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
    /// True when this decision was served from `runtime`'s grace-window
    /// cache after a RE-verification's network call failed — not just
    /// confirmed by the server. Always `false` for anything actually
    /// deserialized from the server response (the server never sends this
    /// field, so `#[serde(default)]` leaves that path untouched) and for a
    /// genuinely fresh success. See `lib.rs::verify_gmad_entitlement` and
    /// CLAUDE.md's resilience clause — the whole reason this field exists is
    /// so a transient network hiccup during a background re-check does not
    /// revoke an already-established session, while still telling the UI
    /// honestly that the grant it's showing is not fresh (Design Principle 3:
    /// no data = "—"/an honest marker, never fake certainty).
    #[serde(default)]
    pub stale: bool,
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

    /// Resolve the updater channel through the canonical priority/fallback model.
    /// Entitlement responses never populate a developer override or installer
    /// default; those inputs remain owned by their separately verified callers.
    pub fn resolved_update_channel(&self) -> update_channel::ResolvedChannel {
        if !self.unlocks_runtime() {
            return update_channel::stable_fallback();
        }

        update_channel::resolve(&update_channel::ChannelInputs {
            signed_developer_override: None,
            account_entitlement: Some(self.entitled_update_channel()),
            installer_default: None,
        })
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

    let decision = response
        .json::<EntitlementDecision>()
        .await
        .map_err(|_| "invalid entitlement response".to_string())?;

    let resolved = decision.resolved_update_channel();
    debug_assert!(resolved.signature_verification_required);
    debug_assert!(!resolved.manifest_url.is_empty());
    debug_assert!(!resolved.channel.is_restricted() || decision.unlocks_runtime());

    Ok(decision)
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
            stale: false,
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
        assert_eq!(
            valid.resolved_update_channel().channel,
            update_channel::ReleaseChannel::ClosedBeta
        );

        let mut invalid = decision("no_active_entitlement", Some("G-1ABCDEF0"), true);
        invalid.update_channel = Some(update_channel::ReleaseChannel::Dev);
        assert_eq!(
            invalid.entitled_update_channel(),
            update_channel::ReleaseChannel::Stable
        );
        assert_eq!(
            invalid.resolved_update_channel().channel,
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

    #[test]
    fn server_response_without_stale_field_deserializes_as_not_stale() {
        // The real entitlement server has never heard of `stale` — it's a
        // purely local, runtime-cache-only field. `#[serde(default)]` must
        // keep the actual server response path working unchanged.
        let raw = r#"{
            "state": "eligible",
            "gid": "G-1ABCDEF0",
            "checked_at": "2026-08-19T00:00:00Z",
            "terms": { "document_id": "closed-beta-terms-of-use", "version": "1.0.0-beta", "effective_at": null }
        }"#;
        let parsed: EntitlementDecision = serde_json::from_str(raw).expect("valid server payload must parse");
        assert!(!parsed.stale, "a real server response is never stale");
        assert!(parsed.unlocks_runtime());
    }
}
