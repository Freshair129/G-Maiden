//! Steam identity resolution (account system, Phase A).
//!
//! Turns whatever the user pastes — a 32-bit account id, a SteamID64, a
//! steamcommunity `/profiles/{id64}` or `/id/{vanity}` URL, or a bare vanity
//! name — into a canonical `{ steamid64, account_id }`. Digit forms resolve
//! offline; vanity names need one network hop (steamcommunity's `?xml=1`
//! endpoint, no API key) and are resolved server-side here because
//! steamcommunity sends no CORS headers the webview could use.

use serde::Serialize;

const STEAMID64_BASE: u64 = 76_561_197_960_265_728;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SteamIdentity {
    pub steamid64: String,
    pub account_id: u32,
}

fn from_steamid64(id64: u64) -> Option<SteamIdentity> {
    if id64 < STEAMID64_BASE {
        return None;
    }
    let acc = id64 - STEAMID64_BASE;
    if acc == 0 || acc > u32::MAX as u64 {
        return None;
    }
    Some(SteamIdentity { steamid64: id64.to_string(), account_id: acc as u32 })
}

fn from_account_id(acc: u32) -> Option<SteamIdentity> {
    if acc == 0 {
        return None;
    }
    Some(SteamIdentity { steamid64: (STEAMID64_BASE + acc as u64).to_string(), account_id: acc })
}

/// Parse a pure-digits identity: `/profiles/{id64}`, a raw 17-digit SteamID64,
/// or a shorter all-digits account id. None if the input isn't digits-based.
fn parse_digits(input: &str) -> Option<SteamIdentity> {
    let s = input.trim();
    let digits: String = if let Some(idx) = s.find("/profiles/") {
        s[idx + 10..].chars().take_while(|c| c.is_ascii_digit()).collect()
    } else if !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()) {
        s.to_string()
    } else {
        return None;
    };
    let n: u64 = digits.parse().ok()?;
    if n >= STEAMID64_BASE {
        from_steamid64(n)
    } else if n <= u32::MAX as u64 {
        from_account_id(n as u32)
    } else {
        None
    }
}

/// Pull the vanity token out of a `/id/{name}` URL or a bare non-digit name.
fn vanity_token(input: &str) -> Option<String> {
    let s = input.trim();
    if let Some(idx) = s.find("/id/") {
        let name = s[idx + 4..].split('/').next().unwrap_or("").trim();
        return if name.is_empty() { None } else { Some(name.to_string()) };
    }
    if !s.is_empty() && !s.contains('/') && !s.chars().all(|c| c.is_ascii_digit()) {
        return Some(s.to_string());
    }
    None
}

/// Extract the digits inside `<tag>...</tag>` (handles CDATA), first match only.
fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let inner = xml[start..end].trim();
    let inner = inner
        .strip_prefix("<![CDATA[")
        .and_then(|s| s.strip_suffix("]]>"))
        .unwrap_or(inner);
    let digits: String = inner.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() { None } else { Some(digits) }
}

async fn resolve_vanity(name: &str) -> Result<SteamIdentity, String> {
    let url = format!("https://steamcommunity.com/id/{name}/?xml=1");
    let body = reqwest::get(&url)
        .await
        .map_err(|e| format!("network: {e}"))?
        .text()
        .await
        .map_err(|e| format!("read: {e}"))?;
    let id64 = extract_tag(&body, "steamID64")
        .ok_or_else(|| "vanity not found or profile private".to_string())?;
    let n: u64 = id64.parse().map_err(|_| "bad steamID64".to_string())?;
    from_steamid64(n).ok_or_else(|| "steamID64 out of range".to_string())
}

/// Resolve any Steam identity input to a canonical `{ steamid64, account_id }`.
#[tauri::command]
pub async fn resolve_steam_id(input: String) -> Result<SteamIdentity, String> {
    if let Some(id) = parse_digits(&input) {
        return Ok(id);
    }
    if let Some(name) = vanity_token(&input) {
        return resolve_vanity(&name).await;
    }
    Err("could not parse a Steam id, profile url, or vanity name".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digit_forms_resolve_offline() {
        assert_eq!(parse_digits("76561198115363193").unwrap().account_id, 155_097_465);
        assert_eq!(parse_digits("155097465").unwrap().steamid64, "76561198115363193");
        assert_eq!(
            parse_digits("https://steamcommunity.com/profiles/76561198115363193").unwrap().account_id,
            155_097_465
        );
        assert!(parse_digits("suanranger129").is_none());
        assert!(parse_digits("0").is_none());
    }

    #[test]
    fn vanity_token_extraction() {
        assert_eq!(vanity_token("https://steamcommunity.com/id/suanranger129").as_deref(), Some("suanranger129"));
        assert_eq!(vanity_token("https://steamcommunity.com/id/suanranger129/").as_deref(), Some("suanranger129"));
        assert_eq!(vanity_token("suanranger129").as_deref(), Some("suanranger129"));
        assert!(vanity_token("76561198115363193").is_none());
    }

    #[test]
    fn tag_extraction_handles_cdata() {
        assert_eq!(
            extract_tag("<a><steamID64>76561198115363193</steamID64></a>", "steamID64").as_deref(),
            Some("76561198115363193")
        );
        assert_eq!(
            extract_tag("<steamID64><![CDATA[76561198115363193]]></steamID64>", "steamID64").as_deref(),
            Some("76561198115363193")
        );
    }

    // Live network check — run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn live_vanity_resolve() {
        let id = resolve_steam_id("https://steamcommunity.com/id/suanranger129".into()).await.unwrap();
        assert_eq!(id.steamid64, "76561198115363193");
        assert_eq!(id.account_id, 155_097_465);
    }
}
