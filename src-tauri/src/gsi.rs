//! G-Maiden GSI ingestion (G1.1).
//! Local HTTP server on 127.0.0.1:3000 that receives Dota 2 Game State Integration
//! POSTs, extracts the useful fields, and emits a clean `game-tick` event to the UI.

use axum::{
    extract::{Query, State},
    response::Html,
    routing::{get, post},
    Router,
};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

const OVERLAY_MODULE_IDS: [&str; 19] = [
    "alert",
    "gmeter",
    "toast",
    "companion",
    "advice",
    "buyback",
    "missing",
    "banner",
    "lowhp",
    "vol",
    "standby",
    "clock",
    "kda",
    "gold",
    "gpm",
    "xpm",
    "nw",
    "score",
    "hero",
];
const SETTINGS_EVENT: &str = "settings";
const OVERLAY_LAYOUT_SYNC_EVENT: &str = "overlay-layout-sync";

/// Clean, UI-facing snapshot of the current game state.
#[derive(Serialize, serde::Deserialize, Clone, Default)]
pub struct GameTick {
    pub in_game: bool,
    pub clock_time: i64,
    pub game_state: String,
    pub daytime: bool,
    pub radiant_score: i64,
    pub dire_score: i64,
    pub gold: i64,
    pub net_worth: i64,
    pub gpm: i64,
    pub xpm: i64,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub team_name: String,
    pub last_hits: i64,
    pub denies: i64,
    pub hero: String,
    pub level: i64,
    pub alive: bool,
    pub hp_percent: i64,
    pub mana_percent: i64,
    /// GSI `hero.health` — absolute current HP (0 when absent). Together with
    /// `max_hp` this is the input a lethal-HP / burst-danger warning needs that a
    /// percentage alone cannot give (damage.rs `is_lethal`, feature-map #6).
    /// GROUNDWORK ONLY: GSI does not send the player's armor / magic-resistance
    /// (those would be derived from the local loadout, like self-burst), and it
    /// never sends ANY enemy stat — so a truthful enemy-burst warning still needs
    /// an enemy hero-level source (scoreboard-CV, deferred) before it can fire.
    #[serde(default)]
    pub hp: i64,
    /// GSI `hero.max_health` — absolute max HP (0 when absent).
    #[serde(default)]
    pub max_hp: i64,
    /// GSI `player.steamid` (SteamID64 string) — identifies the local player so
    /// the deck can auto-load their OpenDota profile without manual entry. "" when
    /// absent (menu / some spectator states).
    pub steamid: String,
    /// GSI `hero.buyback_cost` — gold needed to buy back (0 when N/A). Feeds G-Revive.
    pub buyback_cost: i64,
    /// GSI `hero.respawn_seconds` — live respawn countdown (0 when alive). Feeds G-Revive.
    pub respawn_seconds: i64,
    /// Number of entries in hero.kill_list — when it grows we know a new kill happened.
    /// Each entry's `victimid` is a player slot (0-9); the latest entry is the newest kill.
    pub kill_list_len: i64,
    /// Player-slot ID of the most recent kill victim (from the last entry in kill_list).
    /// -1 when kill_list is empty.
    pub last_victim_slot: i64,
    /// The player's own item names from the GSI `items` block (empty slots
    /// dropped). Grounds G-Master's self-burst estimate (damage.rs). Own-hero
    /// data only — never the enemies'. `#[serde(default)]` so an older/partial
    /// tick (e.g. round-tripped from a prior build) still deserializes.
    #[serde(default)]
    pub item_names: Vec<String>,
}

// lenient extractors — GSI fields vary by game phase / spectator mode.
fn dig<'a>(v: &'a Value, path: &[&str]) -> &'a Value {
    let mut cur = v;
    for k in path {
        cur = &cur[k];
    }
    cur
}
fn i(v: &Value, path: &[&str]) -> i64 {
    let c = dig(v, path);
    c.as_i64()
        .or_else(|| c.as_f64().map(|f| f as i64))
        .unwrap_or(0)
}
fn s(v: &Value, path: &[&str]) -> String {
    dig(v, path).as_str().unwrap_or("").to_string()
}
fn b(v: &Value, path: &[&str]) -> bool {
    dig(v, path).as_bool().unwrap_or(false)
}

/// Extract the latest victim slot from hero.kill_list. Dota 2 GSI sends this as
/// `{"0": {"victimid": 5}, "1": {"victimid": 3}, ...}` — sequential string keys.
/// Returns (count, last_victim_slot).
fn parse_kill_list(v: &Value) -> (i64, i64) {
    let kl = &v["hero"]["kill_list"];
    if let Some(obj) = kl.as_object() {
        let count = obj.len() as i64;
        let last = (0..count)
            .rev()
            .find_map(|idx| {
                obj.get(&idx.to_string())
                    .and_then(|entry| entry["victimid"].as_i64())
            })
            .unwrap_or(-1);
        (count, last)
    } else {
        (0, -1)
    }
}

/// The local team's score, which in Dota's GSI IS the enemy death count:
/// `map.radiant_score` counts kills *by* Radiant, i.e. Dire deaths. `None` when
/// the tick has no usable `player.team_name` (menu / spectator), because
/// guessing a side here would attribute our own deaths to the enemy.
pub(crate) fn enemy_deaths_from_score(tick: &GameTick) -> Option<i64> {
    if tick.team_name.eq_ignore_ascii_case("radiant") {
        Some(tick.radiant_score)
    } else if tick.team_name.eq_ignore_ascii_case("dire") {
        Some(tick.dire_score)
    } else {
        None
    }
}

/// How long one enemy death should discount a G-Motion threat slot (ms).
///
/// Enemy hero level is not observable — GSI exposes the local player only — so
/// this uses the local player's level as the closest available proxy and reads
/// the **turbo** (shorter) respawn table on purpose. The game mode is likewise
/// unknown (`revive.rs` has the same gap), and the two error directions are not
/// symmetric:
///
///   • window too LONG  ⇒ a respawned enemy stays discounted ⇒ **missed gank
///     warning**. The dangerous direction for a safety feature.
///   • window too SHORT ⇒ a still-dead enemy counts as a threat again ⇒ a
///     false warning, which is exactly today's unfixed behaviour — so erring
///     short is never worse than the status quo.
///
/// The shorter table is therefore the honest floor, not a mode guess. Most of
/// the harm this fix targets sits in the first ~30 s after death anyway (per-
/// hero risk peaks at 12 s off-map), which even the turbo floor covers.
pub(crate) fn enemy_respawn_estimate_ms(level: i64) -> u64 {
    let lvl = level.clamp(1, 25) as u32;
    (crate::respawn::respawn_seconds(lvl, true) * 1000.0) as u64
}

/// Tight definition of "actually in a match" — we want the overlay/voice/log
/// to engage only when the player is on the map. Excludes hero pick, draft,
/// load screens, the post-game scoreboard, and disconnects.
fn is_in_game(game_state: &str) -> bool {
    matches!(
        game_state,
        "DOTA_GAMERULES_STATE_PRE_GAME" | "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS"
    )
}

/// The hero-pick / strategy window before the horn. Draft-CV wakes the capture
/// loop here to read the roster off the pick screen (see `runtime::in_draft`).
fn is_in_draft(game_state: &str) -> bool {
    matches!(
        game_state,
        "DOTA_GAMERULES_STATE_HERO_SELECTION" | "DOTA_GAMERULES_STATE_STRATEGY_TIME"
    )
}

pub(crate) fn parse_tick_from_value(v: &Value) -> GameTick {
    let game_state = s(v, &["map", "game_state"]);
    let gold = i(v, &["player", "gold"]);
    let raw_nw = i(v, &["player", "net_worth"]);
    let net_worth = if raw_nw > 0 {
        raw_nw
    } else {
        crate::items::net_worth_from(&v["items"], gold)
    };
    let (kl_len, last_victim) = parse_kill_list(v);
    GameTick {
        in_game: is_in_game(&game_state),
        clock_time: i(v, &["map", "clock_time"]),
        game_state,
        daytime: b(v, &["map", "daytime"]),
        radiant_score: i(v, &["map", "radiant_score"]),
        dire_score: i(v, &["map", "dire_score"]),
        gold,
        net_worth,
        gpm: i(v, &["player", "gpm"]),
        xpm: i(v, &["player", "xpm"]),
        kills: i(v, &["player", "kills"]),
        deaths: i(v, &["player", "deaths"]),
        assists: i(v, &["player", "assists"]),
        team_name: s(v, &["player", "team_name"]),
        last_hits: i(v, &["player", "last_hits"]),
        denies: i(v, &["player", "denies"]),
        hero: s(v, &["hero", "name"]),
        level: i(v, &["hero", "level"]),
        alive: b(v, &["hero", "alive"]),
        hp_percent: i(v, &["hero", "health_percent"]),
        mana_percent: i(v, &["hero", "mana_percent"]),
        hp: i(v, &["hero", "health"]),
        max_hp: i(v, &["hero", "max_health"]),
        steamid: s(v, &["player", "steamid"]),
        buyback_cost: i(v, &["hero", "buyback_cost"]),
        respawn_seconds: i(v, &["hero", "respawn_seconds"]),
        kill_list_len: kl_len,
        last_victim_slot: last_victim,
        item_names: crate::items::item_names_from(&v["items"]),
    }
}

pub fn parse_tick_from_json(body: &str) -> GameTick {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    parse_tick_from_value(&v)
}

async fn handle(State(app): State<AppHandle>, body: String) -> &'static str {
    if !crate::runtime::gmad_entitled() {
        return "locked";
    }
    let tick = parse_tick_from_json(&body);
    // Announcer: detect kill/streak/state events from the tick and voice the
    // most significant one (clip-or-silent — these aren't TTS-faked).
    let announce = crate::announcer::most_important(&crate::announcer::observe(&tick));
    // Note the POST (watchdog uses recency) and gate the CV pipeline to live
    // matches (saves idle CPU).
    crate::runtime::mark_post(epoch_ms());
    crate::runtime::set_in_game(tick.in_game);
    crate::runtime::set_in_draft(is_in_draft(&tick.game_state));
    crate::runtime::set_player_team_name(&tick.team_name);
    // G-Motion threat discount (audit H3): a dead enemy is off the minimap and
    // therefore "missing", but is the opposite of a gank threat. Folded in here
    // — after `set_in_game` above, so a match boundary has already cleared the
    // pool — and only while actually in a match, so the post-game scoreboard
    // can't top it up.
    if tick.in_game {
        if let Some(enemy_deaths) = enemy_deaths_from_score(&tick) {
            crate::runtime::note_enemy_score(
                enemy_deaths,
                enemy_respawn_estimate_ms(tick.level),
                epoch_ms(),
            );
        }
    }
    crate::log::note_tick(&tick);
    let _ = app.emit("game-tick", tick);
    // CR-007 WP-4: the announcer (kill/streak/death lines) is a separate,
    // non-critical path from G-Signal — `runtime::signal_enabled()` gates
    // capture.rs's gank/danger/revision voice_interrupt() calls, which never
    // pass through here. Muting the announcer must never touch that path.
    if let Some(ev) = announce {
        if crate::runtime::announcer_enabled() {
            // Voice the clip and show the banner from the SAME active pack, so the
            // announcer sound and its queue banner always fire together (the bundle).
            // Resolve the clip ONCE so the overlay can drive its reactive waveform
            // from a silent copy of the exact clip that plays.
            let clip = crate::audio::pick_clip(&ev);
            if let Some(p) = &clip {
                crate::audio::play_path(p.clone(), &ev);
                // CR-011 §B utterance ledger — only when a clip actually
                // played (Maiden stayed silent otherwise), and after the
                // dispatch above so this never delays the clip itself.
                crate::utterance::emit(
                    &app,
                    crate::utterance::UtterancePayload::new(
                        "announcer",
                        "line",
                        ev.clone(),
                        None,
                        crate::voice_api::active_pack_name(),
                    ),
                );
            }
            let mut banner = crate::voice_api::fired_banner(&ev);
            banner.clip = clip.map(|p| p.to_string_lossy().into_owned());
            let _ = app.emit("announcer-banner", banner);
        }
    }
    "ok"
}

/// Receive a GPU telemetry sample PUSHed by the headless `gpu-feeder` sidecar
/// (own process, runs nvidia-smi). Body: `{ "gpus": [ { loadPercent, tempC,
/// vramUsedMb, vramTotalMb } ] }`. Stashed in the governor; the next
/// `resource-stats` emit carries it to the deck footer.
async fn telemetry_ingest(body: String) -> &'static str {
    if let Ok(v) = serde_json::from_str::<Value>(&body) {
        crate::governor::ingest_gpu(&v);
    }
    "ok"
}

/// Body accepted by `POST /announcer/install`. `pack_id` is preferred;
/// `pack` is the legacy key kept for G-AnnStudio builds that predate this
/// fix. `activate` defaults to true — install almost always means "use this
/// pack now", but the caller can opt out (e.g. to stage a pack ahead of time).
struct InstallRequest {
    pack_id: String,
    activate: bool,
}

fn parse_install_request(body: &str) -> InstallRequest {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let pack_id = v["packId"]
        .as_str()
        .or_else(|| v["pack"].as_str())
        .unwrap_or("")
        .to_string();
    let activate = v["activate"].as_bool().unwrap_or(true);
    InstallRequest { pack_id, activate }
}

/// Receive a notify from G-AnnStudio after it installs a pack into
/// `voice-cache/packs/<id>/`. `:3000` has no auth, so this only ever
/// activates a pack that's ALREADY on disk (`voice_api::activate_if_exists`) —
/// it never creates, writes, moves, or extracts anything; the clip files
/// themselves are G-AnnStudio's job. Returns real per-event counts resolved
/// from the pack's manifest (`voice_api::install_report`), replacing the old
/// `audio::all_counts()` call which counted subfolders of the legacy flat
/// `voice-cache/` layout and had no notion of a manifest-based pack.
async fn announcer_install(body: String) -> axum::Json<serde_json::Value> {
    axum::Json(run_announcer_install(&parse_install_request(&body)))
}

/// Parse the bounded v1 authoring payload from G-AnnStudio. This is deliberately
/// separate from `/announcer/install`: that endpoint can only activate an existing
/// pack, whereas this accepts no files and can only replace `settings.layout`.
fn parse_overlay_layout_sync(body: &str) -> Result<Value, String> {
    let payload: Value = serde_json::from_str(body).map_err(|_| "invalid JSON".to_string())?;
    let root = payload.as_object().ok_or("payload must be an object")?;
    if root.len() != 2 || root.get("schemaVersion").and_then(Value::as_i64) != Some(1) {
        return Err("unsupported layout schema".into());
    }
    let layout = root
        .get("layout")
        .and_then(Value::as_object)
        .ok_or("layout must be an object")?;
    if layout.len() != OVERLAY_MODULE_IDS.len() {
        return Err("layout must contain every known module exactly once".into());
    }
    for id in OVERLAY_MODULE_IDS {
        let module = layout
            .get(id)
            .and_then(Value::as_object)
            .ok_or("layout contains an unknown or missing module")?;
        if module.len() != 4 {
            return Err("module must contain x, y, scale, and enabled only".into());
        }
        let bounded = |key: &str, min: f64, max: f64| -> Result<(), String> {
            let value = module
                .get(key)
                .and_then(Value::as_f64)
                .ok_or_else(|| format!("{id}.{key} must be a number"))?;
            if !value.is_finite() || value < min || value > max {
                return Err(format!("{id}.{key} is outside its allowed range"));
            }
            Ok(())
        };
        bounded("x", 0.0, 100.0)?;
        bounded("y", 0.0, 100.0)?;
        bounded("scale", 0.6, 1.6)?;
        if module.get("enabled").and_then(Value::as_bool).is_none() {
            return Err(format!("{id}.enabled must be a boolean"));
        }
    }
    Ok(payload)
}

/// Preserve every existing settings field and replace only the validated layout.
/// Kept pure so the sync boundary is testable without the local settings file.
fn merge_overlay_layout(existing_settings_json: Option<&str>, layout: Value) -> Value {
    let mut settings = existing_settings_json
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| serde_json::json!({}));
    settings["layout"] = layout;
    settings
}

/// Build the complete local-sync result before touching disk or the event bus.
/// Keeping this pure gives the authoring seam a bounded smoke surface: invalid
/// payloads fail before persistence, and a valid layout can only produce the
/// two documented UI updates (the full settings snapshot plus the layout-only
/// event). This helper is intentionally separate from GSI tick handling.
#[derive(Debug, PartialEq)]
struct OverlayLayoutSyncPlan {
    settings: Value,
    layout: Value,
}

fn prepare_overlay_layout_sync(
    existing_settings_json: Option<&str>,
    body: &str,
) -> Result<OverlayLayoutSyncPlan, String> {
    let payload = parse_overlay_layout_sync(body)?;
    let layout = payload["layout"].clone();
    Ok(OverlayLayoutSyncPlan {
        settings: merge_overlay_layout(existing_settings_json, layout.clone()),
        layout,
    })
}

/// Receive a complete layout draft from G-AnnStudio and apply only that field
/// of the normal settings object. The server is loopback-only; validation here
/// prevents this authoring seam from becoming a generic settings write surface.
async fn overlay_layout_sync(State(app): State<AppHandle>, body: String) -> axum::Json<Value> {
    let plan = match prepare_overlay_layout_sync(crate::load_settings_json().as_deref(), &body) {
        Ok(plan) => plan,
        Err(error) => {
            return axum::Json(serde_json::json!({ "ok": false, "error": error }));
        }
    };
    let serialized = match serde_json::to_string(&plan.settings) {
        Ok(json) => json,
        Err(_) => {
            return axum::Json(
                serde_json::json!({ "ok": false, "error": "could not encode settings" }),
            );
        }
    };
    if crate::save_settings_json(&serialized).is_err() {
        return axum::Json(serde_json::json!({ "ok": false, "error": "could not persist layout" }));
    }
    if app.emit(SETTINGS_EVENT, &plan.settings).is_err() {
        return axum::Json(
            serde_json::json!({ "ok": false, "error": "layout saved but overlay notification failed" }),
        );
    }
    let _ = app.emit(OVERLAY_LAYOUT_SYNC_EVENT, &plan.layout);
    axum::Json(serde_json::json!({ "ok": true, "schemaVersion": 1 }))
}

/// Pure decision logic, split out of the async handler so it's unit-testable
/// without spinning up axum/tokio.
fn run_announcer_install(req: &InstallRequest) -> serde_json::Value {
    if req.pack_id.is_empty() {
        return serde_json::json!({ "ok": false, "error": "missing packId" });
    }

    let report = match crate::voice_api::install_report(&req.pack_id) {
        Ok(r) => r,
        Err(e) => {
            // Keep the absolute path in the local log only: `:3000` has no auth,
            // so the response must not echo the install directory back to a caller.
            eprintln!(
                "[G-Maiden] announcer install: pack '{}' not found/readable: {e}",
                req.pack_id
            );
            return serde_json::json!({
                "ok": false,
                "pack": req.pack_id,
                "error": "pack not found or manifest unreadable"
            });
        }
    };

    let activated = if req.activate {
        match crate::voice_api::activate_if_exists(&report.pack_id) {
            Ok(()) => true,
            Err(e) => {
                eprintln!(
                    "[G-Maiden] announcer install: activation of '{}' failed: {e}",
                    report.pack_id
                );
                return serde_json::json!({ "ok": false, "pack": report.pack_id, "error": e });
            }
        }
    } else {
        false
    };

    eprintln!(
        "[G-Maiden] announcer pack installed: {} (activated={activated}, {}/{} events mapped)",
        report.pack_id,
        report.counts.values().filter(|c| **c > 0).count(),
        report.counts.len()
    );
    serde_json::json!({
        "ok": true,
        "pack": report.pack_id,
        "packId": report.pack_id,
        "activated": activated,
        "counts": report.counts,
        "unmappedEvents": report.unmapped_events,
        "missingClips": report.missing_clips,
    })
}

const OAUTH_CALLBACK_HTML: &str = "<!doctype html><meta charset=utf-8><title>G-Maiden</title>\
<body style=\"font-family:system-ui;background:#0b1220;color:#dce9ff;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h2>G-Maiden</h2><p>เข้าสู่ระบบสำเร็จ — กลับไปที่แอปได้เลย</p>\
<p style=\"opacity:.6\">ปิดหน้านี้ได้</p></div><script>setTimeout(()=>window.close(),800)</script></body>";

/// OAuth (Google) redirect target. The system browser lands here after the
/// provider + Supabase round-trip; we hand the PKCE `code` back to the webview
/// via an event and it calls exchangeCodeForSession. Reuses the GSI :3000 server
/// so there's no extra listener/port (redirect URL is fixed for the allowlist).
async fn oauth_callback(
    State(app): State<AppHandle>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Html<&'static str> {
    if let Some(code) = params.get("code") {
        // CR-008 WP-3: only honor a code for a sign-in the app itself started
        // (single-use, time-boxed). This unauthenticated local endpoint would
        // otherwise let a drive-by page inject an attacker's `code` → session
        // fixation. An unsolicited/expired callback is ignored, not exchanged.
        if crate::runtime::take_oauth_pending(params.get("state").map(String::as_str), epoch_ms()) {
            let _ = app.emit("oauth-callback", code.clone());
        } else {
            let _ = app.emit(
                "oauth-error",
                "การเข้าสู่ระบบหมดเวลา หรือไม่ได้เริ่มจากแอป — กรุณาลองใหม่".to_string(),
            );
        }
    } else if let Some(err) = params
        .get("error_description")
        .or_else(|| params.get("error"))
    {
        let _ = app.emit("oauth-error", err.clone());
    }
    Html(OAUTH_CALLBACK_HTML)
}

fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Connection/status snapshot pushed to the UI by the watchdog so it can stop
/// showing "connected" after Dota closes (Dota just goes silent — no final tick).
#[derive(Serialize, Clone)]
struct GsiStatus {
    dota_running: bool,
    /// a GSI POST arrived recently (heartbeat is ~30s, so we allow a 45s gap).
    gsi_active: bool,
    in_game: bool,
    /// Dota is in *true* Exclusive Fullscreen → overlay + minimap capture can't
    /// work (no DWM) and the desktop may freeze. UI warns the user to switch to
    /// Borderless. False for Borderless / Windowed / Fullscreen-Optimizations.
    display_exclusive: bool,
}

/// Watchdog: every few seconds, check whether Dota is still running. When it
/// isn't, reset in-game state and close the G-Log (otherwise both stay stuck
/// "live" forever). Always pushes a `gsi-status` event so the UI reflects
/// reality. Spawned alongside the server.
async fn watchdog(app: AppHandle) {
    const STALE_MS: u64 = 45_000; // > GSI heartbeat (30s) + margin
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(4)).await;
        let running = crate::setup::dota_running();
        if !running {
            crate::runtime::set_in_game(false);
            crate::log::force_end();
        }
        let last = crate::runtime::last_post_ms();
        let gsi_active = running && last != 0 && epoch_ms().saturating_sub(last) < STALE_MS;
        // Only meaningful while Dota runs; cheap single Win32 query.
        let display_exclusive = running && crate::setup::exclusive_fullscreen_active();
        let _ = app.emit(
            "gsi-status",
            GsiStatus {
                dota_running: running,
                gsi_active,
                in_game: crate::runtime::in_game(),
                display_exclusive,
            },
        );
    }
}

/// Bind :3000 and serve GSI. Spawned as a background task by `main`.
pub async fn serve(app: AppHandle) {
    tauri::async_runtime::spawn(watchdog(app.clone()));
    let router = Router::new()
        .route("/gsi", post(handle))
        .route("/announcer/install", post(announcer_install))
        .route("/overlay/layout", post(overlay_layout_sync))
        .route("/telemetry", post(telemetry_ingest))
        .route("/auth/callback", get(oauth_callback))
        .with_state(app);
    match tokio::net::TcpListener::bind("127.0.0.1:3000").await {
        Ok(listener) => {
            eprintln!("[G-Maiden] GSI server listening on http://127.0.0.1:3000/gsi");
            if let Err(e) = axum::serve(listener, router).await {
                eprintln!("[G-Maiden] GSI server error: {e}");
            }
        }
        Err(e) => eprintln!("[G-Maiden] could not bind GSI port 3000: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn in_game_only_during_active_play() {
        // Pre-match / draft / load / showcase / post / disconnect → false
        for s in [
            "",
            "DOTA_GAMERULES_STATE_INIT",
            "DOTA_GAMERULES_STATE_HERO_SELECTION",
            "DOTA_GAMERULES_STATE_STRATEGY_TIME",
            "DOTA_GAMERULES_STATE_TEAM_SHOWCASE",
            "DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD",
            "DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD",
            "DOTA_GAMERULES_STATE_POST_GAME",
            "DOTA_GAMERULES_STATE_DISCONNECT",
            "DOTA_GAMERULES_STATE_NONSENSE_FUTURE_VALUE",
        ] {
            assert!(!is_in_game(s), "expected !in_game for {s:?}");
        }
        // On the map (pre-game horn + actual play) → true
        for s in [
            "DOTA_GAMERULES_STATE_PRE_GAME",
            "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
        ] {
            assert!(is_in_game(s), "expected in_game for {s:?}");
        }
    }

    fn run_handle(payload: serde_json::Value) -> GameTick {
        parse_tick_from_value(&payload)
    }

    #[test]
    fn missing_fields_default_to_zero_not_panic() {
        // Empty body should yield a fully-zero tick, not a panic. GSI sometimes
        // POSTs a near-empty payload during state changes.
        let t = run_handle(serde_json::json!({}));
        assert!(!t.in_game);
        assert_eq!(t.clock_time, 0);
        assert_eq!(t.hp_percent, 0);
        assert!(t.hero.is_empty());
    }

    #[test]
    fn happy_path_in_match() {
        let t = run_handle(serde_json::json!({
            "map":    { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
                        "clock_time": 612, "daytime": true,
                        "radiant_score": 14, "dire_score": 9 },
            "player": { "gold": 2300, "net_worth": 14500, "gpm": 520, "xpm": 610,
                        "team_name": "radiant",
                        "kills": 7, "deaths": 2, "assists": 10,
                        "last_hits": 145, "denies": 8 },
            "hero":   { "name": "npc_dota_hero_crystal_maiden", "level": 14,
                        "alive": true, "health_percent": 78, "mana_percent": 65,
                        "health": 507, "max_health": 650 }
        }));
        assert!(t.in_game);
        assert_eq!(t.clock_time, 612);
        assert_eq!(t.hero, "npc_dota_hero_crystal_maiden");
        assert_eq!(t.team_name, "radiant");
        assert_eq!(t.kills, 7);
        assert_eq!(t.hp_percent, 78);
        // abs HP/max HP (feature-map #6 groundwork) parse alongside the percentage
        assert_eq!(t.hp, 507);
        assert_eq!(t.max_hp, 650);
    }

    #[test]
    fn net_worth_derived_when_gsi_omits_it() {
        // Player-mode GSI sends net_worth=0; the overlay used to show "—". With
        // the derivation path, gold + Σ item costs lands a real number.
        let t = run_handle(serde_json::json!({
            "map":    { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" },
            "player": { "gold": 1500, "net_worth": 0 },
            "items":  {
                "slot0": { "name": "item_blink" },           // 2250
                "slot1": { "name": "item_black_king_bar" },  // 4050
                "slot2": { "name": "empty" },                // 0
                "slot3": { "name": "item_tpscroll" },        // 100
            }
        }));
        assert_eq!(t.gold, 1500);
        assert_eq!(t.net_worth, 1500 + 2250 + 4050 + 100);
    }

    #[test]
    fn net_worth_passthrough_when_gsi_sends_real_value() {
        // Spectator clients populate net_worth — trust it (more accurate than
        // our cost-snapshot which lags patches).
        let t = run_handle(serde_json::json!({
            "map":    { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" },
            "player": { "gold": 1500, "net_worth": 19999 },
            "items":  { "slot0": { "name": "item_blink" } } // would derive to 1500+2250
        }));
        assert_eq!(t.net_worth, 19999);
    }

    #[test]
    fn parses_buyback_and_respawn_when_dead() {
        // When the hero is dead, GSI exposes buyback_cost + respawn_seconds.
        let t = run_handle(serde_json::json!({
            "map":  { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" },
            "hero": { "name": "npc_dota_hero_crystal_maiden", "level": 16,
                      "alive": false, "buyback_cost": 1500, "respawn_seconds": 30 }
        }));
        assert!(!t.alive);
        assert_eq!(t.buyback_cost, 1500);
        assert_eq!(t.respawn_seconds, 30);
    }

    #[test]
    fn enemy_deaths_read_the_local_teams_score() {
        // Dota's GSI counts kills BY a team, so the LOCAL team's score is the
        // enemy death count. Getting this backwards would discount threats
        // every time WE died — the exact inversion of the fix.
        let mut t = run_handle(serde_json::json!({
            "map": { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
                     "radiant_score": 14, "dire_score": 9 },
            "player": { "team_name": "radiant" },
            "hero": { "name": "npc_dota_hero_lina" }
        }));
        assert_eq!(enemy_deaths_from_score(&t), Some(14), "radiant player kills dire");

        t.team_name = "dire".into();
        assert_eq!(enemy_deaths_from_score(&t), Some(9), "dire player kills radiant");

        // No side ⇒ no answer. Guessing would attribute our own deaths to them.
        t.team_name = String::new();
        assert_eq!(enemy_deaths_from_score(&t), None);
        t.team_name = "spectator".into();
        assert_eq!(enemy_deaths_from_score(&t), None);
    }

    #[test]
    fn respawn_estimate_errs_short_and_clamps_the_level_range() {
        // Erring SHORT is the safe direction: too long silences a real warning.
        // The turbo table is strictly below the default one at every level.
        for lvl in [1i64, 7, 15, 25] {
            let est = enemy_respawn_estimate_ms(lvl);
            let default_table =
                (crate::respawn::respawn_seconds(lvl as u32, false) * 1000.0) as u64;
            assert!(
                est < default_table,
                "level {lvl}: estimate {est}ms must undercut the default table's {default_table}ms"
            );
        }
        // Out-of-range levels must clamp, not index out of bounds.
        assert_eq!(enemy_respawn_estimate_ms(0), enemy_respawn_estimate_ms(1));
        assert_eq!(enemy_respawn_estimate_ms(-5), enemy_respawn_estimate_ms(1));
        assert_eq!(enemy_respawn_estimate_ms(99), enemy_respawn_estimate_ms(25));
        // And it must actually be a usable window, not zero.
        assert!(enemy_respawn_estimate_ms(1) >= 5_000);
    }

    #[test]
    fn kill_list_parsed() {
        let t = run_handle(serde_json::json!({
            "map":    { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" },
            "player": { "kills": 3 },
            "hero":   {
                "name": "npc_dota_hero_crystal_maiden",
                "kill_list": {
                    "0": { "victimid": 5 },
                    "1": { "victimid": 2 },
                    "2": { "victimid": 7 }
                }
            }
        }));
        assert_eq!(t.kill_list_len, 3);
        assert_eq!(t.last_victim_slot, 7);
    }

    #[test]
    fn kill_list_empty() {
        let t = run_handle(serde_json::json!({
            "map":    { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" },
            "hero":   { "name": "npc_dota_hero_invoker" }
        }));
        assert_eq!(t.kill_list_len, 0);
        assert_eq!(t.last_victim_slot, -1);
    }

    // --- POST /announcer/install (`run_announcer_install`) ---------------

    fn install_temp_root(tag: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("gmaiden-gsi-install-test-{tag}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Writes `packs/<id>/manifest.json` by hand (matching `voice_api`'s
    /// camelCase `Manifest`/`ManifestMapping` serde shape) since those structs
    /// are private to that module.
    fn install_write_pack(root: &std::path::Path, id: &str, mappings_json: &str) {
        let dir = root.join("packs").join(id);
        std::fs::create_dir_all(dir.join("clips")).unwrap();
        let manifest = format!(
            "{{\"id\":\"{id}\",\"name\":\"Test\",\"version\":\"0.1.0\",\"locale\":\"th-TH\",\
             \"author\":\"\",\"description\":\"\",\"coverImage\":\"\",\"mappings\":{mappings_json}}}"
        );
        std::fs::write(dir.join("manifest.json"), manifest).unwrap();
    }

    struct InstallRootGuard(std::path::PathBuf);
    impl Drop for InstallRootGuard {
        fn drop(&mut self) {
            crate::voice_api::set_test_voice_root(None);
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn install_activates_existing_pack_and_reports_real_counts() {
        let root = install_temp_root("ok");
        crate::voice_api::set_test_voice_root(Some(root.clone()));
        let _guard = InstallRootGuard(root.clone());

        install_write_pack(
            &root,
            "demo",
            r#"{"kill":{"text":"","thai":"","banner":"","bannerAsset":"","clips":["clips/kill_01.wav","clips/kill_02.wav"]}}"#,
        );
        std::fs::write(root.join("packs/demo/clips/kill_01.wav"), b"x").unwrap();
        std::fs::write(root.join("packs/demo/clips/kill_02.wav"), b"x").unwrap();

        let resp = run_announcer_install(&InstallRequest {
            pack_id: "demo".into(),
            activate: true,
        });
        assert_eq!(resp["ok"], true);
        assert_eq!(resp["activated"], true);
        assert_eq!(resp["packId"], "demo");
        assert_eq!(resp["counts"]["kill"], 2);

        let active = std::fs::read_to_string(root.join("active-pack.txt")).unwrap();
        assert_eq!(active.trim(), "demo");
    }

    #[test]
    fn install_accepts_legacy_pack_key_when_pack_id_absent() {
        let root = install_temp_root("legacy-key");
        crate::voice_api::set_test_voice_root(Some(root.clone()));
        let _guard = InstallRootGuard(root.clone());

        install_write_pack(&root, "demo", r#"{}"#);

        let req = parse_install_request(r#"{"pack":"demo"}"#);
        assert_eq!(req.pack_id, "demo");
        assert!(req.activate); // default true when omitted

        let resp = run_announcer_install(&req);
        assert_eq!(resp["ok"], true);
        assert_eq!(resp["activated"], true);
    }

    #[test]
    fn install_activate_false_returns_counts_without_writing_active_pack() {
        let root = install_temp_root("no-activate");
        crate::voice_api::set_test_voice_root(Some(root.clone()));
        let _guard = InstallRootGuard(root.clone());

        install_write_pack(
            &root,
            "demo",
            r#"{"kill":{"text":"","thai":"","banner":"","bannerAsset":"","clips":["clips/kill_01.wav"]}}"#,
        );
        std::fs::write(root.join("packs/demo/clips/kill_01.wav"), b"x").unwrap();

        let resp = run_announcer_install(&InstallRequest {
            pack_id: "demo".into(),
            activate: false,
        });
        assert_eq!(resp["ok"], true);
        assert_eq!(resp["activated"], false);
        assert_eq!(resp["counts"]["kill"], 1);
        assert!(!root.join("active-pack.txt").is_file());
    }

    #[test]
    fn install_unknown_pack_id_is_not_activated_and_leaves_active_pack_untouched() {
        let root = install_temp_root("unknown");
        crate::voice_api::set_test_voice_root(Some(root.clone()));
        let _guard = InstallRootGuard(root.clone());

        std::fs::write(root.join("active-pack.txt"), "previous").unwrap();

        let resp = run_announcer_install(&InstallRequest {
            pack_id: "does-not-exist".into(),
            activate: true,
        });
        assert_eq!(resp["ok"], false);

        let active = std::fs::read_to_string(root.join("active-pack.txt")).unwrap();
        assert_eq!(active.trim(), "previous");
    }

    #[test]
    fn install_missing_pack_id_in_body_is_rejected() {
        let resp = run_announcer_install(&parse_install_request("{}"));
        assert_eq!(resp["ok"], false);
    }

    // --- POST /overlay/layout (`parse_overlay_layout_sync`) ---------------

    fn valid_overlay_layout_payload() -> Value {
        let ids = [
            "alert",
            "gmeter",
            "toast",
            "companion",
            "advice",
            "buyback",
            "missing",
            "banner",
            "lowhp",
            "vol",
            "standby",
            "clock",
            "kda",
            "gold",
            "gpm",
            "xpm",
            "nw",
            "score",
            "hero",
        ];
        let layout = ids
            .into_iter()
            .map(|id| {
                (
                    id.to_string(),
                    serde_json::json!({ "x": 50.0, "y": 25.0, "scale": 1.0, "enabled": true }),
                )
            })
            .collect::<serde_json::Map<_, _>>();
        serde_json::json!({ "schemaVersion": 1, "layout": layout })
    }

    #[test]
    fn overlay_layout_sync_accepts_complete_bounded_v1_payload() {
        let parsed =
            parse_overlay_layout_sync(&valid_overlay_layout_payload().to_string()).unwrap();
        assert_eq!(parsed["schemaVersion"], 1);
        assert_eq!(parsed["layout"]["banner"]["scale"], 1.0);
    }

    #[test]
    fn overlay_layout_sync_plan_preserves_settings_and_emits_both_contract_payloads() {
        let payload = valid_overlay_layout_payload();
        let plan = prepare_overlay_layout_sync(
            Some(r#"{"voiceVolume":0.7,"layout":{"banner":{"x":1}}}"#),
            &payload.to_string(),
        )
        .unwrap();
        assert_eq!(plan.settings["voiceVolume"], 0.7);
        assert_eq!(plan.settings["layout"], payload["layout"]);
        assert_eq!(plan.layout, payload["layout"]);
        assert_eq!(SETTINGS_EVENT, "settings");
        assert_eq!(OVERLAY_LAYOUT_SYNC_EVENT, "overlay-layout-sync");
    }

    #[test]
    fn overlay_layout_sync_rejects_invalid_json_and_schema_without_preparing_a_plan() {
        assert!(prepare_overlay_layout_sync(None, "not-json").is_err());

        let mut payload = valid_overlay_layout_payload();
        payload["schemaVersion"] = serde_json::json!(2);
        assert!(prepare_overlay_layout_sync(None, &payload.to_string()).is_err());

        let mut payload = valid_overlay_layout_payload();
        payload["layout"]["banner"]["enabled"] = serde_json::json!("yes");
        assert!(prepare_overlay_layout_sync(None, &payload.to_string()).is_err());
    }

    #[test]
    fn overlay_layout_sync_rejects_unknown_or_partial_modules() {
        let mut payload = valid_overlay_layout_payload();
        payload["layout"].as_object_mut().unwrap().remove("hero");
        assert!(parse_overlay_layout_sync(&payload.to_string()).is_err());

        let mut payload = valid_overlay_layout_payload();
        payload["layout"].as_object_mut().unwrap().insert(
            "unknown".into(),
            serde_json::json!({ "x": 50.0, "y": 25.0, "scale": 1.0, "enabled": true }),
        );
        assert!(parse_overlay_layout_sync(&payload.to_string()).is_err());
    }

    #[test]
    fn overlay_layout_sync_rejects_out_of_range_geometry() {
        let mut payload = valid_overlay_layout_payload();
        payload["layout"]["banner"]["scale"] = serde_json::json!(1.7);
        assert!(prepare_overlay_layout_sync(None, &payload.to_string()).is_err());

        let mut payload = valid_overlay_layout_payload();
        payload["layout"]["banner"]["x"] = serde_json::json!(-0.1);
        assert!(prepare_overlay_layout_sync(None, &payload.to_string()).is_err());

        let mut payload = valid_overlay_layout_payload();
        payload["layout"]["banner"]["y"] = serde_json::json!(100.1);
        assert!(prepare_overlay_layout_sync(None, &payload.to_string()).is_err());
    }
}
