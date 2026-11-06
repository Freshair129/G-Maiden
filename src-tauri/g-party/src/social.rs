use serde::{Deserialize, Serialize};

pub struct SocialJoinOptions {
    pub ticket: String,
    pub relay_url: String,
    pub room_id: String,
    pub display_name: String,
    pub consent: bool,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SocialProof {
    pub proof: String,
}
