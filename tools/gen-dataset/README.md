# gen-dataset â€” synthetic minimap hero-detector dataset (G-Maiden P2.1)

Generates labeled `patch_size Ã— patch_size` PNG patches for training an ONNX
minimap hero-detector, by compositing hero minimap icons onto minimap
backgrounds with the **exact** degradation profile from Spike S-1.

## Why this exists

Spike S-1 (`docs/architecture/spikes/S-1-minimap-cv.md`) proved the minimap CV hot-loop
passes the latency and CPU gates but that NCC template-matching only reaches
~10% identity accuracy on degraded icons. That motivates a small **ONNX
classifier** instead of NCC. Training it needs thousands of labeled icon-sized
patches **now**, without waiting for gameplay footage. This tool synthesises them
so P2.2 (training) is unblocked.

The augmentation constants are copied verbatim from the spike's `render_frame()`
(`spikes/s1-minimap-cv/src/main.rs`), so the synthetic training distribution
matches what the production CV (`src-tauri/src/cv/prefilter.rs`) actually feeds
the model at runtime: `iconÃ—icon` candidate crops, resized to the model input.

## Degradation profile (matches the spike exactly)

| Augmentation | Value | Spike source |
| --- | --- | --- |
| Fog/visibility dimming | `rgb *= 0.55 + 0.45*rand` (0.55â€“1.0) | `dim` |
| Sub-pixel jitter | gaussian Ïƒ = 0.6 px on x,y (rounded to int shift) | `jitter_x/y` |
| Additive per-channel noise | gaussian Ïƒ = 0.035 on 0..1, then clamp | inner loop |
| Partial occlusion | 18% chance, right half hidden | `occlude` |
| Distractors (negatives) | 2â€“3 px team-colored dots (red/green) | step 2 |
| Enemy team-ring color | `(0.86, 0.16, 0.16)` Dire-red | `TEAM_RING` |

These are echoed into `manifest.json` under `degradation_profile` and asserted by
`test_gen.py::test_manifest_degradation_constants`.

## Install

```
pip install -r requirements.txt   # numpy + Pillow only
```

## Run

Zero-asset smoke run (synthetic icons + procedural backgrounds â€” always works):

```
python gen_dataset.py --out-dir dataset --count 5000 --seed 20260621
```

With real assets (recommended for production training):

```
python gen_dataset.py \
  --icons-dir icons \
  --backgrounds-dir backgrounds \
  --out-dir dataset --count 20000 --val-split 0.15 --patch-size 32 --seed 1
```

### CLI options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--icons-dir` | (none) | Dir of hero minimap icon PNGs (transparent bg). Falls back to synthetic icons. |
| `--backgrounds-dir` | (none) | Dir of real minimap background crops. Falls back to procedural backgrounds. |
| `--out-dir` | `dataset` | Output root. |
| `--count` | `5000` | Approx total patches, split across all classes. |
| `--val-split` | `0.15` | Per-class validation fraction. |
| `--seed` | `20260621` | RNG seed; same seed â†’ identical dataset. |
| `--patch-size` | `32` | Output patch side (model input). |
| `--synth-heroes` | `10` | Synthetic roster size in fallback mode. |

## Output layout (PyTorch `ImageFolder`-compatible)

```
out-dir/
  train/
    <hero_name>/*.png
    __negative__/*.png
  val/
    <hero_name>/*.png
    __negative__/*.png
  manifest.json        # counts per class, params, seed, degradation profile
```

P2.2 can load it directly:

```python
from torchvision.datasets import ImageFolder
train = ImageFolder("dataset/train")
val   = ImageFolder("dataset/val")   # synthetic â€” see domain-gap note below
```

`__negative__` is the not-a-hero class (background-only or background +
creep/ward distractors), teaching the model to reject the false positives the
color-ring prefilter would otherwise pass through.

## Getting real assets

**Hero minimap icons** â€” the canonical source is Valve's game files:
`game/dota/pak01_dir.vpk` â†’ `panorama/images/heroes/icons/` (the *minimap*
`<hero>_minimap_icon` / `_png` assets), extractable with GCFScape / VRF
(ValveResourceFormat). Drop one transparent-background PNG per hero into
`--icons-dir`; the file stem becomes the class label (e.g. `crystal_maiden.png`).

Note: the OpenDota/Steam CDN
`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/<hero>.png`
serves the **portrait** icon, *not* the minimap blip â€” prefer the VPK minimap
assets for fidelity. **This tool intentionally does not download anything**; drop
files in yourself.

**Backgrounds** â€” crop the minimap square (bottom-left of the HUD, â‰ˆ15.6% of
screen height per `src-tauri/src/cv/region.rs`) from real Dota 2 screenshots,
ideally hero-free, and place the crops in `--backgrounds-dir`.

## Domain-gap caveats for P2.2

- **Synthetic â‰  real.** Reserve **real gameplay footage for VALIDATION ONLY** â€”
  never train on it â€” so the held-out metric honestly measures the syntheticâ†’real
  gap. The `val/` split this tool emits is itself synthetic; replace it with real
  patches before trusting validation numbers.
- **Synthetic-icon fallback is low fidelity.** It reproduces the spike's
  colored-ring + HSV-interior templates (which NCC scored 10% on). Use real icon
  PNGs for any model intended to ship.
- If real-footage validation is weak, close the gap by (a) supplying real icons,
  (b) supplying real backgrounds, (c) widening augmentation here (e.g. rotation,
  scale jitter, JPEG/scaling artifacts) to match the observed failure modes.

## Tests

```
python test_gen.py        # plain-asserts runner, no pytest needed
# or
pytest test_gen.py
```

Covers: layout exists, classes populated, manifest counts == files on disk,
determinism (same seed â†’ identical hashes), patch dims == `--patch-size`,
augmentation is not a no-op, and degradation constants match the spike.

