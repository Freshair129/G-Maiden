// G-Maiden Rust core library — hosts every module plus the Tauri app setup.
// `main.rs` is a thin bin shim that just calls `run()` (canonical Tauri v2
// lib+bin split, so external tools like `tests/perf` can link the real
// modules instead of re-implementing the critical-path chain).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub mod announcer;
pub mod audio;
mod calibration;
pub mod capture;
#[cfg(feature = "wgc")]
mod capture_wgc;
mod counter_advice;
pub mod cv;
pub mod damage;
#[cfg(not(feature = "wgc"))]
pub mod dxgi;
mod governor;
mod gmad_entitlement;
pub mod gsi;
mod identity;
mod items;
mod log;
mod master;
pub mod motion;
mod ocr;
pub mod respawn;
mod revive;
pub mod runtime;
mod secret;
pub mod sentry;
mod setup;
pub mod signal;
mod slm;
pub mod tts;
mod usage;
mod utterance;
mod voice_api;

/// Show/hide the OSD overlay window (called by the control GUI toggle).
#[tauri::command]
fn set_overlay_visible(app: tauri::AppHandle, visible: bool) {
    if let Some(ov) = app.get_webview_window("overlay") {
        let _ = if visible && runtime::gmad_entitled() { ov.show() } else { ov.hide() };
    }
}

#[tauri::command]
async fn verify_gmad_entitlement(
    app: tauri::AppHandle,
    access_token: String,
) -> Result<gmad_entitlement::EntitlementDecision, String> {
    runtime::set_gmad_entitled(false);
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
    let decision = gmad_entitlement::verify(&access_token).await?;
    runtime::set_gmad_entitled(decision.unlocks_runtime());
    if decision.unlocks_runtime() && runtime::mark_gmad_capture_started() {
        capture::start(app.clone());
    }
    Ok(decision)
}

#[tauri::command]
fn lock_gmad_runtime(app: tauri::AppHandle) {
    runtime::set_gmad_entitled(false);
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
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

#[tauri::command]
fn quit_application(app: tauri::AppHandle) {
    app.exit(0);
}

/// Try to play a pre-recorded clip for `event`. If no clips are present,
/// fall back to SAPI speaking `fallback`. Keeps the Maiden voice unified at
/// the call site — the UI doesn't have to know which path is active.
#[tauri::command]
fn speak_event(event: String, fallback: String, voice: Option<String>, rate: Option<i32>) {
    if !audio::play_random(&event) {
        tts::speak_with_priority(
            &fallback,
            voice.as_deref(),
            rate,
            audio::priority_for_event(&event),
        );
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

#[tauri::command]
fn voice_api_state() -> Result<voice_api::VoiceState, String> {
    voice_api::state()
}

#[tauri::command]
fn voice_api_action(
    action: String,
    pack_id: Option<String>,
) -> Result<voice_api::VoiceState, String> {
    voice_api::action(&action, pack_id.as_deref())
}

#[tauri::command]
fn voice_api_create_template(
    pack_id: String,
    name: String,
    locale: String,
) -> Result<voice_api::VoiceState, String> {
    voice_api::create_template(&pack_id, &name, &locale)
}

#[tauri::command]
fn voice_api_upload_asset(
    pack_id: String,
    kind: String,
    name: String,
    bytes: Vec<u8>,
) -> Result<voice_api::UploadResult, String> {
    voice_api::upload_asset(&pack_id, &kind, &name, &bytes)
}

#[tauri::command]
fn voice_api_import_archive(
    name: String,
    bytes: Vec<u8>,
) -> Result<voice_api::ImportResult, String> {
    voice_api::import_archive(&name, &bytes)
}

#[tauri::command]
fn voice_api_map_event(
    payload: voice_api::MapEventRequest,
) -> Result<voice_api::VoiceState, String> {
    voice_api::map_event(payload)
}

#[tauri::command]
fn voice_api_update_pack(
    payload: voice_api::UpdatePackRequest,
) -> Result<voice_api::VoiceState, String> {
    voice_api::update_pack(payload)
}

/// Preview an announcer event on the overlay WITHOUT being in-game: play the
/// pack's mapped clip and emit the same `announcer-banner` payload gsi.rs emits
/// on a real fired event, so the pack's banner shows on the overlay exactly as it
/// will in a match. Lets users verify a pack's banner+sound bundle before playing.
#[tauri::command]
fn preview_announcer_event(app: tauri::AppHandle, pack_id: String, event: String) {
    let clip = voice_api::preview_clip(&pack_id, &event);
    if let Some(p) = &clip {
        audio::play_file(p.clone());
    }
    let mut banner = voice_api::preview_banner(&pack_id, &event);
    banner.clip = clip.map(|p| p.to_string_lossy().into_owned());
    let _ = app.emit("announcer-banner", banner);
}

/// Read a voiced clip's bytes so the overlay can decode it via Web Audio and drive
/// a reactive waveform from the SAME audio it hears. Confined to the voice-cache
/// dir — the path always originates from our own clip resolver, never user input.
#[tauri::command]
fn read_audio_bytes(path: String) -> Result<Vec<u8>, String> {
    audio::read_clip_bytes(&path)
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
async fn request_advice(
    app: tauri::AppHandle,
    tick: gsi::GameTick,
) -> Result<master::Advice, String> {
    // Ground counter-advice on the enemies CV has identified this match. Read
    // from the Rust runtime (single source of truth) rather than a per-window
    // frontend list — the always-on advice path fires from the overlay window,
    // whose companion store is never populated.
    let enemies = runtime::known_enemies();
    let result = tauri::async_runtime::spawn_blocking(move || master::advise(&tick, &enemies))
        .await
        .map_err(|e| format!("internal: {e}"))??;
    // Broadcast to overlay — ignore error (overlay may be hidden).
    let _ = app.emit("advice-update", &result);
    // CR-011 §B utterance ledger — fired after the broadcast above, never
    // before, so it can't add latency to the advice dispatch itself. `meta`
    // is the resolved backend ("claude"/"ollama") when `advise()` just ran a
    // fresh (non-cached) call; best-effort, so `None` on a cache-miss race.
    // Cached re-fetches are NOT logged: the auto path re-voices the same text
    // within its cooldown window, and verbatim duplicates would crowd genuine
    // signal/announcer entries out of the 30-cap ledger (Opus gate, CR011-P2).
    if !result.cached {
        let backend_meta = master::last_backend().map(str::to_string);
        utterance::emit(
            &app,
            utterance::UtterancePayload::new("master", "line", result.text.clone(), None, backend_meta),
        );
    }
    Ok(result)
}

/// G-Revive: on death, return the deterministic buyback verdict immediately and
/// fire a best-effort local-SLM narrative that arrives later via `buyback-narrative`.
/// Threat fields default safe until CV is wired, so the verdict is conservative.
#[tauri::command]
async fn request_buyback_advice(
    app: tauri::AppHandle,
    tick: gsi::GameTick,
) -> revive::ReviveAdvice {
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

/// Manual roster injection (Draft-CV). Sets the match roster by hand — 10 hero
/// labels in labels.json short form (e.g. "crystal_maiden") — without waiting for
/// the pick-screen recognizer. Lets the ally/enemy slot fill + roster-grounded
/// phantom filter be exercised before the portrait asset pack / calibration ship.
/// Emits `draft-roster` exactly as the capture loop's Draft-CV path does.
#[tauri::command]
fn set_draft_roster(app: tauri::AppHandle, radiant: Vec<String>, dire: Vec<String>) {
    runtime::set_roster(radiant.clone(), dire.clone());
    let _ = app.emit("draft-roster", runtime::Roster { radiant, dire });
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
}

/// Mirror the UI's G-Signal toggle so the capture loop can skip warning work.
/// Emits `signal-change` (mirrors `set_volume`'s `volume-change`) so any
/// surface that owns this flag (the deck's audio rail) stays in sync even
/// when a different writer changes it (CR-007 WP-4 Fix 1).
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

/// Pick the G-Master Claude auth *mode*. `auth = "apikey"` routes Claude advice
/// through the Anthropic Messages API using the separately-stored key; anything
/// else (e.g. "plan") keeps the signed-in `claude` CLI Plan quota. The key is
/// NOT passed here — see `set_master_api_key` (CR-008 WP-2).
#[tauri::command]
fn set_master_mode(auth: String) {
    runtime::set_master_mode(auth == "apikey");
}

/// Store (or clear, when empty) the Anthropic API key in the DPAPI secret store
/// and mirror it into the live runtime. The plaintext never round-trips back to
/// the webview; the UI reflects saved-state via `has_master_api_key`.
#[tauri::command]
fn set_master_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    if trimmed.is_empty() {
        secret::secret_delete(app, "anthropic_api_key".to_string())?;
        runtime::set_master_api_key(None);
    } else {
        secret::secret_set(app, "anthropic_api_key".to_string(), trimmed.clone())?;
        runtime::set_master_api_key(Some(trimmed));
    }
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
fn detect_gsi_setup() -> setup::SetupStatus {
    setup::detect()
}

#[tauri::command]
fn detect_dota_running() -> bool {
    setup::dota_running()
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

#[tauri::command]
fn save_settings_file(json: String) -> Result<(), String> {
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
fn load_settings_file() -> Option<String> {
    std::fs::read_to_string(settings_file_path()).ok()
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
    // Forensics first: route panics on ANY thread (capture / GSI / governor) to
    // %LOCALAPPDATA%\G-Maiden\logs\error.log so a freeze/crash leaves a trace.
    log::init_panic_hook();
    log::error("[startup] G-Maiden process started");

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &toggle2 {
                        if let Some(ov) = app.get_webview_window("overlay") {
                            let visible = ov.is_visible().unwrap_or(true);
                            let _ = if visible || !runtime::gmad_entitled() {
                                ov.hide()
                            } else {
                                ov.show()
                            };
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
            verify_gmad_entitlement,
            lock_gmad_runtime,
            speak,
            speak_event,
            cancel_speech,
            quit_application,
            list_voices,
            set_cv_voice,
            set_cv_signal_enabled,
            set_announcer_enabled,
            set_cv_signal_sensitivity,
            set_master_backend,
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
            voice_api_action,
            voice_api_create_template,
            voice_api_upload_asset,
            voice_api_import_archive,
            voice_api_map_event,
            voice_api_update_pack,
            preview_announcer_event,
            read_audio_bytes,
            list_event_clips,
            play_clip,
            open_voice_cache_dir,
            open_url,
            detect_gsi_setup,
            detect_dota_running,
            install_gsi_config,
            get_log_dir,
            save_settings_file,
            load_settings_file,
            current_match_path,
            open_log_dir,
            list_match_logs,
            delete_match_log,
            read_match_log,
            delete_all_match_logs,
            request_advice,
            request_buyback_advice,
            set_draft_roster,
            read_usage,
            clear_usage_log,
            identity::resolve_steam_id
        ])
        .setup(move |app| {
            // CR-008 WP-2: load the Anthropic API key from the DPAPI secret store
            // into the runtime once at startup. Owned separately from the auth
            // mode so the frontend's mode-sync effect can never clobber it (B2).
            if let Some(key) = secret::load_secret(app.handle(), "anthropic_api_key") {
                runtime::set_master_api_key(Some(key));
            }

            // G1.1: GSI ingestion server (127.0.0.1:3000); emits `game-tick` to all windows.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(gsi::serve(handle));

            // G7.2: resource governor — poll RAM/CPU every 10s, emit resource-stats.
            governor::start(app.handle().clone());
            // Headless GPU feeder sidecar → pushes nvidia-smi metrics to
            // POST /telemetry (own process; keeps nvidia-smi out of the main app).
            governor::spawn_gpu_feeder();

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
                let _ = ov.hide();
            }

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
