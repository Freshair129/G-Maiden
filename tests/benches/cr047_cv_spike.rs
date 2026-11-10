//! CR-047 measurement spike. Loaded only by detector.rs under cfg(test).
//! No capture, app startup, GPU, network, model training, or dependency changes.
//! Run the ignored test in an admitted, exclusively locked Cargo lane, in release.
//! Timings include instrumentation overhead and are NOT live acceptance.

use super::*;
use crate::cv::prefilter::{prefilter_candidates, DEFAULT_THRESHOLD_FRAC};
use std::time::Instant;

const FRAMES: usize = 10;

// Exact fixture construction from capture.rs::tests::synthetic_frame.
fn synthetic_frame(n: usize) -> Frame {
    let (w, h, icon) = (256usize, 256usize, 20usize);
    let mut bgra = vec![0u8; w * h * 4];
    for (i, px) in bgra.chunks_mut(4).enumerate() {
        let x = i % w;
        px.copy_from_slice(&[18, 36 + (x % 7) as u8, 14, 255]);
    }
    for k in 0..n {
        let bx = (k * 37) % (w - icon);
        let by = (k * 53) % (h - icon);
        for yy in by..by + icon {
            for xx in bx..bx + icon {
                let p = (yy * w + xx) * 4;
                bgra[p..p + 3].copy_from_slice(&[41, 41, 219]);
            }
        }
    }
    Frame::from_bgra(w, h, bgra).unwrap()
}

fn asset_fixture() -> Frame {
    // Existing icon assets, composed deterministically; NOT a real-match corpus.
    let mut frame = synthetic_frame(0);
    for (k, name) in ["axe", "crystal_maiden", "pudge", "lina", "juggernaut"]
        .iter()
        .enumerate()
    {
        let icon = image::open(format!("../assets/minimap-icons/{name}.png"))
            .expect("required repository icon")
            .resize_exact(20, 20, image::imageops::FilterType::Triangle)
            .to_rgba8();
        let (bx, by) = ((k * 37) % 236, (k * 53) % 236);
        for y in 0..20 {
            for x in 0..20 {
                let p = icon.get_pixel(x, y).0;
                let at = ((by + y as usize) * 256 + bx + x as usize) * 4;
                for (c, value) in [p[2], p[1], p[0]].into_iter().enumerate() {
                    frame.bgra[at + c] = ((u32::from(value) * u32::from(p[3])
                        + u32::from(frame.bgra[at + c]) * (255 - u32::from(p[3])))
                        / 255) as u8;
                }
            }
        }
    }
    frame
}

fn encoded(detections: Vec<Detection>) -> Vec<(usize, String, i32, i32, u32)> {
    detections
        .into_iter()
        .map(|d| (d.label, d.name, d.x, d.y, d.score.to_bits()))
        .collect()
}

fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1_000.0
}

fn ungated_grid_count(frame: &Frame, icon: usize) -> usize {
    let mut offsets = Vec::new();
    let half = icon as i32 / 2;
    for gy in 0..frame.height / icon {
        for gx in 0..frame.width / icon {
            for oy in [-half, 0, half] {
                for ox in [-half, 0, half] {
                    offsets.push((
                        (gx as i32 * icon as i32 + ox).clamp(0, (frame.width - icon) as i32),
                        (gy as i32 * icon as i32 + oy).clamp(0, (frame.height - icon) as i32),
                    ));
                }
            }
        }
    }
    offsets.sort_unstable();
    offsets.dedup();
    offsets.len()
}

#[test]
#[ignore = "CR-047 offline profiling spike; requires admitted release Cargo lane"]
fn cr047_cpu_profile() {
    assert!(
        !cfg!(debug_assertions),
        "use --release; debug is not comparable"
    );
    assert_eq!(
        std::env::current_dir().unwrap().file_name().unwrap(),
        "src-tauri"
    );
    let start = Instant::now();
    let detector = Detector::load(
        Path::new("../models/minimap-detector.onnx"),
        Path::new("../models/labels.json"),
    );
    assert!(
        detector.is_active(),
        "missing/invalid model is FAIL, not a passing skip"
    );
    let model = detector.model.as_ref().unwrap();
    println!(
        "CR047_JSON {}",
        serde_json::json!({
            "kind":"startup", "evidence":"measured-offline", "load_ms":ms(start),
            "model_bytes":std::fs::metadata("../models/minimap-detector.onnx").unwrap().len(),
            "classes":detector.labels.len(), "frames_per_case":FRAMES,
            "logical_cpus":std::thread::available_parallelism().unwrap().get(),
            "whole_app_cpu_pct":null, "gpu_ms":null, "dota_fps_delta":null,
            "aggregate_working_set_bytes":null
        })
    );
    // Warm only the model. Each case starts with a new exact-patch cache.
    for _ in 0..5 {
        model
            .run(tvec!(patch_rgb_tensor(&synthetic_frame(5), 0, 0, 20)
                .into_tensor()
                .into()))
            .unwrap();
    }
    for (fixture, original) in [
        ("capture-flat", synthetic_frame(0)),
        ("capture-five", synthetic_frame(5)),
        ("capture-fifteen-stress", synthetic_frame(15)),
        ("repo-icons-five-composite", asset_fixture()),
    ] {
        let ungated_candidates = ungated_grid_count(&original, 20);
        for sequence in ["repeat", "change-all-blue-bytes"] {
            for threshold in [DEFAULT_THRESHOLD_FRAC, 0.36] {
                for cached in [true, false] {
                    let mut cache = super::super::patch_cache::PatchCache::default();
                    for index in 0..FRAMES {
                        let mut frame = original.clone();
                        if sequence == "change-all-blue-bytes" {
                            for px in frame.bgra.chunks_mut(4) {
                                px[0] = px[0].wrapping_add(index as u8);
                            }
                        }
                        let total = Instant::now();
                        let start = Instant::now();
                        let candidates =
                            prefilter_candidates(&frame, 20, threshold, crate::cv::DIRE_RING);
                        let prefilter_ms = ms(start);
                        cache.begin_frame();
                        let mut raw = Vec::new();
                        let (mut preprocess_ms, mut model_ms, mut softmax_ms) = (0., 0., 0.);
                        let (mut lookup_ms, mut calls) = (0., 0usize);
                        for &(x, y) in &candidates {
                            let start = Instant::now();
                            let input = patch_rgb_tensor(&frame, x, y, 20).into_tensor();
                            preprocess_ms += ms(start);
                            let start = Instant::now();
                            let key = input
                                .as_slice::<f32>()
                                .unwrap()
                                .iter()
                                .map(|v| v.to_bits())
                                .collect();
                            let before = model_ms + softmax_ms;
                            let infer = || {
                                calls += 1;
                                let start = Instant::now();
                                let output = model.run(tvec!(input.into())).unwrap();
                                model_ms += ms(start);
                                let start = Instant::now();
                                let values = output[0].to_array_view::<f32>().unwrap();
                                let result =
                                    softmax_argmax(&values.iter().copied().collect::<Vec<_>>());
                                softmax_ms += ms(start);
                                Some(result)
                            };
                            let result = if cached {
                                cache.classify(key, infer)
                            } else {
                                let mut infer = infer;
                                infer()
                            };
                            // Residual includes key copy/hash/equality/cache, closure/timer overhead.
                            lookup_ms += (ms(start) - (model_ms + softmax_ms - before)).max(0.);
                            let (label, score) = result.unwrap();
                            if Some(label) != detector.negative_idx && score >= CONF_THRESHOLD {
                                raw.push(Detection {
                                    label,
                                    name: detector.labels[label].clone(),
                                    x,
                                    y,
                                    score,
                                });
                            }
                        }
                        let start = Instant::now();
                        let result = nms(raw, 20);
                        let nms_ms = ms(start);
                        let total_ms = ms(total);
                        // Outside the timed region: compare the instrumented path against production.
                        let oracle_start = Instant::now();
                        let oracle = detector.detect(&frame, &candidates, 20);
                        let oracle_ms = ms(oracle_start);
                        assert_eq!(encoded(result), encoded(oracle), "profiling path drift");
                        println!(
                            "CR047_JSON {}",
                            serde_json::json!({
                                "kind":"frame", "evidence":"measured-offline", "fixture":fixture,
                                "sequence":sequence, "threshold":threshold, "cached":cached, "index":index,
                                "width":frame.width, "height":frame.height, "icon":20,
                                "all_pixel_windows":(frame.width-19)*(frame.height-19),
                                "ungated_grid_candidates_count_only":ungated_candidates,
                                "prefilter_removed_grid_candidates":ungated_candidates-candidates.len(),
                                "candidates":candidates.len(), "inference_calls":calls,
                                "exact_patch_hits":if cached {cache.hits} else {0},
                                "prefilter_ms":prefilter_ms, "crop_resize_normalize_ms":preprocess_ms,
                                "key_cache_overhead_ms":lookup_ms, "model_ms":model_ms,
                                "model_ms_per_call":if calls>0 {Some(model_ms/calls as f64)} else {None},
                                "softmax_ms":softmax_ms, "nms_ms":nms_ms, "total_ms":total_ms,
                                "oracle_ms_diagnostic_only":oracle_ms
                            })
                        );
                    }
                }
            }
        }
    }
}
