//! Minimap screen capture (Phase 2 P2.0) — Windows Graphics Capture (WGC) via
//! `windows-capture` v2. Captures the primary monitor, crops the minimap region
//! every frame, runs the [`crate::cv::prefilter`] over it, and emits a debug
//! event so the overlay can draw candidate boxes during calibration.
//!
//! Design notes:
//! - **Read-only**: WGC composites via DWM; we never touch the game process
//!   (Risk R-06 — no inject / no memory read).
//! - **Rate**: WGC would fire at monitor refresh (60+ Hz). We cap the *source*
//!   to [`CAPTURE_HZ`] and then **adaptively** process: normally only every
//!   [`NORMAL_INTERVAL_MS`] (≈8 Hz) to save CPU, but every frame (up to the
//!   source cap, ≈15 Hz) when Sentry has missing heroes — i.e. when a gank read
//!   is in flight and freshness matters.
//! - **Gating**: the CV pipeline only runs while in a live match
//!   ([`crate::runtime::in_game`]); at the menu it idles.
//! - **Color**: we request `Bgra8`, matching [`crate::cv::Frame`]'s byte order.
//!
//! Live verification (compile alone is NOT sufficient) needs Dota 2 open — see
//! the Phase 2 roadmap P2.0 exit criteria.

use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    frame::Frame as WcFrame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    },
};

use crate::cv::detector::{Detection, Detector};
use crate::cv::prefilter::{prefilter_candidates, DEFAULT_THRESHOLD_FRAC};
use crate::cv::region::MinimapRegion;
use crate::cv::Frame;
use crate::motion::Motion;
use crate::sentry::Sentry;
use crate::signal::{Signal, SignalEvent};

/// Source frame-rate cap (Hz). We let WGC deliver up to the "alert" rate and
/// throttle down in software, so we can speed up instantly without restarting
/// the capture session.
const CAPTURE_HZ: u64 = 15;

/// Normal-state processing cadence (ms) ≈ 8 Hz. When Sentry has missing heroes
/// we drop this throttle and process at the full source rate (≈15 Hz).
const NORMAL_INTERVAL_MS: u128 = 125;

/// Cap the rate of the debug/calibration `minimap-cv` event (ms). Independent of
/// the processing cadence: even when we process at 15 Hz, we only push candidate
/// boxes to the full-screen overlay webview at ≈5 Hz so the IPC → WebView2 → DWM
/// compositing path can't pile up over a long match (suspected freeze cause).
/// Edge-triggered gank alerts / enemy-missing events still emit immediately.
const DEBUG_EMIT_INTERVAL_MS: u128 = 200;

/// If a single processed frame's compute exceeds this (ms) we log it to
/// `error.log` — a developing CV/compositor stall shows up as frames creeping
/// over budget *before* the system locks up.
const SLOW_FRAME_MS: u128 = 250;

/// Maiden's spoken gank warning (TTS fallback when no `danger` clip is cached).
const GANK_LINE: &str = "ระวังนะคะ ศัตรูหายไปจากแมพหลายตัว อาจมีแก๊งค์!";
/// Belief-revision retraction line (TTS fallback when no `revision` clip cached).
const REVISION_LINE: &str = "เอ๊ะ! เดี๋ยวก่อน ดูเหมือนจะปลอดภัยแล้วค่ะ";

/// Debug/result payload emitted per processed frame. Candidates feed the
/// calibration overlay; detections are the confirmed heroes (empty until the
/// ONNX model is present — see [`Detector`]).
#[derive(Clone, serde::Serialize)]
struct MinimapDebug {
    region: MinimapRegion,
    icon: usize,
    /// candidate top-left coords *within* the cropped region.
    candidates: Vec<(i32, i32)>,
    count: usize,
    /// confirmed hero detections (classifier active).
    detections: Vec<Detection>,
    /// whether a real ONNX classifier is running (vs candidate-only).
    classifier: bool,
}

/// Capture handler state. Flags carry the Tauri handle (to emit) and the
/// computed minimap region (so `new` doesn't have to recompute geometry).
struct MinimapCapture {
    app: AppHandle,
    region: MinimapRegion,
    icon: usize,
    detector: Detector,
    // CV → game-knowledge pipeline (P2.3–P2.5).
    sentry: Sentry,
    motion: Motion,
    signal: Signal,
    /// monotonic clock origin for ms timestamps fed to the pipeline.
    start: Instant,
    /// last frame we actually processed (drives the adaptive throttle).
    last_processed: Instant,
    /// last time we emitted the debug `minimap-cv` payload to the overlay
    /// (throttled to ≈5 Hz — see [`DEBUG_EMIT_INTERVAL_MS`]).
    last_emit: Instant,
    /// last time we fed a frame to the calibration buffer (≈9 Hz when on).
    last_calib: Instant,
}

impl GraphicsCaptureApiHandler for MinimapCapture {
    type Flags = (AppHandle, MinimapRegion);
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let (app, region) = ctx.flags;
        let icon = region.icon_size();
        let dir = model_dir(&app);
        let detector = Detector::load(&dir.join("minimap-detector.onnx"), &dir.join("labels.json"));
        let now = Instant::now();
        Ok(MinimapCapture {
            app,
            region,
            icon,
            detector,
            sentry: Sentry::new(),
            motion: Motion::new(),
            signal: Signal::new(),
            start: now,
            last_processed: now,
            last_emit: now,
            last_calib: now,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut WcFrame<'_>,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        // Gate to live matches — no CV work at the menu (idle-CPU saver).
        if !crate::runtime::in_game() {
            return Ok(());
        }
        // Calibration evidence feed (≈9 fps; only when the QA mode is on). Runs
        // before the minimap throttle so the clip ring buffer stays smooth even
        // when CV processing is throttled.
        if crate::calibration::is_enabled() && self.last_calib.elapsed().as_millis() >= 110 {
            self.last_calib = Instant::now();
            let (fw, fh) = (frame.width(), frame.height());
            if let Ok(fb) = frame.buffer_crop(0, 0, fw, fh) {
                let mut full: Vec<u8> = Vec::new();
                let _ = fb.as_nopadding_buffer(&mut full);
                crate::calibration::push_full_bgra(&full, fw, fh);
            }
        }
        // Adaptive throttle: process at ~8 Hz normally, but at the full source
        // rate while Sentry is "suspicious" (has missing heroes) so a developing
        // gank is read with minimum lag.
        let now = self.start.elapsed().as_millis() as u64;
        let suspicious = !self.sentry.missing(now).is_empty();
        if !suspicious && self.last_processed.elapsed().as_millis() < NORMAL_INTERVAL_MS {
            return Ok(());
        }
        self.last_processed = Instant::now();
        let work_start = Instant::now();

        let r = self.region;
        // Crop to the minimap square. buffer_crop takes (start_x, start_y,
        // end_x, end_y) with end exclusive, so width == side.
        let end_x = (r.x + r.side).min(frame.width());
        let end_y = (r.y + r.side).min(frame.height());
        if r.x >= end_x || r.y >= end_y {
            return Ok(()); // region off-screen (bad calibration) — skip safely
        }
        let buf = frame.buffer_crop(r.x, r.y, end_x, end_y)?;
        let w = (end_x - r.x) as usize;
        let h = (end_y - r.y) as usize;
        // v2 fills our Vec with tightly-packed BGRA rows (stride padding removed)
        // and returns a slice into it; we keep the owned Vec for the Frame.
        let mut packed: Vec<u8> = Vec::new();
        let _ = buf.as_nopadding_buffer(&mut packed);

        if let Some(f) = Frame::from_bgra(w, h, packed) {
            let now_ms = now; // computed above for the throttle
            let candidates = prefilter_candidates(
                &f,
                self.icon,
                DEFAULT_THRESHOLD_FRAC,
                crate::runtime::enemy_team_ring(),
            );
            let detections = self.detector.detect(&f, &candidates, self.icon);

            // Record identified enemies for grounded G-Master counter advice
            // (runtime source of truth, cleared at match start). Mirrors capture.rs.
            for d in &detections {
                crate::runtime::add_known_enemy(&d.name);
            }

            // G-Sentry: flag enemies missing >5s (edge-triggered).
            for em in self.sentry.update(&detections, &r, now_ms) {
                crate::log::note_event(crate::log::enemy_missing_record(
                    &em.hero,
                    em.missing_for_ms,
                    em.last_pos,
                ));
                if crate::calibration::is_enabled() {
                    crate::calibration::screenshot(
                        "enemy-missing",
                        serde_json::json!({
                            "hero": em.hero, "missing_for_ms": em.missing_for_ms,
                        }),
                    );
                }
                let _ = self.app.emit("enemy-missing", &em);
            }
            // G-Motion: history + gank-risk over currently-missing enemies.
            self.motion.record(&detections, &r, now_ms);
            let missing = self.sentry.missing(now_ms);
            let risk = self.motion.assess(&missing, now_ms);
            // G-Signal: edge-triggered warning + Belief Revision, voiced now
            // (only when the user has G-Signal enabled).
            if crate::runtime::signal_enabled() {
                // Pull the latest user-tunable sensitivity in case it changed
                // since the previous tick (atomic read, ~free).
                self.signal
                    .set_sensitivity(crate::runtime::signal_sensitivity());
                match self.signal.evaluate(&risk) {
                    SignalEvent::Alert(alert) => {
                        // Silent-arm efficacy study (TASK 2): when this match is
                        // silent-armed the pipeline + logging still run, but the
                        // gank alert (voice + banner) is suppressed. `armed` = the
                        // user WAS alerted. Mirrors capture.rs (DXGI backend).
                        let armed = !crate::runtime::silent_arm();
                        // Use the "gank" event so the bundled voice pack's gank
                        // takes are picked (separate from the HP-danger pack).
                        if armed {
                            voice_interrupt("gank", GANK_LINE);
                        }
                        // W2: only capture calibration evidence when the line
                        // was actually voiced — in the silent arm GANK_LINE is
                        // suppressed, so recording it would falsely log it as
                        // spoken. The gank_signal log below stays unconditional.
                        if armed && crate::calibration::is_enabled() {
                            crate::calibration::record(
                                "gank",
                                Some(GANK_LINE),
                                serde_json::json!({
                                    "probability": alert.probability,
                                    "missing_heroes": alert.missing_heroes,
                                    "eta_ms": alert.eta_ms,
                                }),
                            );
                        }
                        crate::log::note_event(crate::log::gank_signal_record(
                            alert.probability,
                            &alert.missing_heroes,
                            alert.eta_ms,
                            armed,
                        ));
                        if armed {
                            let _ = self.app.emit("gank-alert", &alert);
                        }
                    }
                    SignalEvent::Revision => {
                        let armed = !crate::runtime::silent_arm();
                        if armed {
                            voice_interrupt("revision", REVISION_LINE);
                        }
                        crate::log::note_event(crate::log::gank_revision_record());
                        if armed {
                            let _ = self.app.emit("gank-clear", ());
                        }
                    }
                    SignalEvent::None => {}
                }
            }

            // Debug/calibration feed — throttled to ≈5 Hz so the full-screen
            // overlay webview can't back up the DWM compositor over a long match.
            // (Gank alerts / enemy-missing above are edge-triggered, emitted now.)
            if self.last_emit.elapsed().as_millis() >= DEBUG_EMIT_INTERVAL_MS {
                self.last_emit = Instant::now();
                let payload = MinimapDebug {
                    region: r,
                    icon: self.icon,
                    count: candidates.len(),
                    candidates,
                    detections,
                    classifier: self.detector.is_active(),
                };
                let _ = self.app.emit("minimap-cv", payload);
            }
        }

        // Stall watchdog: a frame creeping over budget is the early sign of the
        // CV/compositor lockup — record it so error.log shows the run-up.
        let work_ms = work_start.elapsed().as_millis();
        if work_ms > SLOW_FRAME_MS {
            crate::log::error(&format!(
                "[capture] SLOW frame {work_ms}ms (suspicious={suspicious}) — possible CV/compositor stall"
            ));
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Spawn the minimap capture on its own thread. Non-blocking; logs and exits
/// quietly on any failure (e.g. WGC unavailable on older Windows) so the rest
/// of the app keeps running.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        crate::log::error("[capture] WGC capture thread started");
        if let Err(e) = run(app) {
            eprintln!("[capture] minimap capture stopped: {e}");
            crate::log::error(&format!("[capture] STOPPED: {e}"));
        }
    });
}

fn run(app: AppHandle) -> Result<(), String> {
    let monitor = Monitor::primary().map_err(|e| format!("no primary monitor: {e}"))?;
    let sw = monitor.width().map_err(|e| format!("monitor width: {e}"))?;
    let sh = monitor
        .height()
        .map_err(|e| format!("monitor height: {e}"))?;
    let region = MinimapRegion::for_resolution(sw, sh);

    // WGC's border-toggle (`DrawBorderSettings::WithoutBorder`) and custom
    // update-interval are Windows 11 / build ≥ 20348 features. On Windows 10
    // (e.g. 19045) constructing the session with them throws "…not supported by
    // the Graphics Capture API on this platform" and the capture thread dies at
    // startup — which silently took down the *entire* CV pipeline: no frames →
    // G-Sentry tracks nobody → G-Motion risk stays 0 → the G-Meter is pinned to
    // "ปลอดภัย" and G-Signal never warns. Try the modern path first (border-free
    // on Win11), then fall back to platform defaults so capture actually runs on
    // Win10. On Win10 the border feature doesn't exist, so `Default` draws none.
    match MinimapCapture::start(modern_settings(monitor, region, app.clone())) {
        Ok(()) => Ok(()),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("not supported") || msg.contains("platform") {
                crate::log::error(&format!(
                    "[capture] modern WGC settings unsupported ({msg}); retrying with platform defaults (Win10 path)"
                ));
                let monitor = Monitor::primary().map_err(|e| format!("no primary monitor: {e}"))?;
                MinimapCapture::start(compat_settings(monitor, region, app))
                    .map_err(|e| format!("capture failed (compat): {e}"))
            } else {
                Err(format!("capture failed: {e}"))
            }
        }
    }
}

/// Win11/modern WGC settings: border-free capture and a software FPS cap.
type CaptureSettings = Settings<(AppHandle, MinimapRegion), Monitor>;
fn modern_settings(monitor: Monitor, region: MinimapRegion, app: AppHandle) -> CaptureSettings {
    Settings::new(
        monitor,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(1000 / CAPTURE_HZ)),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        (app, region),
    )
}

/// Windows 10 fallback: every newer-than-WGC-baseline toggle left at platform
/// `Default` so session creation doesn't touch an unsupported property. The
/// source then fires at refresh rate; the adaptive throttle in
/// [`MinimapCapture::on_frame_arrived`] still caps *processing* to ≈8 Hz.
fn compat_settings(monitor: Monitor, region: MinimapRegion, app: AppHandle) -> CaptureSettings {
    Settings::new(
        monitor,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::Default,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        (app, region),
    )
}

/// Voice a critical event with interrupt semantics: cancel whatever Maiden is
/// saying, then play a pre-recorded clip for `event` if the cache has one, else
/// speak `fallback` via SAPI. Used by G-Signal so a gank warning cuts in
/// immediately (and Belief Revision can retract mid-stream). Default voice/rate
/// — the user's picked voice lives in the frontend; wiring it here is a P2 tuning
/// item.
fn voice_interrupt(event: &str, fallback: &str) {
    crate::audio::cancel();
    crate::tts::cancel();
    // Audit H9: shared with capture.rs's copy of this function — see
    // `tts::speak_critical_fallback`'s doc comment.
    if !crate::audio::play_random(event) {
        crate::tts::speak_critical_fallback(event, fallback);
    }
}

/// Locate the model directory, preferring the Tauri resource dir (where the
/// installer drops `models/`), then `models/` next to the executable, then
/// `models/` in the working directory (how `pnpm tauri dev` runs from repo root).
fn model_dir(app: &AppHandle) -> std::path::PathBuf {
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join("models");
        if p.join("minimap-detector.onnx").exists() {
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p = parent.join("models");
            if p.join("minimap-detector.onnx").exists() {
                return p;
            }
        }
    }
    std::path::PathBuf::from("models")
}

#[cfg(test)]
mod tests {
    //! P2.5 latency harness — times the controllable compute pipeline
    //! (prefilter → detect → sentry → motion → signal) over many synthetic
    //! frames and asserts p99 stays well inside budget. WGC capture (~refresh
    //! bound) and audio output (~40 ms, cpal) are I/O budgeted separately per the
    //! Engineering-Spec latency breakdown, so they're not in this measurement.
    use super::*;
    use std::path::Path;

    /// 256×256 BGRA frame, dark background with `n` Dire-red blips so prefilter +
    /// detector have realistic work to do.
    fn synthetic_frame(n: usize) -> Frame {
        let (w, h, icon) = (256usize, 256usize, 20usize);
        let mut bgra = vec![0u8; w * h * 4];
        for (i, px) in bgra.chunks_mut(4).enumerate() {
            let (x, _y) = (i % w, i / w);
            // faint green/brown background
            px[0] = 18;
            px[1] = 36 + (x % 7) as u8;
            px[2] = 14;
            px[3] = 255;
        }
        for k in 0..n {
            let bx = (k * 37) % (w - icon);
            let by = (k * 53) % (h - icon);
            for yy in by..by + icon {
                for xx in bx..bx + icon {
                    let p = (yy * w + xx) * 4;
                    bgra[p] = 41; // B
                    bgra[p + 1] = 41; // G
                    bgra[p + 2] = 219; // R (Dire red)
                }
            }
        }
        Frame::from_bgra(w, h, bgra).unwrap()
    }

    #[test]
    fn pipeline_latency_within_budget() {
        // Latency is only meaningful in release — tract inference in a debug build
        // is ~100× slower (the spike's 0.85 ms was release). Run this gate with
        //   cargo test --release --lib pipeline_latency
        // In debug we skip so the normal test suite stays fast.
        if cfg!(debug_assertions) {
            eprintln!("skip latency harness in debug; run with --release");
            return;
        }
        let model = Path::new("../models/minimap-detector.onnx");
        if !model.exists() {
            eprintln!("skip latency harness: model not present");
            return;
        }
        let detector = Detector::load(model, Path::new("../models/labels.json"));
        let region = MinimapRegion {
            x: 0,
            y: 0,
            side: 256,
        };
        let icon = 20usize;
        let frame = synthetic_frame(5);

        let mut sentry = Sentry::new();
        let mut motion = Motion::new();
        let mut signal = Signal::new();

        let iters = 300usize;
        let mut samples_us: Vec<u128> = Vec::with_capacity(iters);
        for i in 0..iters {
            let now_ms = (i as u64) * 125; // ~8 Hz cadence
            let t = Instant::now();
            let cands =
                prefilter_candidates(&frame, icon, DEFAULT_THRESHOLD_FRAC, crate::cv::DIRE_RING);
            let dets = detector.detect(&frame, &cands, icon);
            let _ = sentry.update(&dets, &region, now_ms);
            motion.record(&dets, &region, now_ms);
            let missing = sentry.missing(now_ms);
            let risk = motion.assess(&missing, now_ms);
            let _ = signal.evaluate(&risk);
            samples_us.push(t.elapsed().as_micros());
        }
        samples_us.sort_unstable();
        let p50 = samples_us[iters / 2] as f64 / 1000.0;
        let p99 = samples_us[(iters * 99) / 100] as f64 / 1000.0;
        eprintln!("[P2.5 latency] compute pipeline p50={p50:.3} ms  p99={p99:.3} ms");
        // Generous gate: the spike's whole-loop budget was 80 ms. The CV compute
        // alone must sit far under that even on slow CI.
        assert!(p99 < 80.0, "pipeline p99 {p99:.3} ms exceeds 80 ms budget");
    }
}
