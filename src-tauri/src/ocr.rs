//! OCR engine wrapper — reads the Dota 2 scoreboard so G-Master can see the
//! enemy team's gold / level / net worth (info GSI never sends to the player).
//!
//! Phase A (this file): lazy-load the PP-OCRv5 ONNX models via `pure_onnx_ocr_sync`
//! (it runs on the same `tract-onnx` we already use for the minimap detector,
//! so no new runtime DLL), expose an `OcrEngine` handle the rest of the code
//! can pass an image into, and degrade gracefully when the model files aren't
//! present (the installer doesn't bundle them — see `models_dir()` for the
//! lookup order and `tools/ocr-download/` for the fetch script).
//!
//! Future phases will:
//!   B. plug in a region detector for the scoreboard (auto-recognize when
//!      Tab is held) + crop pre-OCR to the 10-row grid for ~10× speed,
//!   C. emit a `team-stats` Tauri event and render the Team NW Full module.
//!
//! Until the models land on disk, every public call returns `Unavailable` so
//! existing flows are unchanged (no startup cost, no panic).
//!
//! No `_unused` warnings while phases B/C land — the public surface is small.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use image::DynamicImage;

/// One OCR hit — a polygon + recognised text + the recognition confidence.
/// Mirrors `pure_onnx_ocr_sync::OcrResult` but without leaking the upstream type so
/// we can switch backends later (e.g. to bundled tessdata) without changing
/// the rest of the codebase.
#[derive(Clone, Debug, serde::Serialize)]
pub struct OcrHit {
    pub text: String,
    pub confidence: f32,
    /// Axis-aligned bounding box (min_x, min_y, max_x, max_y) in image pixels.
    pub bbox: (i32, i32, i32, i32),
}

/// What went wrong. Most callers only care about `Unavailable` vs everything
/// else, so they can fall back to a "scoreboard OCR off" UX without unwrapping.
#[derive(Debug)]
pub enum OcrError {
    /// Model files not present yet — run `tools/ocr-download/`.
    Unavailable,
    /// Never constructed yet — Phase B's crop preprocessing (region-detector
    /// crop before OCR) will be the first path that can fail to decode.
    #[allow(dead_code)]
    Decode(String),
    Inference(String),
}

impl std::fmt::Display for OcrError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OcrError::Unavailable => {
                write!(f, "OCR models not installed — see tools/ocr-download/")
            }
            OcrError::Decode(e) => write!(f, "image decode: {e}"),
            OcrError::Inference(e) => write!(f, "ocr inference: {e}"),
        }
    }
}

/// Look up the OCR models. Exe-relative first (so the bundled NSIS / dev
/// `pnpm tauri build` layouts both work), then a dev fallback so a hacker
/// developing in `cargo run` finds models dropped into the repo.
fn models_dir() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p = parent.join("models").join("ocr");
            if files_present(&p) {
                return Some(p);
            }
        }
    }
    let dev = PathBuf::from("models/ocr");
    if files_present(&dev) {
        return Some(dev);
    }
    None
}

fn files_present(dir: &Path) -> bool {
    dir.join("det.onnx").is_file()
        && dir.join("rec.onnx").is_file()
        && dir.join("ppocrv5_dict.txt").is_file()
}

// Lazily-built engine. `OnceLock` for the loaded handle so we never re-parse
// the ONNX. `Mutex<Option<...>>` so a missing-then-installed cycle works
// without a restart (Phase B will trigger a re-init when the user runs the
// download tool).
static ENGINE: OnceLock<Mutex<Option<pure_onnx_ocr_sync::OcrEngine>>> = OnceLock::new();

fn engine() -> Result<&'static Mutex<Option<pure_onnx_ocr_sync::OcrEngine>>, OcrError> {
    let m = ENGINE.get_or_init(|| Mutex::new(None));
    let mut g = m
        .lock()
        .map_err(|_| OcrError::Inference("engine mutex poisoned".into()))?;
    if g.is_none() {
        let dir = models_dir().ok_or(OcrError::Unavailable)?;
        let built = pure_onnx_ocr_sync::OcrEngineBuilder::new()
            .det_model_path(dir.join("det.onnx"))
            .rec_model_path(dir.join("rec.onnx"))
            .dictionary_path(dir.join("ppocrv5_dict.txt"))
            .build()
            .map_err(|e| OcrError::Inference(format!("engine build: {e}")))?;
        *g = Some(built);
    }
    drop(g);
    Ok(m)
}

/// True when the engine is wired and the model files are on disk. Cheap; safe
/// to poll from the UI to gray out OCR-dependent panels.
// Built-ahead scaffold: no caller yet — awaits Phase B (scoreboard region
// detector) / Phase C (`team-stats` event + Team NW Full module) wiring.
#[allow(dead_code)]
pub fn available() -> bool {
    models_dir().is_some()
}

/// Run OCR over an in-memory image. Returns a list of hits, ordered top-to-
/// bottom by the bbox y-min (so a per-row crop reads naturally for the
/// scoreboard layout).
// Built-ahead scaffold: no caller yet — awaits Phase B (scoreboard region
// detector) / Phase C (`team-stats` event + Team NW Full module) wiring.
#[allow(dead_code)]
pub fn recognize(img: &DynamicImage) -> Result<Vec<OcrHit>, OcrError> {
    let m = engine()?;
    let g = m
        .lock()
        .map_err(|_| OcrError::Inference("engine mutex poisoned".into()))?;
    let Some(eng) = g.as_ref() else {
        return Err(OcrError::Unavailable);
    };
    let raw = eng
        .run_from_image(img)
        .map_err(|e| OcrError::Inference(format!("{e}")))?;
    let mut hits: Vec<OcrHit> = raw
        .into_iter()
        .map(|r| {
            // bounding_box is a geo_types::Polygon — sweep its exterior ring
            // to derive an axis-aligned bbox the rest of the app can crop with.
            let exterior = r.bounding_box.exterior();
            let (mut xmin, mut ymin) = (f64::INFINITY, f64::INFINITY);
            let (mut xmax, mut ymax) = (f64::NEG_INFINITY, f64::NEG_INFINITY);
            for c in exterior.0.iter() {
                if c.x < xmin {
                    xmin = c.x;
                }
                if c.x > xmax {
                    xmax = c.x;
                }
                if c.y < ymin {
                    ymin = c.y;
                }
                if c.y > ymax {
                    ymax = c.y;
                }
            }
            OcrHit {
                text: r.text,
                confidence: r.confidence,
                bbox: (xmin as i32, ymin as i32, xmax as i32, ymax as i32),
            }
        })
        .collect();
    hits.sort_by_key(|h| h.bbox.1);
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_models_report_unavailable_not_panic() {
        // CI never has the OCR models — the function must report cleanly so the
        // UI/team-stats path can gray out instead of crashing. This is the
        // load-bearing test for the whole degrade-gracefully behavior.
        if available() {
            // Local dev with models present — skip; the assertion below is
            // about absence, not presence.
            return;
        }
        let img = DynamicImage::new_rgb8(40, 20);
        match recognize(&img) {
            Err(OcrError::Unavailable) => {}
            other => panic!("expected Unavailable when models absent, got {other:?}"),
        }
    }

    #[test]
    fn available_false_when_models_dir_missing() {
        if !std::path::Path::new("models/ocr").exists() {
            assert!(
                !available(),
                "available() must be false until tools/ocr-download/ has been run"
            );
        }
    }
}
