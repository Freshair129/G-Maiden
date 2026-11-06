//! G-Ann immutable artifact and profile installation registry.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileId(pub String);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstallationId(pub String);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum OriginAuthority {
    Local {
        lineage_id: String,
    },
    Store {
        issuer: String,
        publisher_id: String,
    },
    System,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactRef {
    pub digest: String,
    pub announcer_id: String,
    pub revision: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivationState {
    Inactive,
    Active,
    DeferredUntilMatchEnd,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InstalledRevision {
    pub installation_id: InstallationId,
    pub artifact: ArtifactRef,
    pub authority: OriginAuthority,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Selection {
    pub active: Option<InstallationId>,
    pub pending: Option<InstallationId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ProjectBinding {
    pub token: String,
    pub lineage_id: String,
    pub announcer_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Registry {
    pub schema_version: u32,
    pub profile_id: ProfileId,
    pub installations: Vec<InstalledRevision>,
    pub bindings: Vec<ProjectBinding>,
}

impl Registry {
    pub fn empty(profile_id: ProfileId) -> Self {
        Self {
            schema_version: 1,
            profile_id,
            installations: Vec::new(),
            bindings: Vec::new(),
        }
    }
}
