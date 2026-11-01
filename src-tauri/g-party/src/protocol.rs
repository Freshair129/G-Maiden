use serde::{Deserialize, Serialize};

fn required_nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}

pub const FRESH_MS: u64 = 2_000;
pub const SOURCE_RETENTION_MS: u64 = 10_000;
pub const MEMBER_IDLE_MS: u64 = 30_000;
pub const ROOM_LIFETIME_MS: u64 = 4 * 60 * 60 * 1_000;
pub const MAX_RESPONSE_BYTES: usize = 32 * 1_024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stats {
    pub hero: String,
    pub level: u8,
    pub hp: u32,
    pub max_hp: u32,
    pub mana_percent: u8,
    pub alive: bool,
    pub respawn_seconds: u16,
}

impl Stats {
    pub(crate) fn valid(&self) -> bool {
        valid_hero(&self.hero)
            && (1..=30).contains(&self.level)
            && (1..=100_000).contains(&self.max_hp)
            && self.hp <= self.max_hp
            && self.mana_percent <= 100
            && self.respawn_seconds <= 600
    }
}

pub(crate) fn valid_hero(hero: &str) -> bool {
    hero.strip_prefix("npc_dota_hero_").is_some_and(|suffix| {
        !suffix.is_empty()
            && suffix.len() <= 100
            && suffix
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemberState {
    Live,
    Stale,
    Waiting,
    DifferentMatch,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemberView {
    pub member_id: String,
    pub display_name: String,
    pub is_owner: bool,
    pub state: MemberState,
    #[serde(deserialize_with = "required_nullable")]
    pub age_ms: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub sample: Option<Stats>,
}

impl MemberView {
    pub fn age_by(&mut self, elapsed_ms: u64) {
        if let Some(age) = self.age_ms.as_mut() {
            *age = age.saturating_add(elapsed_ms);
            if *age > FRESH_MS {
                self.withhold();
            }
        } else if self.state == MemberState::Live {
            self.withhold();
        }
    }

    pub(crate) fn withhold(&mut self) {
        self.sample = None;
        if self.state == MemberState::Live {
            self.state = MemberState::Stale;
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PartyStatus {
    Idle,
    Connecting,
    Connected,
    Reconnecting,
    Closed,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartyView {
    pub status: PartyStatus,
    pub room_id: Option<String>,
    pub self_id: Option<String>,
    pub owner_id: Option<String>,
    pub invite: Option<String>,
    pub expires_in_ms: Option<u64>,
    pub error: Option<String>,
    pub members: Vec<MemberView>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Membership {
    pub room_id: String,
    pub member_id: String,
    pub member_token: String,
    pub owner_id: String,
    #[serde(deserialize_with = "required_nullable")]
    pub invite: Option<String>,
    pub expires_in_ms: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RoomSnapshot {
    pub room_id: String,
    pub self_id: String,
    pub owner_id: String,
    pub expires_in_ms: u64,
    pub members: Vec<MemberView>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scope {
    pub match_key: String,
    pub team: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedSample {
    pub hero: String,
    pub level: u8,
    pub hp: u32,
    pub max_hp: u32,
    pub mana_percent: u8,
    pub alive: bool,
    pub respawn_seconds: u16,
    pub source_age_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRequest {
    pub sequence: u64,
    pub scope: Option<Scope>,
    pub sample: Option<SharedSample>,
}

pub fn validate_relay_url(value: &str) -> Result<reqwest::Url, &'static str> {
    let invalid = "invalid_relay_url";
    if value.len() > 2_048
        || value.trim() != value
        || value.chars().any(char::is_control)
        || value.contains('\\')
    {
        return Err(invalid);
    }
    let (_, rest) = value.split_once("://").ok_or(invalid)?;
    let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
    if !path.is_empty() || authority.contains('@') {
        return Err(invalid);
    }
    let url = reqwest::Url::parse(value).map_err(|_| invalid)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(invalid);
    }
    if url.scheme() == "http" {
        let literal = authority == "127.0.0.1"
            || authority.starts_with("127.0.0.1:")
            || authority == "[::1]"
            || authority.starts_with("[::1]:");
        if !literal {
            return Err(invalid);
        }
    }
    Ok(url)
}

pub(crate) fn valid_hex(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn valid_invite(invite: &str) -> bool {
    let parts: Vec<_> = invite.split('.').collect();
    parts.len() == 3 && parts[0] == "GMP1" && valid_hex(parts[1], 32) && valid_hex(parts[2], 64)
}

pub fn display_name(value: &str) -> Result<String, &'static str> {
    if value.chars().any(char::is_control) {
        return Err("invalid_display_name");
    }
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 32 {
        return Err("invalid_display_name");
    }
    Ok(value.to_owned())
}
