use serde::{Deserialize, Serialize};

#[path = "update_channel.rs"]
pub mod update_channel;

const ENTITLEMENT_URL: &str = "https://wsseitulmcgnolgsrxgh.supabase.co/functions/v1/get-gmad-desktop-entitlement";
const SUPABASE_PUBLISHABLE_KEY: &str = "sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct TermsSummary {
    pub document_id: Option<String>,
    pub version: Option<String>,
    pub effective_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct EntitlementDecision {
    pub state: String,
    pub gid: Option<String>,
    pub checked_at: Option<String>,
    pub terms: Option<TermsSummary>,
    /// Optional server-authoritative updater channel. Missing or malformed
    /// values remain None and callers must fall back to Stable.
    #[serde(default)]
    pub update_channel: Option<update_channel::ReleaseChannel>,
}

impl EntitlementDecision {
    pub fn unlocks_runtime(&self) -> bool {
        self.state == "eligible"
            && self.gid.as_deref().is_some_and(|gid| !gid.is_empty())
            && self
                .terms
                .as_ref()
                .and_then(|terms| terms.version.as_deref())
                .is_some_and(|version| !version.is_empty())
    }

    /// A restricted channel is accepted only from an otherwise valid,
    /// server-authoritative entitlement decision. Auth failures and public
    /// accounts therefore resolve to Stable rather than retaining stale access.
    pub fn entitled_update_channel(&self) -> update_channel::ReleaseChannel {
        if self.unlocks_runtime() {
            self.update_channel.unwrap_or_default()
        } else {
            update_channel::ReleaseChannel::Stable
        }
    }
}

pub async fn verify(access_token: &str) -> Result<EntitlementDecision, String> {
    if !(32..=8192).contains(&access_token.len()) || access_token.chars().any(char::is_whitespace) {
        return Err("invalid access token".into());
    }

    let response = reqwest::Client::new()
        .post(ENTITLEMENT_URL)
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .bearer_auth(access_token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| "entitlement service unavailable".to_string())?;

    if !response.status().is_success() {
        return Err(if response.status().is_server_error() {
            "entitlement service unavailable"
        } else {
            "entitlement authorization failed"
        }
        .into());
    }

    response
        .json::<EntitlementDecision>()
        .await
        .map_err(|_| "invalid entitlement response".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decision(state: &str, gid: Option<&str>, terms: bool) -> EntitlementDecision {
        EntitlementDecision {
            state: state.into(),
            gid: gid.map(str::to_string),
            checked_at: None,
            terms: terms.then(|| TermsSummary {
                document_id: Some("closed-beta-terms-of-use".into()),
                version: Some("1.0.0-beta".into()),
                effective_at: None,
            }),
            update_channel: None,
        }
    }

    #[test]
    fn only_eligible_decision_with_server_gid_unlocks_runtime() {
        assert!(decision("eligible", Some("G-1ABCDEF0"), true).unlocks_runtime());
        assert!(!decision("eligible", None, true).unlocks_runtime());
        assert!(!decision("eligible", Some("G-1ABCDEF0"), false).unlocks_runtime());
        assert!(!decision("terms_required", Some("G-1ABCDEF0"), true).unlocks_runtime());
        assert!(!decision("no_active_entitlement", Some("G-1ABCDEF0"), true).unlocks_runtime());
    }

    #[test]
    fn restricted_channel_requires_valid_entitlement() {
        let mut valid = decision("eligible", Some("G-1ABCDEF0"), true);
        valid.update_channel = Some(update_channel::ReleaseChannel::ClosedBeta);
        assert_eq!(
            valid.entitled_update_channel(),
            update_channel::ReleaseChannel::ClosedBeta
        );

        let mut invalid = decision("no_active_entitlement", Some("G-1ABCDEF0"), true);
        invalid.update_channel = Some(update_channel::ReleaseChannel::Dev);
        assert_eq!(
            invalid.entitled_update_channel(),
            update_channel::ReleaseChannel::Stable
        );
    }

    #[test]
    fn missing_channel_defaults_to_stable() {
        assert_eq!(
            decision("eligible", Some("G-1ABCDEF0"), true).entitled_update_channel(),
            update_channel::ReleaseChannel::Stable
        );
    }
}
