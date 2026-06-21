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
    };
    crate::log::note_tick(&tick);
    let _ = app.emit("game-tick", tick);
    "ok"
}

/// Bind :3000 and serve GSI. Spawned as a background task by `main`.
pub async fn serve(app: AppHandle) {
    let router = Router::new().route("/gsi", post(handle)).with_state(app);
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
        // Mirror handle()'s body parsing without the Tauri/axum harness.
        let v = payload;
        let game_state = s(&v, &["map", "game_state"]);
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
}
