#!/usr/bin/env python3
"""Contract tests for the exported G-Maiden minimap detector ONNX (P2.2).

These assert the EXACT inference contract the Rust (tract-onnx) side relies on.
Run `python train.py` first to produce the artifacts. Run with:
    python -m pytest test_contract.py -q
or directly:
    python test_contract.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

THIS_DIR = Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parent.parent
MODELS_DIR = REPO_ROOT / "models"
ONNX_PATH = MODELS_DIR / "minimap-detector.onnx"
LABELS_PATH = MODELS_DIR / "labels.json"

NEG_LABEL = "__negative__"
INPUT_NAME = "input"
OUTPUT_NAME = "logits"


def _session() -> ort.InferenceSession:
    assert ONNX_PATH.is_file(), f"missing ONNX model: {ONNX_PATH} (run train.py first)"
    return ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])


def _labels() -> list[str]:
    assert LABELS_PATH.is_file(), f"missing labels: {LABELS_PATH} (run train.py first)"
    return json.loads(LABELS_PATH.read_text())


def test_input_shape_and_name():
    sess = _session()
    inp = sess.get_inputs()[0]
    assert inp.name == INPUT_NAME, f"input node name {inp.name!r} != {INPUT_NAME!r}"
    assert list(inp.shape) == [1, 3, 32, 32], f"input shape {inp.shape} != [1,3,32,32]"


def test_output_shape_and_name():
    sess = _session()
    labels = _labels()
    out = sess.get_outputs()[0]
    assert out.name == OUTPUT_NAME, f"output node name {out.name!r} != {OUTPUT_NAME!r}"
    assert list(out.shape) == [1, len(labels)], \
        f"output shape {out.shape} != [1,{len(labels)}]"


def test_labels_json():
    labels = _labels()
    assert isinstance(labels, list) and all(isinstance(x, str) for x in labels)
    sess = _session()
    n_out = sess.get_outputs()[0].shape[1]
    assert len(labels) == n_out, f"labels len {len(labels)} != num_classes {n_out}"
    assert NEG_LABEL in labels, f"labels must contain {NEG_LABEL!r}: {labels}"
    assert len(set(labels)) == len(labels), "labels must be unique"


def test_forward_pass_finite_logits():
    """A single forward pass on a synthetic patch returns finite logits of the
    contracted shape. Input is RGB float32 in [0,1], NCHW [1,3,32,32]."""
    sess = _session()
    labels = _labels()
    rng = np.random.default_rng(0)
    patch = rng.random((1, 3, 32, 32)).astype(np.float32)  # already in [0,1]
    logits = sess.run([OUTPUT_NAME], {INPUT_NAME: patch})[0]
    assert logits.shape == (1, len(labels)), f"logits shape {logits.shape}"
    assert logits.dtype == np.float32, f"logits dtype {logits.dtype}"
    assert np.all(np.isfinite(logits)), "logits contain NaN/Inf"


def _run_all():
    fns = [test_input_shape_and_name, test_output_shape_and_name,
           test_labels_json, test_forward_pass_finite_logits]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {fn.__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
