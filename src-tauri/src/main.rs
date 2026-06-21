// G-Maiden Rust core entry point.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod audio;
mod cv;
mod gsi;
mod log;
mod master;
mod setup;
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

const EVENTS: &[&str] = &[
    "danger",
    "levelUp",
    "kill",
    "death",
    "respawn",
    "manaLow",
    "revision",
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

/// Open the voice-cache directory in Explorer so the user can drop clips in.
#[tauri::command]
fn open_voice_cache_dir() {
    let dir = audio::voice_cache_dir();
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::process::Command::new("explorer")
        .arg(dir.as_os_str())
        .spawn();
}

/// Ask Maiden (via Claude Plan quota) for advice on the current game state.
/// Runs on a blocking thread so the async runtime stays free.
#[tauri::command]
async fn request_advice(tick: gsi::GameTick) -> Result<master::Advice, String> {
    tauri::async_runtime::spawn_blocking(move || master::advise(&tick))
        .await
        .map_err(|e| format!("internal: {e}"))?
}

/// List SAPI voices installed on this machine so the UI can let the user pick.
#[tauri::command]
fn list_voices() -> Vec<tts::Voice> {
    tts::list_voices()
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
    // Alt+S — show/hide the overlay while in-game (works even when Dota 2 is focused).
    let toggle = Shortcut::new(Some(Modifiers::ALT), Code::KeyS);
    let toggle_for_handler = toggle.clone();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &toggle_for_handler && event.state() == ShortcutState::Pressed {
                        if let Some(ov) = app.get_webview_window("overlay") {
                            let visible = ov.is_visible().unwrap_or(true);
                            let _ = if visible { ov.hide() } else { ov.show() };
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
            voice_cache_status,
            open_voice_cache_dir,
            detect_gsi_setup,
            install_gsi_config,
            get_log_dir,
            current_match_path,
            open_log_dir,
            list_match_logs,
            delete_match_log,
            delete_all_match_logs,
            request_advice
        ])
        .setup(move |app| {
            // G1.1: GSI ingestion server (127.0.0.1:3000); emits `game-tick` to all windows.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(gsi::serve(handle));

            app.global_shortcut().register(toggle)?;

            // OSD overlay: full-screen, click-through, over the game.
            if let Some(ov) = app.get_webview_window("overlay") {
                if let Ok(Some(monitor)) = ov.current_monitor() {
                    let _ = ov.set_size(*monitor.size());
                    let _ = ov.set_position(tauri::PhysicalPosition::new(0, 0));
                }
                let _ = ov.set_ignore_cursor_events(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
