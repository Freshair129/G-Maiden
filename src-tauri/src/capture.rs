//! Minimap screen capture — **DXGI Desktop Duplication** primary backend
//! (ADR-13 / CR-001), with the legacy **WGC** backend preserved behind
//! `--features wgc` as a rollback, and a **GSI-only "Lite mode"** when no capture
//! backend can start (e.g. Dota 2 in exclusive fullscreen).
//!
//! Why DXGI: WGC composited via DWM and on Win10 stalled at ~0.7 Hz with 8% CPU
//! and crashed on the unsupported border toggle (see error.log 2026-06-28). DXGI
//! copies the desktop straight off the GPU, delivers within one vsync, and needs
//! no compositor — so it does not fight the game.
//!
//! Pipeline is unchanged downstream: we crop the minimap square out of the
//! full-screen BGRA8 buffer and feed [`crate::cv::Frame`] exactly as before
//! (prefilter → detect → G-Sentry → G-Motion → G-Signal → emit).
//!
//! Cadence (CR-001): ~4 Hz normal, ~8 Hz when G-Sentry is "suspicious" (missing
//! heroes), ~2 Hz when the governor reports over-budget. The DXGI loop controls
//! cadence with an explicit sleep rather than a high-rate callback.
//!
//! Live verification (compile alone is NOT sufficient) needs Dota 2 open in
//! borderless fullscreen — see ADR-13 Phase 3 validation.

/// Legacy WGC backend, selected at build time with `--features wgc` (ADR-13
/// rollback). Implementation frozen in `capture_wgc.rs`.
#[cfg(feature = "wgc")]
pub fn start(app: tauri::AppHandle) {
    crate::capture_wgc::start(app);
}

#[cfg(not(feature = "wgc"))]
pub use backend::start;

#[cfg(not(feature = "wgc"))]
mod backend {
    use std::time::{Duration, Instant};

    use tauri::{AppHandle, Emitter, Manager};

    use crate::cv::detector::{Detection, Detector};
    use crate::cv::prefilter::{prefilter_candidates, DEFAULT_THRESHOLD_FRAC};
    use crate::cv::region::MinimapRegion;
    use crate::cv::Frame;
    use crate::dxgi::DxgiCapture;
    use crate::motion::Motion;
    use crate::sentry::Sentry;
    use crate::signal::{Signal, SignalEvent};

    /// Normal-state loop cadence (ms) ≈ 4 Hz.
    const NORMAL_INTERVAL_MS: u64 = 250;
    /// Alert cadence (ms) ≈ 8 Hz — used while G-Sentry has missing heroes so a
    /// developing gank is read with minimum lag (gank window is 10–12 s, so this
    /// is ample).
    const ALERT_INTERVAL_MS: u64 = 125;
    /// Throttled cadence (ms) ≈ 2 Hz — used when the governor reports the process
    /// is over its CPU/RAM budget. Resource safety wins over freshness here.
    const THROTTLE_INTERVAL_MS: u64 = 500;

    /// Cap the rate of the debug/calibration `minimap-cv` event (ms) ≈ 5 Hz, so
    /// the IPC → WebView2 → DWM path can't pile up over a long match. Edge-
    /// triggered gank alerts / enemy-missing events still emit immediately.
    const DEBUG_EMIT_INTERVAL_MS: u128 = 200;

    /// If a single frame's compute exceeds this (ms) we log it — a developing CV
    /// stall shows up as frames creeping over budget before anything locks up.
    const SLOW_FRAME_MS: u128 = 100;

    /// Maiden's spoken gank warning (TTS fallback when no `danger` clip is cached).
    const GANK_LINE: &str = "ระวังนะคะ ศัตรูหายไปจากแมพหลายตัว อาจมีแก๊งค์!";
    /// Belief-revision retraction line (TTS fallback when no `revision` clip cached).
    const REVISION_LINE: &str = "เอ๊ะ! เดี๋ยวก่อน ดูเหมือนจะปลอดภัยแล้วค่ะ";

    /// Debug/result payload emitted per processed frame. Candidates feed the
    /// calibration overlay; detections are confirmed heroes (empty until the ONNX
    /// model is present — see [`Detector`]).
    #[derive(Clone, serde::Serialize)]
    struct MinimapDebug {
        region: MinimapRegion,
        icon: usize,
        candidates: Vec<(i32, i32)>,
        count: usize,
        detections: Vec<Detection>,
        classifier: bool,
    }

    /// Per-frame pipeline state. Same shape as the old WGC `MinimapCapture` minus
    /// the capture-API trait (the DXGI loop owns cadence) and `last_processed`
    /// (the explicit loop sleep replaces the per-frame throttle).
    struct CaptureState {
        app: AppHandle,
        region: MinimapRegion,
        icon: usize,
        detector: Detector,
        sentry: Sentry,
        motion: Motion,
        signal: Signal,
        /// monotonic clock origin for ms timestamps fed to the pipeline.
        start: Instant,
        /// last debug `minimap-cv` emit (throttled ≈5 Hz).
        last_emit: Instant,
        /// last calibration-buffer feed (≈9 Hz when QA mode on).
        last_calib: Instant,
    }

    impl CaptureState {
        fn new(app: AppHandle, region: MinimapRegion) -> Self {
            let icon = region.icon_size();
            let dir = model_dir(&app);
            let detector =
                Detector::load(&dir.join("minimap-detector.onnx"), &dir.join("labels.json"));
            let now = Instant::now();
            CaptureState {
                app,
                region,
                icon,
                detector,
                sentry: Sentry::new(),
                motion: Motion::new(),
                signal: Signal::new(),
                start: now,
                last_emit: now,
                last_calib: now,
            }
        }
    }

    /// Spawn the minimap capture on its own thread. Non-blocking; on any failure
    /// to start DXGI (e.g. exclusive fullscreen, no GPU) it logs, emits
    /// `capture-mode = "lite"`, and exits the thread quietly — the rest of the app
    /// (GSI, announcer, overlay, G-Master) keeps running in Lite mode.
    pub fn start(app: AppHandle) {
        std::thread::Builder::new()
            .name("g-capture".into())
            .spawn(move || {
                crate::log::error("[capture] DXGI capture thread started");
                if let Err(e) = run_dxgi(app.clone()) {
                    eprintln!("[capture] DXGI unavailable: {e} — running in Lite mode (GSI-only)");
                    crate::log::error(&format!(
                        "[capture] DXGI unavailable: {e}. Running in Lite mode \
                         (GSI-only, minimap CV off)"
                    ));
                    let _ = app.emit("capture-mode", "lite");
                }
            })
            .expect("capture thread spawn");
    }

    /// Initialise DXGI for the primary monitor and run the capture loop forever.
    /// Returns `Err` only if the duplication can't be created — the caller turns
    /// that into Lite mode.
    fn run_dxgi(app: AppHandle) -> Result<(), String> {
        let mut dxgi = DxgiCapture::new(0)?;
        let _ = app.emit("capture-mode", "dxgi");
        let region = MinimapRegion::for_resolution(dxgi.width(), dxgi.height());
        crate::log::error(&format!(
            "[capture] DXGI active — {}x{}, minimap {}px @ ({},{})",
            dxgi.width(),
            dxgi.height(),
            region.side,
            region.x,
            region.y
        ));
        let mut state = CaptureState::new(app, region);

        loop {
            // Gate to live matches — no CV work at the menu (idle-CPU saver).
            if !crate::runtime::in_game() {
                std::thread::sleep(Duration::from_millis(500));
                continue;
            }
            if let Some((full, fw, fh)) = dxgi.acquire_frame() {
                process_frame(&mut state, &full, fw, fh);
            }
            std::thread::sleep(Duration::from_millis(select_interval(&state)));
        }
    }

    /// Pick the loop cadence: governor over-budget → throttle (2 Hz); else alert
    /// (8 Hz) while Sentry is suspicious; else normal (4 Hz).
    fn select_interval(state: &CaptureState) -> u64 {
        if crate::governor::cpu_throttle() {
            return THROTTLE_INTERVAL_MS;
        }
        let now = state.start.elapsed().as_millis() as u64;
        if state.sentry.missing(now).is_empty() {
            NORMAL_INTERVAL_MS
        } else {
            ALERT_INTERVAL_MS
        }
    }

    /// Crop the minimap square out of a full-screen tightly-packed BGRA8 buffer.
    /// Returns the cropped `(bytes, width, height)`, or `None` if the region is
    /// off-screen (bad calibration) or the buffer is short.
    fn crop_bgra(
        full: &[u8],
        fw: u32,
        fh: u32,
        r: &MinimapRegion,
    ) -> Option<(Vec<u8>, usize, usize)> {
        let end_x = (r.x + r.side).min(fw);
        let end_y = (r.y + r.side).min(fh);
        if r.x >= end_x || r.y >= end_y {
            return None;
        }
        let w = (end_x - r.x) as usize;
        let h = (end_y - r.y) as usize;
        let stride = fw as usize * 4;
        if full.len() < end_y as usize * stride {
            return None; // defensive: DXGI always gives fw*fh*4, but never index OOB
        }
        let row_bytes = w * 4;
        let mut out = vec![0u8; row_bytes * h];
        for row in 0..h {
            let src = (r.y as usize + row) * stride + r.x as usize * 4;
            let dst = row * row_bytes;
            out[dst..dst + row_bytes].copy_from_slice(&full[src..src + row_bytes]);
        }
        Some((out, w, h))
    }

    /// Run the full CV → game-knowledge pipeline on one captured full-screen
    /// frame. Logic is identical to the old WGC `on_frame_arrived`; only the frame
    /// source (DXGI full-screen + software crop) differs.
    fn process_frame(state: &mut CaptureState, full: &[u8], fw: u32, fh: u32) {
        let work_start = Instant::now();

        // Calibration evidence feed (≈9 fps; QA mode only). DXGI already hands us
        // the full screen, so no extra capture is needed.
        if crate::calibration::is_enabled() && state.last_calib.elapsed().as_millis() >= 110 {
            state.last_calib = Instant::now();
            crate::calibration::push_full_bgra(full, fw, fh);
        }

        let r = state.region;
        let now_ms = state.start.elapsed().as_millis() as u64;
        let suspicious = !state.sentry.missing(now_ms).is_empty();

        let (cropped, w, h) = match crop_bgra(full, fw, fh, &r) {
            Some(v) => v,
            None => return, // region off-screen — skip safely
        };

        if let Some(f) = Frame::from_bgra(w, h, cropped) {
            let candidates = prefilter_candidates(&f, state.icon, DEFAULT_THRESHOLD_FRAC);
            let detections = state.detector.detect(&f, &candidates, state.icon);

            // G-Sentry: flag enemies missing >5s (edge-triggered).
            for em in state.sentry.update(&detections, &r, now_ms) {
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
                let _ = state.app.emit("enemy-missing", &em);
            }

            // G-Motion: history + gank-risk over currently-missing enemies.
            state.motion.record(&detections, &r, now_ms);
            let missing = state.sentry.missing(now_ms);
            let risk = state.motion.assess(&missing, now_ms);

            // G-Signal: edge-triggered warning + Belief Revision, voiced now (only
            // when the user has G-Signal enabled).
            if crate::runtime::signal_enabled() {
                state.signal.set_sensitivity(crate::runtime::signal_sensitivity());
                match state.signal.evaluate(&risk) {
                    SignalEvent::Alert(alert) => {
                        voice_interrupt("gank", GANK_LINE);
                        if crate::calibration::is_enabled() {
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
                        ));
                        let _ = state.app.emit("gank-alert", &alert);
                    }
                    SignalEvent::Revision => {
                        voice_interrupt("revision", REVISION_LINE);
                        crate::log::note_event(crate::log::gank_revision_record());
                        let _ = state.app.emit("gank-clear", ());
                    }
                    SignalEvent::None => {}
                }
            }

            // Debug/calibration feed — throttled to ≈5 Hz.
            if state.last_emit.elapsed().as_millis() >= DEBUG_EMIT_INTERVAL_MS {
                state.last_emit = Instant::now();
                let payload = MinimapDebug {
                    region: r,
                    icon: state.icon,
                    count: candidates.len(),
                    candidates,
                    detections,
                    classifier: state.detector.is_active(),
                };
                let _ = state.app.emit("minimap-cv", payload);
            }
        }

        // Stall watchdog: a frame creeping over budget is the early sign of a CV
        // stall — record it so error.log shows the run-up.
        let work_ms = work_start.elapsed().as_millis();
        if work_ms > SLOW_FRAME_MS {
            crate::log::error(&format!(
                "[capture] SLOW frame {work_ms}ms (suspicious={suspicious}) — possible CV stall"
            ));
        }
    }

    /// Voice a critical event with interrupt semantics: cancel whatever Maiden is
    /// saying, then play a pre-recorded clip for `event` if cached, else speak
    /// `fallback` via SAPI. Lets a gank warning cut in immediately (and Belief
    /// Revision retract mid-stream).
    fn voice_interrupt(event: &str, fallback: &str) {
        crate::audio::cancel();
        crate::tts::cancel();
        if !crate::audio::play_random(event) {
            let (name, rate) = crate::runtime::voice();
            crate::tts::speak(fallback, name.as_deref(), rate);
        }
    }

    /// Locate the model directory, preferring the Tauri resource dir, then
    /// `models/` next to the exe, then `models/` in the working directory.
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
        //! Latency harness — times the controllable compute pipeline (prefilter →
        //! detect → sentry → motion → signal) over many synthetic frames and
        //! asserts p99 stays well inside budget. Capture I/O is budgeted
        //! separately, so it's not in this measurement.
        use super::*;
        use std::path::Path;

        fn synthetic_frame(n: usize) -> Frame {
            let (w, h, icon) = (256usize, 256usize, 20usize);
            let mut bgra = vec![0u8; w * h * 4];
            for (i, px) in bgra.chunks_mut(4).enumerate() {
                let (x, _y) = (i % w, i / w);
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
                        bgra[p] = 41;
                        bgra[p + 1] = 41;
                        bgra[p + 2] = 219;
                    }
                }
            }
            Frame::from_bgra(w, h, bgra).unwrap()
        }

        #[test]
        fn pipeline_latency_within_budget() {
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
            let region = MinimapRegion { x: 0, y: 0, side: 256 };
            let icon = 20usize;
            let frame = synthetic_frame(5);

            let mut sentry = Sentry::new();
            let mut motion = Motion::new();
            let mut signal = Signal::new();

            let iters = 300usize;
            let mut samples_us: Vec<u128> = Vec::with_capacity(iters);
            for i in 0..iters {
                let now_ms = (i as u64) * 125;
                let t = Instant::now();
                let cands = prefilter_candidates(&frame, icon, DEFAULT_THRESHOLD_FRAC);
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
            eprintln!("[latency] compute pipeline p50={p50:.3} ms  p99={p99:.3} ms");
            assert!(p99 < 80.0, "pipeline p99 {p99:.3} ms exceeds 80 ms budget");
        }
    }
}
