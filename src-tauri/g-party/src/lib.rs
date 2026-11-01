//! Explicit, bounded sharing of a participant's own validated GSI observation.

use serde_json::Value;
mod client;
mod protocol;
pub use client::{ConnectOptions, PartyClient};
pub use protocol::{
    display_name, valid_invite, validate_relay_url, MemberState, MemberView, PartyStatus,
    PartyView, Scope, SharedSample, Stats, SyncRequest, FRESH_MS,
};

#[derive(Clone, PartialEq, Eq)]
pub struct LocalObservation {
    hero: String,
    hp: u32,
    max_hp: u32,
    mana_percent: u8,
    alive: bool,
    respawn_seconds: u16,
    level: u8,
    team: String,
    owner: String,
    match_id: String,
}

impl LocalObservation {
    pub fn scope(&self, room_id: &str) -> Scope {
        let mut input = b"G-Party/v1\0".to_vec();
        input.extend_from_slice(room_id.as_bytes());
        input.push(0);
        input.extend_from_slice(self.match_id.as_bytes());
        let digest = ring::digest::digest(&ring::digest::SHA256, &input);
        Scope {
            match_key: digest.as_ref().iter().map(|b| format!("{b:02x}")).collect(),
            team: self.team.clone(),
        }
    }

    pub fn shared_sample(&self, source_age_ms: u64) -> SharedSample {
        SharedSample {
            hero: self.hero.clone(),
            level: self.level,
            hp: self.hp,
            max_hp: self.max_hp,
            mana_percent: self.mana_percent,
            alive: self.alive,
            respawn_seconds: self.respawn_seconds,
            source_age_ms,
        }
    }
}

pub fn project_local(value: &Value, local_player_verified: bool) -> Option<LocalObservation> {
    if !local_player_verified
        || value.pointer("/provider/appid")?.as_u64()? != 570
        || value.pointer("/player/activity")?.as_str()? != "playing"
        || !matches!(
            value.pointer("/map/game_state")?.as_str()?,
            "DOTA_GAMERULES_STATE_PRE_GAME" | "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS"
        )
    {
        return None;
    }
    let owner = value.pointer("/player/steamid")?.as_str()?;
    if owner.len() != 17 || !owner.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let team = value.pointer("/player/team_name")?.as_str()?;
    if !matches!(team, "radiant" | "dire") {
        return None;
    }
    let match_id = match value.pointer("/map/matchid")? {
        Value::String(id)
            if !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit()) =>
        {
            id.parse::<u64>().ok()?
        }
        Value::Number(id) => id.as_u64()?,
        _ => return None,
    };
    if match_id == 0 {
        return None;
    }
    let hero = value.pointer("/hero/name")?.as_str()?;
    let suffix = hero.strip_prefix("npc_dota_hero_")?;
    if suffix.is_empty()
        || suffix.len() > 100
        || !suffix
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    {
        return None;
    }
    let integer = |field: &str, min, max| {
        value
            .get("hero")?
            .get(field)?
            .as_u64()
            .filter(|n| (min..=max).contains(n))
    };
    let hp = integer("health", 0, 100_000)? as u32;
    let max_hp = integer("max_health", 1, 100_000)? as u32;
    if hp > max_hp {
        return None;
    }
    Some(LocalObservation {
        hero: hero.to_owned(),
        hp,
        max_hp,
        mana_percent: integer("mana_percent", 0, 100)? as u8,
        alive: value.pointer("/hero/alive")?.as_bool()?,
        respawn_seconds: integer("respawn_seconds", 0, 600)? as u16,
        level: integer("level", 1, 30)? as u8,
        team: team.to_owned(),
        owner: owner.to_owned(),
        match_id: match_id.to_string(),
    })
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod transport_tests;
