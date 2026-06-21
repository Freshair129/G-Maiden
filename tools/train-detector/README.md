# G-Maiden P2.2 — minimap hero-icon detector (train + ONNX export)

Trains a small, **tract-safe** CNN to classify 32×32 minimap candidate patches
into `hero name | __negative__`, and exports it to ONNX for the Rust runtime
(`tract-onnx`). Consumes the P2.1 synthetic dataset generator
(`../gen-dataset/gen_dataset.py`).

## Quick start

```sh
# (CPU torch preferred — see requirements.txt for the index-url one-liner)
pip install -r requirements.txt

# Generate dataset (synthetic fallback), train, export ONNX + labels.json, verify.
python train.py

# Contract tests against the exported artifacts.
python -m pytest test_contract.py -q     # or: python test_contract.py
```

Outputs (repo-relative):
- `models/minimap-detector.onnx`
- `models/labels.json`

## Inference contract (the Rust side is written to this — do not deviate)

| Field   | Value |
| ------- | ----- |
| Input   | NCHW `[1, 3, 32, 32]`, float32, **RGB**, pixels `/255.0` → `[0,1]`. **No** ImageNet mean/std. Node name `input`. |
| Output  | Raw logits `[1, num_classes]`, node name `logits`. Rust applies softmax. |
| Opset   | 13 |
| Batch   | Fixed = 1 (no dynamic axes — concrete shape for tract). |
| Labels  | `models/labels.json` = JSON array; `labels[i]` is the name for logits index `i`. One entry is the literal `__negative__` (Rust looks it up by name). |

## Model architecture (tract-safe — Conv/BN/ReLU/MaxPool/GAP/Linear only)

```
Conv(3→16, 3×3, pad1) → BN → ReLU → MaxPool2×2      # 32→16
Conv(16→32, 3×3, pad1) → BN → ReLU → MaxPool2×2     # 16→8
Conv(32→64, 3×3, pad1) → BN → ReLU → MaxPool2×2     # 8→4
AdaptiveAvgPool2d(1) → Flatten → Linear(64→num_classes)
```

No MobileNetV3 / squeeze-excite / hardswish / depthwise-separable ops — those
risk unsupported ONNX ops in tract. `model.eval()` is set before export so
BatchNorm folds to inference mode. The exporter is forced to the legacy
TorchScript path (`dynamo=False`) so no `onnxscript` dependency is needed and the
graph has concrete static shapes.

## CLI flags (train.py)

| Flag | Default | Notes |
| ---- | ------- | ----- |
| `--count` | `9000` | Approx total synthetic patches (split across classes). |
| `--epochs` | `15` | |
| `--batch-size` | `128` | |
| `--lr` | `1e-3` | Adam. |
| `--ds-dir` | `./_ds` | Dataset reuse/output dir. Reused unless `--regen`. |
| `--regen` | off | Force dataset regeneration. |
| `--icons-dir` | none | Real hero icon PNGs (transparent bg) → passed to the P2.1 generator. |
| `--backgrounds-dir` | none | Real minimap bg crops → passed to the generator. |
| `--pass-threshold` | `0.80` | Min val accuracy to exit 0. |
| `--onnx-tolerance` | `0.02` | Max `|torch_acc − onnx_acc|`. |

Exit code is non-zero (CI-friendly) if val accuracy < threshold or torch/onnx
accuracies diverge beyond tolerance.

## Verification baked into the run

`train.py` re-loads the exported `.onnx` with **onnxruntime**, runs the val set
through it one sample at a time (batch=1 contract), and asserts the ONNX accuracy
matches torch within tolerance and clears the pass threshold. `test_contract.py`
independently asserts input shape `[1,3,32,32]` / name `input`, output shape
`[1,num_classes]` / name `logits`, `labels.json` length == num_classes and
contains `__negative__`, and that a single forward pass returns finite logits.

## ⚠️ Synthetic data caveat — read before shipping

By default the P2.1 generator runs in **synthetic-icon fallback** (10 procedural
`synthhero_NN` icons on procedural backgrounds, no external assets). The resulting
val accuracy (≈100% on the held-out synthetic split) is **optimistic**: the model
is learning to separate cleanly-distinct procedural blips, not real heroes.

Before this model can ship:
- Supply **real hero minimap icon PNGs** via `--icons-dir` (passed through to the
  generator). The class labels then become real hero names.
- Optionally supply **real minimap background crops** via `--backgrounds-dir`.
- **Real Dota 2 footage is for VALIDATION ONLY — never training** — so the
  held-out metric honestly measures the synthetic→real domain gap (see the P2.1
  generator docstring, "DOMAIN-GAP STRATEGY"). Re-run and trust the *real-footage*
  validation number, not the synthetic one, as the go/no-go signal.
