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

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;
use std::time::Duration;

use super::Frame;

/// Templates + query patches are resampled to this square before NCC.
const TEMPLATE_SIDE: usize = 48;

/// Minimum NCC score (−1..1) to accept a portrait as a given hero. Portraits are
/// clean, so this can be fairly strict; NEEDS-TUNING once real templates exist.
const NCC_THRESHOLD: f32 = 0.75;
/// A close runner-up is evidence that the crop is too small or obscured to
/// identify safely. Leave that slot unknown instead of shifting a wrong hero
/// into the roster and constraining minimap detections with it.
const NCC_MARGIN: f32 = 0.10;
const TEMPLATE_URL: &str = "https://cdn.steamstatic.com/apps/dota2/images/dota_react/heroes";
const MAX_TEMPLATE_BYTES: usize = 512 * 1024;
const TEMPLATE_FETCH_WORKERS: usize = 16;

/// Reference-portrait recognizer, or an idle no-op when no templates are present.
pub struct DraftRecognizer {
    /// (label, unit zero-mean feature of length TEMPLATE_SIDE²).
    templates: Vec<PortraitTemplate>,
}

struct PortraitTemplate {
    label: String,
    full: Vec<f32>,
    hud: Vec<f32>,
    hud_color: Vec<f32>,
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
        let mut loaded_files = HashSet::new();
        for dir in dirs {
            for folder in [dir.to_path_buf(), dir.join("hud-v2")] {
                let Ok(entries) = std::fs::read_dir(&folder) else {
                    continue;
                };
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|x| x.to_str()) != Some("png") {
                        continue;
                    }
                    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                        continue;
                    };
                    let label = stem.split_once("__").map_or(stem, |(label, _)| label);
                    if super::identity::HeroId::from_label(label).is_none() {
                        continue;
                    }
                    let key = (folder.ends_with("hud-v2"), stem.to_string());
                    if loaded_files.contains(&key) {
                        continue;
                    }
                    if let Ok(img) = image::open(&path) {
                        loaded_files.insert(key);
                        templates.push(PortraitTemplate {
                            label: label.to_string(),
                            full: image_feature(&img, false),
                            hud: image_feature(&img, true),
                            hud_color: hud_color_feature(&img),
                        });
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
        let hud_dir = dir.join("hud-v2");
        if std::fs::create_dir_all(&hud_dir).is_err() {
            return 0;
        }

        let missing = labels
            .into_iter()
            .filter(|label| label != "__negative__" && is_safe_label(label))
            .filter(|label| {
                let path = hud_dir.join(format!("{label}__default.png"));
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
                let dir = hud_dir.clone();
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
        self.recognize_at(frame, NCC_THRESHOLD, NCC_MARGIN, false)
    }

    pub fn recognize_hud(&self, frame: &Frame) -> Option<(String, f32)> {
        self.recognize_at(frame, 0.75, 0.12, true)
    }

    fn recognize_at(
        &self,
        frame: &Frame,
        threshold: f32,
        margin: f32,
        hud: bool,
    ) -> Option<(String, f32)> {
        let q = if hud {
            frame_hud_feature(frame)
        } else {
            frame_feature(frame)
        };
        let color_query = hud.then(|| frame_hud_color_feature(frame));
        // Variants of one hero are corroborating references, not rival identities.
        let mut heroes: HashMap<&str, f32> = HashMap::new();
        for t in &self.templates {
            let gray_score = dot(&q, if hud { &t.hud } else { &t.full });
            let score = color_query
                .as_ref()
                .map_or(gray_score, |rgb| gray_score.min(dot(rgb, &t.hud_color)));
            let best = heroes.entry(&t.label).or_insert(f32::NEG_INFINITY);
            *best = best.max(score);
        }
        if heroes.len() < 2 {
            return None;
        }
        let mut best_label = "";
        let mut best_score = f32::NEG_INFINITY;
        let mut second_score = f32::NEG_INFINITY;
        for (label, score) in heroes {
            if score > best_score {
                second_score = best_score;
                best_score = score;
                best_label = label;
            } else if score > second_score {
                second_score = score;
            }
        }
        (best_score >= threshold && best_score - second_score >= margin)
            .then(|| (best_label.to_string(), best_score))
    }
}

fn is_safe_label(label: &str) -> bool {
    !label.is_empty()
        && label
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn download_template(client: &reqwest::blocking::Client, dir: &Path, label: &str) -> bool {
    let variants = [format!("{label}.png")];
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

        let final_path = dir.join(format!("{label}__default.png"));
        let temp_path = dir.join(format!("{label}__default.png.part"));
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
    Some(image_feature(&image::open(path).ok()?, false))
}

fn image_feature(img: &image::DynamicImage, hud: bool) -> Vec<f32> {
    let gray = img.to_luma8();
    // Normalize geometry first, then exclude the frame and lower ult/facet icons.
    // Identical support on reference/query prevents matching HUD decorations.
    let gray = if hud {
        let aligned = image::imageops::resize(&gray, 60, 36, image::imageops::FilterType::Triangle);
        image::imageops::crop_imm(&aligned, 7, 2, 46, 21).to_image()
    } else {
        gray
    };
    let resized = image::imageops::resize(
        &gray,
        TEMPLATE_SIDE as u32,
        TEMPLATE_SIDE as u32,
        image::imageops::FilterType::Triangle,
    );
    unit_zero_mean(
        &resized
            .pixels()
            .map(|p| p[0] as f32 / 255.0)
            .collect::<Vec<_>>(),
    )
}

fn captured_feature(frame: &Frame, hud: bool) -> Vec<f32> {
    if frame.width == 0 || frame.height == 0 {
        return vec![0.0; TEMPLATE_SIDE * TEMPLATE_SIDE];
    }
    let rgb = image::RgbImage::from_fn(frame.width as u32, frame.height as u32, |x, y| {
        let i = (y as usize * frame.width + x as usize) * 4;
        image::Rgb([frame.bgra[i + 2], frame.bgra[i + 1], frame.bgra[i]])
    });
    image_feature(&image::DynamicImage::ImageRgb8(rgb), hud)
}

fn frame_feature(frame: &Frame) -> Vec<f32> {
    captured_feature(frame, false)
}
fn frame_hud_feature(frame: &Frame) -> Vec<f32> {
    captured_feature(frame, true)
}

fn hud_color_feature(img: &image::DynamicImage) -> Vec<f32> {
    let aligned = image::imageops::resize(
        &img.to_rgb8(),
        60,
        36,
        image::imageops::FilterType::Triangle,
    );
    let inner = image::imageops::crop_imm(&aligned, 7, 2, 46, 21).to_image();
    let resized = image::imageops::resize(
        &inner,
        TEMPLATE_SIDE as u32,
        TEMPLATE_SIDE as u32,
        image::imageops::FilterType::Triangle,
    );
    unit_zero_mean(
        &resized
            .as_raw()
            .iter()
            .map(|v| *v as f32 / 255.0)
            .collect::<Vec<_>>(),
    )
}

fn frame_hud_color_feature(frame: &Frame) -> Vec<f32> {
    if frame.width == 0 || frame.height == 0 {
        return vec![0.0; TEMPLATE_SIDE * TEMPLATE_SIDE * 3];
    }
    let rgb = image::RgbImage::from_fn(frame.width as u32, frame.height as u32, |x, y| {
        let i = (y as usize * frame.width + x as usize) * 4;
        image::Rgb([frame.bgra[i + 2], frame.bgra[i + 1], frame.bgra[i]])
    });
    hud_color_feature(&image::DynamicImage::ImageRgb8(rgb))
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
    fn reference_and_capture_use_identical_resampling_and_luma() {
        let rgb = image::RgbImage::from_fn(60, 36, |x, y| {
            image::Rgb([
                ((x * 41 + y * 3) % 256) as u8,
                ((x * 7 + y * 31) % 256) as u8,
                ((x * 17 + y * 13) % 256) as u8,
            ])
        });
        let mut bytes = Vec::new();
        for p in rgb.pixels() {
            bytes.extend_from_slice(&[p[2], p[1], p[0], 255]);
        }
        let frame = Frame::from_bgra(60, 36, bytes).unwrap();
        let gray = image::DynamicImage::ImageRgb8(rgb).to_luma8();
        let resized = image::imageops::resize(&gray, 48, 48, image::imageops::FilterType::Triangle);
        let reference = unit_zero_mean(
            &resized
                .pixels()
                .map(|p| p[0] as f32 / 255.0)
                .collect::<Vec<_>>(),
        );
        assert!(dot(&reference, &frame_feature(&frame)) > 0.9999);
    }

    #[test]
    fn recognizes_the_matching_template_over_a_different_one() {
        // Two synthetic "portraits": a left-bright gradient and a checkerboard.
        let grad = synthetic_frame(|x, _y| (x * 4) as u8);
        let check = synthetic_frame(|x, y| if (x + y) % 2 == 0 { 240 } else { 15 });

        let mut r = DraftRecognizer {
            templates: Vec::new(),
        };
        r.templates.push(template("gradient_hero", &grad));
        r.templates.push(template("checker_hero", &check));

        let (label, score) = r.recognize(&grad).expect("should match a template");
        assert_eq!(label, "gradient_hero");
        assert!(score > 0.9, "self-match NCC should be near 1, got {score}");
    }

    #[test]
    fn a_single_or_ambiguous_reference_cannot_confirm_identity() {
        let frame = synthetic_frame(|x, _| (x * 4) as u8);
        let mut recognizer = DraftRecognizer {
            templates: vec![template("axe", &frame)],
        };
        assert!(recognizer.recognize_hud(&frame).is_none());
        recognizer.templates.push(template("lina", &frame));
        assert!(recognizer.recognize_hud(&frame).is_none());
    }

    #[test]
    #[ignore = "requires local Steam screenshot and public portrait cache"]
    fn local_hud_portrait_reference_probe() {
        let path = std::env::var("GMAIDEN_PORTRAIT_FIXTURE").expect("local image path");
        let cache = std::env::var("GMAIDEN_PORTRAIT_CACHE").expect("local reference cache");
        let image = image::open(path).unwrap().to_rgba8();
        let recognizer = DraftRecognizer::load(Path::new(&cache));
        let mut names = Vec::new();
        for b in crate::cv::hero_hud::HeroHudRegion::identity_boxes(image.width(), image.height()) {
            let crop = image::imageops::crop_imm(&image, b.x, b.y, b.width, b.height).to_image();
            let mut bytes = crop.into_raw();
            for pixel in bytes.chunks_exact_mut(4) {
                pixel.swap(0, 2);
            }
            let frame = Frame::from_bgra(b.width as usize, b.height as usize, bytes).unwrap();
            let result = recognizer.recognize_hud(&frame);
            eprintln!("HUD portrait {result:?}");
            names.push(result.map(|(name, _)| name));
        }
        // Static game assets are independent references; no screenshot is a template.
        assert_eq!(names[0].as_deref(), Some("morphling"));
        let expected = [
            "morphling",
            "dawnbreaker",
            "ringmaster",
            "techies",
            "slark",
            "tidehunter",
            "pugna",
            "dragon_knight",
            "drow_ranger",
            "undying",
        ];
        assert_eq!(
            names.iter().filter(|name| name.is_some()).count(),
            10,
            "both real teams must be fully recognized without lowering confidence"
        );
        for (slot, name) in names.iter().enumerate() {
            if let Some(name) = name {
                assert_eq!(name, expected[slot], "wrong identity in slot {slot}");
                assert!(super::super::identity::HeroId::from_label(name).is_some());
            }
        }
        for y in [180, 300, 420, 540] {
            for x in (300..1700).step_by(100) {
                let mut bytes = image::imageops::crop_imm(&image, x, y, 62, 35)
                    .to_image()
                    .into_raw();
                for pixel in bytes.chunks_exact_mut(4) {
                    pixel.swap(0, 2);
                }
                let patch = Frame::from_bgra(62, 35, bytes).unwrap();
                assert!(
                    recognizer.recognize_hud(&patch).is_none(),
                    "terrain is not a hero at {x},{y}"
                );
            }
        }
        // Use the real portrait reads to admit identity, then challenge Sentry
        // with every model label. Repeating minimap guesses cannot grow roster.
        let mut votes = crate::cv::roster::RosterVotes::default();
        for now in [0, 1000, 2000] {
            votes.observe(&names, now);
        }
        let slots = votes.observe(&names, 3000);
        let radiant: Vec<_> = slots[..5]
            .iter()
            .map(|n| n.clone().unwrap_or_default())
            .collect();
        let dire: Vec<_> = slots[5..]
            .iter()
            .map(|n| n.clone().unwrap_or_default())
            .collect();
        let allowed = crate::cv::roster::enemy_labels(&radiant, &dire, 2);
        let mut sentry = crate::sentry::Sentry::new();
        sentry.retain_allowed(&allowed);
        let labels: Vec<String> =
            serde_json::from_str(include_str!("../../../models/labels.json")).unwrap();
        let guesses: Vec<_> = labels
            .into_iter()
            .enumerate()
            .map(|(label, name)| crate::cv::detector::Detection {
                label,
                name,
                x: 10,
                y: 10,
                score: 0.99,
            })
            .collect();
        let region = crate::cv::region::MinimapRegion {
            x: 0,
            y: 0,
            side: 256,
        };
        for now in [0, 150, 300, 450] {
            sentry.update(&guesses, &region, now);
        }
        let events = sentry.update(&[], &region, 6000);
        assert_eq!(events.len(), allowed.len());
        assert!(
            !events.is_empty(),
            "positive control must include a real recognized portrait"
        );
        for event in events {
            assert!(allowed.contains(&event.hero));
            assert_eq!(
                event.hero_id,
                crate::cv::identity::HeroId::from_label(&event.hero).unwrap()
            );
        }
        let root = std::path::Path::new(&std::env::var("GMAIDEN_PORTRAIT_FIXTURE").unwrap())
            .parent()
            .unwrap()
            .to_path_buf();
        let second_match = [
            Some("tiny"),
            Some("ember_spirit"),
            Some("bounty_hunter"),
            Some("crystal_maiden"),
            Some("dragon_knight"),
            Some("zuus"),
            Some("oracle"),
            Some("legion_commander"),
            Some("earthshaker"),
            Some("medusa"),
        ];
        for (file, expected) in [
            (
                "20261016184707_1.jpg",
                [
                    Some("windrunner"),
                    Some("shadow_shaman"),
                    Some("centaur"),
                    Some("lina"),
                    None,
                    Some("axe"),
                    Some("lion"),
                    Some("pudge"),
                    Some("mirana"),
                    Some("drow_ranger"),
                ],
            ),
            ("20261018144117_1.jpg", second_match),
            ("20261018144110_1.jpg", second_match),
            ("20261018141746_1.jpg", [None; 10]), // actual Dota main menu, no match HUD
            (
                "20261018144123_1.jpg",
                [
                    Some("tiny"),
                    Some("ember_spirit"),
                    Some("bounty_hunter"),
                    Some("crystal_maiden"),
                    Some("dragon_knight"),
                    Some("zuus"),
                    Some("oracle"),
                    Some("legion_commander"),
                    Some("earthshaker"),
                    Some("medusa"),
                ],
            ),
        ] {
            let image = image::open(root.join(file)).unwrap().to_rgba8();
            let mut votes = crate::cv::roster::RosterVotes::default();
            let mut samples = Vec::new();
            for (slot, b) in
                crate::cv::hero_hud::HeroHudRegion::identity_boxes(image.width(), image.height())
                    .iter()
                    .enumerate()
            {
                let mut bytes = image::imageops::crop_imm(&image, b.x, b.y, b.width, b.height)
                    .to_image()
                    .into_raw();
                for pixel in bytes.chunks_exact_mut(4) {
                    pixel.swap(0, 2);
                }
                let frame = Frame::from_bgra(b.width as usize, b.height as usize, bytes).unwrap();
                let read = recognizer.recognize_hud(&frame).map(|(name, _)| name);
                if let Some(name) = &read {
                    assert_eq!(Some(name.as_str()), expected[slot], "{file} slot {slot}");
                }
                eprintln!("{file} slot {slot}: {read:?}");
                samples.push(read);
            }
            if file == "20261016184707_1.jpg" {
                assert!(
                    samples[5..].iter().all(Option::is_some),
                    "independent real team must be 5/5"
                );
            }
            if file == "20261018144123_1.jpg" {
                // Dead/grayed portraits and the on-fire frame can obscure identity.
                // Completeness must never force these through the same confidence gate.
                for slot in [0, 3, 7] {
                    assert!(samples[slot].is_none());
                }
                assert_eq!(samples.iter().flatten().count(), 7);
            }
            for now in [0, 1000, 2000] {
                votes.observe(&samples, now);
            }
            let roster = votes.observe(&samples, 3000);
            for (slot, name) in roster.iter().enumerate() {
                if let Some(name) = name {
                    assert_eq!(Some(name.as_str()), expected[slot]);
                }
            }
        }
    }

    #[test]
    fn matching_grayscale_without_matching_color_cannot_confirm_a_hero() {
        let mut red = synthetic_frame(|x, _| (x * 4 + 5) as u8);
        let mut green = red.clone();
        for p in red.bgra.chunks_exact_mut(4) {
            p[0] = 0;
            p[1] = 0;
        }
        for p in green.bgra.chunks_exact_mut(4) {
            p[0] = 0;
            p[2] = 0;
        }
        assert!(dot(&frame_hud_feature(&red), &frame_hud_feature(&green)) > 0.99);
        let other = synthetic_frame(|x, y| if (x + y) % 2 == 0 { 240 } else { 15 });
        let r = DraftRecognizer {
            templates: vec![template("axe", &red), template("lina", &other)],
        };
        assert!(r.recognize_hud(&green).is_none());
        assert_eq!(r.recognize_hud(&red).unwrap().0, "axe");
    }

    fn template(label: &str, frame: &Frame) -> PortraitTemplate {
        PortraitTemplate {
            label: label.into(),
            full: frame_feature(frame),
            hud: frame_hud_feature(frame),
            hud_color: frame_hud_color_feature(frame),
        }
    }

    #[test]
    fn variants_share_identity_but_a_distinct_hero_is_still_required() {
        let frame = synthetic_frame(|x, _| (x * 4) as u8);
        let other = synthetic_frame(|x, y| if (x + y) % 2 == 0 { 240 } else { 15 });
        let mut r = DraftRecognizer {
            templates: vec![template("axe", &frame), template("axe", &frame)],
        };
        assert!(r.recognize_hud(&frame).is_none());
        r.templates.push(template("lina", &other));
        assert_eq!(r.recognize_hud(&frame).unwrap().0, "axe");
        r.templates.push(template("lina", &frame));
        assert!(r.recognize_hud(&frame).is_none());
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
