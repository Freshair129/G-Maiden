//! Hero-icon detector — Step 3 of the minimap CV pipeline (Phase 2 P2.2).
//!
//! Primary path: an ONNX classifier (trained on synthetic data, see
//! `tools/train-detector/`) run via `tract-onnx` — a pure-Rust runtime, so we
//! bundle no `onnxruntime.dll` and stay light on RAM. Spike S-1 proved NCC
//! template matching tops out at ~10% accuracy under fog/noise/occlusion, so
//! ONNX is the *default*, not an escalation (ADR-05, revised).
//!
//! For each prefilter candidate we crop an `icon×icon` patch, bilinear-resize
//! it to the model's 32×32 input, classify, drop the negative / low-confidence
//! ones, then NMS overlapping detections (greedy by score — ported from the
//! spike's `detect()`).
//!
//! ## Inference contract (must match `tools/train-detector/`)
//! - input  : NCHW `[1, 3, 32, 32]`, f32, **RGB**, normalized to [0,1] (÷255)
//! - output : raw logits `[1, num_classes]`; softmax applied here
//! - labels : `models/labels.json` = class names in output-index order; the
//!            entry named `"__negative__"` is the background/reject class
//!
//! If the model or labels are missing the detector loads in **candidate-only**
//! mode (returns no detections) so the app still runs — the capture loop keeps
//! emitting prefilter candidates for calibration.

use std::path::Path;

use tract_onnx::prelude::*;

use super::Frame;

/// Model input side length (square). Matches the training contract.
pub const MODEL_INPUT: usize = 32;

/// Minimum softmax confidence to accept a (non-negative) classification.
const CONF_THRESHOLD: f32 = 0.60;

/// The reject/background class name in `labels.json`.
const NEGATIVE_LABEL: &str = "__negative__";

type Runnable = TypedRunnableModel<TypedModel>;

/// A confirmed hero detection at a minimap patch.
#[derive(Clone, serde::Serialize)]
pub struct Detection {
    /// Class index into the labels list.
    pub label: usize,
    /// Hero (class) name, resolved from labels.
    pub name: String,
    /// Patch top-left within the captured region.
    pub x: i32,
    pub y: i32,
    /// Softmax confidence.
    pub score: f32,
}

/// ONNX hero classifier, or a no-op fallback when no model is present.
pub struct Detector {
    model: Option<Runnable>,
    labels: Vec<String>,
    negative_idx: Option<usize>,
}

impl Detector {
    /// Load the ONNX model + labels. On any failure (missing file, parse error,
    /// unsupported op) returns a candidate-only detector and logs why — the app
    /// never fails to start because the model isn't there yet.
    pub fn load(model_path: &Path, labels_path: &Path) -> Self {
        match Self::try_load(model_path, labels_path) {
            Ok(d) => {
                eprintln!(
                    "[detector] ONNX loaded: {} classes from {}",
                    d.labels.len(),
                    model_path.display()
                );
                d
            }
            Err(e) => {
                eprintln!(
                    "[detector] candidate-only mode (no classifier): {e} \
                     (looked for {})",
                    model_path.display()
                );
                Detector { model: None, labels: Vec::new(), negative_idx: None }
            }
        }
    }

    fn try_load(model_path: &Path, labels_path: &Path) -> TractResult<Self> {
        let labels: Vec<String> =
            serde_json::from_str(&std::fs::read_to_string(labels_path)?)?;
        let negative_idx = labels.iter().position(|l| l == NEGATIVE_LABEL);
        let model = tract_onnx::onnx()
            .model_for_path(model_path)?
            .with_input_fact(
                0,
                f32::fact([1, 3, MODEL_INPUT, MODEL_INPUT]).into(),
            )?
            .into_optimized()?
            .into_runnable()?;
        Ok(Detector { model: Some(model), labels, negative_idx })
    }

    /// True if a real classifier is loaded (vs candidate-only fallback).
    pub fn is_active(&self) -> bool {
        self.model.is_some()
    }

    /// Classify every candidate patch; keep confident, non-negative detections,
    /// then suppress overlaps. Returns empty in candidate-only mode.
    pub fn detect(&self, frame: &Frame, candidates: &[(i32, i32)], icon: usize) -> Vec<Detection> {
        let Some(model) = &self.model else {
            return Vec::new();
        };
        let mut raw: Vec<Detection> = Vec::new();
        for &(px, py) in candidates {
            let input = self.patch_to_tensor(frame, px, py, icon);
            let out = match model.run(tvec!(input.into())) {
                Ok(o) => o,
                Err(_) => continue, // a bad patch shouldn't kill the frame
            };
            let view = match out[0].to_array_view::<f32>() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let logits: Vec<f32> = view.iter().copied().collect();
            let (idx, conf) = softmax_argmax(&logits);
            if Some(idx) == self.negative_idx || conf < CONF_THRESHOLD {
                continue;
            }
            let name = self.labels.get(idx).cloned().unwrap_or_default();
            raw.push(Detection { label: idx, name, x: px, y: py, score: conf });
        }
        nms(raw, icon)
    }

    /// Crop the `icon×icon` patch at (px,py) and bilinear-resize to the model's
    /// 32×32 RGB input. `Frame::at` already yields RGB in [0,1], satisfying the
    /// ÷255 normalization in the contract.
    fn patch_to_tensor(&self, frame: &Frame, px: i32, py: i32, icon: usize) -> Tensor {
        let n = MODEL_INPUT;
        let scale = icon as f32 / n as f32;
        let arr = tract_ndarray::Array4::<f32>::from_shape_fn((1, 3, n, n), |(_, c, oy, ox)| {
            // map output pixel centre back into the source patch (clamped)
            let sx = ((ox as f32 + 0.5) * scale - 0.5).clamp(0.0, (icon - 1) as f32);
            let sy = ((oy as f32 + 0.5) * scale - 0.5).clamp(0.0, (icon - 1) as f32);
            let rgb = bilinear(frame, px, py, icon, sx, sy);
            rgb[c]
        });
        arr.into_tensor()
    }
}

/// Bilinear sample of the patch [px..px+icon, py..py+icon] at fractional
/// (sx, sy) measured from the patch origin. Reads through `Frame::at`, which is
/// out-of-bounds safe.
fn bilinear(frame: &Frame, px: i32, py: i32, icon: usize, sx: f32, sy: f32) -> [f32; 3] {
    let x0 = sx.floor() as i32;
    let y0 = sy.floor() as i32;
    let x1 = (x0 + 1).min(icon as i32 - 1);
    let y1 = (y0 + 1).min(icon as i32 - 1);
    let fx = sx - x0 as f32;
    let fy = sy - y0 as f32;
    let at = |lx: i32, ly: i32| frame.at((px + lx) as usize, (py + ly) as usize);
    let c00 = at(x0, y0);
    let c10 = at(x1, y0);
    let c01 = at(x0, y1);
    let c11 = at(x1, y1);
    let mut out = [0.0f32; 3];
    for k in 0..3 {
        let top = c00[k] * (1.0 - fx) + c10[k] * fx;
        let bot = c01[k] * (1.0 - fx) + c11[k] * fx;
        out[k] = top * (1.0 - fy) + bot * fy;
    }
    out
}

/// Softmax + argmax over logits. Returns (best_index, best_probability).
fn softmax_argmax(logits: &[f32]) -> (usize, f32) {
    if logits.is_empty() {
        return (0, 0.0);
    }
    let max = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let exps: Vec<f32> = logits.iter().map(|l| (l - max).exp()).collect();
    let sum: f32 = exps.iter().sum();
    let mut best = (0usize, f32::NEG_INFINITY);
    for (i, e) in exps.iter().enumerate() {
        let p = e / sum;
        if p > best.1 {
            best = (i, p);
        }
    }
    best
}

/// Greedy non-max suppression by score; suppress detections whose centres fall
/// within half an icon of an already-kept, higher-scoring one. Ported from the
/// spike's `detect()` NMS.
fn nms(mut raw: Vec<Detection>, icon: usize) -> Vec<Detection> {
    raw.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let r = icon as i32 / 2;
    let mut kept: Vec<Detection> = Vec::new();
    for d in raw {
        if kept
            .iter()
            .any(|k| (k.x - d.x).abs() < r && (k.y - d.y).abs() < r)
        {
            continue;
        }
        kept.push(d);
    }
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn softmax_picks_largest_logit() {
        let (idx, p) = softmax_argmax(&[0.1, 2.0, -1.0, 0.5]);
        assert_eq!(idx, 1);
        assert!(p > 0.5 && p <= 1.0);
    }

    #[test]
    fn softmax_probabilities_sum_to_one() {
        let logits = [1.0, 2.0, 3.0];
        let max = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let sum: f32 = logits.iter().map(|l| (l - max).exp()).sum();
        let total: f32 = logits.iter().map(|l| (l - max).exp() / sum).sum();
        assert!((total - 1.0).abs() < 1e-5);
    }

    #[test]
    fn nms_suppresses_overlapping_keeps_best() {
        let mk = |x, y, s: f32| Detection {
            label: 0,
            name: "x".into(),
            x,
            y,
            score: s,
        };
        // two overlapping (within icon/2=10) + one far away
        let dets = vec![mk(50, 50, 0.7), mk(54, 52, 0.9), mk(120, 120, 0.8)];
        let kept = nms(dets, 20);
        assert_eq!(kept.len(), 2);
        // the higher-scoring of the overlap pair survives
        assert!(kept.iter().any(|d| (d.x, d.y) == (54, 52)));
        assert!(!kept.iter().any(|d| (d.x, d.y) == (50, 50)));
    }

    /// Integration: load the REAL exported model (if present) and run one
    /// inference. This is the load-bearing check that tract accepts the ops the
    /// training pipeline exports — the biggest P2.2 risk. Skips (passes) when the
    /// model isn't on disk so CI without the artifact still goes green.
    /// cargo test runs from `src-tauri/`, so the model is one level up.
    #[test]
    fn real_model_loads_and_infers() {
        let model = Path::new("../models/minimap-detector.onnx");
        let labels = Path::new("../models/labels.json");
        if !model.exists() {
            eprintln!("skip: {} not present", model.display());
            return;
        }
        let d = Detector::load(model, labels);
        assert!(d.is_active(), "tract failed to load the exported ONNX");
        assert!(d.labels.iter().any(|l| l == NEGATIVE_LABEL));
        // A blank patch must classify without panicking and yield finite scores.
        let f = Frame::from_bgra(64, 64, vec![20u8; 64 * 64 * 4]).unwrap();
        let dets = d.detect(&f, &[(0, 0), (20, 20), (40, 40)], 20);
        for det in &dets {
            assert!(det.score.is_finite() && det.score >= CONF_THRESHOLD);
        }
    }

    #[test]
    fn missing_model_is_candidate_only() {
        let d = Detector::load(
            Path::new("does-not-exist.onnx"),
            Path::new("does-not-exist.json"),
        );
        assert!(!d.is_active());
        let f = Frame::from_bgra(40, 40, vec![0u8; 40 * 40 * 4]).unwrap();
        assert!(d.detect(&f, &[(0, 0), (10, 10)], 20).is_empty());
    }
}
