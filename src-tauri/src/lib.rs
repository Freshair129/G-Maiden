// G-Maiden Rust core library — hosts every module plus the Tauri app setup.
// `main.rs` is a thin bin shim that just calls `run()` (canonical Tauri v2
// lib+bin split, so external tools like `tests/perf` can link the real
// modules instead of re-implementing the critical-path chain).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_updater::UpdaterExt;

pub mod action_damage;
pub mod announcer;
pub mod audio;
mod audio_waveform;
mod calibration;
pub mod capture;
pub mod capture_frame;
#[cfg(not(feature = "wgc"))]
mod capture_recovery;
#[cfg(feature = "wgc")]
mod capture_wgc;
mod counter_advice;
pub mod cv;
pub mod damage;
#[cfg(not(feature = "wgc"))]
pub mod dxgi;
mod event_media;
mod governor;
pub mod gsi;
mod identity;
mod items;
mod local_endpoint;
mod local_player;
mod log;
mod master;
pub mod memory;
mod minimap_admission;
mod minimap_clock;
mod minimap_owned_child;
pub mod minimap_preview;
mod minimap_preview_process;
mod minimap_preview_runtime;
mod minimap_preview_wire;
pub mod motion;
mod ocr;
pub mod package_registry;
pub mod package_install;
mod package_ipc;
mod party;
pub mod respawn;
mod revive;
pub mod runtime;
mod safety_events;
mod secret;
pub mod sentry;
mod setup;
pub mod signal;
mod slm;
pub mod tts;
pub mod tuning;
pub mod update_channel;
mod update_guard;
#[cfg(test)]
#[path = "../vendor/tauri-plugin-updater/src/install_guard.rs"]
mod updater_install_guard_regression;
mod usage;
mod utterance;
mod voice_api;
mod vrzo_fence;
mod vrzo_mix;
mod vrzo_playback;
mod webview_bootstrap;

/// The update found by the last `check_channel_update`, held so `install_pending_update`
/// installs exactly what the user was shown rather than re-resolving and racing a
/// manifest edit.
#[derive(Default)]
struct PendingUpdate(std::sync::Mutex<Option<tauri_plugin_updater::Update>>);
static UPDATE_INSTALLING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn update_safety() -> update_guard::UpdateSafety {
    let session = runtime::match_session_snapshot();
    update_guard::UpdateSafety {
        dota_running: setup::dota_running_status(),
        session_active: matches!(
            session.session_lifecycle,
            Some(
                runtime::MatchLifecycle::Draft
                    | runtime::MatchLifecycle::Live
                    | runtime::MatchLifecycle::Disconnected
            )
        ),
        in_game: runtime::in_game(),
    }
}

#[derive(serde::Serialize)]
struct UpdateOffer {
    version: String,
    notes: String,
    channel: String,
}

/// Check the channel's manifest for an update.
///
/// The endpoint is built **in Rust from the hardcoded stable URL**
/// (`update_channel::ReleaseChannel::manifest_url`) and no `target` is passed to the
/// updater. That is deliberate and load-bearing: `tauri-plugin-updater` uses one
/// `target` string BOTH to fill `{{target}}` in the endpoint template AND as the key it
/// looks up in the manifest's `platforms{}`. Overloading it to carry the channel is what
/// broke both previous callers — bare `check()` asked for a `windows.json` that does not
/// exist, and `check({target:'dev'})` fetched the right file then looked for a
/// `platforms['dev']` that manifests generated from Tauri's own `latest.json` never
/// carry. With the URL supplied here and no target, the plugin falls back through
/// `{os}-{arch}-{installer}` then `{os}-{arch}`, which is what the manifests actually
/// contain — and it keeps MSI and NSIS installers resolving to their own artifact.
///
/// The webview supplies neither a URL nor a channel, so a compromised or buggy
/// renderer cannot select an attacker's or restricted manifest. Signature
/// verification is untouched: the plugin still checks minisign against the pubkey
/// embedded in the app before anything is installed.
#[tauri::command]
async fn check_channel_update(app: tauri::AppHandle) -> Result<Option<UpdateOffer>, String> {
    // Desktop clients check only the signed stable manifest.
    let channel = update_channel::ReleaseChannel::Stable;

    let url: tauri::Url = channel
        .manifest_url()
        .parse()
        .map_err(|_| "invalid channel manifest url".to_string())?;

    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| format!("updater endpoint rejected: {e}"))?
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("updater unavailable: {e}"))?;

    let found = updater
        .check()
        .await
        .map_err(|e| format!("update check failed: {e}"))?;

    let offer = found.as_ref().map(|u| UpdateOffer {
        version: u.version.clone(),
        notes: u.body.clone().unwrap_or_default(),
        channel: channel.as_str().to_string(),
    });
    *app.state::<PendingUpdate>().0.lock().unwrap() = found;
    Ok(offer)
}

/// Download and install the update from the last successful check.
#[tauri::command]
async fn install_pending_update(app: tauri::AppHandle) -> Result<(), String> {
    let _lease = update_guard::InstallLease::acquire(&UPDATE_INSTALLING)?;
    update_guard::ensure_idle(update_safety())?;
    // Clone out of the mutex before awaiting — holding the guard across an await
    // would make this future non-Send and can deadlock a second caller.
    let update = app.state::<PendingUpdate>().0.lock().unwrap().clone();
    let update = update.ok_or_else(|| "no update pending".to_string())?;
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        update_guard::commit_if_idle(update_safety, || {
            update.install_guarded(bytes, || {
                update_guard::ensure_idle(update_safety())
                    .map_err(|error| std::io::Error::other(error).into())
            })
        })?
        .map_err(|e| format!("install failed: {e}"))
    })
    .await
    .map_err(|e| format!("install task failed: {e}"))??;
    Ok(())
}

/// Show/hide the OSD overlay window (called by the control GUI toggle).
#[tauri::command]
fn set_overlay_visible(app: tauri::AppHandle, visible: bool) {
    update_overlay_visibility(&app, Some(visible));
}

struct OverlayBootstrap {
    started: std::time::Instant,
    state: std::sync::Mutex<webview_bootstrap::Bootstrap>,
}

impl OverlayBootstrap {
    fn new(root: webview_bootstrap::SelectedRoot) -> Self {
        Self {
            started: std::time::Instant::now(),
            state: std::sync::Mutex::new(webview_bootstrap::Bootstrap::new(root)),
        }
    }
}

impl OverlayBootstrap {
    fn elapsed(&self) -> u64 {
        self.started.elapsed().as_millis().min(u64::MAX as u128) as u64
    }
}

fn bootstrap_failed(app: &tauri::AppHandle, reason: &'static str) {
    if let Some(bootstrap) = app.try_state::<OverlayBootstrap>() {
        if let Ok(mut state) = bootstrap.state.lock() {
            state.fail();
        }
    }
    log::error(&format!(
        "[G-WebViewBootstrap] status=failed reason={reason}"
    ));
}

fn dispatch_overlay_visibility(
    app: &tauri::AppHandle,
) -> Result<std::sync::mpsc::Receiver<Result<(), String>>, String> {
    let (completed, completion) = std::sync::mpsc::channel();
    let read_app = app.clone();
    let apply_app = app.clone();
    webview_bootstrap::dispatch_visibility(
        |action| app.run_on_main_thread(action),
        move || {
            let bootstrap = read_app.try_state::<OverlayBootstrap>()?;
            let mut state = bootstrap.state.lock().ok()?;
            state.expire(bootstrap.elapsed());
            (state.phase == webview_bootstrap::Phase::Ready).then_some(state.visible)
        },
        move |visible| {
            let result = (|| {
                let visible = visible.ok_or("overlay bootstrap unavailable")?;
                let window = apply_app
                    .get_webview_window("overlay")
                    .ok_or("overlay window unavailable")?;
                if visible {
                    window.show()
                } else {
                    window.hide()
                }
                .map_err(|_| "overlay visibility unavailable".to_string())
            })();
            let _ = completed.send(result);
        },
    )
    .map_err(|_| "overlay visibility dispatch unavailable")?;
    Ok(completion)
}

fn update_overlay_visibility(app: &tauri::AppHandle, intent: Option<bool>) {
    let Some(bootstrap) = app.try_state::<OverlayBootstrap>() else {
        return;
    };
    let ready = bootstrap.state.lock().ok().is_some_and(|mut state| {
        state.expire(bootstrap.elapsed());
        let visible = intent.unwrap_or(!state.visible);
        state.visibility(visible).is_some()
    });
    if ready {
        let _ = dispatch_overlay_visibility(app);
    }
}

#[tauri::command]
async fn overlay_bootstrap_ready(window: tauri::WebviewWindow) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = window.url().map_err(|_| "overlay URL unavailable")?;
        let bootstrap = window.state::<OverlayBootstrap>();
        let root = bootstrap
            .state
            .lock()
            .map_err(|_| "overlay bootstrap unavailable")?
            .root();
        if window.label() != "overlay" || !root.trusts(url.as_str()) {
            return Err("untrusted overlay readiness".to_string());
        }
        let first = loop {
            let pending = {
                let mut state = bootstrap
                    .state
                    .lock()
                    .map_err(|_| "overlay bootstrap unavailable")?;
                state.expire(bootstrap.elapsed());
                if state.phase == webview_bootstrap::Phase::Failed {
                    return Err("overlay bootstrap unavailable".to_string());
                }
                state
                    .ready(window.label(), url.as_str(), bootstrap.elapsed())
                    .ok()
            };
            if let Some(first) = pending {
                break first;
            }
            // React can finish hydration before PageLoad Finished. Wait off the
            // event-loop thread so that native page callback can complete setup.
            std::thread::sleep(std::time::Duration::from_millis(10));
        };
        if first {
            let final_url = window.url().map_err(|_| "overlay URL unavailable")?;
            if !root.trusts(final_url.as_str()) {
                bootstrap_failed(window.app_handle(), "overlay-ready-url");
                return Err("untrusted overlay readiness".to_string());
            }
            let completion = dispatch_overlay_visibility(window.app_handle())?;
            let remaining = std::time::Duration::from_millis(
                webview_bootstrap::DEADLINE_MS.saturating_sub(bootstrap.elapsed()),
            );
            match completion.recv_timeout(remaining) {
                Ok(Ok(())) => {}
                _ => {
                    bootstrap_failed(window.app_handle(), "overlay-visibility");
                    return Err("overlay visibility unavailable".to_string());
                }
            }
            eprintln!("[G-WebViewBootstrap] window=overlay status=ready trusted_final_url=true");
        }
        Ok(())
    })
    .await
    .map_err(|_| "overlay bootstrap task unavailable".to_string())?
}

#[tauri::command]
fn get_capture_mode() -> String {
    capture::current_mode().to_string()
}

#[tauri::command]
fn retry_capture(app: tauri::AppHandle) -> Result<(), String> {
    capture::retry(app)
}

/// Speak `text` via Maiden's voice (Windows SAPI for now). Fire-and-forget.
#[tauri::command]
fn speak(text: String, voice: Option<String>, rate: Option<i32>) {
    tts::speak(&text, voice.as_deref(), rate);
}

/// Stop the current TTS playback (used by Belief Revision to retract mid-stream).
/// Cancels both pre-recorded clip and SAPI synth so neither leaks past the cut.
#[tauri::command]
fn cancel_speech() {
    audio::cancel();
    tts::cancel();
}

#[tauri::command]
fn quit_application(app: tauri::AppHandle) {
    app.exit(0);
}

/// Event previews use the equipped GANN pair and its native media lifecycle.
#[tauri::command]
async fn speak_event(app: tauri::AppHandle, event: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        voice_api::play_event(app, event, 0, true, audio::Priority::Normal)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn speak_advice(
    app: tauri::AppHandle,
    text: String,
    voice: Option<String>,
    rate: Option<i32>,
    advice_generation: u64,
    advice_session_epoch: u64,
) -> Result<(), String> {
    let session = runtime::match_session_snapshot();
    if session.session_epoch != advice_session_epoch {
        return Err("Advice session changed".into());
    }
    tts::speak_advice_guarded(
        &text,
        voice.as_deref(),
        rate,
        advice_generation,
        advice_session_epoch,
    )?;
    utterance::emit_for_session(
        &app,
        utterance::UtterancePayload::new_for_session("master", "line", text, None, None, &session),
    );
    Ok(())
}

#[tauri::command]
fn is_advice_generation_current(advice_generation: u64) -> bool {
    runtime::with_master_generation_admission(advice_generation, false, || Ok(())).is_ok()
}

#[tauri::command]
fn get_master_context_generation() -> u64 {
    runtime::master_cloud_context_generation()
}

#[tauri::command]
fn preview_static_advice_voice(
    voice: Option<String>,
    rate: Option<i32>,
    advice_generation: u64,
) -> Result<(), String> {
    tts::speak_static_advice_preview(voice.as_deref(), rate, advice_generation)
}

fn emit_master_context(app: &tauri::AppHandle) {
    let _ = app.emit(
        "master-context-changed",
        serde_json::json!({ "context_generation": runtime::master_cloud_context_generation() }),
    );
}

fn configure_webview_memory(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
    };
    use webview2_core::Interface;
    let label = window.label().to_string();
    let _ = window.with_webview(move |webview| {
        let result = unsafe {
            webview.controller().CoreWebView2().and_then(|view| {
                let mut browser_pid = 0;
                if view.BrowserProcessId(&mut browser_pid).is_ok() {
                    eprintln!("[G-WebViewBootstrap] window={label} browser_pid={browser_pid}");
                }
                view.cast::<ICoreWebView2_19>()?
                    .SetMemoryUsageTargetLevel(COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW)
            })
        };
        match result {
            Ok(()) => eprintln!("[G-Gov] WebView {label}: low memory target applied"),
            Err(error) => {
                eprintln!("[G-Gov] WebView {label}: low memory target unavailable: {error}")
            }
        }
    });
}

fn configure_overlay_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|_| "overlay monitor unavailable")?
        .ok_or("overlay monitor unavailable")?;
    window
        .set_size(*monitor.size())
        .map_err(|_| "overlay size unavailable")?;
    window
        .set_position(tauri::PhysicalPosition::new(0, 0))
        .map_err(|_| "overlay position unavailable")?;
    window
        .set_ignore_cursor_events(true)
        .map_err(|_| "overlay pass-through unavailable")?;
    window
        .set_always_on_top(true)
        .map_err(|_| "overlay topmost unavailable")?;
    configure_webview_memory(window);
    Ok(())
}

fn create_control_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::webview::{NewWindowResponse, PageLoadEvent};
    let root = {
        let bootstrap = app.state::<OverlayBootstrap>();
        let root = bootstrap
            .state
            .lock()
            .map_err(|_| "overlay bootstrap unavailable")?
            .root();
        root
    };
    let popup_script = format!(
        "window.open({}, 'g-maiden-overlay');",
        serde_json::to_string(root.as_str())?
    );

    let mut control = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == "control")
        .ok_or("control window template missing")?
        .clone();
    let overlay = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == "overlay")
        .ok_or("overlay window template missing")?
        .clone();
    // App(index.html) follows Tauri's framework mode resolver. Admission still
    // accepts exactly the single root selected before either window is built.
    if control.use_https_scheme || overlay.use_https_scheme {
        return Err("related WebView experiment requires the packaged HTTP root".into());
    }
    control.url = tauri::WebviewUrl::App("index.html".into());
    let popup_app = app.clone();
    let control_window = tauri::WebviewWindowBuilder::from_config(app, &control)?
        .on_navigation(move |url| root.trusts(url.as_str()))
        .on_new_window(move |target, features| {
            let control_url = popup_app.get_webview_window("control").and_then(|window| window.url().ok());
            let admitted = {
                let bootstrap = popup_app.state::<OverlayBootstrap>();
                let Ok(mut state) = bootstrap.state.lock() else { return NewWindowResponse::Deny; };
                state.admit(control_url.as_ref().map_or("", |url| url.as_str()), target.as_str(), bootstrap.elapsed())
            };
            if !admitted { return NewWindowResponse::Deny; }

            // Building can pump native events. Never retain the state mutex across
            // native creation or the opener's deferred SetNewWindow callback.
            let mut config = overlay.clone();
            config.url = tauri::WebviewUrl::External("about:blank".parse().expect("constant blank URL"));
            config.visible = false;
            let built = tauri::WebviewWindowBuilder::from_config(&popup_app, &config)
                .map(|builder| builder.window_features(features)
                    .on_navigation(move |url| root.trusts(url.as_str()))
                    .on_new_window(|_, _| NewWindowResponse::Deny)
                    .on_page_load(move |window, payload| {
                        if payload.event() != PageLoadEvent::Finished || !root.trusts(payload.url().as_str()) { return; }
                        let final_trusted = window.url().is_ok_and(|url| root.trusts(url.as_str()));
                        if !final_trusted || configure_overlay_window(&window).is_err() {
                            bootstrap_failed(window.app_handle(), "overlay-configuration");
                            return;
                        }
                        let bootstrap = window.state::<OverlayBootstrap>();
                        if let Ok(mut state) = bootstrap.state.lock() {
                            if state.loaded(window.label(), payload.url().as_str(), bootstrap.elapsed()) {
                                eprintln!("[G-WebViewBootstrap] window=overlay status=loaded trusted_final_url=true");
                            }
                        };
                    }))
                .and_then(|builder| builder.build());
            match built {
                Ok(window) => {
                    let accepted = {
                        let bootstrap = popup_app.state::<OverlayBootstrap>();
                        let accepted = bootstrap.state.lock().map(|mut state| state.created(bootstrap.elapsed())).unwrap_or(false);
                        accepted
                    };
                    if accepted { NewWindowResponse::Create { window } }
                    else {
                        let _ = window.destroy();
                        bootstrap_failed(&popup_app, "late-overlay-creation");
                        NewWindowResponse::Deny
                    }
                }
                Err(_) => {
                    bootstrap_failed(&popup_app, "overlay-creation");
                    NewWindowResponse::Deny
                }
            }
        })
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished || !root.trusts(payload.url().as_str()) { return; }
            if !window.url().is_ok_and(|url| root.trusts(url.as_str())) {
                bootstrap_failed(window.app_handle(), "control-final-url");
                return;
            }
            configure_webview_memory(&window);
            let request = {
                let bootstrap = window.state::<OverlayBootstrap>();
                let request = bootstrap.state.lock().map(|mut state| state.request(payload.url().as_str(), bootstrap.elapsed())).unwrap_or(false);
                request
            };
            if request {
                eprintln!("[G-WebViewBootstrap] window=control status=loaded trusted_final_url=true");
                if window.eval(&popup_script).is_err() {
                    bootstrap_failed(window.app_handle(), "popup-request");
                }
            }
        })
        .build()?;
    let close_window = control_window.clone();
    control_window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = close_window.hide();
        }
    });

    let deadline_app = app.clone();
    std::thread::Builder::new()
        .name("g-webview-bootstrap".into())
        .spawn(move || {
            let bootstrap = deadline_app.state::<OverlayBootstrap>();
            std::thread::sleep(std::time::Duration::from_millis(
                webview_bootstrap::DEADLINE_MS.saturating_sub(bootstrap.elapsed()),
            ));
            let failed = bootstrap
                .state
                .lock()
                .map(|mut state| {
                    state.expire(bootstrap.elapsed());
                    state.phase == webview_bootstrap::Phase::Failed
                })
                .unwrap_or(true);
            if failed {
                bootstrap_failed(&deadline_app, "startup-deadline");
            }
        })?;
    Ok(())
}

/// Voice-cache status: directory + clip count per known event.
#[derive(serde::Serialize, Clone)]
struct VoiceCacheStatus {
    dir: String,
    counts: std::collections::BTreeMap<String, usize>,
    total: usize,
}

// The announcer event contract (mirrors G-Suite/schemas/gmaiden-events.json).
// danger/revision are the G-Signal lines; the rest are fired by `announcer`.
#[tauri::command]
fn voice_cache_status() -> VoiceCacheStatus {
    let dir = audio::voice_cache_dir().to_string_lossy().to_string();
    let mut counts = std::collections::BTreeMap::new();
    let mut total = 0;
    for e in voice_api::event_ids() {
        let c = audio::clip_count(e);
        total += c;
        counts.insert(e.to_string(), c);
    }
    VoiceCacheStatus { dir, counts, total }
}

/// List individual clip files for a specific event (for the Audio Settings UI).
#[tauri::command]
fn list_event_clips(event: String) -> Vec<EventClip> {
    audio::list_event_clips(&event)
        .into_iter()
        .map(|(name, path, source)| EventClip { name, path, source })
        .collect()
}

#[derive(serde::Serialize)]
struct EventClip {
    name: String,
    path: String,
    source: String,
}

/// Preview a clip only when it belongs to an installed Store pack or the bundled default.
#[tauri::command]
async fn preview_announcer_clip(
    app: tauri::AppHandle,
    event: String,
    path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected =
            voice_api::select_announcer_playback_path(&event, std::path::Path::new(&path))
                .ok_or("GANN clip is not mapped by the active package")?;
        voice_api::play_selected(app, selected, event, 0, true, audio::Priority::Normal)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_voice_cache_dir() -> Result<(), String> {
    voice_api::ensure_dev_authoring()?;
    let dir = audio::voice_cache_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("explorer")
        .arg(dir.as_os_str())
        .spawn();
    Ok(())
}

#[tauri::command]
fn voice_api_state() -> Result<voice_api::VoiceState, String> {
    voice_api::state()
}

#[tauri::command]
async fn voice_api_import_file(
    window: tauri::WebviewWindow,
    path: String,
) -> Result<voice_api::ImportResult, String> {
    if window.label() != "control" {
        return Err("Import is restricted to Control".into());
    }
    let app = window.app_handle();
    let bootstrap = app
        .try_state::<OverlayBootstrap>()
        .ok_or("Control bootstrap unavailable")?;
    let root = bootstrap
        .state
        .lock()
        .map_err(|_| "Control bootstrap unavailable")?
        .root();
    if !root.trusts(
        window
            .url()
            .map_err(|_| "Control URL unavailable")?
            .as_str(),
    ) {
        return Err("Untrusted import origin".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        voice_api::import_file(std::path::Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn voice_api_install_store_pack(
    item_id: String,
    access_token: String,
) -> Result<voice_api::VoiceState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        voice_api::install_store_pack(&item_id, &access_token)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn voice_api_action(
    action: String,
    pack_id: Option<String>,
) -> Result<voice_api::VoiceState, String> {
    static ACTIONS: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _order = ACTIONS.lock().await;
    tauri::async_runtime::spawn_blocking(move || voice_api::action(&action, pack_id.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// Preview an announcer event only for an installed Store pack or the bundled default.
static ANNOUNCER_PREVIEW_SERIAL: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

/// Local decoder evidence only; never game data or a network telemetry stream.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn record_announcer_visual(
    window: tauri::WebviewWindow,
    playback_id: String,
    reason: String,
    frames: u32,
    dropped: u32,
    first_frame_ms: f64,
    elapsed_ms: f64,
    media_seconds: f64,
    warmed: Option<bool>,
    duration_seconds: Option<f64>,
    waiting: Option<u32>,
) -> Result<(), String> {
    let bootstrap = window.state::<OverlayBootstrap>();
    let root = bootstrap
        .state
        .lock()
        .map_err(|_| "Overlay bootstrap unavailable")?
        .root();
    if window.label() != "overlay"
        || !root.trusts(
            window
                .url()
                .map_err(|_| "Overlay URL unavailable")?
                .as_str(),
        )
        || playback_id.parse::<u64>().is_err()
        || !matches!(reason.as_str(), "ended" | "cleared" | "error")
        || frames > 10_000
        || dropped > frames
        || !(-1.0..=30_000.0).contains(&first_frame_ms)
        || !(0.0..=60_000.0).contains(&elapsed_ms)
        || !(0.0..=30.0).contains(&media_seconds)
        || duration_seconds.is_some_and(|n| !(0.0..=30.0).contains(&n))
        || waiting.is_some_and(|n| n > 10_000)
    {
        return Err("Invalid visual receipt".into());
    }
    eprintln!("[G-BannerVisual] playback={playback_id} reason={reason} frames={frames} dropped={dropped} first_frame_ms={first_frame_ms:.1} elapsed_ms={elapsed_ms:.1} media_seconds={media_seconds:.3} warmed={} duration_seconds={:.3} waiting={}", warmed.unwrap_or(false), duration_seconds.unwrap_or(0.0), waiting.unwrap_or(0));
    Ok(())
}

fn trusted_announcer_surface(window: &tauri::WebviewWindow, label: &str) -> Result<(), String> {
    if window.label() != label {
        return Err("Restricted announcer surface".into());
    }
    let bootstrap = window.state::<OverlayBootstrap>();
    let root = bootstrap
        .state
        .lock()
        .map_err(|_| "Overlay bootstrap unavailable")?
        .root();
    if !root.trusts(
        window
            .url()
            .map_err(|_| "Surface URL unavailable")?
            .as_str(),
    ) {
        return Err("Untrusted announcer origin".into());
    }
    Ok(())
}

#[tauri::command]
fn announcer_visual_warm_candidates(
    window: tauri::WebviewWindow,
) -> Result<voice_api::visual_warm::Candidates, String> {
    trusted_announcer_surface(&window, "overlay")?;
    Ok(voice_api::visual_warm_candidates())
}

#[tauri::command]
async fn warm_announcer_visual_variant(
    window: tauri::WebviewWindow,
    pack_id: String,
    event: String,
    clip_id: String,
) -> Result<(), String> {
    trusted_announcer_surface(&window, "control")?;
    if pack_id.len() > 96 || event.len() > 64 || clip_id.len() > 96 {
        return Err("Invalid warm hint".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        voice_api::warm_announcer_variant(&pack_id, &event, &clip_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Audition the exact GANN variant through the same audio admission lifecycle.
#[tauri::command]
async fn preview_announcer_variant(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    event: String,
    clip_id: String,
    pack_id: String,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    if window.label() != "control" {
        return Err("Preview is restricted to Control".into());
    }
    let bootstrap = app
        .try_state::<OverlayBootstrap>()
        .ok_or("Control bootstrap unavailable")?;
    let root = bootstrap
        .state
        .lock()
        .map_err(|_| "Control bootstrap unavailable")?
        .root();
    if !root.trusts(
        window
            .url()
            .map_err(|_| "Control URL unavailable")?
            .as_str(),
    ) {
        return Err("Untrusted preview origin".into());
    }
    let id = ANNOUNCER_PREVIEW_SERIAL
        .fetch_add(1, Ordering::AcqRel)
        .wrapping_add(1);
    let requested = std::time::Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let pack = pack_id.as_str();
        let path = voice_api::preview_variant(pack, &event, &clip_id)
            .ok_or_else(|| "ไม่พบคลิป GANN ที่ติดตั้งสำหรับอีเวนต์นี้".to_string())?;
        audio::validate_clip(&path)?;
        let selected = voice_api::select_announcer_path(pack, &event, &path)
            .ok_or("กรุณาเลือก GANN เป็นแพ็กที่ใช้งานก่อน")?;
        voice_api::verify_visual(&selected)?;
        let scope_selected = selected.clone();
        let scope_event = event.clone();
        let scope = std::sync::Arc::new(move || {
            ANNOUNCER_PREVIEW_SERIAL.load(Ordering::Acquire) == id
                && voice_api::with_current_announcer_clip(&scope_event, &scope_selected, || ())
                    .is_some()
        });
        if !scope() {
            return Err("กรุณาเลือก GANN เป็นแพ็กที่ใช้งานก่อน".into());
        }
        let observer =
            vrzo_playback::observer(app, selected.clone(), event.clone(), 0, true, scope)
                .ok_or_else(|| "ตัวอย่างแบนเนอร์ไม่พร้อม".to_string())?;
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        audio::play_observed_with_lifecycle(
            path,
            audio::Priority::Normal,
            move |commit| {
                if ANNOUNCER_PREVIEW_SERIAL.load(Ordering::Acquire) == id
                    && requested.elapsed() < std::time::Duration::from_secs(2)
                {
                    let _ = voice_api::with_current_announcer_clip(&event, &selected, commit);
                }
            },
            move |outcome| {
                let _ = tx.try_send(outcome == audio::PlaybackResult::Admitted);
            },
            observer,
        );
        if rx
            .recv_timeout(std::time::Duration::from_secs(3))
            .unwrap_or(false)
        {
            Ok(())
        } else {
            Err("เสียงตัวอย่างยังไม่พร้อมหรือถูกเสียงสำคัญขัดจังหวะ".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn preview_announcer_event(
    app: tauri::AppHandle,
    pack_id: String,
    event: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = voice_api::select_announcer_clip(&event).ok_or("GANN event is unmapped")?;
        if !package_ipc::matches_preview_identity(&pack_id,&selected.pack_id,selected.installation.as_ref().map(|i|i.installation_id().0.as_str())) {
            return Err("เลือก Equip แพ็ก GANN ก่อนดูตัวอย่าง".into());
        }
        voice_api::play_selected(app, selected, event, 0, true, audio::Priority::Normal)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_audio_waveform(path: String) -> Result<audio_waveform::Waveform, String> {
    tauri::async_runtime::spawn_blocking(move || audio_waveform::read_audio_waveform(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Open an external http(s) URL in the default browser (e.g. the voice-pack
/// store — purchases happen on the web). `explorer` handles URLs and is a GUI
/// app, so no console flashes; scheme is validated to avoid arbitrary commands.
#[tauri::command]
fn open_url(url: String) {
    // `explorer <url>` mishandles URLs with query strings (e.g. OAuth `?a&b`) and
    // opens a folder instead of the browser. rundll32's FileProtocolHandler is the
    // canonical opener and passes the whole URL through untouched. CREATE_NO_WINDOW
    // keeps Dota from being kicked out of fullscreen (windows-spawn rule).
    if url.starts_with("https://") || url.starts_with("http://") {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
}

/// Ask Maiden (via Claude Plan quota) for advice on the current game state.
/// Runs on a blocking thread so the async runtime stays free.
/// Also broadcasts `advice-update` to the overlay window so it can show the
/// advice inline (G5.4) without the control panel being open.
#[tauri::command]
fn get_master_readiness() -> master::MasterReadiness {
    master::backend_readiness()
}

#[tauri::command]
async fn request_advice(
    app: tauri::AppHandle,
    tick: gsi::GameTick,
    session_epoch: u64,
) -> Result<master::Advice, String> {
    if !runtime::is_current_live_session(session_epoch) || !tick.in_game {
        return Err("Advice request does not belong to the active live match.".into());
    }
    let session = runtime::match_session_snapshot();
    if session.session_epoch != session_epoch {
        return Err("Advice request belongs to an earlier match session.".into());
    }
    // Ground counter-advice on the enemies CV has identified this match. Read
    // from the Rust runtime (single source of truth) rather than a per-window
    // frontend list — the always-on advice path fires from the overlay window,
    // whose companion store is never populated.
    let enemies = runtime::known_enemies();
    let result = tauri::async_runtime::spawn_blocking(move || {
        master::advise_with_epoch(&tick, &enemies, Some(session_epoch))
    })
    .await
    .map_err(|e| format!("internal: {e}"))??;
    if !runtime::is_current_live_session(session_epoch) {
        return Err(
            "Advice response belongs to an earlier match session and was discarded.".into(),
        );
    }
    let session = runtime::match_session_snapshot();
    if session.session_epoch != session_epoch {
        return Err(
            "Advice response belongs to an earlier match session and was discarded.".into(),
        );
    }
    master::with_advice_publication(&result, || {
        // Broadcast a flattened identity envelope so both the companion and overlay
        // can reject a response queued before a match boundary.
        let event = runtime::MatchSessionEvent::new(result.clone(), &session);
        let _ = app.emit("advice-update", event);
        // CR-011 §B utterance ledger — fired after the broadcast above, never
        // before, so it can't add latency to the advice dispatch itself. `meta`
        // is the resolved backend ("claude"/"ollama") when `advise()` just ran a
        // fresh (non-cached) call; best-effort, so `None` on a cache-miss race.
        // Cached re-fetches are NOT logged: the auto path re-voices the same text
        // within its cooldown window, and verbatim duplicates would crowd genuine
        // signal/announcer entries out of the 30-cap ledger (Opus gate, CR011-P2).
        if !result.cached {
            let backend_meta = master::last_backend().map(str::to_string);
            let payload = utterance::UtterancePayload::new_for_session(
                "master",
                "line",
                result.text.clone(),
                None,
                backend_meta,
                &session,
            )
            .generated();
            utterance::emit_for_session(&app, payload);
        }
        Ok(result.clone())
    })
}

/// G-Revive: on death, return the deterministic buyback verdict immediately and
/// fire a best-effort local-SLM narrative that arrives later via `buyback-narrative`.
/// Unobserved threat fields remain unknown and cannot produce a safe verdict.
#[tauri::command]
async fn request_buyback_advice(
    app: tauri::AppHandle,
    tick: gsi::GameTick,
    session_epoch: u64,
) -> Result<revive::ReviveAdvice, String> {
    if !runtime::is_current_live_session(session_epoch) || !tick.in_game || tick.alive {
        return Err("Buyback request does not belong to an active death episode.".into());
    }
    let identity = runtime::begin_buyback_request(session_epoch, tick.deaths)?;
    if !runtime::is_current_live_session(session_epoch) || !tick.in_game {
        return Err("Buyback request does not belong to the active live match.".into());
    }
    let session = runtime::match_session_snapshot();
    if session.session_epoch != session_epoch {
        return Err("Buyback request belongs to an earlier match session.".into());
    }
    let ctx = revive::DeathContext::from_tick(&tick);
    let advice = revive::advise_buyback(&ctx);
    runtime::with_buyback_publication(session_epoch, identity, || {
        let event = runtime::MatchSessionEvent::new(
            runtime::BuybackEvent {
                payload: advice.clone(),
                identity,
            },
            &session,
        );
        let _ = app.emit("buyback-advice", event);
        Ok(())
    })?;

    // Voice the verdict via the local SLM off the hot path — fire-and-forget so the
    // UI gets the verdict now; the narrative emits when (if) ollama answers.
    let prompt = revive::narrate_prompt(&advice, &tick);
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Use the user-picked model from Settings; empty → legacy chain in slm.rs.
        let model = runtime::master_ollama_model();
        if let Ok(text) = slm::advise_offline(&prompt, &model) {
            let _ = runtime::with_buyback_publication(session_epoch, identity, || {
                let event = runtime::BuybackEvent {
                    payload: runtime::SessionTextEvent::new(text, &session),
                    identity,
                };
                let _ = app2.emit("buyback-narrative", event);
                Ok(())
            });
        }
    });
    Ok(advice)
}

/// Aggregated Claude usage stats for the QuotaCard (5h + 7d windows).
#[tauri::command]
fn read_usage() -> usage::UsageStats {
    usage::read_stats()
}

/// Privacy reset for the usage log (parallel to delete_all_match_logs for G-Log).
#[tauri::command]
fn clear_usage_log() -> Result<(), String> {
    usage::clear()
}

/// List SAPI voices installed on this machine so the UI can let the user pick.
#[tauri::command]
fn list_voices() -> Vec<tts::Voice> {
    tts::list_voices()
}

/// Mirror the UI's voice picker to the Rust speech path so G-Signal gank
/// warnings speak in Maiden's chosen voice (not the SAPI default).
#[tauri::command]
fn set_cv_voice(name: Option<String>, rate: Option<i32>) {
    runtime::set_voice(name, rate);
    // Audit H9: the prewarmed critical-line cache is keyed on (voice, rate) —
    // a stale bake just falls through to the live path (correct, just slow),
    // but re-baking here means a voice change doesn't leave the fast path
    // cold for the rest of the session. Off-thread: same reasoning as the
    // startup call in `lib.rs::run`.
    std::thread::spawn(audio::prepare_critical_playback);
}

/// Mirror the UI's G-Signal toggle so the capture loop can skip warning work.
/// Emits `signal-change` (mirrors `set_volume`'s `volume-change`) so any
/// surface that owns this flag (the deck's audio rail) stays in sync even
/// when a different writer changes it (CR-007 WP-4 Fix 1).
#[tauri::command]
fn set_hp_alert_settings(enabled: bool, voice_enabled: bool, threshold: i64) {
    runtime::set_hp_alert_settings(enabled, voice_enabled, threshold);
}

#[tauri::command]
fn set_cv_signal_enabled(app: tauri::AppHandle, enabled: bool) {
    runtime::set_signal_enabled(enabled);
    let _ = app.emit("signal-change", enabled);
}

/// Mirror the UI's announcer toggle (G-AnnStudio kill/streak/death lines,
/// gated in gsi.rs). Independent of G-Signal — danger/gank/revision always
/// fire regardless of this flag (see runtime::ANNOUNCER_ENABLED doc comment).
/// Emits `announcer-change` so other surfaces stay in sync (CR-007 WP-4 Fix 1).
#[tauri::command]
fn set_announcer_enabled(app: tauri::AppHandle, enabled: bool) {
    runtime::set_announcer_enabled(enabled);
    let _ = app.emit("announcer-change", enabled);
}

/// Mirror the UI's G-Signal sensitivity picker (Low/Med/High) so the capture
/// loop trades false positives for hit rate per the player's preference.
#[tauri::command]
fn set_cv_signal_sensitivity(level: signal::Sensitivity) {
    runtime::set_signal_sensitivity(level);
}

#[tauri::command]
fn set_persona_preset(preset: String) {
    let code = match preset.as_str() {
        "coach" => 0,
        "silent" => 1,
        "caster" => 2,
        "meme" => 3,
        _ => 0,
    };
    runtime::set_persona_preset(code);
}

/// Pick the G-Master backend (auto/claude/ollama). The user can route around
/// claude rate-limits or pin to local for privacy/offline play.
#[tauri::command]
fn set_master_backend(app: tauri::AppHandle, backend: runtime::MasterBackend) {
    runtime::set_master_backend(backend);
    emit_master_context(&app);
}

/// Set the separate local consent for sending the own-stat allowlist to Claude.
/// Choosing a provider or invoking Ask does not call or imply this opt-in.
#[tauri::command]
fn set_master_cloud_context_opt_in(app: tauri::AppHandle, enabled: bool) {
    runtime::set_master_cloud_context_opt_in(enabled);
    emit_master_context(&app);
}

/// Pick the Ollama model G-Master uses when the Ollama backend is active.
/// Empty string = legacy default chain in slm.rs.
#[tauri::command]
fn set_master_ollama_model(app: tauri::AppHandle, name: String) {
    runtime::set_master_ollama_model(name);
    emit_master_context(&app);
}

/// Pick the G-Master Claude auth *mode*. `auth = "apikey"` routes Claude advice
/// through the Anthropic Messages API using the separately-stored key; anything
/// else (e.g. "plan") keeps the signed-in `claude` CLI Plan quota. The key is
/// NOT passed here — see `set_master_api_key` (CR-008 WP-2).
#[tauri::command]
fn set_master_mode(app: tauri::AppHandle, auth: String) {
    runtime::set_master_mode(auth == "apikey");
    emit_master_context(&app);
}

/// Store (or clear, when empty) the Anthropic API key in the DPAPI secret store
/// and mirror it into the live runtime. The plaintext never round-trips back to
/// the webview; the UI reflects saved-state via `has_master_api_key`.
#[tauri::command]
fn set_master_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    if trimmed.is_empty() {
        secret::secret_delete(app.clone(), "anthropic_api_key".to_string())?;
        runtime::set_master_api_key(None);
    } else {
        secret::secret_set(
            app.clone(),
            "anthropic_api_key".to_string(),
            trimmed.clone(),
        )?;
        runtime::set_master_api_key(Some(trimmed));
    }
    emit_master_context(&app);
    Ok(())
}

/// Whether an Anthropic API key is currently stored — drives the UI "key saved"
/// state without exposing the plaintext to the webview.
#[tauri::command]
fn has_master_api_key() -> bool {
    runtime::master_api_key_present()
}

/// Arm the OAuth callback gate right before the frontend opens the sign-in
/// browser, so `:3000/auth/callback` only honors a code for a sign-in the app
/// actually initiated (CR-008 WP-3 — login-CSRF / session-fixation guard).
#[tauri::command]
fn oauth_begin(state: String) -> Result<(), String> {
    if !gsi::oauth_listener_ready() {
        return Err("Google sign-in requires port 3000. Close the app using that port, then restart G-Maiden; GSI can continue on its selected fallback port.".into());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    runtime::set_oauth_pending(state, now)
        .then_some(())
        .ok_or_else(|| "invalid OAuth transaction state".to_string())
}

/// Toggle in-game calibration evidence capture (screenshots + audit clips).
/// QA/tuning mode — off by default; writes images locally only.
#[tauri::command]
fn set_calibration_enabled(enabled: bool) {
    calibration::set_enabled(enabled);
}

/// Toggle the silent-arm efficacy study opt-in (RWANG TASK 2, C-2). Off by
/// default; small random proportion of matches get their gank alert silenced
/// (voice + banner) while G-Signal keeps computing and logging as normal, so
/// the user can later compare warned-vs-silent death rates. Instantly
/// disable-able — see `runtime::set_efficacy_enabled`.
#[tauri::command]
fn set_efficacy_enabled(enabled: bool) {
    runtime::set_efficacy_enabled(enabled);
}

/// Scan the local match logs and return the user's own two-arm efficacy
/// comparison (`{ armed: {events, deaths, rate}, silent: {...} }`). Local-only
/// — reads `log::log_dir()`, never uploads anything.
#[tauri::command]
fn efficacy_summary() -> Result<serde_json::Value, String> {
    log::efficacy_summary()
}

/// Trigger a calibration motion clip for a voice-paired event fired in the
/// frontend (danger / kill / death / advice). No-op when calibration is off.
#[tauri::command]
fn capture_calibration_clip(
    event: String,
    line: Option<String>,
    context: Option<serde_json::Value>,
) {
    calibration::record(
        &event,
        line.as_deref(),
        context.unwrap_or(serde_json::Value::Null),
    );
}

/// Set the master voice volume (0–100). Applies to both WAV clips (rodio) and
/// SAPI TTS. The overlay reflects this via the `volume-change` event.
#[tauri::command]
fn set_volume(app: tauri::AppHandle, vol: u8) {
    audio::set_volume(vol);
    let _ = app.emit("volume-change", vol);
}

/// Select the GPU/CPU-temp telemetry source shown in the deck footer:
/// 0 = auto (prefer the rich G-Telemetry file, else the light feeder push),
/// 1 = feeder only, 2 = G-Telemetry only, 3 = off.
#[tauri::command]
fn set_telemetry_source(source: u8) {
    governor::set_telemetry_source(source);
}

/// Get the current master volume (0–100).
#[tauri::command]
fn get_volume() -> u8 {
    audio::get_volume()
}

/// Discover Dota 2's GSI cfg directory and report whether our cfg is in place.
#[tauri::command]
fn detect_gsi_setup(dota_install_path: Option<String>) -> setup::SetupStatus {
    setup::detect(dota_install_path.as_deref())
}

#[tauri::command]
fn detect_dota_running() -> bool {
    setup::dota_running()
}

/// Write our GSI cfg into the discovered Dota 2 directory.
#[tauri::command]
fn install_gsi_config(dota_install_path: Option<String>) -> setup::SetupStatus {
    setup::install(dota_install_path.as_deref())
}

#[tauri::command]
fn set_gsi_dota_selection(dota_install_path: Option<String>) -> Result<(), String> {
    let changed = setup::set_dota_selection(dota_install_path.as_deref())?;
    gsi::note_config_port_changed(changed);
    Ok(())
}

/// Path to the G-Log directory (privacy-first; local only).
#[tauri::command]
fn get_log_dir() -> String {
    log::log_dir().to_string_lossy().to_string()
}

/// Load the local derived G-Memory context. No network access is performed.
#[tauri::command]
fn get_player_memory() -> Result<memory::MemoryContext, String> {
    memory::get_player_memory()
}

/// Delete only the derived G-Memory snapshot; archived G-Log files remain intact.
#[tauri::command]
fn delete_player_memory() -> Result<(), String> {
    memory::delete_player_memory()
}

/// Settings persistence — `%LOCALAPPDATA%\G-Maiden\settings.json`.
///
/// localStorage alone loses the overlay layout whenever the webview origin
/// changes (dev :5173 vs production tauri://localhost are separate stores), so
/// the Control window mirrors every settings write here and hydrates from this
/// file on boot. The payload is the frontend's `Settings` JSON, opaque to Rust.
fn settings_file_path() -> std::path::PathBuf {
    log::log_dir()
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("settings.json")
}

pub(crate) fn save_settings_json(json: &str) -> Result<(), String> {
    let path = settings_file_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Write-then-rename so a crash mid-write can't truncate the only copy.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings_file(json: String) -> Result<(), String> {
    save_settings_json(&json)
}

pub(crate) fn load_settings_json() -> Option<String> {
    std::fs::read_to_string(settings_file_path()).ok()
}

#[tauri::command]
fn load_settings_file() -> Option<String> {
    load_settings_json()
}

/// Path of the currently-recording match log, or null if no match is active.
#[tauri::command]
fn current_match_path() -> Option<String> {
    log::current_path().map(|p| p.to_string_lossy().to_string())
}

/// Open the G-Log directory in Explorer.
#[tauri::command]
fn open_log_dir() {
    log::open_log_dir();
}

/// List archived match logs (newest first; excludes the currently-recording file).
#[tauri::command]
fn list_match_logs() -> Vec<log::MatchLog> {
    log::list_matches()
}

/// Delete one archived match log (privacy control).
#[tauri::command]
fn delete_match_log(name: String) -> Result<(), String> {
    log::delete_match(&name)
}

/// Read one archived match log's content, reduced to a debrief timeline
/// (CR-011 P3). `name` is validated inside `log::read_match_log` — it must
/// resolve to a bare `match-*.jsonl` filename confined to `log::log_dir()`.
#[tauri::command]
fn read_match_log(name: String) -> Result<Vec<log::TimelineEntry>, String> {
    log::read_match_log(&name)
}

/// Wipe every archived match log (privacy reset). Currently-recording file
/// is preserved so the active match survives.
#[tauri::command]
fn delete_all_match_logs() -> Result<u32, String> {
    log::delete_all()
}

/// Runs the Tauri application. Called from the thin `main.rs` bin shim — kept
/// as a plain function (not `fn main`) so external tools (e.g. `tests/perf`)
/// can depend on this crate as a library without linking the app entry point.
pub fn run() {
    if let Some(code) = minimap_preview_process::run_if_requested() {
        std::process::exit(code);
    }
    // Forensics first: route panics on ANY thread (capture / GSI / governor) to
    // %LOCALAPPDATA%\G-Maiden\logs\error.log so a freeze/crash leaves a trace.
    log::init_panic_hook();
    log::error("[startup] G-Maiden process started");
    if let Err(error) = governor::initialize_process_group() {
        log::error(&format!(
            "[startup] refusing to start without the whole-app CPU Job Object hard cap: {error}"
        ));
        std::process::exit(1);
    }

    // Global hotkeys — work even when Dota 2 is focused.
    // Ctrl+Alt+S = overlay show/hide (Alt+S / Ctrl+S collide with Dota binds).
    let toggle = Shortcut::new(Some(Modifiers::ALT | Modifiers::CONTROL), Code::KeyS);
    let vol_up = Shortcut::new(Some(Modifiers::ALT), Code::ArrowUp); // volume +10
    let vol_down = Shortcut::new(Some(Modifiers::ALT), Code::ArrowDown); // volume -10
    let mute = Shortcut::new(Some(Modifiers::ALT), Code::KeyM); // mute/unmute

    // Shortcut is Copy — clippy::clone_on_copy. Plain rebind moves into the handler.
    let toggle2 = toggle;
    let vol_up2 = vol_up;
    let vol_down2 = vol_down;
    let mute2 = mute;

    // Volume before mute (so unmute restores the right level).
    static MUTED_VOL: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(
            "g-announcer-video",
            |_ctx, request, responder| {
                tauri::async_runtime::spawn_blocking(move || {
                    responder.respond(voice_api::id_video::response(request))
                });
            },
        )
        .manage(PendingUpdate::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &toggle2 {
                        update_overlay_visibility(app, None);
                    } else if shortcut == &vol_up2 {
                        let cur = audio::get_volume();
                        let next = (cur + 10).min(100);
                        audio::set_volume(next);
                        let _ = app.emit("volume-change", next);
                    } else if shortcut == &vol_down2 {
                        let cur = audio::get_volume();
                        let next = cur.saturating_sub(10);
                        audio::set_volume(next);
                        let _ = app.emit("volume-change", next);
                    } else if shortcut == &mute2 {
                        let cur = audio::get_volume();
                        if cur == 0 {
                            let restore = MUTED_VOL.load(std::sync::atomic::Ordering::Relaxed);
                            let v = if restore > 0 { restore } else { 80 };
                            audio::set_volume(v);
                            let _ = app.emit("volume-change", v);
                        } else {
                            MUTED_VOL.store(cur, std::sync::atomic::Ordering::Relaxed);
                            audio::set_volume(0);
                            let _ = app.emit("volume-change", 0u8);
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            party::party_connect,
            party::party_social_proof,
            party::party_join_social,
            party::party_get_state,
            party::party_leave,
            party::party_kick,
            party::party_rotate_invite,
            minimap_preview_runtime::start_minimap_preview,
            minimap_preview_runtime::read_minimap_preview,
            minimap_preview_runtime::stop_minimap_preview,
            set_overlay_visible,
            overlay_bootstrap_ready,
            check_channel_update,
            install_pending_update,
            speak,
            get_capture_mode,
            retry_capture,
            speak_event,
            speak_advice,
            preview_static_advice_voice,
            is_advice_generation_current,
            get_master_context_generation,
            cancel_speech,
            quit_application,
            list_voices,
            set_cv_voice,
            set_persona_preset,
            set_cv_signal_enabled,
            set_hp_alert_settings,
            set_announcer_enabled,
            set_cv_signal_sensitivity,
            set_master_backend,
            set_master_cloud_context_opt_in,
            set_master_ollama_model,
            set_master_mode,
            set_master_api_key,
            has_master_api_key,
            oauth_begin,
            secret::secret_set,
            secret::secret_get,
            secret::secret_delete,
            set_calibration_enabled,
            capture_calibration_clip,
            set_efficacy_enabled,
            efficacy_summary,
            set_volume,
            get_volume,
            set_telemetry_source,
            voice_cache_status,
            voice_api_state,
            voice_api_import_file,
            voice_api_install_store_pack,
            voice_api_action,
            preview_announcer_event,
            preview_announcer_variant,
            record_announcer_visual,
            announcer_visual_warm_candidates,
            warm_announcer_visual_variant,
            read_audio_waveform,
            list_event_clips,
            preview_announcer_clip,
            open_voice_cache_dir,
            open_url,
            detect_gsi_setup,
            detect_dota_running,
            install_gsi_config,
            set_gsi_dota_selection,
            get_log_dir,
            get_player_memory,
            delete_player_memory,
            save_settings_file,
            load_settings_file,
            current_match_path,
            open_log_dir,
            list_match_logs,
            delete_match_log,
            read_match_log,
            delete_all_match_logs,
            request_advice,
            get_master_readiness,
            request_buyback_advice,
            read_usage,
            clear_usage_log,
            identity::resolve_steam_id
        ])
        .setup(move |app| {
            // Restore local runtime preferences before GSI can deliver the
            // first gameplay tick. The webview later hydrates the same,
            // validated snapshot for Control and Overlay.
            if let Some(settings) = load_settings_json() {
                if let Err(error) = runtime::apply_startup_settings_json(&settings) {
                    eprintln!("[settings] saved runtime settings were not loaded: {error}");
                }
            }

            // CR-008 WP-2: load the Anthropic API key from the DPAPI secret store
            // into the runtime once at startup. Owned separately from the auth
            // mode so the frontend's mode-sync effect can never clobber it (B2).
            if let Some(key) = secret::load_secret(app.handle(), "anthropic_api_key") {
                runtime::set_master_api_key(Some(key));
            }

            // Audit H8: warm the resolved-clip cache before the first event can
            // fire, so a pack left active from a prior session doesn't pay the
            // cold-cache resolution cost on the first gank alert of a new
            // session. Cheap (one manifest read+parse) and infallible — see
            // `voice_api::pack_io::rebuild_resolved_cache`.
            voice_api::visual_warm::install(app.handle().clone());
            voice_api::install_playback(app.handle().clone());
            if let Err(error) = package_ipc::start(app.path().app_local_data_dir()?, tauri::is_dev()) {
                eprintln!("[G-AnnInstall] installation service unavailable: {error}");
            }
            voice_api::rebuild_resolved_cache();

            // Audit H9: prewarm G-Signal's fixed TTS fallback lines to WAV so
            // the (rare, but hot-path) cache-miss case never has to shell out
            // to Piper-probe-then-SAPI from inside the capture loop. Up to
            // four PowerShell round trips (~150-200ms each) — spawned off the
            // startup thread so it never delays window creation; harmless if
            // it's still running when the first gank alert fires, since that
            // just falls through to the pre-H9 live path exactly as before.
            std::thread::spawn(audio::prepare_critical_playback);

            // G1.1: GSI ingestion server (127.0.0.1:3000); emits `game-tick` to all windows.
            if let Err(reason) = party::install(app.handle()) {
                eprintln!("[G-Party] unavailable reason={reason}");
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(gsi::serve(handle));
            if runtime::mark_local_capture_started() {
                capture::start(app.handle().clone());
            }

            // G7.2: resource governor — poll RAM/CPU every second, emit resource-stats.
            governor::start(app.handle().clone());
            // Headless GPU feeder sidecar → pushes nvidia-smi metrics to
            // POST /telemetry. Startup reaches this point only after the host joined
            // its Job Object, so the feeder inherits membership by default. Normal
            // exit also stops/waits the exact owned child; a feeder left by an older
            // degraded-mode build may outlive abnormal exit.
            app.manage(governor::spawn_gpu_feeder());

            app.global_shortcut().register(toggle)?;
            app.global_shortcut().register(vol_up)?;
            app.global_shortcut().register(vol_down)?;
            app.global_shortcut().register(mute)?;

            let root = webview_bootstrap::SelectedRoot::select(
                tauri::is_dev(),
                app.config().build.dev_url.as_ref().map(|url| url.as_str()),
            )?;
            app.manage(OverlayBootstrap::new(root));
            create_control_window(app.handle())?;

            // --- System tray ---
            let show_item =
                MenuItem::with_id(app, "show", "Show Control Panel", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit G-Maiden", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("G-Maiden")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("control") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("control") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(feeder) = app.try_state::<governor::GpuFeederProcess>() {
                    if !feeder.shutdown() {
                        eprintln!("could not fully stop owned gpu-feeder sidecar on app exit");
                    }
                }
            }
        });
}
