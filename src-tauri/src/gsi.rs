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

/// Tight definition of "actually in a match" — we want the overlay/voice/log
/// to engage only when the player is on the map. Excludes hero pick, draft,
/// load screens, the post-game scoreboard, and disconnects.
fn is_in_game(game_state: &str) -> bool {
    matches!(
        game_state,
        "DOTA_GAMERULES_STATE_PRE_GAME" | "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS"
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
        steamid: s(v, &["player", "steamid"]),
        buyback_cost: i(v, &["hero", "buyback_cost"]),
        respawn_seconds: i(v, &["hero", "respawn_seconds"]),
        kill_list_len: kl_len,
        last_victim_slot: last_victim,
    }
}

pub(crate) fn parse_tick_from_json(body: &str) -> GameTick {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    parse_tick_from_value(&v)
}

async fn handle(State(app): State<AppHandle>, body: String) -> &'static str {
    let tick = parse_tick_from_json(&body);
    // Announcer: detect kill/streak/state events from the tick and voice the
    // most significant one (clip-or-silent — these aren't TTS-faked).
    let announce = crate::announcer::most_important(&crate::announcer::observe(&tick));
    // Note the POST (watchdog uses recency) and gate the CV pipeline to live
    // matches (saves idle CPU).
    crate::runtime::mark_post(epoch_ms());
    crate::runtime::set_in_game(tick.in_game);
    crate::runtime::set_player_team_name(&tick.team_name);
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
            crate::audio::play_random(&ev);
            let _ = app.emit("announcer-banner", crate::voice_api::fired_banner(&ev));
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

/// Receive a notify from G-AnnStudio after it installs a pack into voice-cache.
/// The clips are already on disk (audio.rs reads the dir live), so we just
/// confirm by returning the current per-event clip counts.
async fn announcer_install(body: String) -> axum::Json<serde_json::Value> {
    let pack = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v["pack"].as_str().map(String::from))
        .unwrap_or_default();
    let counts = crate::audio::all_counts();
    eprintln!(
        "[G-Maiden] announcer pack installed: {pack} ({} events)",
        counts.len()
    );
    axum::Json(serde_json::json!({ "ok": true, "pack": pack, "counts": counts }))
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
        let _ = app.emit("oauth-callback", code.clone());
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
                        "alive": true, "health_percent": 78, "mana_percent": 65 }
        }));
        assert!(t.in_game);
        assert_eq!(t.clock_time, 612);
        assert_eq!(t.hero, "npc_dota_hero_crystal_maiden");
        assert_eq!(t.team_name, "radiant");
        assert_eq!(t.kills, 7);
        assert_eq!(t.hp_percent, 78);
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
}
