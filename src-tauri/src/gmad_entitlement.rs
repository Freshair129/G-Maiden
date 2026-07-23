use serde::{Deserialize, Serialize};

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

    #[test]
    fn only_eligible_decision_with_server_gid_unlocks_runtime() {
        let decision = |state: &str, gid: Option<&str>, terms: bool| EntitlementDecision {
            state: state.into(),
            gid: gid.map(str::to_string),
            checked_at: None,
            terms: terms.then(|| TermsSummary {
                document_id: Some("closed-beta-terms-of-use".into()),
                version: Some("1.0.0-beta".into()),
                effective_at: None,
            }),
        };
        assert!(decision("eligible", Some("G-1ABCDEF0"), true).unlocks_runtime());
        assert!(!decision("eligible", None, true).unlocks_runtime());
        assert!(!decision("eligible", Some("G-1ABCDEF0"), false).unlocks_runtime());
        assert!(!decision("terms_required", Some("G-1ABCDEF0"), true).unlocks_runtime());
        assert!(!decision("no_active_entitlement", Some("G-1ABCDEF0"), true).unlocks_runtime());
    }
}
