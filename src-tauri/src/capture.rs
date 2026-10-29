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
//! Fresh frames drive critical evaluation; bounded DXGI acquisition includes its wait
//! in T0. Resource pressure withdraws observation readiness. A separate 500ms
//! freshness watchdog never substitutes for a critical capture cadence.
//!
//! Live verification (compile alone is NOT sufficient) needs Dota 2 open in
//! borderless fullscreen — see ADR-13 Phase 3 validation.

use std::sync::atomic::{AtomicU8, Ordering};
#[cfg(not(feature = "wgc"))]
#[path = "capture_schedule.rs"]
mod schedule;

const MODE_INITIALIZING: u8 = 0;
const MODE_RETRYING: u8 = 1;
const MODE_LITE: u8 = 2;
const MODE_DXGI: u8 = 3;
const MODE_GDI: u8 = 4;
static CAPTURE_MODE: AtomicU8 = AtomicU8::new(MODE_INITIALIZING);

/// Current capture state, also used to hydrate a settings page opened after
/// the startup event was emitted.
pub fn current_mode() -> &'static str {
    match CAPTURE_MODE.load(Ordering::SeqCst) {
        MODE_RETRYING => "retrying",
        MODE_LITE => "lite",
        MODE_DXGI => "dxgi",
        MODE_GDI => "gdi",
        _ => "initializing",
    }
}

fn publish_mode(app: &tauri::AppHandle, mode: &'static str) {
    use tauri::Emitter;

    let value = match mode {
        "retrying" => MODE_RETRYING,
        "lite" => MODE_LITE,
        "dxgi" => MODE_DXGI,
        "gdi" => MODE_GDI,
        _ => MODE_INITIALIZING,
    };
    CAPTURE_MODE.store(value, Ordering::SeqCst);
    let _ = app.emit("capture-mode", mode);
}

/// Legacy WGC backend, selected at build time with `--features wgc` (ADR-13
/// rollback). Implementation frozen in `capture_wgc.rs`.
#[cfg(feature = "wgc")]
pub fn start(app: tauri::AppHandle) {
    publish_mode(&app, "initializing");
    crate::capture_wgc::start(app);
}

#[cfg(feature = "wgc")]
pub fn retry(_app: tauri::AppHandle) -> Result<(), String> {
    Err("capture retry is unavailable with the legacy WGC backend".into())
}

#[cfg(not(feature = "wgc"))]
pub use backend::{retry, start};

#[cfg(not(feature = "wgc"))]
mod backend {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::{self, Receiver, SyncSender, TryRecvError, TrySendError};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::{Duration, Instant};

    use tauri::{AppHandle, Emitter, Manager};

    use crate::capture::publish_mode;
    use crate::capture_frame::{CaptureRoi, CaptureRoiKind, FrameCaptureMetadata};
    use crate::cv::detector::{Detection, Detector};
    use crate::cv::draft_detector::DraftRecognizer;
    use crate::cv::draft_region::{DraftRegion, PortraitBox};
    use crate::cv::hero_hud::HeroHudRegion;
    use crate::cv::prefilter::{prefilter_candidates, DEFAULT_THRESHOLD_FRAC};
    use crate::cv::region::MinimapRegion;
    use crate::cv::Frame;
    use crate::dxgi::DxgiCapture;
    use crate::motion::Motion;
    use crate::sentry::Sentry;
    use crate::signal::{Signal, SignalEvent};

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

    /// If a single frame's compute exceeds this (ms) we log it — a developing CV
    /// stall shows up as frames creeping over budget before anything locks up.
    const SLOW_FRAME_MS: u128 = 100;

    /// Freshness watchdog only: silence is unavailable observation, never a
    /// delayed critical evaluation or evidence that all heroes remain visible.
    const STALE_FRAME_MS: u64 = super::schedule::FRESHNESS_WATCHDOG_MS;

    /// A live capture session with no completed frame for this long is torn
    /// down so DXGI/device state can be rebuilt. This absorbs short Alt-Tab
    /// and mode changes while bounding a permanently lost capture session.
    const CAPTURE_RECOVERY_MS: u64 = 6_000;

    /// Heartbeat for `sensor-health` (ms). The event is edge-triggered on any
    /// field the UI branches on; this only exists so `frame_age_ms` keeps
    /// ticking on screen while nothing else changes.
    const HEALTH_HEARTBEAT_MS: u128 = 1_000;

    /// Minimum gap (ms) between recorded `risk_trace` log lines ≈ 1 Hz — this is
    /// the offline re-fit input for G-Motion/G-Signal (audit item: thresholds
    /// unmeasured because inputs were never recorded), sampled far below the CV
    /// cadence since it only needs to capture the shape of a gank window, not
    /// every frame. See `log::should_record_risk_trace`.
    const RISK_TRACE_INTERVAL_MS: u64 = 1000;

    static RETRY_SENDER: OnceLock<Mutex<Option<SyncSender<()>>>> = OnceLock::new();

    fn retry_sender() -> &'static Mutex<Option<SyncSender<()>>> {
        RETRY_SENDER.get_or_init(|| Mutex::new(None))
    }

    fn queue_retry(sender: &SyncSender<()>) -> Result<(), &'static str> {
        match sender.try_send(()) {
            Ok(()) | Err(TrySendError::Full(())) => Ok(()),
            Err(TrySendError::Disconnected(())) => Err("capture supervisor stopped"),
        }
    }

    enum CaptureExit {
        RetryRequested,
        SenderClosed,
    }

    struct CaptureWorkerGuard {
        app: AppHandle,
    }

    impl Drop for CaptureWorkerGuard {
        fn drop(&mut self) {
            let mut sender = retry_sender()
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            publish_lite(&self.app, "capture supervisor stopped");
            *sender = None;
            crate::runtime::reset_local_capture_started();
        }
    }

    // Review fix: these used to be this module's own `const` copies of the
    // same Thai text tts.rs bakes into the prewarm cache (GANK_LINE ==
    // GANK_LINE_ALT, REVISION_LINE == REVISION_LINE_ALT, byte-for-byte) —
    // tts.rs's doc comment claims hoisting the prewarm lines there means the
    // cache "can never drift from what's actually said," but this second
    // copy (feeding voice_interrupt's caption/utterance-ledger/calibration
    // uses below) meant it silently could. Alias to the single source of
    // truth instead of duplicating the literals.
    use crate::tts::{GANK_LINE_ALT as GANK_LINE, REVISION_LINE_ALT as REVISION_LINE};

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
        capture_frame_id: Option<u64>,
        capture_acquired_at_ms: Option<u64>,
        geometry_generation: String,
        display_index: u32,
        display_fingerprint: String,
        desktop_origin: [i32; 2],
    }

    /// Honest state of the minimap sensor, broadcast to every window.
    ///
    /// Before this event the only thing the UI ever heard was `capture-mode`,
    /// emitted twice per process: once at thread start and once on a hard
    /// init failure. Everything in between — the GDI fall-back, a missing
    /// ONNX model, a governor throttle, a mid-session capture stall — was
    /// invisible, so an empty missing-hero set rendered as an affirmative
    /// green "ปลอดภัย" whether the map was genuinely clear or the sensor was
    /// dead. `healthy` is the single field a consumer should branch on before
    /// claiming safety; the rest is diagnosis.
    #[derive(Clone, Copy, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SensorHealth {
        /// `"dxgi"` | `"gdi"` | `"lite"` — the backend actually serving frames.
        backend: &'static str,
        /// ONNX classifier loaded. False ⇒ candidate-only mode, which yields
        /// zero detections forever, which looks exactly like "map is clear".
        classifier: bool,
        /// Governor has the process over budget ⇒ capture is down to 2 Hz.
        throttled: bool,
        /// Milliseconds since the last frame that actually reached the CV
        /// pipeline. Held near zero while out of a match so re-entry is clean.
        /// `None` in Lite mode: there is no capture loop, so there is no frame
        /// clock to report — the same "no data is not a number" rule the
        /// governor follows with its `-1` sentinels. (It also keeps this off
        /// the JSON `2^53` cliff that a `u64::MAX` sentinel would sit on.)
        frame_age_ms: Option<u64>,
        /// Is the minimap sensor producing trustworthy data right now?
        healthy: bool,
    }

    impl SensorHealth {
        /// No capture backend is currently producing frames. GSI and voice
        /// remain available while the supervisor waits for a manual retry.
        fn lite() -> Self {
            SensorHealth {
                backend: "lite",
                classifier: false,
                throttled: false,
                frame_age_ms: None,
                healthy: false,
            }
        }

        /// What the UI branches on. Fail-closed: anything we are unsure about
        /// resolves to "not healthy", because the cost of wrongly claiming the
        /// sensor works is a player trusting a green light over a dead feed.
        fn key(&self) -> (&'static str, bool, bool, bool) {
            (self.backend, self.classifier, self.throttled, self.healthy)
        }
    }

    /// Per-frame pipeline state. Same shape as the old WGC `MinimapCapture` minus
    /// the capture-API trait (the DXGI loop owns cadence) and `last_processed`
    /// Critical work is admitted only for fresh frames within the due-time budget.
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
        /// last recorded `risk_trace` log line (throttled ≈1 Hz — see
        /// `RISK_TRACE_INTERVAL_MS`).
        last_risk_trace: Instant,
        /// Draft-CV: pick-screen portrait recognizer + the 10 portrait boxes.
        draft: DraftRecognizer,
        draft_region: DraftRegion,
        draft_template_dir: std::path::PathBuf,
        draft_bundled_template_dir: std::path::PathBuf,
        draft_labels_path: std::path::PathBuf,
        draft_template_fetch_started: bool,
        draft_template_fetch_done: Arc<AtomicBool>,
        draft_templates_reloaded: bool,
        last_draft_progress_epoch: Option<u64>,
        last_draft_progress: Option<crate::runtime::DraftRosterProgress>,
        last_hero_hud_emit: Instant,
        last_inference_log: Instant,
        inference_frames: u64,
        inference_hits: u64,
        inference_misses: u64,
        inference_ms: u128,
        roster_votes: crate::cv::roster::RosterVotes,
        roster_vote_epoch: u64,
        scene_ok_ms: Option<u64>,
        warning_frame_ms: Option<u64>,
        observation_since_ms: Option<u64>,
        last_missing_emit: Instant,
        warning_reason: String,
        last_warning_log: Instant,
        /// `runtime::match_epoch()` as of the last pipeline rebuild. When the
        /// shared counter moves past this, a match boundary happened and
        /// Sentry/Motion/Signal are rebuilt (see `reset_pipeline`).
        match_epoch: u64,
        preview_geometry_generation: u64,
        preview_display_index: u32,
        preview_display_id: u64,
        preview_desktop_origin: [i32; 2],
        /// Last frame that reached `process_frame`. Drives `frame_age_ms`.
        last_frame_ok: Instant,
        cycle_started: Instant,
        frames: super::schedule::FrameGate,
        next_cycle_due: Instant,
        /// Last `sensor-health` emit + the field tuple it carried, so the event
        /// is edge-triggered rather than spammed at loop cadence.
        last_health_emit: Instant,
        last_health_key: Option<(&'static str, bool, bool, bool)>,
    }

    fn missing_state_payload(
        missing: &[(String, u64, (f32, f32))],
        visible: Vec<String>,
        known: usize,
        ready: bool,
        reason: &str,
        age_ms: u64,
    ) -> serde_json::Value {
        let visible_heroes = if ready { visible } else { Vec::new() };
        let missing = if ready { missing } else { &[] };
        let heroes: Vec<_> = missing.iter().map(|(hero, _, _)| hero).collect();
        let observations: Vec<_> = missing.iter().map(|(hero, age, pos)| {
            serde_json::json!({"hero":hero,"hero_id":crate::cv::identity::HeroId::from_label(hero),"missing_for_ms":age,"last_pos":pos})
        }).collect();
        serde_json::json!({"heroes":heroes,"visible_heroes":visible_heroes,"observation_age_ms":age_ms,"observations":observations,"roster_known":known,"ready":ready,"reason":reason})
    }

    impl CaptureState {
        fn new(app: AppHandle, region: MinimapRegion, screen_w: u32, screen_h: u32) -> Self {
            let icon = region.icon_size();
            let dir = model_dir(&app);
            let detector =
                Detector::load(&dir.join("minimap-detector.onnx"), &dir.join("labels.json"));
            let draft_template_dir = app
                .path()
                .app_local_data_dir()
                .map(|path| path.join("cv").join("portraits"))
                .unwrap_or_else(|_| dir.join("portraits"));
            let draft_bundled_template_dir = dir.join("portraits");
            let draft = DraftRecognizer::load_from_dirs(&[
                &draft_template_dir,
                &draft_bundled_template_dir,
            ]);
            let draft_region = DraftRegion::for_resolution(screen_w, screen_h);
            let now = Instant::now();
            CaptureState {
                app,
                region,
                icon,
                detector,
                sentry: Sentry::new(),
                motion: Motion::for_next_match(),
                signal: Signal::new(),
                start: now,
                last_emit: now,
                last_calib: now,
                last_risk_trace: now,
                draft,
                draft_region,
                draft_template_dir,
                draft_bundled_template_dir,
                draft_labels_path: dir.join("labels.json"),
                draft_template_fetch_started: false,
                draft_template_fetch_done: Arc::new(AtomicBool::new(false)),
                draft_templates_reloaded: false,
                last_draft_progress_epoch: None,
                last_draft_progress: None,
                last_hero_hud_emit: now,
                last_inference_log: now,
                inference_frames: 0,
                inference_hits: 0,
                inference_misses: 0,
                inference_ms: 0,
                roster_votes: crate::cv::roster::RosterVotes::default(),
                roster_vote_epoch: 0,
                scene_ok_ms: None,
                warning_frame_ms: None,
                observation_since_ms: None,
                last_missing_emit: now,
                warning_reason: String::new(),
                last_warning_log: now,
                match_epoch: crate::runtime::match_epoch(),
                preview_geometry_generation: 0,
                preview_display_index: 0,
                preview_display_id: 0,
                preview_desktop_origin: [0, 0],
                last_frame_ok: now,
                cycle_started: now,
                frames: super::schedule::FrameGate::default(),
                next_cycle_due: now,
                last_health_emit: now,
                last_health_key: None,
            }
        }

        /// Rebuild the three stateful G-modules. Their tracks are only valid
        /// within one continuous observation of one map: G-Sentry's `confirmed`
        /// flag is sticky by design (so a hero seen all match isn't re-confirmed
        /// every frame), G-Motion's history is keyed to a coordinate space, and
        /// G-Signal holds an `alerted` latch. Carrying any of that across a
        /// match boundary or a monitor switch turns it from memory into a lie.
        fn reset_pipeline(&mut self) {
            self.frames = super::schedule::FrameGate::default();
            self.sentry = Sentry::new();
            self.motion = Motion::for_next_match();
            self.signal = Signal::new();
            self.observation_since_ms = None;
            self.warning_frame_ms = None;
            self.scene_ok_ms = None;
        }

        fn suspend_observation(&mut self) {
            self.sentry = Sentry::new();
            self.motion.reset_tracking();
            self.signal.suspend();
            self.observation_since_ms = None;
            self.warning_frame_ms = None;
        }

        fn missing_snapshot(
            &mut self,
            session: &crate::runtime::MatchSessionSnapshot,
            missing: &[(String, u64, (f32, f32))],
            known: usize,
            ready: bool,
            reason: &str,
        ) {
            if !crate::runtime::is_current_capture_session(session.session_epoch) {
                return;
            }
            if self.last_missing_emit.elapsed() < Duration::from_millis(500)
                && self.warning_reason == reason
            {
                return;
            }
            self.last_missing_emit = Instant::now();
            let visible_heroes = self
                .sentry
                .visible(self.warning_frame_ms.unwrap_or(u64::MAX));
            let payload = missing_state_payload(
                missing,
                visible_heroes,
                known,
                ready,
                reason,
                self.last_frame_ok.elapsed().as_millis() as u64,
            );
            let _ = self.app.emit(
                "missing-state",
                crate::runtime::MatchSessionEvent::new(&payload, session),
            );
            if self.warning_reason != reason
                || self.last_warning_log.elapsed() >= Duration::from_secs(10)
            {
                crate::log::note_event_for_session(
                    session.session_epoch,
                    serde_json::json!({
                        "type": "warning_gate", "reason": reason, "ready": ready, "roster_known": known,
                        "missing_count": payload["heroes"].as_array().map_or(0, Vec::len),
                        "roster_source": "portrait_temporal",
                    }),
                );
                self.last_warning_log = Instant::now();
            }
            self.warning_reason = reason.to_string();
        }

        /// Rebuild the pipeline if a match boundary passed since the last check.
        /// Called once per loop tick — an atomic load plus a compare, so it is
        /// free enough to sit ahead of the G-Signal path.
        fn sync_match_epoch(&mut self) {
            let epoch = crate::runtime::match_epoch();
            if epoch != self.match_epoch {
                self.match_epoch = epoch;
                self.reset_pipeline();
                crate::log::error(&format!(
                    "[capture] match boundary (epoch {epoch}) — G-Sentry/G-Motion/G-Signal reset"
                ));
            }
        }

        /// Warm the public, static portrait reference cache only after Dota
        /// reaches hero selection. Network work is isolated on its own thread;
        /// the capture loop keeps rendering unknown slots until local templates
        /// are ready.
        fn prepare_draft_templates(&mut self) {
            if !self.draft_template_fetch_started {
                self.draft_template_fetch_started = true;
                let dir = self.draft_template_dir.clone();
                let labels = self.draft_labels_path.clone();
                let done = Arc::clone(&self.draft_template_fetch_done);
                let spawn = std::thread::Builder::new()
                    .name("g-draft-assets".into())
                    .spawn(move || {
                        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            let downloaded =
                                DraftRecognizer::fetch_missing_templates(&dir, &labels);
                            crate::log::error(&format!(
                                "[draft] cached {downloaded} hero portrait templates locally"
                            ));
                        }));
                        done.store(true, Ordering::Release);
                    });
                if spawn.is_err() {
                    self.draft_template_fetch_done
                        .store(true, Ordering::Release);
                }
            }

            self.reload_draft_templates_if_ready();
        }

        fn reload_draft_templates_if_ready(&mut self) -> bool {
            if self.draft_templates_reloaded
                || !self.draft_template_fetch_done.load(Ordering::Acquire)
            {
                return false;
            }
            self.draft = DraftRecognizer::load_from_dirs(&[
                &self.draft_template_dir,
                &self.draft_bundled_template_dir,
            ]);
            self.draft_templates_reloaded = true;
            true
        }

        fn emit_draft_template_ready(&mut self) {
            let session = crate::runtime::match_session_snapshot();
            if self.last_draft_progress_epoch != Some(session.session_epoch) {
                return;
            }
            let Some(mut progress) = self.last_draft_progress.clone() else {
                return;
            };
            if !progress.templates_loading {
                return;
            }
            progress.templates_loading = false;
            progress.recognizer_active = self.draft.is_active();
            if !crate::runtime::is_current_capture_session(session.session_epoch)
                && !crate::runtime::is_current_draft_session(session.session_epoch)
            {
                return;
            }
            self.last_draft_progress = Some(progress.clone());
            let event = crate::runtime::MatchSessionEvent::new(progress, &session);
            let _ = self.app.emit("draft-roster", event);
        }

        fn draft_templates_loading(&self) -> bool {
            self.draft_template_fetch_started
                && !self.draft_template_fetch_done.load(Ordering::Acquire)
        }

        /// Emit `sensor-health` when anything the UI branches on changed, or on
        /// the [`HEALTH_HEARTBEAT_MS`] heartbeat. Called from the loop body,
        /// never from `process_frame` — the ≤300ms G-Signal path must not pay
        /// for reporting.
        fn emit_health(&mut self, backend: &'static str) {
            let frame_age_ms = self.last_frame_ok.elapsed().as_millis() as u64;
            let classifier = self.detector.is_active();
            let throttled = crate::governor::cpu_throttle();
            let health = SensorHealth {
                backend,
                classifier,
                throttled,
                frame_age_ms: Some(frame_age_ms),
                healthy: backend != "lite"
                    && classifier
                    && !throttled
                    && frame_age_ms <= STALE_FRAME_MS,
            };
            let key = health.key();
            if self.last_health_key != Some(key)
                || self.last_health_emit.elapsed().as_millis() >= HEALTH_HEARTBEAT_MS
            {
                self.last_health_key = Some(key);
                self.last_health_emit = Instant::now();
                let _ = self.app.emit("sensor-health", health);
            }
        }

        /// Re-target the pipeline at a new capture resolution/region after a
        /// monitor switch (CR012-P1-01). `region`/`icon` drive minimap CV;
        /// `draft_region` drives the pick-screen portrait boxes — both are
        /// resolution-dependent, so both must move together. G-Sentry,
        /// G-Motion and G-Signal are reset: the tracked positions are
        /// expressed in the OLD monitor's coordinate space and would otherwise
        /// misfire as bogus "enemy moved instantly" events against the new
        /// one, and a latched G-Signal alert would belong to a screen we are
        /// no longer looking at. A
        /// monitor switch is rare (Dota relocated to another screen, or the
        /// app started before Dota launched), so losing a few seconds of
        /// missing/motion history here is the right trade against silently
        /// capturing the wrong screen.
        fn set_region(&mut self, region: MinimapRegion, screen_w: u32, screen_h: u32) {
            self.region = region;
            self.icon = region.icon_size();
            self.draft_region = DraftRegion::for_resolution(screen_w, screen_h);
            self.last_draft_progress = None;
            self.last_hero_hud_emit = Instant::now();
            self.suspend_observation();
            self.scene_ok_ms = None;
        }
    }

    /// Spawn one capture supervisor. Initialization failures leave the
    /// supervisor waiting in Lite mode so retry reuses the same thread.
    pub fn start(app: AppHandle) {
        let (sender, receiver) = mpsc::sync_channel(1);
        {
            let mut slot = retry_sender()
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if slot.is_some() {
                return;
            }
            *slot = Some(sender);
        }
        crate::capture::publish_mode(&app, "initializing");

        let thread_app = app.clone();
        let spawn = std::thread::Builder::new()
            .name("g-capture".into())
            .spawn(move || {
                let _guard = CaptureWorkerGuard {
                    app: thread_app.clone(),
                };
                crate::log::error("[capture] DXGI capture thread started");
                supervise(thread_app, receiver);
            });

        if let Err(error) = spawn {
            let mut slot = retry_sender()
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            publish_lite(&app, &format!("failed to spawn supervisor: {error}"));
            *slot = None;
            crate::runtime::reset_local_capture_started();
        }
    }

    /// Queue a retry without creating another capture thread. Requests
    /// coalesce while one retry is already waiting in the bounded channel.
    pub fn retry(app: AppHandle) -> Result<(), String> {
        let sender = retry_sender()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();

        if let Some(sender) = sender {
            if queue_retry(&sender).is_ok() {
                publish_mode(&app, "retrying");
                return Ok(());
            }
            let mut slot = retry_sender()
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            *slot = None;
        }

        if !crate::runtime::mark_local_capture_started() {
            return Err("capture supervisor is still starting".into());
        }
        start(app.clone());
        if retry_sender()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
            .is_some()
        {
            Ok(())
        } else {
            Err("capture supervisor could not be started".into())
        }
    }

    fn supervise(app: AppHandle, receiver: Receiver<()>) {
        loop {
            match run_dxgi(app.clone(), &receiver) {
                Ok(CaptureExit::RetryRequested) => {
                    publish_mode(&app, "retrying");
                }
                Ok(CaptureExit::SenderClosed) => break,
                Err(error) => {
                    publish_lite(&app, &error);
                    match receiver.recv() {
                        Ok(()) => publish_mode(&app, "retrying"),
                        Err(_) => break,
                    }
                }
            }
        }
    }

    fn publish_lite(app: &AppHandle, reason: &str) {
        eprintln!("[capture] unavailable: {reason} — running in Lite mode (GSI-only)");
        crate::log::error(&format!(
            "[capture] unavailable: {reason}. Running in Lite mode (GSI-only, minimap CV off)"
        ));
        publish_mode(app, "lite");
        let _ = app.emit("sensor-health", SensorHealth::lite());
    }

    /// Initialise DXGI for whichever monitor Dota 2 is actually running on
    /// (CR012-P1-01 — falls back to monitor 0 / primary if Dota isn't found
    /// yet, e.g. the app started first) and run the capture loop forever.
    /// Returns `Err` when capture must degrade to Lite, or a control event when
    /// the supervisor should retry or stop.
    fn run_dxgi(app: AppHandle, retry: &Receiver<()>) -> Result<CaptureExit, String> {
        let _preview_source = crate::minimap_preview_runtime::SourceScope::new();
        let mut preview_geometry = None;
        let mut current_monitor = crate::dxgi::detect_dota_monitor().unwrap_or(0);
        let mut dxgi = DxgiCapture::new(current_monitor)?;
        let mut reported_backend = dxgi.backend();
        publish_mode(&app, reported_backend);
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
        // CR-live-probe-rect: fires at most once — logs the ONE legitimate case
        // an `acquire_rect` can fail where `acquire_frame` would not (the
        // region's geometry is off-screen for the current resolution; a plain
        // capture timeout/access-lost affects both accessors identically and
        // needs no fallback, see `rect_is_on_screen`'s doc comment below).
        let mut warned_rect_geometry = false;
        let mut recovery = Duration::ZERO;

        loop {
            // T0 precedes scheduler checks, capture wait, copies, and inference.
            state.cycle_started = state.next_cycle_due;
            if !recovery.is_zero() {
                match retry.recv_timeout(recovery) {
                    Ok(()) => return Ok(CaptureExit::RetryRequested),
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        return Ok(CaptureExit::SenderClosed);
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                }
                recovery = Duration::ZERO;
            }
            let active_started = Instant::now();
            match retry.try_recv() {
                Ok(()) => return Ok(CaptureExit::RetryRequested),
                Err(TryRecvError::Disconnected) => return Ok(CaptureExit::SenderClosed),
                Err(TryRecvError::Empty) => {}
            }

            // Match boundary → rebuild Sentry/Motion/Signal before this tick's
            // frame can fold into last match's tracks. Ahead of the draft and
            // in-game gates so state is already clean when the horn lands.
            state.sync_match_epoch();
            let templates_reloaded = state.reload_draft_templates_if_ready();
            if templates_reloaded && !crate::runtime::in_draft() {
                state.emit_draft_template_ready();
            }
            // Honest sensor state for the overlay + deck. Ahead of the gates
            // too, so "capture is alive" is reported at the menu and during the
            // draft, not only mid-match.
            state.emit_health(dxgi.backend());
            if state.warning_frame_ms.is_some()
                && state.last_frame_ok.elapsed().as_millis() > u128::from(STALE_FRAME_MS)
            {
                state.suspend_observation();
                let session = crate::runtime::match_session_snapshot();
                state.missing_snapshot(
                    &session,
                    &[],
                    crate::runtime::enemy_roster_labels().len(),
                    false,
                    "capture_stale",
                );
            }
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
                                return Err(format!(
                                    "monitor switch to {idx} failed; old output was dropped: {e}"
                                ));
                            }
                        }
                    }
                }
            }

            let geometry = crate::minimap_preview::Geometry {
                x: state.region.x,
                y: state.region.y,
                side: state.region.side,
                screen_w: dxgi.width(),
                screen_h: dxgi.height(),
                display: current_monitor,
                display_id: dxgi.display_id(),
                origin_x: dxgi.desktop_origin().0,
                origin_y: dxgi.desktop_origin().1,
            };
            if preview_geometry != Some(geometry) {
                state.preview_geometry_generation =
                    crate::minimap_preview_runtime::invalidate_geometry();
                state.preview_display_index = current_monitor;
                state.preview_display_id = geometry.display_id;
                state.preview_desktop_origin = [geometry.origin_x, geometry.origin_y];
                preview_geometry = Some(geometry);
            }
            crate::minimap_preview_runtime::publish_geometry(geometry);
            if !crate::dxgi::dota_is_foreground() {
                state.suspend_observation();
                state.scene_ok_ms = None;
                state.last_frame_ok = Instant::now();
                let session = crate::runtime::match_session_snapshot();
                state.missing_snapshot(
                    &session,
                    &[],
                    crate::runtime::enemy_roster_labels().len(),
                    false,
                    "game_not_visible",
                );
                if retry
                    .recv_timeout(Duration::from_millis(u64::from(
                        super::schedule::ACQUIRE_WAIT_MS,
                    )))
                    .is_ok()
                {
                    return Ok(CaptureExit::RetryRequested);
                }
                state.next_cycle_due = Instant::now();
                continue;
            }

            // Draft-CV: read the roster off the pick screen before the horn. Runs
            // ONLY while in hero selection and ONLY until a roster is committed
            // (`roster().is_none()`), then idles. `in_game()` is false here, so
            // this is the only place the loop wakes during the draft.
            if crate::runtime::in_draft() {
                state.prepare_draft_templates();
                let session = crate::runtime::match_session_snapshot();
                if crate::runtime::is_current_draft_session(session.session_epoch) {
                    // CR-live-probe-rect: acquire only the bounding strip of the
                    // 10 portrait boxes instead of the full desktop — `DraftRegion`
                    // guarantees every box (and therefore the strip bounding them)
                    // sits on-screen, so no geometry fallback is needed here.
                    let (bx, by, bw, bh) = draft_bounding_rect(&state.draft_region.boxes);
                    if let Some((strip, sw, sh)) = dxgi.acquire_rect(bx, by, bw, bh) {
                        if !crate::minimap_preview::matches_output(
                            geometry,
                            dxgi.display_id(),
                            dxgi.desktop_origin(),
                            (dxgi.width(), dxgi.height()),
                        ) {
                            state.suspend_observation();
                            state.scene_ok_ms = None;
                            continue;
                        }
                        process_draft_frame(&mut state, &strip, sw, sh, bx, by, &session);
                    }
                }
                // Same reasoning as the not-in-game branch below: the minimap
                // pipeline is idle by design during the pick screen, so don't
                // let it age into a false "stalled" reading.
                state.last_frame_ok = Instant::now();
                if retry
                    .recv_timeout(Duration::from_millis(DRAFT_INTERVAL_MS))
                    .is_ok()
                {
                    return Ok(CaptureExit::RetryRequested);
                }
                state.next_cycle_due = Instant::now();
                continue;
            }
            // Gate to live matches — no CV work at the menu (idle-CPU saver).
            if !crate::runtime::in_game() {
                // Hold the frame clock at "just now" while we're deliberately
                // not capturing, so entering a match doesn't start out looking
                // like a 40-minute-old stall. `frame_age_ms` is only meaningful
                // as "the pipeline is running but starved".
                state.last_frame_ok = Instant::now();
                if retry
                    .recv_timeout(Duration::from_millis(u64::from(
                        super::schedule::ACQUIRE_WAIT_MS,
                    )))
                    .is_ok()
                {
                    return Ok(CaptureExit::RetryRequested);
                }
                state.next_cycle_due = Instant::now();
                continue;
            }

            state.sync_match_epoch();
            let session = crate::runtime::match_session_snapshot();
            if !crate::runtime::is_current_capture_session(session.session_epoch) {
                if retry
                    .recv_timeout(Duration::from_millis(u64::from(
                        super::schedule::ACQUIRE_WAIT_MS,
                    )))
                    .is_ok()
                {
                    return Ok(CaptureExit::RetryRequested);
                }
                state.next_cycle_due = Instant::now();
                continue;
            }

            if crate::governor::cpu_throttle() {
                state.suspend_observation();
                state.missing_snapshot(
                    &session,
                    &[],
                    crate::runtime::enemy_roster_labels().len(),
                    false,
                    "resource_unavailable_or_over_budget",
                );
                // Readiness is withdrawn; this wait is only a recovery watchdog.
                if retry
                    .recv_timeout(Duration::from_millis(STALE_FRAME_MS))
                    .is_ok()
                {
                    return Ok(CaptureExit::RetryRequested);
                }
                state.next_cycle_due = Instant::now();
                continue;
            }

            // CR-live-probe-rect: calibration/QA mode still needs the WHOLE
            // desktop (`calibration::push_full_bgra` feeds the calibration
            // overlay evidence buffer with full-screen frames), so that path
            // keeps today's full acquire_frame + software crop exactly. Every
            // other tick switches to a GPU subrect acquire of just the minimap
            // square — far cheaper than copying and cropping the full desktop.
            if crate::calibration::is_enabled() {
                if let Some((full, fw, fh)) = dxgi.acquire_frame() {
                    if !crate::minimap_preview::matches_output(
                        geometry,
                        dxgi.display_id(),
                        dxgi.desktop_origin(),
                        (dxgi.width(), dxgi.height()),
                    ) {
                        state.suspend_observation();
                        state.scene_ok_ms = None;
                        continue;
                    }
                    if state.last_calib.elapsed().as_millis() >= 110 {
                        state.last_calib = Instant::now();
                        if crate::runtime::is_current_capture_session(session.session_epoch) {
                            crate::calibration::push_full_bgra(&full, fw, fh);
                        }
                    }
                    if let Some((cropped, w, h)) = crop_bgra(&full, fw, fh, &state.region) {
                        process_frame(&mut state, cropped, w, h, &session, None);
                    }
                }
            } else {
                let r = state.region;
                let (sw, sh) = (dxgi.width(), dxgi.height());
                let cropped_frame = if rect_is_on_screen(r.x, r.y, r.side, r.side, sw, sh) {
                    let request =
                        CaptureRoi::new(CaptureRoiKind::Minimap, r.x, r.y, r.side, r.side);
                    dxgi.acquire_regions(session.session_epoch, &[request])
                        .and_then(|bundle| {
                            let metadata = bundle.metadata;
                            let region = bundle.into_region(CaptureRoiKind::Minimap)?;
                            Some((
                                region.bgra,
                                region.rect.width as usize,
                                region.rect.height as usize,
                                Some(metadata),
                            ))
                        })
                } else {
                    // Defensive fallback (should not happen in practice —
                    // `MinimapRegion` is always constructed to fit on screen —
                    // but a user-calibrated region could in principle be bad).
                    // Unlike a plain capture timeout/access-lost (which affects
                    // `acquire_frame` and `acquire_rect` identically, so needs
                    // no fallback), a geometrically off-screen rect is a case
                    // `acquire_rect` can never satisfy while `acquire_frame` +
                    // crop still could — so fall back rather than silently
                    // starving the pipeline every tick.
                    if !warned_rect_geometry {
                        warned_rect_geometry = true;
                        crate::log::error(&format!(
                            "[capture] minimap region {r:?} is off-screen for {sw}x{sh} — \
                             acquire_rect can't serve it; falling back to full-frame \
                             acquire+crop for this and future ticks"
                        ));
                    }
                    dxgi.acquire_frame()
                        .and_then(|(full, fw, fh)| crop_bgra(&full, fw, fh, &r))
                        .map(|(bytes, w, h)| (bytes, w, h, None))
                };
                if let Some((cropped, w, h, frame_metadata)) = cropped_frame {
                    if !crate::minimap_preview::matches_output(
                        geometry,
                        dxgi.display_id(),
                        dxgi.desktop_origin(),
                        (dxgi.width(), dxgi.height()),
                    ) || frame_metadata.is_some_and(|m| {
                        m.display_id != geometry.display_id
                            || m.screen_width != geometry.screen_w
                            || m.screen_height != geometry.screen_h
                    }) {
                        state.suspend_observation();
                        state.scene_ok_ms = None;
                        continue;
                    }
                    process_frame(&mut state, cropped, w, h, &session, frame_metadata);
                }
            }

            // The next critical cycle is due now. Preserve this timestamp across
            // noncritical HUD/template work instead of hiding that work before T0.
            state.next_cycle_due = Instant::now();
            state.prepare_draft_templates();
            if state.last_hero_hud_emit.elapsed() >= Duration::from_millis(1000) {
                state.last_hero_hud_emit = Instant::now();
                let hud = HeroHudRegion::for_resolution(dxgi.width(), dxgi.height());
                let (x, y, width, height) = hud.bounding_rect();
                if rect_is_on_screen(x, y, width, height, dxgi.width(), dxgi.height()) {
                    let request = CaptureRoi::new(CaptureRoiKind::TopHeroBar, x, y, width, height);
                    if let Some(bundle) = dxgi.acquire_regions(session.session_epoch, &[request]) {
                        if !crate::minimap_preview::matches_output(
                            geometry,
                            dxgi.display_id(),
                            dxgi.desktop_origin(),
                            (dxgi.width(), dxgi.height()),
                        ) || bundle.metadata.display_id != geometry.display_id
                            || bundle.metadata.screen_width != geometry.screen_w
                            || bundle.metadata.screen_height != geometry.screen_h
                        {
                            state.suspend_observation();
                            state.scene_ok_ms = None;
                            continue;
                        }
                        if let Some(region) = bundle.into_region(CaptureRoiKind::TopHeroBar) {
                            if let Some(frame) = Frame::from_bgra(
                                region.rect.width as usize,
                                region.rect.height as usize,
                                region.bgra,
                            ) {
                                if crate::runtime::is_current_capture_session(session.session_epoch)
                                {
                                    let payload = hud.read(&frame, x, y);
                                    let usable = payload
                                        .radiant
                                        .iter()
                                        .chain(&payload.dire)
                                        .filter(|slot| {
                                            slot.cue != crate::cv::hero_hud::HeroHudCue::Unknown
                                        })
                                        .count();
                                    if usable >= 6 {
                                        state.scene_ok_ms =
                                            Some(state.start.elapsed().as_millis() as u64);
                                        let samples = HeroHudRegion::identity_boxes(
                                            dxgi.width(),
                                            dxgi.height(),
                                        )
                                        .iter()
                                        .map(|b| {
                                            crop_rect_frame(
                                                &frame,
                                                b.x - x,
                                                b.y - y,
                                                b.width,
                                                b.height,
                                            )
                                            .and_then(|crop| state.draft.recognize_hud(&crop))
                                            .map(|(name, _)| name)
                                        })
                                        .collect::<Vec<_>>();
                                        publish_roster_samples(&mut state, samples, &session);
                                    }
                                    let event =
                                        crate::runtime::MatchSessionEvent::new(payload, &session);
                                    let _ = state.app.emit("hero-hud", event);
                                }
                            }
                        }
                    }
                }
            }

            let backend = dxgi.backend();
            recovery = Duration::from_millis(super::schedule::recovery_ms(
                active_started.elapsed().as_millis() as u64,
            ));
            if backend != reported_backend {
                reported_backend = backend;
                publish_mode(&state.app, backend);
            }
            if state.last_frame_ok.elapsed() >= Duration::from_millis(CAPTURE_RECOVERY_MS) {
                return Err(format!(
                    "no minimap frame for {} ms during a live capture session",
                    state.last_frame_ok.elapsed().as_millis()
                ));
            }
        }
    }

    /// Geometry-only check mirroring `dxgi::clamp_rect`'s reject conditions
    /// (that fn is private to `dxgi.rs`, so this is a small, deliberately
    /// duplicated, pure predicate) — used only to tell apart the ONE case an
    /// `acquire_rect` can fail where `acquire_frame` would still have
    /// succeeded (the rect's origin/size doesn't fit the current screen at
    /// all) from an ordinary "no new frame this tick" (capture timeout /
    /// access-lost), which both accessors are equally subject to since they
    /// share the same underlying `AcquireNextFrame` call — that case needs no
    /// fallback and must stay silent, exactly like `acquire_frame` did before
    /// this refactor.
    fn rect_is_on_screen(x: u32, y: u32, w: u32, h: u32, screen_w: u32, screen_h: u32) -> bool {
        w > 0 && h > 0 && x < screen_w && y < screen_h
    }

    /// Smallest rect that bounds every Draft-CV portrait box, so the loop can
    /// `acquire_rect` just that strip instead of the full desktop.
    /// `DraftRegion::for_resolution` always produces boxes that fit on screen
    /// (see its calibration tests), so the bounding
    /// strip is guaranteed on-screen too — no geometry fallback needed here.
    fn draft_bounding_rect(boxes: &[PortraitBox]) -> (u32, u32, u32, u32) {
        let min_x = boxes.iter().map(|b| b.x).min().unwrap_or(0);
        let min_y = boxes.iter().map(|b| b.y).min().unwrap_or(0);
        let max_x = boxes
            .iter()
            .map(|b| b.x.saturating_add(b.width))
            .max()
            .unwrap_or(0);
        let max_y = boxes
            .iter()
            .map(|b| b.y.saturating_add(b.height))
            .max()
            .unwrap_or(0);
        (
            min_x,
            min_y,
            max_x.saturating_sub(min_x),
            max_y.saturating_sub(min_y),
        )
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
        crop_rect(full, fw, fh, x, y, side, side)
    }

    fn crop_rect(
        full: &[u8],
        fw: u32,
        fh: u32,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    ) -> Option<(Vec<u8>, usize, usize)> {
        let end_x = x.checked_add(width)?.min(fw);
        let end_y = y.checked_add(height)?.min(fh);
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

    /// Draft-CV: crop the 10 pick-screen portrait boxes out of `strip` — a
    /// pre-acquired subrect (`sw`×`sh`) that bounds all 10 boxes, acquired at
    /// `(strip_x, strip_y)` in screen space (see `draft_bounding_rect`) —
    /// recognize each, and emit slot-preserving progress as picks become
    /// readable. Partial identities stay slot-preserving and unknown slots
    /// cannot admit minimap labels.
    fn crop_rect_frame(frame: &Frame, x: u32, y: u32, w: u32, h: u32) -> Option<Frame> {
        if x as usize + w as usize > frame.width || y as usize + h as usize > frame.height {
            return None;
        }
        let mut bytes = Vec::with_capacity((w * h * 4) as usize);
        for yy in y..y + h {
            for xx in x..x + w {
                let [red, green, blue] = frame.at(xx as usize, yy as usize);
                bytes.extend_from_slice(&[
                    (blue * 255.0) as u8,
                    (green * 255.0) as u8,
                    (red * 255.0) as u8,
                    255,
                ]);
            }
        }
        Frame::from_bgra(w as usize, h as usize, bytes)
    }

    fn publish_roster_samples(
        state: &mut CaptureState,
        samples: Vec<Option<String>>,
        session: &crate::runtime::MatchSessionSnapshot,
    ) {
        if state.roster_vote_epoch != session.session_epoch {
            state.roster_votes = crate::cv::roster::RosterVotes::default();
            state.roster_vote_epoch = session.session_epoch;
            state.last_draft_progress = None;
        }
        let slots = state
            .roster_votes
            .observe(&samples, state.start.elapsed().as_millis() as u64);
        let progress = crate::runtime::DraftRosterProgress {
            radiant: slots[..5].to_vec(),
            dire: slots[5..].to_vec(),
            complete: slots.iter().all(Option::is_some),
            recognizer_active: state.draft.is_active(),
            templates_loading: state.draft_templates_loading(),
        };
        if state.last_draft_progress.as_ref() == Some(&progress) {
            return;
        }
        if !crate::runtime::set_roster_for_capture_session(
            session.session_epoch,
            progress
                .radiant
                .iter()
                .map(|name| name.clone().unwrap_or_default())
                .collect(),
            progress
                .dire
                .iter()
                .map(|name| name.clone().unwrap_or_default())
                .collect(),
        ) {
            return;
        }
        state.last_draft_progress_epoch = Some(session.session_epoch);
        state.last_draft_progress = Some(progress.clone());
        crate::log::note_event_for_session(
            session.session_epoch,
            serde_json::json!({
                "type": "roster_confirmed", "source": "portrait_temporal",
                "slots": slots.iter().enumerate().map(|(slot, name)| serde_json::json!({
                    "slot": slot, "team": if slot < 5 { "radiant" } else { "dire" },
                    "hero": name, "hero_id": name.as_deref().and_then(crate::cv::identity::HeroId::from_label),
                })).collect::<Vec<_>>(),
            }),
        );
        let allowed = crate::runtime::enemy_roster_labels();
        state.sentry.retain_allowed(&allowed);
        state.motion.retain_allowed(&allowed);
        state.signal.suspend();
        let _ = state.app.emit(
            "draft-roster",
            crate::runtime::MatchSessionEvent::new(progress, session),
        );
    }

    fn process_draft_frame(
        state: &mut CaptureState,
        strip: &[u8],
        sw: u32,
        sh: u32,
        strip_x: u32,
        strip_y: u32,
        session: &crate::runtime::MatchSessionSnapshot,
    ) {
        state.sync_match_epoch();
        if !crate::runtime::is_current_draft_session(session.session_epoch) {
            return;
        }

        let samples = state
            .draft_region
            .boxes
            .iter()
            .map(|b| {
                crop_rect(
                    strip,
                    sw,
                    sh,
                    b.x.saturating_sub(strip_x),
                    b.y.saturating_sub(strip_y),
                    b.width,
                    b.height,
                )
                .and_then(|(bytes, w, h)| Frame::from_bgra(w, h, bytes))
                .and_then(|frame| state.draft.recognize(&frame))
                .map(|(name, _)| name)
            })
            .collect();
        publish_roster_samples(state, samples, session);
    }

    /// Run the full CV → game-knowledge pipeline on one already-cropped minimap
    /// frame (`cropped`, sized `w`×`h`) — a pre-cropped rect-local BGRA8 buffer.
    /// The caller does the acquisition/crop: a GPU subrect `acquire_rect` of just
    /// the minimap square on the normal path, or a software crop of a full-desktop
    /// `acquire_frame` in calibration/QA mode (which separately feeds
    /// `calibration::push_full_bgra` from the full buffer it already has).
    /// Downstream logic is otherwise identical to the old WGC `on_frame_arrived`.
    fn process_frame(
        state: &mut CaptureState,
        cropped: Vec<u8>,
        w: usize,
        h: usize,
        session: &crate::runtime::MatchSessionSnapshot,
        frame_metadata: Option<FrameCaptureMetadata>,
    ) {
        state.sync_match_epoch();
        if !crate::runtime::is_current_capture_session(session.session_epoch) {
            return;
        }
        let work_start = Instant::now();
        if !super::schedule::admits_critical(
            state.cycle_started.elapsed().as_millis() as u64,
            crate::governor::cpu_throttle(),
            true,
        ) {
            state.suspend_observation();
            state.missing_snapshot(
                session,
                &[],
                crate::runtime::enemy_roster_labels().len(),
                false,
                "capture_deadline_or_resource_pressure",
            );
            return;
        }
        // Identical desktop crops are not new observations and cannot accumulate confirmation.
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        cropped.hash(&mut hasher);
        let fingerprint = hasher.finish();
        if !state.frames.admit(
            state.cycle_started.elapsed().as_millis() as u64,
            crate::governor::cpu_throttle(),
            Some(fingerprint),
        ) {
            return;
        }
        // A frame reached the pipeline — this is the only thing that resets the
        // staleness clock `sensor-health` reports.
        state.last_frame_ok = work_start;

        let r = state.region;
        let now_ms = state.start.elapsed().as_millis() as u64;
        let suspicious = !state.sentry.missing(now_ms).is_empty();

        if let Some(f) = Frame::from_bgra(w, h, cropped) {
            let candidates = prefilter_candidates(
                &f,
                state.icon,
                DEFAULT_THRESHOLD_FRAC,
                crate::runtime::enemy_team_ring(),
            );
            let inference_started = Instant::now();
            let mut detections = state.detector.detect(&f, &candidates, state.icon);
            let (hits, misses) = state.detector.last_inference_work();
            state.inference_frames += 1;
            state.inference_hits += hits as u64;
            state.inference_misses += misses as u64;
            state.inference_ms += inference_started.elapsed().as_millis();
            if state.last_inference_log.elapsed() >= Duration::from_secs(5) {
                eprintln!("[G-CV] interval_ms={} frames={} exact_patch_hits={} inference_calls={} classifier_ms={}",
                    state.last_inference_log.elapsed().as_millis(), state.inference_frames,
                    state.inference_hits, state.inference_misses, state.inference_ms);
                state.last_inference_log = Instant::now();
                state.inference_frames = 0;
                state.inference_hits = 0;
                state.inference_misses = 0;
                state.inference_ms = 0;
            }

            if !super::schedule::admits_critical(
                state.cycle_started.elapsed().as_millis() as u64,
                crate::governor::cpu_throttle(),
                true,
            ) {
                state.suspend_observation();
                state.missing_snapshot(
                    session,
                    &[],
                    crate::runtime::enemy_roster_labels().len(),
                    false,
                    "capture_deadline_or_resource_pressure",
                );
                return;
            }
            let allowed = crate::runtime::enemy_roster_labels();
            detections.retain(|d| allowed.contains(&d.name));
            state.sentry.retain_allowed(&allowed);
            state.motion.retain_allowed(&allowed);
            let context_ok = crate::runtime::warning_context_is_ready(session.session_epoch);
            let scene_ok = state
                .scene_ok_ms
                .is_some_and(|last| now_ms.saturating_sub(last) <= 2500);
            let frame_gap = state
                .warning_frame_ms
                .is_some_and(|last| now_ms.saturating_sub(last) > 1500);
            if frame_gap || !context_ok || !scene_ok || allowed.is_empty() {
                state.suspend_observation();
            }
            let tracking = context_ok && scene_ok && !allowed.is_empty();
            if tracking {
                state.warning_frame_ms = Some(now_ms);
                state.observation_since_ms.get_or_insert(now_ms);
            } else {
                detections.clear();
            }
            // The same hero is one observation per frame, including for motion/advice.
            detections.sort_by(|a, b| b.score.total_cmp(&a.score));
            let mut seen = std::collections::HashSet::new();
            detections.retain(|d| seen.insert(d.name.clone()));

            // Record identified enemies so G-Master's counter advice is grounded
            // on who's actually in the match (runtime is the single source of
            // truth; cleared at match start). Best-effort, dedup handled inside.
            for d in &detections {
                if !crate::runtime::add_known_enemy_for_session(session.session_epoch, &d.name) {
                    return;
                }
            }

            // G-Sentry: flag enemies missing >5s (edge-triggered).
            for em in state.sentry.update(&detections, &r, now_ms) {
                if !crate::runtime::is_current_capture_session(session.session_epoch) {
                    return;
                }
                crate::log::note_event_for_session(
                    session.session_epoch,
                    crate::log::enemy_missing_record(&em.hero, em.missing_for_ms, em.last_pos),
                );
                if crate::calibration::is_enabled()
                    && crate::runtime::is_current_capture_session(session.session_epoch)
                {
                    crate::calibration::screenshot(
                        "enemy-missing",
                        serde_json::json!({
                            "hero": em.hero, "missing_for_ms": em.missing_for_ms,
                        }),
                    );
                }
                if crate::runtime::is_current_capture_session(session.session_epoch) {
                    let event = crate::runtime::MatchSessionEvent::new(&em, session);
                    let _ = state.app.emit("enemy-missing", event);
                }
            }

            state.signal.observe_visible(&state.sentry.visible(now_ms));

            // G-Motion: history + gank-risk over currently-missing enemies.
            state.motion.record(&detections, &r, now_ms);
            // A score-based death count is only authoritative while the last
            // validated GSI source remains fresh. On feed loss, keep the CV-only
            // path running but stop using an old own-team score to discount
            // missing enemies; unknown deaths stay in the risk set.
            let dead_enemies = crate::runtime::fresh_dead_enemy_count(
                crate::runtime::gsi_is_fresh(),
                crate::runtime::dead_enemy_count(),
            );
            state.motion.set_dead_enemies(dead_enemies);
            let missing = state.sentry.missing(now_ms);
            let rotating = state.motion.coordinated_rotation_heroes(&missing, now_ms);
            let rotation_missing: Vec<_> = missing
                .iter()
                .filter(|(hero, _, _)| rotating.contains(hero))
                .cloned()
                .collect();
            let risk = state.motion.assess(&rotation_missing, now_ms);
            let missing_names: Vec<_> = missing.iter().map(|(name, _, _)| name.clone()).collect();
            let baseline = state
                .observation_since_ms
                .is_some_and(|since| now_ms.saturating_sub(since) >= 5000);
            let eligible = tracking && baseline && allowed.len() == 5;
            let corroborated = !rotating.is_empty();
            state
                .signal
                .set_sensitivity(crate::runtime::signal_sensitivity());
            let reason = if !crate::runtime::signal_enabled() {
                "disabled"
            } else if !context_ok {
                "phase_alive_or_clock"
            } else if !scene_ok {
                "capture_unknown"
            } else if allowed.len() != 5 {
                "roster_incomplete"
            } else if !baseline {
                "observation_warmup"
            } else if !corroborated {
                "missing_without_rotation"
            } else {
                state.signal.suppression_reason(&risk, now_ms)
            };
            state.missing_snapshot(session, &missing, allowed.len(), eligible, reason);

            // Offline re-fit input (audit item: G-Motion/G-Signal thresholds are
            // unmeasured magic numbers because the model's own inputs were never
            // recorded — only its edge-triggered decisions). Sampled ≈1 Hz and
            // only while there's something to see, so a 40-min match stays well
            // under this module's 2MB promise (see `log::should_record_risk_trace`
            // doc comment for the size math). Unconditional on G-Signal being
            // enabled — this is a measurement tap, not a user-facing alert.
            if crate::log::should_record_risk_trace(
                state.last_risk_trace.elapsed().as_millis() as u64,
                RISK_TRACE_INTERVAL_MS,
                missing.is_empty(),
                risk.probability,
            ) {
                state.last_risk_trace = Instant::now();
                crate::log::note_event_for_session(
                    session.session_epoch,
                    crate::log::risk_trace_record(risk.probability, &missing),
                );
            }

            // G-Signal: edge-triggered warning + Belief Revision, voiced now (only
            // when the user has G-Signal enabled).
            {
                let eligible = eligible && crate::runtime::signal_enabled();
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
                match state
                    .signal
                    .evaluate(&risk, &missing_names, now_ms, eligible)
                {
                    SignalEvent::Alert(alert) => {
                        if armed {
                            if !crate::runtime::is_current_capture_session(session.session_epoch) {
                                return;
                            }
                            if !super::schedule::admits_critical(
                                state.cycle_started.elapsed().as_millis() as u64,
                                crate::governor::cpu_throttle(),
                                true,
                            ) {
                                state.suspend_observation();
                                state.missing_snapshot(
                                    session,
                                    &[],
                                    allowed.len(),
                                    false,
                                    "capture_deadline_or_resource_pressure",
                                );
                                return;
                            }
                            if !crate::tts::try_voice_interrupt_cached_before(
                                "gank",
                                state.cycle_started + Duration::from_millis(250),
                            ) {
                                state.suspend_observation();
                                state.missing_snapshot(
                                    session,
                                    &[],
                                    allowed.len(),
                                    false,
                                    "critical_audio_unready",
                                );
                                return;
                            }
                            // CR-011 §B utterance ledger — after the voice
                            // dispatch above, never before, so it can't add
                            // latency to the G-Signal path (CLAUDE.md ≤300ms).
                            crate::utterance::emit_for_session(
                                &state.app,
                                crate::utterance::UtterancePayload::new_for_session(
                                    "signal", "line", GANK_LINE, None, None, session,
                                ),
                            );
                        }
                        // W2: only capture calibration evidence when the line
                        // was actually voiced — in the silent arm GANK_LINE is
                        // suppressed, so recording it would falsely log it as
                        // spoken. The gank_signal log below stays unconditional.
                        if armed
                            && crate::calibration::is_enabled()
                            && crate::runtime::is_current_capture_session(session.session_epoch)
                        {
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
                        crate::log::note_event_for_session(
                            session.session_epoch,
                            crate::log::gank_signal_record(
                                alert.probability,
                                &alert.missing_heroes,
                                alert.eta_ms,
                                armed,
                            ),
                        );
                        if armed
                            && crate::runtime::is_current_capture_session(session.session_epoch)
                        {
                            let event = crate::runtime::MatchSessionEvent::new(&alert, session);
                            let _ = state.app.emit("gank-alert", event);
                        }
                    }
                    SignalEvent::Revision => {
                        if armed {
                            if !crate::runtime::is_current_capture_session(session.session_epoch) {
                                return;
                            }
                            if !super::schedule::admits_critical(
                                state.cycle_started.elapsed().as_millis() as u64,
                                crate::governor::cpu_throttle(),
                                true,
                            ) {
                                state.suspend_observation();
                                state.missing_snapshot(
                                    session,
                                    &[],
                                    allowed.len(),
                                    false,
                                    "capture_deadline_or_resource_pressure",
                                );
                                return;
                            }
                            if !crate::tts::try_voice_interrupt_cached_before(
                                "revision",
                                state.cycle_started + Duration::from_millis(250),
                            ) {
                                state.suspend_observation();
                                state.missing_snapshot(
                                    session,
                                    &[],
                                    allowed.len(),
                                    false,
                                    "critical_audio_unready",
                                );
                                return;
                            }
                            // Belief Revision — retracted carries the earlier
                            // GANK_LINE warning being struck through.
                            crate::utterance::emit_for_session(
                                &state.app,
                                crate::utterance::UtterancePayload::new_for_session(
                                    "signal",
                                    "revision",
                                    REVISION_LINE,
                                    Some(GANK_LINE.to_string()),
                                    None,
                                    session,
                                ),
                            );
                        }
                        crate::log::note_event_for_session(
                            session.session_epoch,
                            crate::log::gank_revision_record(),
                        );
                        if armed
                            && crate::runtime::is_current_capture_session(session.session_epoch)
                        {
                            let _ = state.app.emit("gank-clear", session);
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
                    capture_frame_id: frame_metadata.map(|metadata| metadata.frame_id),
                    capture_acquired_at_ms: frame_metadata.map(|metadata| metadata.acquired_at_ms),
                    geometry_generation: state.preview_geometry_generation.to_string(),
                    display_index: state.preview_display_index,
                    display_fingerprint: state.preview_display_id.to_string(),
                    desktop_origin: state.preview_desktop_origin,
                };
                if crate::runtime::is_current_capture_session(session.session_epoch) {
                    let event = crate::runtime::MatchSessionEvent::new(payload, session);
                    let _ = state.app.emit("minimap-cv", event);
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

    // Review fix: `voice_interrupt` used to be defined here (and identically
    // in capture_wgc.rs) — hoisted into `tts::voice_interrupt` since the two
    // copies were byte-for-byte the same; call sites above now call that.

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
        #[test]
        fn missing_state_schema_has_confirmed_presence_and_clears_unready() {
            let missing = vec![("axe".to_string(), 6000, (0.2, 0.4))];
            let live = super::missing_state_payload(
                &missing,
                vec!["nevermore".into()],
                5,
                true,
                "ready",
                0,
            );
            assert_eq!(live["visible_heroes"], serde_json::json!(["nevermore"]));
            assert_eq!(live["heroes"], serde_json::json!(["axe"]));
            let suspended = super::missing_state_payload(
                &missing,
                vec!["nevermore".into()],
                5,
                false,
                "resource_pressure",
                500,
            );
            assert_eq!(suspended["visible_heroes"], serde_json::json!([]));
            assert_eq!(suspended["heroes"], serde_json::json!([]));
            assert_eq!(suspended["observations"], serde_json::json!([]));
            assert_eq!(suspended["roster_known"], 5);
        }

        use crate::audio::{priority_for_event, should_accept_incoming, Priority};
        use crate::motion::GankRisk;
        use std::path::Path;

        #[test]
        fn retry_requests_coalesce_without_spawning_another_worker() {
            let (sender, receiver) = mpsc::sync_channel(1);
            assert!(queue_retry(&sender).is_ok());
            assert!(queue_retry(&sender).is_ok());
            assert!(receiver.try_recv().is_ok());
            assert!(receiver.try_recv().is_err());
        }

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
                let _ = signal.evaluate(&risk, &risk.missing_heroes, now_ms, true);
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
                let event = signal.evaluate(&risk, &risk.missing_heroes, 0, true);
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
