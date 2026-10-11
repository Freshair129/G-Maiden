//! G-Maiden GSI ingestion (G1.1).
//! Local HTTP server on 127.0.0.1:3000 that receives Dota 2 Game State Integration
//! POSTs, extracts the useful fields, and emits a clean `game-tick` event to the UI.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Html,
    routing::{get, post},
    Router,
};
use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
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
const GSI_STATUS_INTERVAL_MS: u64 = 500;

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

fn lifecycle_for_tick(tick: &GameTick) -> crate::runtime::MatchLifecycle {
    use crate::runtime::MatchLifecycle;
    match tick.game_state.as_str() {
        "DOTA_GAMERULES_STATE_DISCONNECT" => MatchLifecycle::Disconnected,
        "DOTA_GAMERULES_STATE_POST_GAME" => MatchLifecycle::End,
        "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" => MatchLifecycle::Live,
        _ => MatchLifecycle::Draft,
    }
}

fn parse_tick_from_value(v: &Value) -> GameTick {
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

fn parse_match_id(v: &Value) -> Option<String> {
    let value = value_at(v, &["map", "matchid"])?;
    let id = match value {
        Value::Number(number) => number.as_u64()?,
        Value::String(raw)
            if !raw.is_empty() && raw.bytes().all(|byte| byte.is_ascii_digit()) =>
        {
            raw.parse::<u64>().ok()?
        }
        _ => return None,
    };
    (id > 0).then(|| id.to_string())
}

pub fn parse_tick_from_json(body: &str) -> GameTick {
    // The capture/performance harnesses use compact fixed fixtures; production
    // ingestion uses parse_gsi_payload, which validates before extraction. Keep
    // this helper non-panicking for callers outside those harnesses as well.
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    parse_tick_from_value(&v)
}

fn value_at<'a>(v: &'a Value, path: &[&str]) -> Option<&'a Value> {
    path.iter().try_fold(v, |cur, key| cur.get(*key))
}

struct ParsedGsiPayload {
    tick: GameTick,
    match_id: Option<String>,
}

fn parse_gsi_payload_with_identity(body: &str) -> Result<ParsedGsiPayload, GsiPayloadError> {
    let value: Value = serde_json::from_str(body).map_err(|_| GsiPayloadError::InvalidJson)?;
    validate_gsi_payload(&value).map_err(|_| GsiPayloadError::InvalidSchema)?;
    Ok(ParsedGsiPayload {
        tick: parse_tick_from_value(&value),
        match_id: parse_match_id(&value),
    })
}

fn optional_object<'a>(
    v: &'a Value,
    path: &[&str],
) -> Result<Option<&'a serde_json::Map<String, Value>>, &'static str> {
    match value_at(v, path) {
        None => Ok(None),
        Some(Value::Null) => Ok(None),
        Some(Value::Object(value)) => Ok(Some(value)),
        Some(_) => Err("expected object"),
    }
}

fn validate_int(
    v: &Value,
    path: &[&str],
    min: i64,
    max: i64,
    required: bool,
) -> Result<(), &'static str> {
    let Some(value) = value_at(v, path) else {
        return if required {
            Err("missing integer")
        } else {
            Ok(())
        };
    };
    if value.is_null() && !required {
        return Ok(());
    }
    let Some(value) = value.as_i64() else {
        return Err("expected integer");
    };
    if !(min..=max).contains(&value) {
        return Err("integer outside allowed range");
    }
    Ok(())
}

fn validate_bool(v: &Value, path: &[&str], required: bool) -> Result<(), &'static str> {
    match value_at(v, path) {
        None if required => Err("missing boolean"),
        None => Ok(()),
        Some(Value::Null) if !required => Ok(()),
        Some(Value::Bool(_)) => Ok(()),
        Some(_) => Err("expected boolean"),
    }
}

fn validate_string<'a>(
    v: &'a Value,
    path: &[&str],
    required: bool,
    max_len: usize,
) -> Result<Option<&'a str>, &'static str> {
    let Some(value) = value_at(v, path) else {
        return if required {
            Err("missing string")
        } else {
            Ok(None)
        };
    };
    if value.is_null() && !required {
        return Ok(None);
    }
    let Some(value) = value.as_str() else {
        return Err("expected string");
    };
    if value.len() > max_len {
        return Err("string outside allowed range");
    }
    if required && value.is_empty() {
        return Err("string must not be empty");
    }
    Ok(Some(value))
}

fn validate_gsi_payload(v: &Value) -> Result<(), &'static str> {
    let root = v.as_object().ok_or("payload must be an object")?;
    for key in ["provider", "map", "player", "hero", "items", "auth"] {
        if root.contains_key(key) {
            let _ = optional_object(v, &[key])?;
        }
    }

    optional_object(v, &["map"])?.ok_or("missing map object")?;
    let game_state =
        validate_string(v, &["map", "game_state"], true, 96)?.ok_or("missing game state")?;
    const KNOWN_GAME_STATES: &[&str] = &[
        "DOTA_GAMERULES_STATE_INIT",
        "DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD",
        "DOTA_GAMERULES_STATE_HERO_SELECTION",
        "DOTA_GAMERULES_STATE_STRATEGY_TIME",
        "DOTA_GAMERULES_STATE_PRE_GAME",
        "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
        "DOTA_GAMERULES_STATE_POST_GAME",
        "DOTA_GAMERULES_STATE_DISCONNECT",
        "DOTA_GAMERULES_STATE_TEAM_SHOWCASE",
        "DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD",
        "DOTA_GAMERULES_STATE_CUSTOM_GAME_SETUP",
        "DOTA_GAMERULES_STATE_SCENARIO_SETUP",
        "DOTA_GAMERULES_STATE_PLAYER_DRAFT",
    ];
    if !KNOWN_GAME_STATES.contains(&game_state) {
        return Err("unknown game state");
    }

    // These sections are present in the configured GSI feed when available.
    // Validate present values even in menus so wrong types never become zeros.
    if let Some(provider) = optional_object(v, &["provider"])? {
        let _ = validate_string(v, &["provider", "name"], false, 128)?;
        validate_int(v, &["provider", "appid"], 0, i64::MAX, false)?;
        if let Some(appid) = provider.get("appid").and_then(Value::as_i64) {
            if appid != 570 {
                return Err("provider is not Dota 2");
            }
        }
        validate_int(v, &["provider", "version"], 0, i64::MAX, false)?;
        validate_int(v, &["provider", "timestamp"], 0, i64::MAX, false)?;
        let _ = validate_string(v, &["provider", "steamid"], false, 32)?;
    }
    if optional_object(v, &["auth"])?.is_some() {
        let _ = validate_string(v, &["auth", "token"], false, 256)?;
    }
    // GSI may include change metadata beside its current snapshot. Validate its
    // envelope, but never merge it into a cached match snapshot here.
    for section in ["added", "previously"] {
        if root.get(section).is_some_and(|value| !value.is_object()) {
            return Err("change metadata must be an object");
        }
    }

    validate_int(v, &["map", "clock_time"], -86_400, 86_400, false)?;
    validate_bool(v, &["map", "daytime"], false)?;
    validate_int(v, &["map", "radiant_score"], 0, 1_000, false)?;
    validate_int(v, &["map", "dire_score"], 0, 1_000, false)?;

    let has_player = optional_object(v, &["player"])?.is_some();
    if has_player {
        let _ = validate_string(v, &["player", "team_name"], false, 32)?;
        let _ = validate_string(v, &["player", "steamid"], false, 32)?;
        for (field, max) in [
            ("gold", 1_000_000),
            ("net_worth", 10_000_000),
            ("gpm", 100_000),
            ("xpm", 100_000),
            ("kills", 100_000),
            ("deaths", 100_000),
            ("assists", 100_000),
            ("last_hits", 100_000),
            ("denies", 100_000),
        ] {
            validate_int(v, &["player", field], 0, max, false)?;
        }
    }

    if let Some(hero) = optional_object(v, &["hero"])? {
        let name = validate_string(v, &["hero", "name"], false, 128)?;
        if name.is_some_and(|name| !name.is_empty() && !name.starts_with("npc_dota_hero_")) {
            return Err("invalid hero name");
        }
        validate_int(v, &["hero", "level"], 0, 30, false)?;
        validate_bool(v, &["hero", "alive"], false)?;
        validate_int(v, &["hero", "health_percent"], 0, 100, false)?;
        validate_int(v, &["hero", "mana_percent"], 0, 100, false)?;
        validate_int(v, &["hero", "health"], 0, 100_000, false)?;
        validate_int(v, &["hero", "max_health"], 0, 100_000, false)?;
        validate_int(v, &["hero", "buyback_cost"], 0, i64::MAX, false)?;
        validate_int(v, &["hero", "respawn_seconds"], 0, i64::MAX, false)?;
        if let Some(kill_list) = hero.get("kill_list").filter(|value| !value.is_null()) {
            let entries = kill_list.as_object().ok_or("kill list must be an object")?;
            for entry in entries.values() {
                let victimid = entry
                    .get("victimid")
                    .and_then(Value::as_i64)
                    .ok_or("victim slot must be an integer")?;
                if !(0..=9).contains(&victimid) {
                    return Err("victim slot outside allowed range");
                }
            }
        }
    }

    if let Some(items) = optional_object(v, &["items"])? {
        for item in items.values() {
            if item.is_null() {
                continue;
            }
            let item = item.as_object().ok_or("item slot must be an object")?;
            if let Some(name) = item.get("name").filter(|value| !value.is_null()) {
                if name.as_str().is_none_or(|name| name.len() > 256) {
                    return Err("item name must be a string");
                }
            }
        }
    }

    if is_in_game(game_state) {
        for (field, min, max) in [
            ("clock_time", -86_400, 86_400),
            ("radiant_score", 0, 1_000),
            ("dire_score", 0, 1_000),
        ] {
            validate_int(v, &["map", field], min, max, true)?;
        }
        validate_bool(v, &["map", "daytime"], true)?;

        if !has_player {
            return Err("active match missing player object");
        }
        let team = validate_string(v, &["player", "team_name"], true, 32)?
            .ok_or("active match missing team")?;
        if !team.eq_ignore_ascii_case("radiant") && !team.eq_ignore_ascii_case("dire") {
            return Err("active match team must be radiant or dire");
        }
        for (field, max) in [
            ("gold", 1_000_000),
            ("net_worth", 10_000_000),
            ("gpm", 100_000),
            ("xpm", 100_000),
            ("kills", 100_000),
            ("deaths", 100_000),
            ("assists", 100_000),
            ("last_hits", 100_000),
            ("denies", 100_000),
        ] {
            validate_int(v, &["player", field], 0, max, true)?;
        }

        let _ = optional_object(v, &["hero"])?.ok_or("active match missing hero object")?;
        let name = validate_string(v, &["hero", "name"], true, 128)?
            .ok_or("active match missing hero name")?;
        if !name.starts_with("npc_dota_hero_") || name.len() <= "npc_dota_hero_".len() {
            return Err("active match hero name is invalid");
        }
        validate_int(v, &["hero", "level"], 1, 30, true)?;
        validate_bool(v, &["hero", "alive"], true)?;
        validate_int(v, &["hero", "health_percent"], 0, 100, true)?;
        validate_int(v, &["hero", "mana_percent"], 0, 100, true)?;
        let health = value_at(v, &["hero", "health"])
            .and_then(Value::as_i64)
            .filter(|value| (0..=100_000).contains(value))
            .ok_or("active match health is missing or invalid")?;
        let max_health = value_at(v, &["hero", "max_health"])
            .and_then(Value::as_i64)
            .filter(|value| (1..=100_000).contains(value))
            .ok_or("active match max health is missing or invalid")?;
        if health > max_health {
            return Err("hero health exceeds max health");
        }
        validate_int(v, &["hero", "buyback_cost"], 0, i64::MAX, true)?;
        validate_int(v, &["hero", "respawn_seconds"], 0, i64::MAX, true)?;
        optional_object(v, &["items"])?.ok_or("active match missing items object")?;
    }

    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
enum GsiPayloadError {
    InvalidJson,
    InvalidSchema,
}

#[cfg_attr(not(test), allow(dead_code))]
fn parse_gsi_payload(body: &str) -> Result<GameTick, GsiPayloadError> {
    parse_gsi_payload_with_identity(body).map(|parsed| parsed.tick)
}

async fn handle(State(app): State<AppHandle>, body: String) -> (StatusCode, &'static str) {
    if !crate::runtime::gmad_entitled() {
        return (StatusCode::OK, "locked");
    }
    let ParsedGsiPayload { tick, match_id } = match parse_gsi_payload_with_identity(&body) {
        Ok(parsed) => parsed,
        Err(GsiPayloadError::InvalidJson) => {
            return (StatusCode::BAD_REQUEST, "invalid JSON");
        }
        Err(GsiPayloadError::InvalidSchema) => {
            return (StatusCode::UNPROCESSABLE_ENTITY, "invalid GSI payload");
        }
    };
    // Note the POST (watchdog uses recency) and gate the CV pipeline to live
    // matches (saves idle CPU).
    crate::runtime::mark_post(epoch_ms());
    let session = crate::runtime::observe_match_tick(
        lifecycle_for_tick(&tick),
        match_id,
        tick.clock_time,
        tick.in_game,
    );
    crate::runtime::set_in_draft(is_in_draft(&tick.game_state));
    crate::runtime::set_player_team_name(&tick.team_name);
    // Announcer: detect kill/streak/state events from the tick and voice the
    // most significant one (clip-or-silent — these aren't TTS-faked).
    let announce = crate::announcer::most_important(&crate::announcer::observe_for_session(
        &tick, &session,
    ));
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
    crate::log::note_tick(&tick, &session);
    // Publish freshness before the tick so every UI consumer can gate its own-
    // state decisions against the same validated observation. Reuse the cached
    // display-mode sample; the 500ms/process watchdogs refresh that separately.
    emit_observation_status(&app);
    let _ = app.emit(
        "game-tick",
        GameTickEvent {
            tick: &tick,
            session: &session,
        },
    );
    // CR-007 WP-4: the announcer (kill/streak/death lines) is a separate,
    // non-critical path from G-Signal — `runtime::signal_enabled()` gates
    // capture.rs's gank/danger/revision voice_interrupt() calls, which never
    // pass through here. Muting the announcer must never touch that path.
    if let Some(ev) = announce {
        if crate::runtime::announcer_enabled()
            && crate::runtime::is_current_active_session_epoch(session.session_epoch)
        {
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
                crate::utterance::emit_for_session(
                    &app,
                    crate::utterance::UtterancePayload::new_for_session(
                        "announcer",
                        "line",
                        ev.clone(),
                        None,
                        crate::voice_api::active_pack_name(),
                        &session,
                    ),
                );
            }
            let mut banner = crate::voice_api::fired_banner(&ev);
            banner.clip = clip.map(|p| p.to_string_lossy().into_owned());
            if crate::runtime::is_current_active_session_epoch(session.session_epoch) {
                let event = crate::runtime::MatchSessionEvent::new(banner, &session);
                let _ = app.emit("announcer-banner", event);
            }
        }
    }
    (StatusCode::OK, "ok")
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
#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum GsiServerState {
    Starting = 0,
    Listening = 1,
    PortConflict = 2,
    BindError = 3,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum GsiFreshness {
    Unavailable,
    Waiting,
    Fresh,
    Stale,
}

fn freshness_at(
    dota_running: bool,
    listener_ready: bool,
    last_post_ms: u64,
    now_ms: u64,
) -> GsiFreshness {
    if !dota_running || !listener_ready {
        GsiFreshness::Unavailable
    } else if last_post_ms == 0 {
        GsiFreshness::Waiting
    } else if crate::runtime::gsi_is_fresh_at(last_post_ms, now_ms) {
        GsiFreshness::Fresh
    } else {
        GsiFreshness::Stale
    }
}

static GSI_SERVER_STATE: AtomicU8 = AtomicU8::new(GsiServerState::Starting as u8);
static DOTA_PROCESS_RUNNING: AtomicBool = AtomicBool::new(false);
static DISPLAY_EXCLUSIVE_ACTIVE: AtomicBool = AtomicBool::new(false);

fn server_state() -> GsiServerState {
    match GSI_SERVER_STATE.load(Ordering::Relaxed) {
        1 => GsiServerState::Listening,
        2 => GsiServerState::PortConflict,
        3 => GsiServerState::BindError,
        _ => GsiServerState::Starting,
    }
}

fn classify_bind_error(error: &std::io::Error) -> GsiServerState {
    if error.kind() == std::io::ErrorKind::AddrInUse {
        GsiServerState::PortConflict
    } else {
        GsiServerState::BindError
    }
}

fn set_server_state(app: &AppHandle, state: GsiServerState) {
    GSI_SERVER_STATE.store(state as u8, Ordering::Relaxed);
    emit_status(app, DOTA_PROCESS_RUNNING.load(Ordering::Relaxed));
}

#[derive(Serialize, Clone)]
struct GsiStatus {
    dota_running: bool,
    /// True only while a validated GSI observation is within the accepted 2s age.
    gsi_active: bool,
    gsi_freshness: GsiFreshness,
    /// Age of the last validated GSI POST; absent until the first valid payload.
    gsi_age_ms: Option<u64>,
    in_game: bool,
    match_id: Option<String>,
    session_id: Option<String>,
    session_epoch: u64,
    session_lifecycle: Option<crate::runtime::MatchLifecycle>,
    /// Dota is in *true* Exclusive Fullscreen → overlay + minimap capture can't
    /// work (no DWM) and the desktop may freeze. UI warns the user to switch to
    /// Borderless. False for Borderless / Windowed / Fullscreen-Optimizations.
    display_exclusive: bool,
    server_state: GsiServerState,
}

#[derive(Serialize)]
#[derive(Clone)]
struct GameTickEvent<'a> {
    #[serde(flatten)]
    tick: &'a GameTick,
    #[serde(flatten)]
    session: &'a crate::runtime::MatchSessionSnapshot,
}

fn emit_status(app: &AppHandle, running: bool) {
    let was_running = DOTA_PROCESS_RUNNING.swap(running, Ordering::Relaxed);
    if was_running && !running {
        let session = crate::runtime::mark_dota_exited();
        crate::log::force_end(&session);
    }
    let display_exclusive = running && crate::setup::exclusive_fullscreen_active();
    DISPLAY_EXCLUSIVE_ACTIVE.store(display_exclusive, Ordering::Relaxed);
    emit_status_snapshot(app, running, display_exclusive);
}

fn emit_observation_status(app: &AppHandle) {
    DOTA_PROCESS_RUNNING.store(true, Ordering::Relaxed);
    emit_status_snapshot(app, true, DISPLAY_EXCLUSIVE_ACTIVE.load(Ordering::Relaxed));
}

fn emit_freshness_status(app: &AppHandle) {
    emit_status_snapshot(
        app,
        DOTA_PROCESS_RUNNING.load(Ordering::Relaxed),
        DISPLAY_EXCLUSIVE_ACTIVE.load(Ordering::Relaxed),
    );
}

fn emit_status_snapshot(app: &AppHandle, running: bool, display_exclusive: bool) {
    let now_ms = epoch_ms();
    let last = crate::runtime::last_post_ms();
    let server_state = server_state();
    let gsi_age_ms = (last != 0).then(|| now_ms.saturating_sub(last));
    let gsi_freshness = freshness_at(
        running,
        matches!(server_state, GsiServerState::Listening),
        last,
        now_ms,
    );
    let gsi_active = gsi_freshness == GsiFreshness::Fresh;
    let session = crate::runtime::observe_gsi_status(running, gsi_active);
    crate::log::note_session_status(&session);
    let _ = app.emit(
        "gsi-status",
        GsiStatus {
            dota_running: running,
            gsi_active,
            gsi_freshness,
            gsi_age_ms,
            in_game: crate::runtime::in_game(),
            match_id: session.match_id,
            session_id: session.session_id,
            session_epoch: session.session_epoch,
            session_lifecycle: session.session_lifecycle,
            display_exclusive,
            server_state,
        },
    );
}

/// Watchdog: every few seconds, check whether Dota is still running. When it
/// isn't, reset in-game state and close the G-Log (otherwise both stay stuck
/// "live" forever). Always pushes a `gsi-status` event so the UI reflects
/// reality. Spawned alongside the server.
async fn watchdog(app: AppHandle) {
    loop {
        let running = crate::setup::dota_running();
        emit_status(&app, running);
        tokio::time::sleep(std::time::Duration::from_secs(4)).await;
    }
}

/// Publish source freshness at the contract cadence without polling the Dota
/// process every 500ms. The separate process watchdog remains at four seconds.
async fn freshness_watchdog(app: AppHandle) {
    loop {
        emit_freshness_status(&app);
        tokio::time::sleep(std::time::Duration::from_millis(GSI_STATUS_INTERVAL_MS)).await;
    }
}

/// Bind :3000 and serve GSI. Retries after a bind conflict so closing the
/// competing process is enough to recover without restarting G-Maiden.
pub async fn serve(app: AppHandle) {
    tauri::async_runtime::spawn(watchdog(app.clone()));
    tauri::async_runtime::spawn(freshness_watchdog(app.clone()));
    let router = Router::new()
        .route("/gsi", post(handle))
        .route("/announcer/install", post(announcer_install))
        .route("/overlay/layout", post(overlay_layout_sync))
        .route("/telemetry", post(telemetry_ingest))
        .route("/auth/callback", get(oauth_callback))
        .with_state(app.clone());
    loop {
        match tokio::net::TcpListener::bind("127.0.0.1:3000").await {
            Ok(listener) => {
                eprintln!("[G-Maiden] GSI server listening on http://127.0.0.1:3000/gsi");
                set_server_state(&app, GsiServerState::Listening);
                if let Err(error) = axum::serve(listener, router.clone()).await {
                    eprintln!("[G-Maiden] GSI server error: {error}");
                    set_server_state(&app, GsiServerState::BindError);
                } else {
                    break;
                }
            }
            Err(error) => {
                let state = classify_bind_error(&error);
                if matches!(state, GsiServerState::PortConflict) {
                    eprintln!("[G-Maiden] GSI port 3000 is occupied; close the other listener to restore GSI and OAuth.");
                } else {
                    eprintln!("[G-Maiden] could not bind GSI port 3000: {error}");
                }
                set_server_state(&app, state);
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_port_conflicts_separately_from_other_bind_errors() {
        assert!(matches!(
            classify_bind_error(&std::io::Error::from(std::io::ErrorKind::AddrInUse)),
            GsiServerState::PortConflict
        ));
        assert!(matches!(
            classify_bind_error(&std::io::Error::from(std::io::ErrorKind::PermissionDenied)),
            GsiServerState::BindError
        ));
        assert_eq!(
            serde_json::to_string(&GsiServerState::PortConflict).unwrap(),
            "\"port_conflict\""
        );
    }

    #[test]
    fn freshness_status_distinguishes_waiting_fresh_stale_and_unavailable() {
        assert_eq!(freshness_at(false, true, 1_000, 1_500), GsiFreshness::Unavailable);
        assert_eq!(freshness_at(true, false, 1_000, 1_500), GsiFreshness::Unavailable);
        assert_eq!(freshness_at(true, true, 0, 1_500), GsiFreshness::Waiting);
        assert_eq!(freshness_at(true, true, 10_000, 12_000), GsiFreshness::Fresh);
        assert_eq!(freshness_at(true, true, 10_000, 12_001), GsiFreshness::Stale);
    }

    #[test]
    fn stale_feed_while_dota_is_open_is_distinct_from_process_exit() {
        assert_eq!(freshness_at(true, true, 10_000, 12_001), GsiFreshness::Stale);
        assert_eq!(freshness_at(false, true, 10_000, 12_001), GsiFreshness::Unavailable);
    }

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

    fn live_payload() -> Value {
        serde_json::json!({
            "provider": { "name": "Dota 2", "appid": 570, "version": 1, "timestamp": 123456 },
            "map": { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
                     "clock_time": 612, "daytime": true,
                     "radiant_score": 14, "dire_score": 9 },
            "player": { "steamid": "76561198000000000", "gold": 2300, "net_worth": 14500,
                        "gpm": 520, "xpm": 610, "team_name": "radiant",
                        "kills": 7, "deaths": 2, "assists": 10,
                        "last_hits": 145, "denies": 8 },
            "hero": { "name": "npc_dota_hero_crystal_maiden", "level": 14,
                      "alive": true, "health_percent": 78, "mana_percent": 65,
                      "health": 507, "max_health": 650,
                      "buyback_cost": 0, "respawn_seconds": 0 },
            "items": { "slot0": { "name": "empty" } }
        })
    }

    #[test]
    fn match_id_accepts_positive_decimal_numbers_and_strings() {
        let number = serde_json::json!({ "map": { "matchid": 123456u64 } });
        let string = serde_json::json!({ "map": { "matchid": "00123456" } });
        assert_eq!(parse_match_id(&number).as_deref(), Some("123456"));
        assert_eq!(parse_match_id(&string).as_deref(), Some("123456"));
    }

    #[test]
    fn missing_zero_or_invalid_match_id_falls_back_without_rejecting_gsi() {
        for value in [
            serde_json::json!({}),
            serde_json::json!({ "map": { "matchid": 0 } }),
            serde_json::json!({ "map": { "matchid": -1 } }),
            serde_json::json!({ "map": { "matchid": 1.5 } }),
            serde_json::json!({ "map": { "matchid": "12x" } }),
            serde_json::json!({ "map": { "matchid": "+12" } }),
        ] {
            assert_eq!(parse_match_id(&value), None);
        }

        let mut payload = live_payload();
        payload["map"]["matchid"] = serde_json::json!("bad-id");
        let parsed = parse_gsi_payload_with_identity(&payload.to_string())
            .expect("an invalid optional id must not reject an otherwise valid GSI tick");
        assert_eq!(parsed.match_id, None);
    }

    #[test]
    fn lifecycle_maps_only_game_in_progress_to_live() {
        let mut tick = run_handle(live_payload());
        assert_eq!(lifecycle_for_tick(&tick), crate::runtime::MatchLifecycle::Live);
        tick.game_state = "DOTA_GAMERULES_STATE_PRE_GAME".into();
        assert_eq!(lifecycle_for_tick(&tick), crate::runtime::MatchLifecycle::Draft);
        tick.game_state = "DOTA_GAMERULES_STATE_DISCONNECT".into();
        assert_eq!(lifecycle_for_tick(&tick), crate::runtime::MatchLifecycle::Disconnected);
        tick.game_state = "DOTA_GAMERULES_STATE_POST_GAME".into();
        assert_eq!(lifecycle_for_tick(&tick), crate::runtime::MatchLifecycle::End);
    }

    fn run_handle(payload: Value) -> GameTick {
        validate_gsi_payload(&payload).expect("test payload must satisfy the GSI schema");
        parse_tick_from_value(&payload)
    }

    #[test]
    fn cold_and_lobby_states_allow_empty_player_and_hero_sections() {
        for game_state in [
            "DOTA_GAMERULES_STATE_INIT",
            "DOTA_GAMERULES_STATE_HERO_SELECTION",
            "DOTA_GAMERULES_STATE_STRATEGY_TIME",
            "DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD",
            "DOTA_GAMERULES_STATE_POST_GAME",
            "DOTA_GAMERULES_STATE_DISCONNECT",
        ] {
            let payload = serde_json::json!({ "map": { "game_state": game_state } });
            let tick = parse_gsi_payload(&payload.to_string()).unwrap();
            assert!(!tick.in_game);
            assert!(tick.hero.is_empty());
            assert_eq!(tick.clock_time, 0);
        }

        let payload = serde_json::json!({
            "map": { "game_state": "DOTA_GAMERULES_STATE_HERO_SELECTION" },
            "player": null,
            "hero": { "name": "", "level": 0 },
            "items": null
        });
        let tick = parse_gsi_payload(&payload.to_string()).unwrap();
        assert!(tick.hero.is_empty());
    }

    #[test]
    fn malformed_json_null_and_wrong_envelopes_are_rejected() {
        assert!(matches!(
            parse_gsi_payload("{\"map\":"),
            Err(GsiPayloadError::InvalidJson)
        ));
        assert!(matches!(
            parse_gsi_payload("null"),
            Err(GsiPayloadError::InvalidSchema)
        ));
        assert!(validate_gsi_payload(&serde_json::json!([])).is_err());
        assert!(validate_gsi_payload(&serde_json::json!({ "map": null })).is_err());
        assert!(validate_gsi_payload(&serde_json::json!({ "map": { "game_state": 5 } })).is_err());
    }

    #[test]
    fn benchmark_json_helper_keeps_legacy_non_panicking_fallback() {
        let tick = parse_tick_from_json("{\"map\":");
        assert!(!tick.in_game);
        assert!(tick.hero.is_empty());
    }

    #[test]
    fn active_match_requires_the_fields_used_to_build_a_live_tick() {
        let mut missing_player_stat = live_payload();
        missing_player_stat["player"]
            .as_object_mut()
            .unwrap()
            .remove("kills");
        assert!(validate_gsi_payload(&missing_player_stat).is_err());

        let mut missing_hero = live_payload();
        missing_hero.as_object_mut().unwrap().remove("hero");
        assert!(validate_gsi_payload(&missing_hero).is_err());

        let mut missing_items = live_payload();
        missing_items.as_object_mut().unwrap().remove("items");
        assert!(validate_gsi_payload(&missing_items).is_err());
    }

    #[test]
    fn wrong_types_ranges_and_unknown_states_are_rejected() {
        let mut wrong_type = live_payload();
        wrong_type["hero"]["alive"] = serde_json::json!("false");
        assert!(validate_gsi_payload(&wrong_type).is_err());

        let mut out_of_range = live_payload();
        out_of_range["hero"]["health_percent"] = serde_json::json!(101);
        assert!(validate_gsi_payload(&out_of_range).is_err());

        let mut negative_buyback = live_payload();
        negative_buyback["hero"]["buyback_cost"] = serde_json::json!(-1);
        assert!(validate_gsi_payload(&negative_buyback).is_err());

        let mut negative_respawn = live_payload();
        negative_respawn["hero"]["respawn_seconds"] = serde_json::json!(-1);
        assert!(validate_gsi_payload(&negative_respawn).is_err());

        let mut fractional = live_payload();
        fractional["player"]["kills"] = serde_json::json!(7.5);
        assert!(validate_gsi_payload(&fractional).is_err());

        let mut unknown = live_payload();
        unknown["map"]["game_state"] = serde_json::json!("DOTA_GAMERULES_STATE_FUTURE");
        assert!(validate_gsi_payload(&unknown).is_err());

        let mut wrong_provider = live_payload();
        wrong_provider["provider"]["appid"] = serde_json::json!(730);
        assert!(validate_gsi_payload(&wrong_provider).is_err());

        let mut wrong_item = live_payload();
        wrong_item["items"]["slot0"]["name"] = serde_json::json!(false);
        assert!(validate_gsi_payload(&wrong_item).is_err());
    }

    #[test]
    fn full_snapshots_with_change_metadata_are_valid_but_partial_live_deltas_are_not() {
        let mut snapshot = live_payload();
        snapshot["previously"] = serde_json::json!({ "player": { "kills": 6 } });
        snapshot["added"] = serde_json::json!({ "hero": { "alive": true } });
        assert!(validate_gsi_payload(&snapshot).is_ok());

        let partial_delta = serde_json::json!({
            "map": { "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS", "clock_time": 613 },
            "previously": { "map": { "clock_time": 612 } },
            "added": {}
        });
        assert!(validate_gsi_payload(&partial_delta).is_err());
        assert!(matches!(
            parse_gsi_payload(&partial_delta.to_string()),
            Err(GsiPayloadError::InvalidSchema)
        ));
    }

    #[test]
    fn happy_path_in_match() {
        let t = run_handle(live_payload());
        assert!(t.in_game);
        assert_eq!(t.clock_time, 612);
        assert_eq!(t.hero, "npc_dota_hero_crystal_maiden");
        assert_eq!(t.team_name, "radiant");
        assert_eq!(t.kills, 7);
        assert_eq!(t.hp_percent, 78);
        // abs HP/max HP (feature-map #6 groundwork) parse alongside the percentage
        assert_eq!(t.hp, 507);
        assert_eq!(t.max_hp, 650);

        let mut pre_game = live_payload();
        pre_game["map"]["game_state"] = serde_json::json!("DOTA_GAMERULES_STATE_PRE_GAME");
        assert!(run_handle(pre_game).in_game);
    }

    #[test]
    fn net_worth_derived_when_gsi_omits_it() {
        // Player-mode GSI sends net_worth=0; the overlay used to show "—". With
        // the derivation path, gold + Σ item costs lands a real number.
        let mut payload = live_payload();
        payload["player"]["gold"] = serde_json::json!(1500);
        payload["player"]["net_worth"] = serde_json::json!(0);
        payload["items"] = serde_json::json!({
            "slot0": { "name": "item_blink" },
            "slot1": { "name": "item_black_king_bar" },
            "slot2": { "name": "empty" },
            "slot3": { "name": "item_tpscroll" }
        });
        let t = run_handle(payload);
        assert_eq!(t.gold, 1500);
        assert_eq!(t.net_worth, 1500 + 2250 + 4050 + 100);
    }

    #[test]
    fn net_worth_passthrough_when_gsi_sends_real_value() {
        // Spectator clients populate net_worth — trust it (more accurate than
        // our cost-snapshot which lags patches).
        let mut payload = live_payload();
        payload["player"]["gold"] = serde_json::json!(1500);
        payload["player"]["net_worth"] = serde_json::json!(19999);
        payload["items"] = serde_json::json!({ "slot0": { "name": "item_blink" } });
        let t = run_handle(payload);
        assert_eq!(t.net_worth, 19999);
    }

    #[test]
    fn parses_buyback_and_respawn_when_dead() {
        // When the hero is dead, GSI exposes buyback_cost + respawn_seconds.
        let mut payload = live_payload();
        payload["hero"]["level"] = serde_json::json!(16);
        payload["hero"]["alive"] = serde_json::json!(false);
        payload["hero"]["buyback_cost"] = serde_json::json!(1500);
        payload["hero"]["respawn_seconds"] = serde_json::json!(30);
        let t = run_handle(payload);
        assert!(!t.alive);
        assert_eq!(t.buyback_cost, 1500);
        assert_eq!(t.respawn_seconds, 30);
    }

    #[test]
    fn enemy_deaths_read_the_local_teams_score() {
        // Dota's GSI counts kills BY a team, so the LOCAL team's score is the
        // enemy death count. Getting this backwards would discount threats
        // every time WE died — the exact inversion of the fix.
        let mut payload = live_payload();
        payload["hero"]["name"] = serde_json::json!("npc_dota_hero_lina");
        let mut t = run_handle(payload);
        assert_eq!(
            enemy_deaths_from_score(&t),
            Some(14),
            "radiant player kills dire"
        );

        t.team_name = "dire".into();
        assert_eq!(
            enemy_deaths_from_score(&t),
            Some(9),
            "dire player kills radiant"
        );

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
        let mut payload = live_payload();
        payload["player"]["kills"] = serde_json::json!(3);
        payload["hero"]["kill_list"] = serde_json::json!({
            "0": { "victimid": 5 },
            "1": { "victimid": 2 },
            "2": { "victimid": 7 }
        });
        let t = run_handle(payload);
        assert_eq!(t.kill_list_len, 3);
        assert_eq!(t.last_victim_slot, 7);
    }

    #[test]
    fn kill_list_empty() {
        let mut payload = live_payload();
        payload["hero"]["name"] = serde_json::json!("npc_dota_hero_invoker");
        payload["hero"]["kill_list"] = serde_json::json!({});
        let t = run_handle(payload);
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
            // These tests write manifest.json/active-pack.txt directly (see
            // install_write_pack), bypassing write_manifest/write_active_pack_id
            // — but `run_announcer_install`'s activate=true path still calls
            // through `activate_if_exists` -> write_active_pack_id, which DOES
            // populate the resolved-clip cache (audit H8) from this test's
            // scratch root. Must not leak into whatever test lands on this
            // pooled thread next.
            crate::voice_api::clear_resolved_cache_for_test();
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
