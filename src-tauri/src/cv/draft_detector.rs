//! Draft-CV hero recognizer — template matching of pick-screen portrait boxes
//! against bundled reference portraits ("option 1").
//!
//! Why template matching here (vs ONNX on the minimap): the pick-screen portrait
//! is large, static, and unoccluded — no fog/noise/scale variance — so normalized
//! cross-correlation (NCC) is accurate and needs zero training. (The S-1 spike
//! showed NCC tops out ~10% on the tiny fogged minimap blip, which is why the
//! minimap uses ONNX.) A trained portrait ONNX model ("option 2") can slot in
//! behind the same recognize() seam later.
//!
//! Templates are cached under the app's local data directory as
//! `<label>.png`, where `<label>` is the detector's hero form (e.g.
//! `crystal_maiden`). They are fetched only after entering hero selection;
//! the recognizer has no network dependency once the images are cached.
//! A missing or invalid cache degrades to unknown slots until local references
//! are available, so it never fabricates a roster.

use std::collections::HashSet;
use std::io::Read;
use std::path::Path;
use std::time::Duration;

use super::Frame;

/// Templates + query patches are resampled to this square before NCC.
const TEMPLATE_SIDE: usize = 48;

/// Minimum NCC score (−1..1) to accept a portrait as a given hero. Portraits are
/// clean, so this can be fairly strict; NEEDS-TUNING once real templates exist.
const NCC_THRESHOLD: f32 = 0.55;
/// A close runner-up is evidence that the crop is too small or obscured to
/// identify safely. Leave that slot unknown instead of shifting a wrong hero
/// into the roster and constraining minimap detections with it.
const NCC_MARGIN: f32 = 0.08;
const TEMPLATE_URL: &str = "https://cdn.steamstatic.com/apps/dota2/images/heroes";
const MAX_TEMPLATE_BYTES: usize = 512 * 1024;
const TEMPLATE_FETCH_WORKERS: usize = 16;

/// Reference-portrait recognizer, or an idle no-op when no templates are present.
pub struct DraftRecognizer {
    /// (label, unit zero-mean feature of length TEMPLATE_SIDE²).
    templates: Vec<(String, Vec<f32>)>,
}

impl DraftRecognizer {
    /// Load every `<label>.png` in `dir` as a template. Never fails — a missing
    /// dir or unreadable file just yields fewer (or zero) templates.
    pub fn load(dir: &Path) -> Self {
        Self::load_from_dirs(&[dir])
    }

    /// Load writable-cache templates first, then any packaged reference pack.
    /// A packaged template wins only when the cache has no file for its label.
    pub fn load_from_dirs(dirs: &[&Path]) -> Self {
        let mut templates = Vec::new();
        let mut loaded_labels = HashSet::new();
        for dir in dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let is_png = path
                        .extension()
                        .and_then(|x| x.to_str())
                        .map(|x| x.eq_ignore_ascii_case("png"))
                        .unwrap_or(false);
                    if !is_png {
                        continue;
                    }
                    if let Some(label) = path.file_stem().and_then(|s| s.to_str()) {
                        if loaded_labels.contains(label) {
                            continue;
                        }
                        if let Some(feat) = load_template(&path) {
                            loaded_labels.insert(label.to_string());
                            templates.push((label.to_string(), feat));
                        }
                    }
                }
            }
        }
        if templates.is_empty() {
            eprintln!("[draft] no portrait templates — Draft-CV recognizer idle");
        } else {
            eprintln!("[draft] loaded {} portrait templates", templates.len());
        }
        DraftRecognizer { templates }
    }

    /// True when at least one template is loaded (vs the idle no-op).
    pub fn is_active(&self) -> bool {
        !self.templates.is_empty()
    }

    pub fn template_count(&self) -> usize {
        self.templates.len()
    }

    /// Fetch missing, public hero scoreboard portraits into a local cache. The
    /// requests contain only static hero names; no match state or player data
    /// is sent. Callers run this off the capture thread, and all inference
    /// continues to use local files only.
    pub fn fetch_missing_templates(dir: &Path, labels_path: &Path) -> usize {
        let Ok(labels_json) = std::fs::read_to_string(labels_path) else {
            return 0;
        };
        let Ok(labels) = serde_json::from_str::<Vec<String>>(&labels_json) else {
            return 0;
        };
        if std::fs::create_dir_all(dir).is_err() {
            return 0;
        }

        let missing = labels
            .into_iter()
            .filter(|label| label != "__negative__" && is_safe_label(label))
            .filter(|label| {
                let path = dir.join(format!("{label}.png"));
                !path.exists() || load_template(&path).is_none()
            })
            .collect::<Vec<_>>();
        if missing.is_empty() {
            return 0;
        }

        let Ok(client) = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(4))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 3 {
                    attempt.stop()
                } else if matches!(
                    attempt.url().host_str(),
                    Some("cdn.steamstatic.com" | "cdn.cloudflare.steamstatic.com")
                ) {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build()
        else {
            return 0;
        };

        let batch_size = missing.len().div_ceil(TEMPLATE_FETCH_WORKERS);
        let downloaded = std::sync::atomic::AtomicUsize::new(0);
        std::thread::scope(|scope| {
            for batch in missing.chunks(batch_size.max(1)) {
                let client = client.clone();
                let dir = dir.to_path_buf();
                let downloaded = &downloaded;
                scope.spawn(move || {
                    for label in batch {
                        if download_template(&client, &dir, label) {
                            downloaded.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        }
                    }
                });
            }
        });
        downloaded.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Classify one cropped portrait box. `None` when the recognizer is idle or no
    /// template clears [`NCC_THRESHOLD`]. Returns the winning `(label, score)`.
    pub fn recognize(&self, frame: &Frame) -> Option<(String, f32)> {
        if self.templates.is_empty() {
            return None;
        }
        let q = frame_feature(frame);
        let mut best_idx = 0usize;
        let mut best_score = f32::NEG_INFINITY;
        let mut second_score = f32::NEG_INFINITY;
        for (i, (_, t)) in self.templates.iter().enumerate() {
            let score = dot(&q, t);
            if score > best_score {
                second_score = best_score;
                best_score = score;
                best_idx = i;
            } else if score > second_score {
                second_score = score;
            }
        }
        (best_score >= NCC_THRESHOLD && best_score - second_score >= NCC_MARGIN)
            .then(|| (self.templates[best_idx].0.clone(), best_score))
    }
}

fn is_safe_label(label: &str) -> bool {
    !label.is_empty()
        && label
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn download_template(client: &reqwest::blocking::Client, dir: &Path, label: &str) -> bool {
    let variants = [format!("{label}_sb.png"), format!("{label}.png")];
    for name in variants {
        let url = format!("{TEMPLATE_URL}/{name}");
        let Ok(response) = client.get(url).send() else {
            continue;
        };
        if !response.status().is_success()
            || !matches!(
                response.url().host_str(),
                Some("cdn.steamstatic.com" | "cdn.cloudflare.steamstatic.com")
            )
        {
            continue;
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_TEMPLATE_BYTES as u64)
        {
            continue;
        }
        let mut limited = response.take((MAX_TEMPLATE_BYTES + 1) as u64);
        let mut bytes = Vec::with_capacity(MAX_TEMPLATE_BYTES.min(64 * 1024));
        if limited.read_to_end(&mut bytes).is_err() {
            continue;
        }
        if bytes.is_empty() || bytes.len() > MAX_TEMPLATE_BYTES {
            continue;
        }
        let Ok(image) = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png) else {
            continue;
        };
        let (width, height) = (image.width(), image.height());
        let aspect = width as f32 / height.max(1) as f32;
        if width < 48 || height < 24 || !(1.4..=2.1).contains(&aspect) {
            continue;
        }

        let final_path = dir.join(format!("{label}.png"));
        let temp_path = dir.join(format!("{label}.png.part"));
        if std::fs::write(&temp_path, bytes).is_err() {
            let _ = std::fs::remove_file(temp_path);
            return false;
        }
        let _ = std::fs::remove_file(&final_path);
        if std::fs::rename(&temp_path, final_path).is_err() {
            let _ = std::fs::remove_file(temp_path);
            return false;
        }
        return true;
    }
    false
}

/// Decode a PNG template, grayscale + resize to `TEMPLATE_SIDE`, return its unit
/// zero-mean NCC feature. `None` on a decode failure.
fn load_template(path: &Path) -> Option<Vec<f32>> {
    let img = image::open(path).ok()?.to_luma8();
    let resized = image::imageops::resize(
        &img,
        TEMPLATE_SIDE as u32,
        TEMPLATE_SIDE as u32,
        image::imageops::FilterType::Triangle,
    );
    let gray: Vec<f32> = resized.pixels().map(|p| p[0] as f32 / 255.0).collect();
    Some(unit_zero_mean(&gray))
}

/// Nearest-neighbour resample a cropped portrait `Frame` to `TEMPLATE_SIDE` grays,
/// then to its unit zero-mean NCC feature.
fn frame_feature(frame: &Frame) -> Vec<f32> {
    let (fw, fh) = (frame.width, frame.height);
    let mut gray = vec![0f32; TEMPLATE_SIDE * TEMPLATE_SIDE];
    for oy in 0..TEMPLATE_SIDE {
        let sy = if fh == 0 { 0 } else { oy * fh / TEMPLATE_SIDE };
        for ox in 0..TEMPLATE_SIDE {
            let sx = if fw == 0 { 0 } else { ox * fw / TEMPLATE_SIDE };
            gray[oy * TEMPLATE_SIDE + ox] = frame.gray(sx, sy);
        }
    }
    unit_zero_mean(&gray)
}

/// Zero-mean then L2-normalise, so a plain dot product of two features is their
/// normalized cross-correlation (invariant to brightness/contrast shifts).
fn unit_zero_mean(v: &[f32]) -> Vec<f32> {
    if v.is_empty() {
        return Vec::new();
    }
    let mean = v.iter().sum::<f32>() / v.len() as f32;
    let centered: Vec<f32> = v.iter().map(|x| x - mean).collect();
    let norm = centered.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm < 1e-6 {
        return vec![0.0; v.len()]; // flat patch — no signal
    }
    centered.iter().map(|x| x / norm).collect()
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_dir_is_idle_and_recognizes_nothing() {
        let r = DraftRecognizer::load(Path::new("does-not-exist-portraits"));
        assert!(!r.is_active());
        let f = Frame::from_bgra(20, 20, vec![10u8; 20 * 20 * 4]).unwrap();
        assert!(r.recognize(&f).is_none());
    }

    #[test]
    fn ncc_of_a_feature_with_itself_is_one() {
        let raw: Vec<f32> = (0..TEMPLATE_SIDE * TEMPLATE_SIDE)
            .map(|i| (i % 17) as f32)
            .collect();
        let feat = unit_zero_mean(&raw);
        assert!((dot(&feat, &feat) - 1.0).abs() < 1e-4);
    }

    #[test]
    fn flat_patch_has_no_signal() {
        let feat = unit_zero_mean(&vec![0.5; 64]);
        assert!(feat.iter().all(|&x| x == 0.0));
    }

    #[test]
    fn recognizes_the_matching_template_over_a_different_one() {
        // Two synthetic "portraits": a left-bright gradient and a checkerboard.
        let grad = synthetic_frame(|x, _y| (x * 4) as u8);
        let check = synthetic_frame(|x, y| if (x + y) % 2 == 0 { 240 } else { 15 });

        let mut r = DraftRecognizer {
            templates: Vec::new(),
        };
        r.templates
            .push(("gradient_hero".into(), frame_feature(&grad)));
        r.templates
            .push(("checker_hero".into(), frame_feature(&check)));

        let (label, score) = r.recognize(&grad).expect("should match a template");
        assert_eq!(label, "gradient_hero");
        assert!(score > 0.9, "self-match NCC should be near 1, got {score}");
    }

    /// A 40×40 BGRA frame whose gray value at (x,y) is `f(x,y)`.
    fn synthetic_frame(f: impl Fn(usize, usize) -> u8) -> Frame {
        let (w, h) = (40usize, 40usize);
        let mut bgra = vec![0u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let v = f(x, y);
                let i = (y * w + x) * 4;
                bgra[i] = v; // B
                bgra[i + 1] = v; // G
                bgra[i + 2] = v; // R  (gray = v)
                bgra[i + 3] = 255;
            }
        }
        Frame::from_bgra(w, h, bgra).unwrap()
    }
}
