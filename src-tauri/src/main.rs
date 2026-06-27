// G-Maiden Rust core entry point.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod announcer;
mod audio;
mod calibration;
mod capture;
mod counter_advice;
mod cv;
mod damage;
mod governor;
mod gsi;
mod items;
mod log;
mod master;
mod motion;
mod ocr;
mod respawn;
mod revive;
mod runtime;
mod sentry;
mod signal;
mod setup;
mod slm;
mod tts;

/// Show/hide the OSD overlay window (called by the control GUI toggle).
#[tauri::command]
fn set_overlay_visible(app: tauri::AppHandle, visible: bool) {
    if let Some(ov) = app.get_webview_window("overlay") {
        let _ = if visible { ov.show() } else { ov.hide() };
    }
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

/// Try to play a pre-recorded clip for `event`. If no clips are present,
/// fall back to SAPI speaking `fallback`. Keeps the Maiden voice unified at
/// the call site — the UI doesn't have to know which path is active.
#[tauri::command]
fn speak_event(event: String, fallback: String, voice: Option<String>, rate: Option<i32>) {
    if !audio::play_random(&event) {
        tts::speak(&fallback, voice.as_deref(), rate);
    }
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
const EVENTS: &[&str] = &[
    "danger",
    "gank",
    "revision",
    "levelUp",
    "match_start",
    "first_blood",
    "kill",
    "double_kill",
    "triple_kill",
    "ultra_kill",
    "rampage",
    "killing_spree",
    "dominating",
    "mega_kill",
    "unstoppable",
    "wicked_sick",
    "monster_kill",
    "godlike",
    "beyond_godlike",
    "death",
    "respawn",
    "hpLow",
    "manaLow",
    "advice",
];

#[tauri::command]
fn voice_cache_status() -> VoiceCacheStatus {
    let dir = audio::voice_cache_dir().to_string_lossy().to_string();
    let mut counts = std::collections::BTreeMap::new();
    let mut total = 0;
    for e in EVENTS {
        let c = audio::clip_count(e);
        total += c;
        counts.insert((*e).to_string(), c);
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

/// Play a specific clip file by its full path (for previewing individual clips).
#[tauri::command]
fn play_clip(path: String) {
    audio::play_file(std::path::PathBuf::from(path));
}

/// Open the voice-cache directory in Explorer so the user can drop clips in.
#[tauri::command]
fn open_voice_cache_dir() {
    let dir = audio::voice_cache_dir();
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::process::Command::new("explorer")
        .arg(dir.as_os_str())
        .spawn();
}

/// Open an external http(s) URL in the default browser (e.g. the voice-pack
/// store — purchases happen on the web). `explorer` handles URLs and is a GUI
/// app, so no console flashes; scheme is validated to avoid arbitrary commands.
#[tauri::command]
fn open_url(url: String) {
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = std::process::Command::new("explorer").arg(&url).spawn();
    }
}

/// Ask Maiden (via Claude Plan quota) for advice on the current game state.
/// Runs on a blocking thread so the async runtime stays free.
/// Also broadcasts `advice-update` to the overlay window so it can show the
/// advice inline (G5.4) without the control panel being open.
#[tauri::command]
async fn request_advice(app: tauri::AppHandle, tick: gsi::GameTick) -> Result<master::Advice, String> {
    let result = tauri::async_runtime::spawn_blocking(move || master::advise(&tick))
        .await
        .map_err(|e| format!("internal: {e}"))??;
    // Broadcast to overlay — ignore error (overlay may be hidden).
    let _ = app.emit("advice-update", &result);
    Ok(result)
}

/// G-Revive: on death, return the deterministic buyback verdict immediately and
/// fire a best-effort local-SLM narrative that arrives later via `buyback-narrative`.
/// Threat fields default safe until CV is wired, so the verdict is conservative.
#[tauri::command]
async fn request_buyback_advice(app: tauri::AppHandle, tick: gsi::GameTick) -> revive::ReviveAdvice {
    let ctx = revive::DeathContext::from_tick(&tick);
    let advice = revive::advise_buyback(&ctx);
    let _ = app.emit("buyback-advice", &advice);

    // Voice the verdict via the local SLM off the hot path — fire-and-forget so the
    // UI gets the verdict now; the narrative emits when (if) ollama answers.
    let prompt = revive::narrate_prompt(&advice, &tick);
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Use the user-picked model from Settings; empty → legacy chain in slm.rs.
        let model = runtime::master_ollama_model();
        if let Ok(text) = slm::advise_offline(&prompt, &model) {
            let _ = app2.emit("buyback-narrative", text);
        }
    });
    advice
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
}

/// Mirror the UI's G-Signal toggle so the capture loop can skip warning work.
#[tauri::command]
fn set_cv_signal_enabled(enabled: bool) {
    runtime::set_signal_enabled(enabled);
}

/// Mirror the UI's G-Signal sensitivity picker (Low/Med/High) so the capture
/// loop trades false positives for hit rate per the player's preference.
#[tauri::command]
fn set_cv_signal_sensitivity(level: signal::Sensitivity) {
    runtime::set_signal_sensitivity(level);
}

/// Pick the G-Master backend (auto/claude/ollama). The user can route around
/// claude rate-limits or pin to local for privacy/offline play.
#[tauri::command]
fn set_master_backend(backend: runtime::MasterBackend) {
    runtime::set_master_backend(backend);
}

/// Pick the Ollama model G-Master uses when the Ollama backend is active.
/// Empty string = legacy default chain in slm.rs.
#[tauri::command]
fn set_master_ollama_model(name: String) {
    runtime::set_master_ollama_model(name);
}

/// Pick the G-Master Claude auth method. `auth = "apikey"` routes Claude advice
/// through the Anthropic Messages API with `api_key`; anything else (e.g. "plan")
/// keeps the signed-in `claude` CLI Plan quota.
#[tauri::command]
fn set_master_auth(auth: String, api_key: String) {
    runtime::set_master_auth(auth == "apikey", api_key);
}

/// Toggle in-game calibration evidence capture (screenshots + audit clips).
/// QA/tuning mode — off by default; writes images locally only.
#[tauri::command]
fn set_calibration_enabled(enabled: bool) {
    calibration::set_enabled(enabled);
}

/// Trigger a calibration motion clip for a voice-paired event fired in the
/// frontend (danger / kill / death / advice). No-op when calibration is off.
#[tauri::command]
fn capture_calibration_clip(event: String, line: Option<String>, context: Option<serde_json::Value>) {
    calibration::record(&event, line.as_deref(), context.unwrap_or(serde_json::Value::Null));
}

/// Set the master voice volume (0–100). Applies to both WAV clips (rodio) and
/// SAPI TTS. The overlay reflects this via the `volume-change` event.
#[tauri::command]
fn set_volume(app: tauri::AppHandle, vol: u8) {
    audio::set_volume(vol);
    let _ = app.emit("volume-change", vol);
}

/// Get the current master volume (0–100).
#[tauri::command]
fn get_volume() -> u8 {
    audio::get_volume()
}

/// Discover Dota 2's GSI cfg directory and report whether our cfg is in place.
#[tauri::command]
fn detect_gsi_setup() -> setup::SetupStatus {
    setup::detect()
}

/// Write our GSI cfg into the discovered Dota 2 directory.
#[tauri::command]
fn install_gsi_config() -> setup::SetupStatus {
    setup::install()
}

/// Path to the G-Log directory (privacy-first; local only).
#[tauri::command]
fn get_log_dir() -> String {
    log::log_dir().to_string_lossy().to_string()
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

/// Wipe every archived match log (privacy reset). Currently-recording file
/// is preserved so the active match survives.
#[tauri::command]
fn delete_all_match_logs() -> Result<u32, String> {
    log::delete_all()
}

fn main() {
    // Forensics first: route panics on ANY thread (capture / GSI / governor) to
    // %LOCALAPPDATA%\G-Maiden\logs\error.log so a freeze/crash leaves a trace.
    log::init_panic_hook();
    log::error("[startup] G-Maiden process started");

    // Global hotkeys — work even when Dota 2 is focused.
    // Ctrl+Alt+S = overlay show/hide (Alt+S / Ctrl+S collide with Dota binds).
    let toggle = Shortcut::new(Some(Modifiers::ALT | Modifiers::CONTROL), Code::KeyS);
    let vol_up = Shortcut::new(Some(Modifiers::ALT), Code::ArrowUp);    // volume +10
    let vol_down = Shortcut::new(Some(Modifiers::ALT), Code::ArrowDown);// volume -10
    let mute = Shortcut::new(Some(Modifiers::ALT), Code::KeyM);         // mute/unmute

    // Shortcut is Copy — clippy::clone_on_copy. Plain rebind moves into the handler.
    let toggle2 = toggle;
    let vol_up2 = vol_up;
    let vol_down2 = vol_down;
    let mute2 = mute;

    // Volume before mute (so unmute restores the right level).
    static MUTED_VOL: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed { return; }
                    if shortcut == &toggle2 {
                        if let Some(ov) = app.get_webview_window("overlay") {
                            let visible = ov.is_visible().unwrap_or(true);
                            let _ = if visible { ov.hide() } else { ov.show() };
                        }
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
            set_overlay_visible,
            speak,
            speak_event,
            cancel_speech,
            list_voices,
            set_cv_voice,
            set_cv_signal_enabled,
            set_cv_signal_sensitivity,
            set_master_backend,
            set_master_ollama_model,
            set_master_auth,
            set_calibration_enabled,
            capture_calibration_clip,
            set_volume,
            get_volume,
            voice_cache_status,
            list_event_clips,
            play_clip,
            open_voice_cache_dir,
            open_url,
            detect_gsi_setup,
            install_gsi_config,
            get_log_dir,
            current_match_path,
            open_log_dir,
            list_match_logs,
            delete_match_log,
            delete_all_match_logs,
            request_advice,
            request_buyback_advice
        ])
        .setup(move |app| {
            // G1.1: GSI ingestion server (127.0.0.1:3000); emits `game-tick` to all windows.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(gsi::serve(handle));

            // P2.0: minimap capture → prefilter; emits `minimap-cv` debug events.
            // Read-only WGC; quietly no-ops if capture is unavailable.
            capture::start(app.handle().clone());

            // G7.2: resource governor — poll RAM/CPU every 10s, emit resource-stats.
            governor::start(app.handle().clone());

            app.global_shortcut().register(toggle)?;
            app.global_shortcut().register(vol_up)?;
            app.global_shortcut().register(vol_down)?;
            app.global_shortcut().register(mute)?;

            // OSD overlay: full-screen, click-through, over the game.
            if let Some(ov) = app.get_webview_window("overlay") {
                if let Ok(Some(monitor)) = ov.current_monitor() {
                    let _ = ov.set_size(*monitor.size());
                    let _ = ov.set_position(tauri::PhysicalPosition::new(0, 0));
                }
                let _ = ov.set_ignore_cursor_events(true);
            }

            // --- System tray ---
            let show_item = MenuItem::with_id(app, "show", "Show Control Panel", true, None::<&str>)?;
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

            // Closing the control window hides it to tray instead of quitting the process.
            // The overlay (and G-Signal) keep running; use tray → Quit to exit.
            if let Some(ctrl) = app.get_webview_window("control") {
                let ctrl2 = ctrl.clone();
                ctrl.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = ctrl2.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
