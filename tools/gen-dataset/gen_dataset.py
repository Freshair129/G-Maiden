#!/usr/bin/env python3
"""Synthetic training-data generator for the G-Maiden minimap hero-detector (P2.1).

WHY THIS EXISTS
---------------
Spike S-1 (docs/SPIKE--S-1-MINIMAP-CV.md) proved the minimap CV hot-loop passes
the latency (<=80 ms) and CPU (<=2.5%) gates, but template-matching NCC only hit
~10% identity accuracy on degraded icons. That refutes NCC as the detector and
motivates a small ONNX classifier (Phase 2, P2.x). To train that classifier we
need thousands of labeled `icon x icon` patches BEFORE real gameplay footage is
collected. This tool synthesises them by compositing official hero minimap icons
onto minimap backgrounds with the EXACT degradation profile the spike applied to
its on-screen icons, so the training distribution matches what the production CV
will actually feed the model at runtime (cropped candidate patches from
`prefilter.rs`, sized to `MinimapRegion::icon_size()`).

DOMAIN-GAP STRATEGY (important for P2.2)
----------------------------------------
Synthetic data is never identical to real frames. We deliberately reserve REAL
Dota 2 footage for VALIDATION ONLY — never for training — so the held-out metric
honestly measures the synthetic->real gap. If real-footage validation accuracy is
poor, P2.2 closes the gap with: (a) real icon PNGs via --icons-dir, (b) real
background crops via --backgrounds-dir, (c) heavier augmentation here. The
augmentation constants below are copied verbatim from the spike's render_frame()
so the synthetic degradation is a faithful proxy, not a guess.

DEGRADATION CONSTANTS (must match spikes/s1-minimap-cv/src/main.rs render_frame)
-------------------------------------------------------------------------------
  fog dimming        : brightness *= 0.55 + 0.45*rand        (range 0.55..1.0)
  sub-pixel jitter   : gaussian sigma = 0.6 px on x and y
  additive noise     : per-channel gaussian sigma = 0.035 on 0..1, then clamp
  partial occlusion  : 18% probability, hide the right half of the icon
  distractors        : creep/ward blips 2-3 px, team-colored (negative class)
  team ring color    : (0.86, 0.16, 0.16) — Dire-red enemy ring (matches cv/ + spike)

Deps: numpy + Pillow only. Deterministic given --seed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Constants copied from the spike (do not "improve" these — they define the
# training distribution that must match the runtime degradation profile).
# ---------------------------------------------------------------------------
TEAM_RING = (0.86, 0.16, 0.16)  # Dire-red enemy ring, normalized RGB (== cv/mod TEAM_RING)

# Degradation profile (spike render_frame, lines ~203-223).
FOG_DIM_BASE = 0.55          # brightness *= 0.55 + 0.45*rand
FOG_DIM_SPAN = 0.45
JITTER_SIGMA_PX = 0.6        # sub-pixel placement jitter (gaussian)
NOISE_SIGMA = 0.035          # additive per-channel gaussian noise on 0..1
OCCLUDE_PROB = 0.18          # 18% chance the right half is hidden

# Synthetic-icon fallback geometry mirrors the spike's build_templates(): the
# icon is authored at a small canonical side then resized to --patch-size. We
# author at 20px (the spike's ICON) so the ring thickness / accent-spot math
# reproduces the spike's silhouettes faithfully before resampling.
SYNTH_ICON_AUTHOR_SIZE = 20
SYNTH_RING_THICKNESS = 2.6   # ring thickness in author-size px (spike r_out - r_in)
SYNTH_N_HEROES = 10          # spike templated 10 heroes; default synthetic roster

NEG_LABEL = "__negative__"


# ---------------------------------------------------------------------------
# Synthetic icon fallback — exact port of the spike's build_templates().
# ---------------------------------------------------------------------------
def _hsv(h: float, s: float, v: float) -> tuple[float, float, float]:
    """HSV->RGB, matching the spike's hsv() so synthetic hues line up."""
    i = int(np.floor(h * 6.0)) % 6
    f = h * 6.0 - np.floor(h * 6.0)
    p = v * (1.0 - s)
    q = v * (1.0 - f * s)
    t = v * (1.0 - (1.0 - f) * s)
    return [
        (v, t, p),
        (q, v, p),
        (p, v, t),
        (p, q, v),
        (t, p, v),
        (v, p, q),
    ][i]


def make_synthetic_icons(n_heroes: int = SYNTH_N_HEROES) -> list[tuple[str, np.ndarray]]:
    """Generate n distinct synthetic hero icons as the spike's build_templates() did.

    Each icon = team-red ring + unique HSV interior + two index-keyed accent
    spots, so the roster has distinct silhouettes. Returns RGBA float arrays in
    0..1 of shape (S, S, 4); the alpha channel marks the icon disc (0 outside)
    so compositing only paints the blip, like a real transparent-bg icon PNG.
    """
    size = SYNTH_ICON_AUTHOR_SIZE
    out: list[tuple[str, np.ndarray]] = []
    cx = (size - 1.0) / 2.0
    cy = cx
    r_out = size / 2.0
    r_in = r_out - SYNTH_RING_THICKNESS
    for h in range(n_heroes):
        hue = h / n_heroes
        interior = _hsv(hue, 0.75, 0.95)
        s1 = ((h * 3) % size, (h * 5 + 4) % size)
        s2 = ((h * 7 + 2) % size, (h * 2 + 9) % size)
        img = np.zeros((size, size, 4), dtype=np.float32)
        for y in range(size):
            for x in range(size):
                dx = x - cx
                dy = y - cy
                d = np.hypot(dx, dy)
                if d > r_out:
                    # Outside the disc -> transparent (real icons have alpha=0 here).
                    continue
                if d > r_in:
                    rgb = TEAM_RING  # enemy ring
                else:
                    near1 = np.hypot(x - s1[0], y - s1[1]) < 2.2
                    near2 = np.hypot(x - s2[0], y - s2[1]) < 2.2
                    if near1 or near2:
                        rgb = tuple(c * 0.35 for c in interior)  # dark accent spot
                    else:
                        rgb = interior
                img[y, x, 0:3] = rgb
                img[y, x, 3] = 1.0
        out.append((f"synthhero_{h:02d}", img))
    return out


# ---------------------------------------------------------------------------
# Icon loading from real PNGs (--icons-dir).
# ---------------------------------------------------------------------------
def load_real_icons(icons_dir: Path) -> list[tuple[str, np.ndarray]]:
    """Load every PNG in icons_dir as an RGBA float (0..1) icon.

    Hero name = file stem. Icons with no alpha are treated as fully opaque.
    Returns [] if the dir is missing/empty so the caller can fall back.
    """
    if not icons_dir or not icons_dir.is_dir():
        return []
    out: list[tuple[str, np.ndarray]] = []
    for p in sorted(icons_dir.glob("*.png")):
        img = Image.open(p).convert("RGBA")
        arr = np.asarray(img, dtype=np.float32) / 255.0
        out.append((p.stem, arr))
    return out


# ---------------------------------------------------------------------------
# Backgrounds — load real crops, else synthesize procedurally (spike step 1).
# ---------------------------------------------------------------------------
def load_real_backgrounds(bg_dir: Path) -> list[np.ndarray]:
    """Load real minimap background crops as RGB float (0..1). [] if absent."""
    if not bg_dir or not bg_dir.is_dir():
        return []
    out: list[np.ndarray] = []
    for ext in ("*.png", "*.jpg", "*.jpeg", "*.bmp"):
        for p in sorted(bg_dir.glob(ext)):
            img = Image.open(p).convert("RGB")
            out.append(np.asarray(img, dtype=np.float32) / 255.0)
    return out


def synth_background(rng: np.random.Generator, size: int) -> np.ndarray:
    """Procedural minimap background, mirroring the spike's render_frame step 1.

    Low-saturation green/brown value-noise plus faint lane diagonals. WHY: gives
    the negatives and the composited positives a realistic, non-uniform backdrop
    so the model can't cheat by keying on a flat color. Spike formula:
        n   = 0.10 + 0.06*rand   (per pixel)
        lane= 0.04 if |x-y| % 64 < 5 else 0
        rgb = (n*0.5 + lane, n + lane, n*0.4)
    """
    n = 0.10 + 0.06 * rng.random((size, size)).astype(np.float32)
    xs = np.arange(size)
    diff = np.abs(xs[None, :] - xs[:, None])
    lane = np.where((diff % 64) < 5, 0.04, 0.0).astype(np.float32)
    bg = np.empty((size, size, 3), dtype=np.float32)
    bg[:, :, 0] = n * 0.5 + lane
    bg[:, :, 1] = n + lane
    bg[:, :, 2] = n * 0.4
    return np.clip(bg, 0.0, 1.0)


def random_bg_patch(rng: np.random.Generator, bgs: list[np.ndarray], size: int) -> np.ndarray:
    """A size x size RGB patch: random crop of a real bg, or a synthetic one."""
    if not bgs:
        return synth_background(rng, size)
    bg = bgs[rng.integers(len(bgs))]
    h, w = bg.shape[:2]
    if h < size or w < size:
        # Real bg smaller than patch -> resize up (rare; keeps tool robust).
        img = Image.fromarray((np.clip(bg, 0, 1) * 255).astype(np.uint8)).resize(
            (size, size), Image.BILINEAR
        )
        return np.asarray(img, dtype=np.float32) / 255.0
    oy = int(rng.integers(0, h - size + 1))
    ox = int(rng.integers(0, w - size + 1))
    return bg[oy : oy + size, ox : ox + size].copy()


# ---------------------------------------------------------------------------
# Compositing + degradation — the heart of the matcher, ported from the spike.
# ---------------------------------------------------------------------------
def composite_icon(
    rng: np.random.Generator, bg: np.ndarray, icon_rgba: np.ndarray, patch_size: int
) -> np.ndarray:
    """Composite one degraded hero icon centered on a background patch.

    Applies the spike's per-icon degradation in the same order:
      1. fog dim     : rgb *= 0.55 + 0.45*rand
      2. additive    : rgb += N(0, 0.035) per channel, clamp [0,1]
      3. sub-pixel   : integer-rounded jitter ~ N(0, 0.6) on x,y (spike rounds
                       the gaussian offset before placement)
      4. occlusion   : 18% chance to drop the right half of the icon
    Alpha-composites onto the bg so transparent icon pixels keep the background.
    Returns an RGB float patch of shape (patch_size, patch_size, 3) in 0..1.
    """
    out = bg.copy()
    # Resize the icon to the patch size (runtime resizes candidate crops to the
    # model input; we author->resample so synthetic and real icons share a path).
    icon = _resize_rgba(icon_rgba, patch_size)
    rgb = icon[:, :, 0:3].copy()
    alpha = icon[:, :, 3].copy()

    # 1. fog/visibility dimming (one scalar per icon, matches spike `dim`).
    dim = FOG_DIM_BASE + FOG_DIM_SPAN * float(rng.random())
    rgb *= dim
    # 2. additive per-channel sensor/compression noise, then clamp.
    rgb += rng.normal(0.0, NOISE_SIGMA, size=rgb.shape).astype(np.float32)
    np.clip(rgb, 0.0, 1.0, out=rgb)

    # 4. partial occlusion: hide the right half (alpha 0 there).
    if float(rng.random()) < OCCLUDE_PROB:
        alpha[:, patch_size // 2 :] = 0.0

    # 3. sub-pixel jitter -> integer shift (spike rounds the gaussian offset).
    jx = int(round(float(rng.normal(0.0, JITTER_SIGMA_PX))))
    jy = int(round(float(rng.normal(0.0, JITTER_SIGMA_PX))))
    rgb = np.roll(rgb, (jy, jx), axis=(0, 1))
    alpha = np.roll(alpha, (jy, jx), axis=(0, 1))

    a = alpha[:, :, None]
    out = rgb * a + out * (1.0 - a)
    return np.clip(out, 0.0, 1.0)


def _resize_rgba(icon_rgba: np.ndarray, size: int) -> np.ndarray:
    """Resize an RGBA float (0..1) icon to size x size, preserving alpha."""
    if icon_rgba.shape[0] == size and icon_rgba.shape[1] == size:
        return icon_rgba
    img = Image.fromarray((np.clip(icon_rgba, 0, 1) * 255).astype(np.uint8), mode="RGBA")
    img = img.resize((size, size), Image.BILINEAR)
    return np.asarray(img, dtype=np.float32) / 255.0


def make_negative(rng: np.random.Generator, bgs: list[np.ndarray], patch_size: int) -> np.ndarray:
    """A negative-class patch: background-only, or background + tiny distractors.

    Distractors mirror the spike's creep/ward blips (2-3 px, team-colored dots):
    red [0.7,0.18,0.18] or green [0.2,0.7,0.3]. These teach the classifier that a
    small colored dot is NOT a hero — exactly the false positives the color-ring
    prefilter would otherwise pass to the detector.
    """
    out = random_bg_patch(rng, bgs, patch_size)
    if float(rng.random()) < 0.6:  # most negatives carry a distractor or two
        n_blips = int(rng.integers(1, 4))
        for _ in range(n_blips):
            sz = int(rng.integers(2, 4))  # 2-3 px, smaller than a hero icon
            if patch_size - sz <= 0:
                continue
            x = int(rng.integers(0, patch_size - sz + 1))
            y = int(rng.integers(0, patch_size - sz + 1))
            color = (0.7, 0.18, 0.18) if rng.random() > 0.5 else (0.2, 0.7, 0.3)
            out[y : y + sz, x : x + sz, :] = color
    return np.clip(out, 0.0, 1.0)


# ---------------------------------------------------------------------------
# Output helpers.
# ---------------------------------------------------------------------------
def save_patch(arr: np.ndarray, path: Path) -> None:
    """Save an RGB float (0..1) patch as a PNG (deterministic given input)."""
    img = Image.fromarray((np.clip(arr, 0, 1) * 255.0 + 0.5).astype(np.uint8), mode="RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG")


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# Generation driver.
# ---------------------------------------------------------------------------
def generate(args: argparse.Namespace) -> dict:
    rng = np.random.default_rng(args.seed)

    icons = load_real_icons(Path(args.icons_dir)) if args.icons_dir else []
    used_synthetic = False
    if not icons:
        used_synthetic = True
        print(
            "WARNING: no real icons found (--icons-dir empty/missing). Falling back\n"
            "         to SYNTHETIC hero icons (spike build_templates). This is LOWER\n"
            "         FIDELITY — real Dota 2 minimap icons are strongly recommended for\n"
            "         training; see README.md for the canonical source.",
            file=sys.stderr,
        )
        icons = make_synthetic_icons(args.synth_heroes)

    bgs = load_real_backgrounds(Path(args.backgrounds_dir)) if args.backgrounds_dir else []
    if not bgs:
        print(
            "INFO: no background crops found (--backgrounds-dir empty/missing). Using\n"
            "      procedural synthetic backgrounds (spike render_frame step 1).",
            file=sys.stderr,
        )

    out_dir = Path(args.out_dir)
    labels = [name for name, _ in icons] + [NEG_LABEL]

    # Split count across classes. We allocate a roughly equal share of positives
    # to each hero, and reserve ~1/(n_heroes+1) of the total for negatives, so the
    # classifier sees a balanced "is this hero X / is this background" problem.
    n_classes = len(labels)
    per_class = max(1, args.count // n_classes)

    counts = {"train": {}, "val": {}}
    sample_hashes: dict[str, str] = {}  # for the determinism test

    for label in labels:
        n = per_class
        n_val = max(1, int(round(n * args.val_split))) if n > 1 else 0
        n_train = n - n_val
        for split, k in (("train", n_train), ("val", n_val)):
            counts[split][label] = 0
            for i in range(k):
                if label == NEG_LABEL:
                    patch = make_negative(rng, bgs, args.patch_size)
                else:
                    icon_rgba = dict(icons)[label]
                    bg = random_bg_patch(rng, bgs, args.patch_size)
                    patch = composite_icon(rng, bg, icon_rgba, args.patch_size)
                path = out_dir / split / label / f"{label}_{i:05d}.png"
                save_patch(patch, path)
                counts[split][label] += 1
                # Record one hash per class/split for the determinism assertion.
                key = f"{split}/{label}/0"
                if key not in sample_hashes and i == 0:
                    sample_hashes[key] = file_sha256(path)

    total_train = sum(counts["train"].values())
    total_val = sum(counts["val"].values())
    manifest = {
        "params": {
            "count_requested": args.count,
            "per_class": per_class,
            "val_split": args.val_split,
            "seed": args.seed,
            "patch_size": args.patch_size,
            "synth_heroes": args.synth_heroes,
            "icons_dir": str(args.icons_dir) if args.icons_dir else None,
            "backgrounds_dir": str(args.backgrounds_dir) if args.backgrounds_dir else None,
            "used_synthetic_icons": used_synthetic,
            "used_synthetic_backgrounds": not bgs,
        },
        "degradation_profile": {
            "team_ring": TEAM_RING,
            "fog_dim_range": [FOG_DIM_BASE, FOG_DIM_BASE + FOG_DIM_SPAN],
            "jitter_sigma_px": JITTER_SIGMA_PX,
            "noise_sigma": NOISE_SIGMA,
            "occlude_prob": OCCLUDE_PROB,
            "source": "spikes/s1-minimap-cv/src/main.rs render_frame()",
        },
        "labels": labels,
        "counts": {
            "train": counts["train"],
            "val": counts["val"],
            "total_train": total_train,
            "total_val": total_val,
        },
        "sample_hashes": sample_hashes,
    }
    (out_dir).mkdir(parents=True, exist_ok=True)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Synthetic minimap hero-detector dataset generator (G-Maiden P2.1).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--icons-dir", default=None,
                   help="Dir of official hero minimap icon PNGs (transparent bg). "
                        "Falls back to synthetic icons if empty/missing.")
    p.add_argument("--backgrounds-dir", default=None,
                   help="Dir of real minimap background crops. Falls back to "
                        "procedural backgrounds if empty/missing.")
    p.add_argument("--out-dir", default="dataset",
                   help="Output root (ImageFolder layout: <split>/<label>/*.png).")
    p.add_argument("--count", type=int, default=5000,
                   help="Approx total patches (split across all classes).")
    p.add_argument("--val-split", type=float, default=0.15,
                   help="Fraction of each class held out for validation.")
    p.add_argument("--seed", type=int, default=20260621,
                   help="RNG seed; same seed -> identical dataset.")
    p.add_argument("--patch-size", type=int, default=32,
                   help="Output patch side in px (model input size).")
    p.add_argument("--synth-heroes", type=int, default=SYNTH_N_HEROES,
                   help="Number of synthetic heroes when in fallback mode.")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    manifest = generate(args)
    c = manifest["counts"]
    print(
        f"Done. train={c['total_train']} val={c['total_val']} "
        f"classes={len(manifest['labels'])} -> {args.out_dir}"
    )
    print(f"Manifest: {Path(args.out_dir) / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
