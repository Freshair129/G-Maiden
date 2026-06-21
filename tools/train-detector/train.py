#!/usr/bin/env python3
"""Train + export the G-Maiden minimap hero-icon classifier to ONNX (P2.2).

PIPELINE
--------
1. Generate (or reuse) a synthetic dataset via the P2.1 generator
   (`tools/gen-dataset/gen_dataset.py`), ImageFolder layout
   `<ds>/train/<label>/*.png` and `<ds>/val/<label>/*.png`.
2. Train a small, tract-safe CNN (Conv/BN/ReLU/MaxPool/GlobalAvgPool/Linear only).
3. Evaluate on the val split; print per-epoch loss + val accuracy and a per-class
   accuracy summary.
4. Export to ONNX honoring the EXACT inference contract the Rust (tract-onnx) side
   expects, and write labels.json.
5. Re-load the exported ONNX with onnxruntime, run the val set through it, and
   assert ONNX accuracy ~= torch accuracy AND >= the pass threshold.

INFERENCE CONTRACT (do not deviate — Rust is written to this)
-------------------------------------------------------------
  input : NCHW [1,3,32,32] float32, RGB, pixels/255 -> [0,1], NO mean/std.
          input node name == "input".
  output: raw logits [1, num_classes], node name == "logits". (Rust softmaxes.)
  opset : 13. Batch dim fixed = 1 (no dynamic axes).
  labels: models/labels.json = JSON array, labels[i] is the name for logits idx i.
          Exactly one entry is the literal "__negative__".
  model : models/minimap-detector.onnx
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

# --- Repo-relative paths -----------------------------------------------------
THIS_DIR = Path(__file__).resolve().parent          # tools/train-detector
REPO_ROOT = THIS_DIR.parent.parent                  # G:\G-Maiden
GEN_SCRIPT = THIS_DIR.parent / "gen-dataset" / "gen_dataset.py"
MODELS_DIR = REPO_ROOT / "models"
ONNX_PATH = MODELS_DIR / "minimap-detector.onnx"
LABELS_PATH = MODELS_DIR / "labels.json"

NEG_LABEL = "__negative__"
INPUT_SIZE = 32   # contract: 32x32
INPUT_NAME = "input"
OUTPUT_NAME = "logits"
OPSET = 13


# ---------------------------------------------------------------------------
# Model — exactly the tract-safe shape specified in P2.2.
# ---------------------------------------------------------------------------
class MinimapCNN(nn.Module):
    """Conv(3->16)->BN->ReLU->Pool x3 -> GlobalAvgPool -> Linear(64->num_classes).

    Only Conv2d / BatchNorm2d / ReLU / MaxPool2d / AdaptiveAvgPool2d / Linear are
    used so the exported ONNX stays within tract-onnx's supported op set. No
    depthwise-separable convs, squeeze-excite, or hardswish.
    """

    def __init__(self, num_classes: int):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),                       # 32 -> 16
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),                       # 16 -> 8
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),                       # 8 -> 4
        )
        self.gap = nn.AdaptiveAvgPool2d(1)         # global avg pool -> [N,64,1,1]
        self.classifier = nn.Linear(64, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.gap(x)
        x = torch.flatten(x, 1)
        return self.classifier(x)


# ---------------------------------------------------------------------------
# Dataset — ImageFolder-style loader matching the contract preprocessing
# (RGB, /255, NCHW). We load eagerly into RAM; the synthetic set is small.
# ---------------------------------------------------------------------------
class PatchFolder(Dataset):
    def __init__(self, split_dir: Path, class_to_idx: dict[str, int]):
        self.samples: list[tuple[np.ndarray, int]] = []
        self.class_to_idx = class_to_idx
        for label, idx in class_to_idx.items():
            cdir = split_dir / label
            if not cdir.is_dir():
                continue
            for p in sorted(cdir.glob("*.png")):
                arr = _load_patch(p)
                self.samples.append((arr, idx))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, i: int):
        arr, label = self.samples[i]
        return torch.from_numpy(arr), label


def _load_patch(path: Path) -> np.ndarray:
    """Load a PNG as CHW float32 RGB in [0,1] — identical to the runtime contract."""
    img = Image.open(path).convert("RGB").resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32) / 255.0    # HWC, [0,1]
    return np.transpose(arr, (2, 0, 1)).copy()         # CHW


def discover_classes(train_dir: Path) -> dict[str, int]:
    """Stable class->index map: sorted dir names (matches torch ImageFolder)."""
    names = sorted(p.name for p in train_dir.iterdir() if p.is_dir())
    if NEG_LABEL not in names:
        raise RuntimeError(f"dataset missing '{NEG_LABEL}' class in {train_dir}")
    return {name: i for i, name in enumerate(names)}


# ---------------------------------------------------------------------------
# Dataset generation (shell out to the P2.1 generator).
# ---------------------------------------------------------------------------
def ensure_dataset(ds_dir: Path, count: int, seed: int, icons_dir: str | None,
                   backgrounds_dir: str | None, regen: bool) -> None:
    train_dir = ds_dir / "train"
    if train_dir.is_dir() and not regen:
        print(f"[data] reusing existing dataset at {ds_dir}")
        return
    cmd = [sys.executable, str(GEN_SCRIPT),
           "--out-dir", str(ds_dir),
           "--count", str(count),
           "--seed", str(seed),
           "--patch-size", str(INPUT_SIZE)]
    if icons_dir:
        cmd += ["--icons-dir", icons_dir]
    if backgrounds_dir:
        cmd += ["--backgrounds-dir", backgrounds_dir]
    print(f"[data] generating dataset: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)


# ---------------------------------------------------------------------------
# Train / eval loops.
# ---------------------------------------------------------------------------
def run_epoch(model, loader, device, criterion, optimizer=None):
    train = optimizer is not None
    model.train(train)
    total_loss, correct, n = 0.0, 0, 0
    torch.set_grad_enabled(train)
    for xb, yb in loader:
        xb = xb.to(device)
        yb = yb.to(device)
        logits = model(xb)
        loss = criterion(logits, yb)
        if train:
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        total_loss += float(loss.detach()) * xb.size(0)
        correct += int((logits.argmax(1) == yb).sum())
        n += xb.size(0)
    torch.set_grad_enabled(True)
    return total_loss / max(n, 1), correct / max(n, 1)


@torch.no_grad()
def per_class_accuracy(model, loader, device, idx_to_class):
    model.eval()
    n_cls = len(idx_to_class)
    correct = [0] * n_cls
    total = [0] * n_cls
    for xb, yb in loader:
        xb = xb.to(device)
        preds = model(xb).argmax(1).cpu()
        for p, t in zip(preds.tolist(), yb.tolist()):
            total[t] += 1
            if p == t:
                correct[t] += 1
    return {idx_to_class[i]: (correct[i] / total[i] if total[i] else float("nan"),
                              total[i]) for i in range(n_cls)}


# ---------------------------------------------------------------------------
# ONNX export + onnxruntime verification.
# ---------------------------------------------------------------------------
def export_onnx(model, device) -> None:
    model.eval()  # fold BatchNorm to inference mode before export
    dummy = torch.zeros(1, 3, INPUT_SIZE, INPUT_SIZE, dtype=torch.float32, device=device)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    export_kwargs = dict(
        input_names=[INPUT_NAME], output_names=[OUTPUT_NAME],
        opset_version=OPSET,
        dynamic_axes=None,          # fixed batch=1, concrete shape (tract-friendly)
        do_constant_folding=True,
    )
    try:
        # torch>=2.5 defaults to the dynamo exporter, which needs `onnxscript`.
        # Force the legacy TorchScript exporter: no extra deps, emits a concrete
        # static-shape graph that tract-onnx ingests cleanly.
        torch.onnx.export(model, dummy, str(ONNX_PATH), dynamo=False, **export_kwargs)
    except TypeError:
        # Older torch without the `dynamo` kwarg: legacy exporter is the default.
        torch.onnx.export(model, dummy, str(ONNX_PATH), **export_kwargs)
    print(f"[onnx] exported -> {ONNX_PATH}")


def onnxruntime_eval(val_loader, labels):
    import onnxruntime as ort
    sess = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name
    correct, n = 0, 0
    for xb, yb in val_loader:
        arr = xb.numpy().astype(np.float32)
        # ONNX model fixes batch=1; feed one sample at a time.
        for i in range(arr.shape[0]):
            logits = sess.run(None, {in_name: arr[i:i + 1]})[0]
            if int(np.argmax(logits[0])) == int(yb[i]):
                correct += 1
            n += 1
    return correct / max(n, 1)


# ---------------------------------------------------------------------------
# Main.
# ---------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Train + export G-Maiden minimap detector (P2.2).")
    ap.add_argument("--ds-dir", default=str(THIS_DIR / "_ds"), help="Dataset output/reuse dir.")
    ap.add_argument("--count", type=int, default=9000, help="Approx total synthetic patches.")
    ap.add_argument("--seed", type=int, default=20260621)
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch-size", type=int, default=128)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--icons-dir", default=None, help="Real hero icon PNGs (else synthetic).")
    ap.add_argument("--backgrounds-dir", default=None, help="Real bg crops (else procedural).")
    ap.add_argument("--regen", action="store_true", help="Force dataset regeneration.")
    ap.add_argument("--pass-threshold", type=float, default=0.80, help="Min val acc to pass.")
    ap.add_argument("--onnx-tolerance", type=float, default=0.02,
                    help="Max |torch_acc - onnx_acc| allowed.")
    args = ap.parse_args(argv)

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = torch.device("cpu")
    ds_dir = Path(args.ds_dir)

    # 1. dataset
    ensure_dataset(ds_dir, args.count, args.seed, args.icons_dir,
                   args.backgrounds_dir, args.regen)
    train_dir, val_dir = ds_dir / "train", ds_dir / "val"
    class_to_idx = discover_classes(train_dir)
    idx_to_class = {i: n for n, i in class_to_idx.items()}
    labels = [idx_to_class[i] for i in range(len(idx_to_class))]
    print(f"[data] {len(labels)} classes: {labels}")

    train_ds = PatchFolder(train_dir, class_to_idx)
    val_ds = PatchFolder(val_dir, class_to_idx)
    print(f"[data] train={len(train_ds)} val={len(val_ds)}")
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False)

    # 2. train
    model = MinimapCNN(len(labels)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    best_val = 0.0
    for epoch in range(1, args.epochs + 1):
        tr_loss, tr_acc = run_epoch(model, train_loader, device, criterion, optimizer)
        _, val_acc = run_epoch(model, val_loader, device, criterion, optimizer=None)
        best_val = max(best_val, val_acc)
        print(f"[train] epoch {epoch:2d}/{args.epochs} "
              f"loss={tr_loss:.4f} train_acc={tr_acc:.4f} val_acc={val_acc:.4f}")

    # 3. final torch val accuracy + per-class summary
    _, torch_val_acc = run_epoch(model, val_loader, device, criterion, optimizer=None)
    pca = per_class_accuracy(model, val_loader, device, idx_to_class)
    print("\n[result] per-class val accuracy:")
    for name in labels:
        acc, cnt = pca[name]
        print(f"  {name:16s} acc={acc:.3f} (n={cnt})")
    print(f"\n[result] FINAL torch val accuracy: {torch_val_acc:.4f}")

    # 4. export ONNX + labels.json
    export_onnx(model, device)
    LABELS_PATH.write_text(json.dumps(labels, indent=2))
    print(f"[onnx] wrote labels -> {LABELS_PATH}")

    # 5. verify ONNX honors the contract
    onnx_val_acc = onnxruntime_eval(val_loader, labels)
    print(f"[onnx] onnxruntime val accuracy: {onnx_val_acc:.4f}")

    diff = abs(torch_val_acc - onnx_val_acc)
    ok = True
    if diff > args.onnx_tolerance:
        print(f"[FAIL] torch/onnx accuracy diff {diff:.4f} > tol {args.onnx_tolerance}")
        ok = False
    if onnx_val_acc < args.pass_threshold:
        print(f"[FAIL] onnx val accuracy {onnx_val_acc:.4f} < threshold {args.pass_threshold}")
        ok = False
    if torch_val_acc < args.pass_threshold:
        print(f"[FAIL] torch val accuracy {torch_val_acc:.4f} < threshold {args.pass_threshold}")
        ok = False

    print(f"\n[summary] torch={torch_val_acc:.4f} onnx={onnx_val_acc:.4f} "
          f"diff={diff:.4f} -> {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
