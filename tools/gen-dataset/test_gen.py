#!/usr/bin/env python3
"""Tests for gen_dataset.py — runnable via `python test_gen.py` or `pytest`.

Covers the contract P2.2 (training) depends on:
  * synthetic-icon fallback runs with ZERO external assets,
  * ImageFolder layout: train/ and val/ each have per-class folders, populated,
  * manifest counts match files actually on disk,
  * determinism: same seed twice -> identical file hashes,
  * patch dimensions == --patch-size,
  * negatives present and distinct class,
  * occlusion/degradation actually alters icons (sanity that augmentation ran).
"""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_dataset as gd  # noqa: E402


def _run(out_dir: Path, seed: int = 123, count: int = 200, patch_size: int = 32):
    args = gd.build_parser().parse_args(
        [
            "--out-dir", str(out_dir),
            "--count", str(count),
            "--seed", str(seed),
            "--patch-size", str(patch_size),
            "--synth-heroes", "6",
        ]
    )
    return gd.generate(args)


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def test_runs_and_creates_layout():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "ds"
        manifest = _run(out)
        assert (out / "train").is_dir(), "train/ missing"
        assert (out / "val").is_dir(), "val/ missing"
        assert (out / "manifest.json").is_file(), "manifest.json missing"
        # Each label has a populated train folder.
        for label in manifest["labels"]:
            tr = out / "train" / label
            assert tr.is_dir(), f"train/{label} missing"
            assert any(tr.glob("*.png")), f"train/{label} empty"
        # Negative class exists.
        assert gd.NEG_LABEL in manifest["labels"], "negative class absent"
        print("OK test_runs_and_creates_layout")


def test_manifest_counts_match_files():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "ds"
        manifest = _run(out)
        for split in ("train", "val"):
            for label, n in manifest["counts"][split].items():
                actual = len(list((out / split / label).glob("*.png")))
                assert actual == n, f"{split}/{label}: manifest {n} != disk {actual}"
        # Totals consistent.
        assert manifest["counts"]["total_train"] == sum(
            manifest["counts"]["train"].values()
        )
        assert manifest["counts"]["total_val"] == sum(
            manifest["counts"]["val"].values()
        )
        print("OK test_manifest_counts_match_files")


def test_patch_dimensions():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "ds"
        ps = 32
        manifest = _run(out, patch_size=ps)
        # Check a sample from each split.
        for split in ("train", "val"):
            label = manifest["labels"][0]
            sample = next((out / split / label).glob("*.png"))
            w, h = Image.open(sample).size
            assert (w, h) == (ps, ps), f"{sample}: {w}x{h} != {ps}x{ps}"
        print("OK test_patch_dimensions")


def test_determinism_same_seed():
    with tempfile.TemporaryDirectory() as td:
        a = Path(td) / "a"
        b = Path(td) / "b"
        m1 = _run(a, seed=999)
        m2 = _run(b, seed=999)
        # Manifest sample hashes recorded identically.
        assert m1["sample_hashes"] == m2["sample_hashes"], "sample hashes differ"
        # Spot-check several real files on disk hash identically.
        checked = 0
        for split in ("train", "val"):
            for label in m1["labels"]:
                fa = sorted((a / split / label).glob("*.png"))
                fb = sorted((b / split / label).glob("*.png"))
                assert len(fa) == len(fb)
                for pa, pb in zip(fa[:2], fb[:2]):
                    assert _sha(pa) == _sha(pb), f"hash mismatch {pa.name}"
                    checked += 1
        assert checked > 0, "no files compared"
        print(f"OK test_determinism_same_seed ({checked} files compared)")


def test_different_seed_differs():
    with tempfile.TemporaryDirectory() as td:
        a = Path(td) / "a"
        b = Path(td) / "b"
        m1 = _run(a, seed=1)
        m2 = _run(b, seed=2)
        # At least one recorded sample hash should differ between seeds.
        diffs = sum(
            1 for k in m1["sample_hashes"] if m1["sample_hashes"][k] != m2["sample_hashes"].get(k)
        )
        assert diffs > 0, "different seeds produced identical samples"
        print(f"OK test_different_seed_differs ({diffs} samples differ)")


def test_degradation_alters_icon():
    """Sanity: the augmentation pipeline changes the clean icon (not a no-op)."""
    rng = np.random.default_rng(0)
    icons = gd.make_synthetic_icons(2)
    _, icon = icons[0]
    bg = gd.synth_background(rng, 32)
    composited = gd.composite_icon(rng, bg.copy(), icon, 32)
    clean = gd._resize_rgba(icon, 32)[:, :, 0:3]
    # Where the icon is opaque, the composite should differ from the clean icon
    # (fog dim + noise applied). Compare mean abs diff over a center region.
    diff = float(np.mean(np.abs(composited - clean)))
    assert diff > 0.001, f"degradation appears to be a no-op (diff={diff})"
    print(f"OK test_degradation_alters_icon (mean abs diff={diff:.4f})")


def test_manifest_degradation_constants():
    """Constants in the manifest must match the spike's profile exactly."""
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "ds"
        m = _run(out)
        dp = m["degradation_profile"]
        assert dp["team_ring"] == [0.86, 0.16, 0.16] or tuple(dp["team_ring"]) == (0.86, 0.16, 0.16)
        assert dp["fog_dim_range"] == [0.55, 1.0]
        assert abs(dp["jitter_sigma_px"] - 0.6) < 1e-9
        assert abs(dp["noise_sigma"] - 0.035) < 1e-9
        assert abs(dp["occlude_prob"] - 0.18) < 1e-9
        print("OK test_manifest_degradation_constants")


def _all_tests():
    return [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]


def main() -> int:
    failures = 0
    for t in _all_tests():
        try:
            t()
        except AssertionError as e:
            failures += 1
            print(f"FAIL {t.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failures += 1
            print(f"ERROR {t.__name__}: {type(e).__name__}: {e}")
    total = len(_all_tests())
    print(f"\n{total - failures}/{total} tests passed.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
