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
    use crate::cv::draft_detector::DraftRecognizer;
    use crate::cv::draft_region::DraftRegion;
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

    /// Draft-CV poll cadence (ms) ≈ 2 Hz while in the pick window. The pick screen
    /// changes only when someone picks, and the match isn't running, so there's no
    /// latency budget to protect — this is unhurried.
    const DRAFT_INTERVAL_MS: u64 = 500;

    /// How often (ms) the loop re-runs Dota-monitor auto-detection
    /// (CR012-P1-01). Throttled deliberately — `detect_dota_monitor` walks
    /// `EnumWindows` + DXGI output enumeration, which is cheap but not
    /// per-frame-cheap, and the G-Signal path must stay ≤300ms end-to-end.
    /// Checked with a plain `Instant::elapsed()` comparison every loop tick
    /// (near-zero cost); the actual win32/DXGI work only runs once this
    /// elapses.
    const MONITOR_RECHECK_MS: u64 = 2000;

    /// Cap the rate of the debug/calibration `minimap-cv` event (ms) ≈ 5 Hz, so
    /// the IPC → WebView2 → DWM path can't pile up over a long match. Edge-
    /// triggered gank alerts / enemy-missing events still emit immediately.
    const DEBUG_EMIT_INTERVAL_MS: u128 = 200;

    /// Cap the rate of the live minimap mirror (`minimap-frame`) — a downscaled
    /// PNG of the captured minimap sent to the Command Deck (ms) ≈ 3 Hz. The
    /// mirror only needs to be glanceable, so we keep the encode + base64 + IPC
    /// cost low against the CPU/RAM budget rather than matching capture cadence.
    const MINIMAP_FRAME_INTERVAL_MS: u128 = 300;
    /// Target width (px) the mirrored minimap is downscaled to before PNG-encode.
    /// The real region is ≈15.6% of screen height (≈220–320 px), so this is a
    /// mild shrink that keeps the base64 payload to a few KB.
    const MINIMAP_FRAME_WIDTH: u32 = 220;

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

    /// Live minimap mirror for the Command Deck: a downscaled PNG of the exact
    /// pixels we already crop for CV, inlined as a base64 `data:` URL (the same
    /// technique pack banners use — the overlay/deck CSP allows `img-src data:`).
    /// `region` travels alongside so the deck can place markers in the same
    /// coordinate space as the image if it wants.
    #[derive(Clone, serde::Serialize)]
    struct MinimapFrame {
        image: String,
        region: MinimapRegion,
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
        /// last live minimap-mirror `minimap-frame` emit (throttled ≈3 Hz).
        last_frame_emit: Instant,
        /// last calibration-buffer feed (≈9 Hz when QA mode on).
        last_calib: Instant,
        /// Draft-CV: pick-screen portrait recognizer + the 10 portrait boxes.
        draft: DraftRecognizer,
        draft_region: DraftRegion,
    }

    impl CaptureState {
        fn new(app: AppHandle, region: MinimapRegion, screen_w: u32, screen_h: u32) -> Self {
            let icon = region.icon_size();
            let dir = model_dir(&app);
            let detector =
                Detector::load(&dir.join("minimap-detector.onnx"), &dir.join("labels.json"));
            let draft = DraftRecognizer::load(&dir.join("portraits"));
            let draft_region = DraftRegion::for_resolution(screen_w, screen_h);
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
                last_frame_emit: now,
                last_calib: now,
                draft,
                draft_region,
            }
        }

        /// Re-target the pipeline at a new capture resolution/region after a
        /// monitor switch (CR012-P1-01). `region`/`icon` drive minimap CV;
        /// `draft_region` drives the pick-screen portrait boxes — both are
        /// resolution-dependent, so both must move together. G-Sentry and
        /// G-Motion are reset: their tracked positions are expressed in the
        /// OLD monitor's coordinate space and would otherwise misfire as
        /// bogus "enemy moved instantly" events against the new one. A
        /// monitor switch is rare (Dota relocated to another screen, or the
        /// app started before Dota launched), so losing a few seconds of
        /// missing/motion history here is the right trade against silently
        /// capturing the wrong screen.
        fn set_region(&mut self, region: MinimapRegion, screen_w: u32, screen_h: u32) {
            self.region = region;
            self.icon = region.icon_size();
            self.draft_region = DraftRegion::for_resolution(screen_w, screen_h);
            self.sentry = Sentry::new();
            self.motion = Motion::new();
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

    /// Initialise DXGI for whichever monitor Dota 2 is actually running on
    /// (CR012-P1-01 — falls back to monitor 0 / primary if Dota isn't found
    /// yet, e.g. the app started first) and run the capture loop forever.
    /// Returns `Err` only if the duplication can't be created — the caller turns
    /// that into Lite mode.
    fn run_dxgi(app: AppHandle) -> Result<(), String> {
        let mut current_monitor = crate::dxgi::detect_dota_monitor().unwrap_or(0);
        let mut dxgi = DxgiCapture::new(current_monitor)?;
        let _ = app.emit("capture-mode", "dxgi");
        let region = MinimapRegion::for_resolution(dxgi.width(), dxgi.height());
        crate::log::error(&format!(
            "[capture] DXGI active — monitor {}, {}x{}, minimap {}px @ ({},{})",
            current_monitor,
            dxgi.width(),
            dxgi.height(),
            region.side,
            region.x,
            region.y
        ));
        let (screen_w, screen_h) = (dxgi.width(), dxgi.height());
        let mut state = CaptureState::new(app, region, screen_w, screen_h);
        let mut last_monitor_check = Instant::now();

        loop {
            // CR012-P1-01: periodically re-detect which monitor Dota 2 is on
            // and hot-swap the DXGI duplication if it moved (or if the app
            // started before Dota launched and only now can find it).
            // Throttled to `MONITOR_RECHECK_MS` — the `Instant::elapsed()`
            // check itself is ~free every tick; the win32/DXGI enumeration
            // only runs once that elapses. On that single tick per 2s the
            // enumeration (EnumWindows + a DXGI factory/output enum, a bounded
            // few ms of non-blocking syscalls) runs before this tick's acquire,
            // so it delays at most ONE frame per 2s — well inside the 300ms
            // G-Signal budget (Opus gate, CR012-P1). Don't pile more work here.
            // Runs even while not
            // in-game so the right monitor is already locked in before the
            // horn.
            if last_monitor_check.elapsed() >= Duration::from_millis(MONITOR_RECHECK_MS) {
                last_monitor_check = Instant::now();
                if let Some(idx) = crate::dxgi::detect_dota_monitor() {
                    if idx != current_monitor {
                        match DxgiCapture::new(idx) {
                            Ok(new_dxgi) => {
                                dxgi = new_dxgi;
                                current_monitor = idx;
                                let region =
                                    MinimapRegion::for_resolution(dxgi.width(), dxgi.height());
                                state.set_region(region, dxgi.width(), dxgi.height());
                                crate::log::error(&format!(
                                    "[capture] Dota moved — switched to monitor {} ({}x{})",
                                    current_monitor,
                                    dxgi.width(),
                                    dxgi.height()
                                ));
                            }
                            Err(e) => {
                                crate::log::error(&format!(
                                    "[capture] monitor switch to {idx} failed, keeping \
                                     monitor {current_monitor}: {e}"
                                ));
                            }
                        }
                    }
                }
            }

            // Draft-CV: read the roster off the pick screen before the horn. Runs
            // ONLY while in hero selection and ONLY until a roster is committed
            // (`roster().is_none()`), then idles. `in_game()` is false here, so
            // this is the only place the loop wakes during the draft.
            if crate::runtime::in_draft() {
                if crate::runtime::roster().is_none() {
                    if let Some((full, fw, fh)) = dxgi.acquire_frame() {
                        process_draft_frame(&mut state, &full, fw, fh);
                    }
                }
                std::thread::sleep(Duration::from_millis(DRAFT_INTERVAL_MS));
                continue;
            }
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
        crop_square(full, fw, fh, r.x, r.y, r.side)
    }

    /// Crop an arbitrary square box `(x, y, side)` out of a full-screen tightly-
    /// packed BGRA8 buffer — shared by the minimap crop and Draft-CV's portrait
    /// boxes. `None` if the box is off-screen or the buffer is short.
    fn crop_square(
        full: &[u8],
        fw: u32,
        fh: u32,
        x: u32,
        y: u32,
        side: u32,
    ) -> Option<(Vec<u8>, usize, usize)> {
        let end_x = (x + side).min(fw);
        let end_y = (y + side).min(fh);
        if x >= end_x || y >= end_y {
            return None;
        }
        let w = (end_x - x) as usize;
        let h = (end_y - y) as usize;
        let stride = fw as usize * 4;
        if full.len() < end_y as usize * stride {
            return None; // defensive: DXGI always gives fw*fh*4, but never index OOB
        }
        let row_bytes = w * 4;
        let mut out = vec![0u8; row_bytes * h];
        for row in 0..h {
            let src = (y as usize + row) * stride + x as usize * 4;
            let dst = row * row_bytes;
            out[dst..dst + row_bytes].copy_from_slice(&full[src..src + row_bytes]);
        }
        Some((out, w, h))
    }

    /// Draft-CV: crop the 10 pick-screen portrait boxes, recognize each, and —
    /// once ALL 10 read confidently (i.e. the draft is complete) — commit the
    /// roster to `runtime` and emit `draft-roster`. A partial pick screen (picks
    /// still coming in) recognizes fewer than 10 and simply retries next poll.
    /// No-op when the recognizer has no templates (asset pack not shipped yet).
    fn process_draft_frame(state: &mut CaptureState, full: &[u8], fw: u32, fh: u32) {
        if !state.draft.is_active() {
            return;
        }
        let mut radiant = Vec::with_capacity(5);
        let mut dire = Vec::with_capacity(5);
        for (i, b) in state.draft_region.boxes.iter().enumerate() {
            let name = crop_square(full, fw, fh, b.x, b.y, b.side)
                .and_then(|(bytes, w, h)| Frame::from_bgra(w, h, bytes))
                .and_then(|f| state.draft.recognize(&f))
                .map(|(name, _score)| name);
            match name {
                Some(n) if i < 5 => radiant.push(n),
                Some(n) => dire.push(n),
                None => {}
            }
        }
        // Only commit a COMPLETE roster (both teams fully identified). This
        // naturally waits for the draft to finish — unpicked slots recognize
        // nothing — and once committed, `roster().is_some()` idles the loop.
        if radiant.len() == 5 && dire.len() == 5 {
            crate::log::error(&format!(
                "[draft] roster read — radiant {radiant:?} dire {dire:?}"
            ));
            crate::runtime::set_roster(radiant.clone(), dire.clone());
            let _ = state
                .app
                .emit("draft-roster", crate::runtime::Roster { radiant, dire });
        }
    }

    /// Downscale a cropped BGRA minimap to [`MINIMAP_FRAME_WIDTH`] and PNG-encode
    /// it into a base64 `data:image/png` URL for the Command Deck mirror. Nearest-
    /// neighbour resize (same cheap kernel `calibration.rs` uses) so it stays well
    /// inside budget at the ≈3 Hz call rate. Returns `None` on a degenerate size
    /// or an encode failure — the caller then simply skips this frame.
    fn encode_minimap_dataurl(bgra: &[u8], w: usize, h: usize) -> Option<String> {
        use image::codecs::png::PngEncoder;
        use image::{ExtendedColorType, ImageEncoder};

        if w == 0 || h == 0 {
            return None;
        }
        let (sw, sh) = (w as u32, h as u32);
        let tw = MINIMAP_FRAME_WIDTH.min(sw);
        let th = ((tw as u64 * sh as u64) / sw as u64).max(1) as u32;
        let mut rgba = vec![0u8; (tw as usize) * (th as usize) * 4];
        for y in 0..th {
            let sy = (y as u64 * sh as u64 / th as u64) as usize;
            for x in 0..tw {
                let sx = (x as u64 * sw as u64 / tw as u64) as usize;
                let si = (sy * w + sx) * 4;
                let di = ((y * tw + x) * 4) as usize;
                if si + 3 < bgra.len() {
                    rgba[di] = bgra[si + 2]; // R (BGRA → RGBA)
                    rgba[di + 1] = bgra[si + 1]; // G
                    rgba[di + 2] = bgra[si]; // B
                    rgba[di + 3] = 255; // A
                }
            }
        }
        let mut png: Vec<u8> = Vec::new();
        PngEncoder::new(&mut png)
            .write_image(&rgba, tw, th, ExtendedColorType::Rgba8)
            .ok()?;
        Some(format!(
            "data:image/png;base64,{}",
            crate::voice_api::base64_encode(&png)
        ))
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
            let candidates = prefilter_candidates(
                &f,
                state.icon,
                DEFAULT_THRESHOLD_FRAC,
                crate::runtime::enemy_team_ring(),
            );
            let mut detections = state.detector.detect(&f, &candidates, state.icon);

            // Roster-grounded phantom-hero fix (Draft-CV): once the pick-screen
            // roster is known, drop any detection classified as a hero that isn't
            // actually in this match — the tiny minimap model otherwise misfires
            // non-hero blips into random heroes. Complements G-Sentry's temporal
            // confirmation gate; this one is a hard identity constraint. No-op
            // until a roster has been read (own-game may never read one).
            if let Some(roster) = crate::runtime::roster_labels() {
                detections.retain(|d| roster.iter().any(|h| h == &d.name));
            }

            // Record identified enemies so G-Master's counter advice is grounded
            // on who's actually in the match (runtime is the single source of
            // truth; cleared at match start). Best-effort, dedup handled inside.
            for d in &detections {
                crate::runtime::add_known_enemy(&d.name);
            }

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
                state
                    .signal
                    .set_sensitivity(crate::runtime::signal_sensitivity());
                // Silent-arm efficacy study (RWANG TASK 2): when the current
                // match was randomly assigned to the silent arm, the pipeline
                // still runs and everything is still logged — only the
                // user-facing alert (voice + banner) is suppressed, so we can
                // later measure whether the warning itself changed the death
                // rate. `armed` = the user WAS alerted this time.
                let armed = !crate::runtime::silent_arm();
                match state.signal.evaluate(&risk) {
                    SignalEvent::Alert(alert) => {
                        if armed {
                            voice_interrupt("gank", GANK_LINE);
                            // CR-011 §B utterance ledger — after the voice
                            // dispatch above, never before, so it can't add
                            // latency to the G-Signal path (CLAUDE.md ≤300ms).
                            crate::utterance::emit(
                                &state.app,
                                crate::utterance::UtterancePayload::new(
                                    "signal",
                                    "line",
                                    GANK_LINE,
                                    None,
                                    None,
                                ),
                            );
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
                            let _ = state.app.emit("gank-alert", &alert);
                        }
                    }
                    SignalEvent::Revision => {
                        if armed {
                            voice_interrupt("revision", REVISION_LINE);
                            // Belief Revision — retracted carries the earlier
                            // GANK_LINE warning being struck through.
                            crate::utterance::emit(
                                &state.app,
                                crate::utterance::UtterancePayload::new(
                                    "signal",
                                    "revision",
                                    REVISION_LINE,
                                    Some(GANK_LINE.to_string()),
                                    None,
                                ),
                            );
                        }
                        crate::log::note_event(crate::log::gank_revision_record());
                        if armed {
                            let _ = state.app.emit("gank-clear", ());
                        }
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

            // Live minimap mirror for the Command Deck (throttled ≈3 Hz). Encodes
            // the same cropped pixels we just ran CV over — no extra capture. Kept
            // at the tail so it never delays the G-Signal latency path above.
            if state.last_frame_emit.elapsed().as_millis() >= MINIMAP_FRAME_INTERVAL_MS {
                state.last_frame_emit = Instant::now();
                if let Some(image) = encode_minimap_dataurl(&f.bgra, f.width, f.height) {
                    let _ = state.app.emit("minimap-frame", MinimapFrame { image, region: r });
                }
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
            crate::tts::speak_with_priority(
                fallback,
                name.as_deref(),
                rate,
                crate::audio::Priority::Critical,
            );
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
        use crate::audio::{priority_for_event, should_accept_incoming, Priority};
        use crate::motion::GankRisk;
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
                let now_ms = (i as u64) * 125;
                let t = Instant::now();
                let cands = prefilter_candidates(
                    &frame,
                    icon,
                    DEFAULT_THRESHOLD_FRAC,
                    crate::cv::DIRE_RING,
                );
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

        #[test]
        fn gsi_to_signal_audio_enqueue_latency_within_budget() {
            let body = r#"{
              "map": { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS", "clock_time": 612, "daytime": true, "radiant_score": 14, "dire_score": 9 },
              "player": { "gold": 2300, "net_worth": 14500, "gpm": 520, "xpm": 610, "kills": 7, "deaths": 2, "assists": 10, "last_hits": 145, "denies": 8, "team_name": "dire" },
              "hero": { "name": "npc_dota_hero_crystal_maiden", "level": 14, "alive": true, "health_percent": 78, "mana_percent": 65 }
            }"#;

            let iters = 1000usize;
            let mut samples_us: Vec<u128> = Vec::with_capacity(iters);
            for _ in 0..iters {
                let mut signal = Signal::new();
                signal.set_sensitivity(crate::signal::Sensitivity::Med);

                let t = Instant::now();
                let tick = crate::gsi::parse_tick_from_json(body);
                crate::runtime::set_player_team_name(&tick.team_name);
                let ring = crate::runtime::enemy_team_ring();
                assert_eq!(
                    ring,
                    crate::cv::RADIANT_RING,
                    "Dire local player should target Radiant-green enemy ring"
                );

                let risk = GankRisk {
                    probability: 0.91,
                    missing_heroes: vec!["npc_dota_hero_axe".into(), "npc_dota_hero_lina".into()],
                    eta_ms: 2400,
                };
                let event = signal.evaluate(&risk);
                let accepted = matches!(event, SignalEvent::Alert(_))
                    && should_accept_incoming(Priority::Cosmetic, priority_for_event("gank"));
                assert!(accepted, "critical gank alert should be enqueueable");
                samples_us.push(t.elapsed().as_micros());
            }
            samples_us.sort_unstable();
            let p50 = samples_us[iters / 2] as f64 / 1000.0;
            let p99 = samples_us[(iters * 99) / 100] as f64 / 1000.0;
            eprintln!("[latency] gsi->signal->audio-enqueue p50={p50:.3} ms  p99={p99:.3} ms");
            assert!(
                p99 < 10.0,
                "gsi->signal->audio-enqueue p99 {p99:.3} ms exceeds 10 ms budget"
            );
        }
    }
}
