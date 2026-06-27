//! G-Maiden GSI ingestion (G1.1).
//! Local HTTP server on 127.0.0.1:3000 that receives Dota 2 Game State Integration
//! POSTs, extracts the useful fields, and emits a clean `game-tick` event to the UI.

use axum::{extract::State, routing::post, Router};
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
    pub last_hits: i64,
    pub denies: i64,
    pub hero: String,
    pub level: i64,
    pub alive: bool,
    pub hp_percent: i64,
    pub mana_percent: i64,
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
    c.as_i64().or_else(|| c.as_f64().map(|f| f as i64)).unwrap_or(0)
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
            .find_map(|idx| obj.get(&idx.to_string())
                .and_then(|entry| entry["victimid"].as_i64()))
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

async fn handle(State(app): State<AppHandle>, body: String) -> &'static str {
    let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    let game_state = s(&v, &["map", "game_state"]);
    let (kl_len, last_victim) = parse_kill_list(&v);
    let tick = GameTick {
        in_game: is_in_game(&game_state),
        clock_time: i(&v, &["map", "clock_time"]),
        game_state,
        daytime: b(&v, &["map", "daytime"]),
        radiant_score: i(&v, &["map", "radiant_score"]),
        dire_score: i(&v, &["map", "dire_score"]),
        gold: i(&v, &["player", "gold"]),
        net_worth: i(&v, &["player", "net_worth"]),
        gpm: i(&v, &["player", "gpm"]),
        xpm: i(&v, &["player", "xpm"]),
        kills: i(&v, &["player", "kills"]),
        deaths: i(&v, &["player", "deaths"]),
        assists: i(&v, &["player", "assists"]),
        last_hits: i(&v, &["player", "last_hits"]),
        denies: i(&v, &["player", "denies"]),
        hero: s(&v, &["hero", "name"]),
        level: i(&v, &["hero", "level"]),
        alive: b(&v, &["hero", "alive"]),
        hp_percent: i(&v, &["hero", "health_percent"]),
        mana_percent: i(&v, &["hero", "mana_percent"]),
        kill_list_len: kl_len,
        last_victim_slot: last_victim,
    };
    // Announcer: detect kill/streak/state events from the tick and voice the
    // most significant one (clip-or-silent — these aren't TTS-faked).
    let announce = crate::announcer::most_important(&crate::announcer::observe(&tick));
    // Note the POST (watchdog uses recency) and gate the CV pipeline to live
    // matches (saves idle CPU).
    crate::runtime::mark_post(epoch_ms());
    crate::runtime::set_in_game(tick.in_game);
    crate::log::note_tick(&tick);
    let _ = app.emit("game-tick", tick);
    if let Some(ev) = announce {
        crate::audio::play_random(&ev);
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
    eprintln!("[G-Maiden] announcer pack installed: {pack} ({} events)", counts.len());
    axum::Json(serde_json::json!({ "ok": true, "pack": pack, "counts": counts }))
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
        let _ = app.emit(
            "gsi-status",
            GsiStatus { dota_running: running, gsi_active, in_game: crate::runtime::in_game() },
        );
    }
}

/// Bind :3000 and serve GSI. Spawned as a background task by `main`.
pub async fn serve(app: AppHandle) {
    tauri::async_runtime::spawn(watchdog(app.clone()));
    let router = Router::new()
        .route("/gsi", post(handle))
        .route("/announcer/install", post(announcer_install))
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
        let v = payload;
        let game_state = s(&v, &["map", "game_state"]);
        let (kl_len, last_victim) = parse_kill_list(&v);
        GameTick {
            in_game: is_in_game(&game_state),
            clock_time: i(&v, &["map", "clock_time"]),
            game_state,
            daytime: b(&v, &["map", "daytime"]),
            radiant_score: i(&v, &["map", "radiant_score"]),
            dire_score: i(&v, &["map", "dire_score"]),
            gold: i(&v, &["player", "gold"]),
            net_worth: i(&v, &["player", "net_worth"]),
            gpm: i(&v, &["player", "gpm"]),
            xpm: i(&v, &["player", "xpm"]),
            kills: i(&v, &["player", "kills"]),
            deaths: i(&v, &["player", "deaths"]),
            assists: i(&v, &["player", "assists"]),
            last_hits: i(&v, &["player", "last_hits"]),
            denies: i(&v, &["player", "denies"]),
            hero: s(&v, &["hero", "name"]),
            level: i(&v, &["hero", "level"]),
            alive: b(&v, &["hero", "alive"]),
            hp_percent: i(&v, &["hero", "health_percent"]),
            mana_percent: i(&v, &["hero", "mana_percent"]),
            kill_list_len: kl_len,
            last_victim_slot: last_victim,
        }
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
                        "kills": 7, "deaths": 2, "assists": 10,
                        "last_hits": 145, "denies": 8 },
            "hero":   { "name": "npc_dota_hero_crystal_maiden", "level": 14,
                        "alive": true, "health_percent": 78, "mana_percent": 65 }
        }));
        assert!(t.in_game);
        assert_eq!(t.clock_time, 612);
        assert_eq!(t.hero, "npc_dota_hero_crystal_maiden");
        assert_eq!(t.kills, 7);
        assert_eq!(t.hp_percent, 78);
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
