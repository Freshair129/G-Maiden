//! In-game calibration / audit evidence capture (opt-in; OFF by default).
//!
//! A QA/tuning mode — **not** for competitive play. When enabled, G-Maiden saves
//! evidence around each event so an agent (or human) can later AUDIT whether the
//! detection/prediction was correct and re-tune thresholds (the G-Log #7 loop):
//!   - CV-only events (enemy-missing)          → a single full-screen screenshot
//!   - voice-paired events (gank, danger, …)   → a motion clip covering 3s BEFORE
//!     the event (from a ring buffer) through ~3s AFTER it ends, saved as an
//!     animated **GIF** plus sampled **keyframe PNGs** (agents read stills better
//!     than GIFs).
//!
//! Everything stays local (privacy-first) under
//! `%LOCALAPPDATA%\G-Maiden\calibration\<match>\` with an `audit.jsonl` index.
//!
//! The WGC capture thread feeds frames via [`push_full_bgra`] (≈9 fps, throttled
//! by the caller); events call [`screenshot`] / [`record`]. GIF/PNG encoding is
//! offloaded to a worker thread so the capture thread never blocks. When disabled,
//! frame feeding is a cheap early return (zero cost).

use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const TARGET_W: u32 = 854; // downscale width for buffered frames (~480p)
const RING_MS: u64 = 3_000; // pre-roll buffer length (3s before the event)
const POST_ROLL_MS: u64 = 3_000; // keep recording 3s after the event "ends"
const MAX_CLIP_MS: u64 = 12_000; // hard cap on a single clip
const FRAME_DELAY_MS: u32 = 110; // ≈9 fps playback / sampling cadence
const KEYFRAME_EVERY: usize = 4; // save every Nth frame as a PNG for agents

#[derive(Clone)]
struct Frame {
    t_ms: u64,
    w: u32,
    h: u32,
    rgba: Vec<u8>,
}

struct Recording {
    event: String,
    line: Option<String>,
    context: serde_json::Value,
    frames: Vec<Frame>,
    end_ms: u64,
    start_ms: u64,
}

struct State {
    dir: PathBuf,
    match_id: String,
    ring: VecDeque<Frame>,
    rec: Option<Recording>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn base_dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("G-Maiden").join("calibration")
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Enable/disable calibration capture. Enabling (re)starts the buffer.
pub fn set_enabled(on: bool) {
    let mut g = match STATE.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    *g = if on {
        Some(State {
            dir: base_dir(),
            match_id: "session".into(),
            ring: VecDeque::new(),
            rec: None,
        })
    } else {
        None
    };
}

pub fn is_enabled() -> bool {
    STATE.lock().map(|g| g.is_some()).unwrap_or(false)
}

/// Tag the current match so evidence lands in its own folder.
pub fn set_match(id: &str) {
    if let Ok(mut g) = STATE.lock() {
        if let Some(s) = g.as_mut() {
            s.match_id = sanitize(id);
        }
    }
}

/// Nearest-neighbour downscale BGRA → RGBA at TARGET_W (keeps aspect).
fn downscale_bgra_to_rgba(bgra: &[u8], w: u32, h: u32) -> (Vec<u8>, u32, u32) {
    if w == 0 || h == 0 {
        return (Vec::new(), 0, 0);
    }
    let tw = TARGET_W.min(w);
    let th = ((tw as u64 * h as u64) / w as u64).max(1) as u32;
    let mut out = vec![0u8; (tw * th * 4) as usize];
    for y in 0..th {
        let sy = (y as u64 * h as u64 / th as u64) as u32;
        for x in 0..tw {
            let sx = (x as u64 * w as u64 / tw as u64) as u32;
            let si = ((sy * w + sx) * 4) as usize;
            let di = ((y * tw + x) * 4) as usize;
            if si + 3 < bgra.len() {
                out[di] = bgra[si + 2]; // R (BGRA → RGBA)
                out[di + 1] = bgra[si + 1]; // G
                out[di + 2] = bgra[si]; // B
                out[di + 3] = 255; // A
            }
        }
    }
    (out, tw, th)
}

/// Feed one full-resolution BGRA frame from the WGC capture loop. Cheap early
/// return when disabled. Caller throttles to ≈9 fps.
pub fn push_full_bgra(bgra: &[u8], w: u32, h: u32) {
    let mut g = match STATE.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    let Some(s) = g.as_mut() else { return };
    let (rgba, tw, th) = downscale_bgra_to_rgba(bgra, w, h);
    if rgba.is_empty() {
        return;
    }
    let t = now_ms();
    let f = Frame {
        t_ms: t,
        w: tw,
        h: th,
        rgba,
    };
    // ring buffer: keep the last RING_MS of frames as pre-roll.
    s.ring.push_back(f.clone());
    while let Some(front) = s.ring.front() {
        if t.saturating_sub(front.t_ms) > RING_MS {
            s.ring.pop_front();
        } else {
            break;
        }
    }
    // active recording: append until the post-roll window closes, then finalize
    // off-thread (GIF/PNG encode must not block the capture thread).
    let finalize_now = if let Some(rec) = s.rec.as_mut() {
        rec.frames.push(f);
        t >= rec.end_ms
    } else {
        false
    };
    if finalize_now {
        if let Some(rec) = s.rec.take() {
            let dir = s.dir.join(&s.match_id);
            std::thread::spawn(move || finalize(dir, rec));
        }
    }
}

/// Single screenshot for a CV-only event (e.g. enemy-missing). Uses the latest
/// buffered frame. No-op if disabled or the buffer is empty.
pub fn screenshot(event: &str, context: serde_json::Value) {
    let (out, frame) = {
        let g = match STATE.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let Some(s) = g.as_ref() else { return };
        let Some(f) = s.ring.back().cloned() else {
            return;
        };
        (s.dir.join(&s.match_id), f)
    };
    let event = event.to_string();
    std::thread::spawn(move || {
        let _ = fs::create_dir_all(&out);
        let ts = now_ms();
        let name = format!("{}-{}.png", sanitize(&event), ts);
        save_png(&out.join(&name), &frame);
        write_audit(
            &out,
            &serde_json::json!({
                "ts": ts, "event": event, "kind": "screenshot",
                "image": name, "context": context,
            }),
        );
    });
}

/// Start a motion clip for a voice-paired event: pre-roll (ring buffer) + a
/// post-roll of ~3s after the spoken line is expected to finish. One clip at a
/// time; a trigger while recording is ignored.
pub fn record(event: &str, line: Option<&str>, context: serde_json::Value) {
    if let Ok(mut g) = STATE.lock() {
        if let Some(s) = g.as_mut() {
            if s.rec.is_some() {
                return;
            }
            let t = now_ms();
            // crude TTS-duration estimate (~75 ms/char, capped) + 3s tail.
            let line_ms = line
                .map(|l| (l.chars().count() as u64 * 75).min(6_000))
                .unwrap_or(0);
            let end = (t + line_ms + POST_ROLL_MS).min(t + MAX_CLIP_MS);
            let frames: Vec<Frame> = s.ring.iter().cloned().collect(); // pre-roll
            s.rec = Some(Recording {
                event: event.to_string(),
                line: line.map(|l| l.to_string()),
                context,
                frames,
                end_ms: end,
                start_ms: t,
            });
        }
    }
}

fn save_png(path: &Path, f: &Frame) {
    if let Some(img) = image::RgbaImage::from_raw(f.w, f.h, f.rgba.clone()) {
        let _ = img.save(path);
    }
}

fn save_gif(path: &Path, frames: &[Frame]) {
    use image::codecs::gif::{GifEncoder, Repeat};
    use image::{Delay, Frame as ImgFrame, RgbaImage};
    let Ok(file) = fs::File::create(path) else {
        return;
    };
    let mut enc = GifEncoder::new_with_speed(file, 20);
    let _ = enc.set_repeat(Repeat::Infinite);
    for f in frames {
        if let Some(img) = RgbaImage::from_raw(f.w, f.h, f.rgba.clone()) {
            let delay = Delay::from_numer_denom_ms(FRAME_DELAY_MS, 1);
            let _ = enc.encode_frame(ImgFrame::from_parts(img, 0, 0, delay));
        }
    }
}

fn finalize(out: PathBuf, rec: Recording) {
    let _ = fs::create_dir_all(&out);
    let ts = rec.start_ms;
    let stem = format!("{}-{}", sanitize(&rec.event), ts);
    // keyframes (stills) for agent audit
    let mut keyframes = Vec::new();
    for (i, f) in rec.frames.iter().enumerate() {
        if i % KEYFRAME_EVERY == 0 {
            let name = format!("{stem}-k{i}.png");
            save_png(&out.join(&name), f);
            keyframes.push(name);
        }
    }
    // animated GIF (the "moving image")
    let gif = format!("{stem}.gif");
    save_gif(&out.join(&gif), &rec.frames);
    write_audit(
        &out,
        &serde_json::json!({
            "ts": ts, "event": rec.event, "kind": "clip", "line": rec.line,
            "frames": rec.frames.len(),
            "duration_ms": rec.end_ms.saturating_sub(rec.start_ms),
            "gif": gif, "keyframes": keyframes, "context": rec.context,
        }),
    );
}

fn write_audit(out: &Path, record: &serde_json::Value) {
    let path = out.join("audit.jsonl");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        if let Ok(line) = serde_json::to_string(record) {
            let _ = writeln!(f, "{line}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synth(w: u32, h: u32, shade: u8) -> Frame {
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        for (i, px) in rgba.chunks_mut(4).enumerate() {
            px[0] = shade;
            px[1] = (i % 256) as u8;
            px[2] = 40;
            px[3] = 255;
        }
        Frame {
            t_ms: 0,
            w,
            h,
            rgba,
        }
    }

    #[test]
    fn downscale_swaps_bgra_to_rgba_and_keeps_aspect() {
        let (w, h) = (4u32, 2u32);
        let bgra: Vec<u8> = (0..w * h).flat_map(|_| [10u8, 20, 30, 255]).collect();
        let (rgba, tw, th) = downscale_bgra_to_rgba(&bgra, w, h);
        assert_eq!((tw, th), (4, 2)); // TARGET_W > w → unchanged size
        assert_eq!(&rgba[0..4], &[30, 20, 10, 255]); // B,G,R,A → R,G,B,A
    }

    /// The load-bearing check: cargo check only *compiles* the image-crate GIF
    /// encoder; this actually runs it, proving clips encode to disk at runtime.
    #[test]
    fn gif_and_png_encode_to_disk() {
        let dir = std::env::temp_dir().join("gm-calib-test");
        let _ = fs::create_dir_all(&dir);
        let frames: Vec<Frame> = (0..6).map(|i| synth(64, 36, (i * 30) as u8)).collect();

        let png = dir.join("k.png");
        save_png(&png, &frames[0]);
        assert!(
            fs::metadata(&png).map(|m| m.len() > 0).unwrap_or(false),
            "png not written"
        );

        let gif = dir.join("clip.gif");
        save_gif(&gif, &frames);
        assert!(
            fs::metadata(&gif).map(|m| m.len() > 0).unwrap_or(false),
            "gif not written"
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
