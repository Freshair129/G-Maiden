use serde::{Deserialize, Serialize};

pub const DEV_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/Freshair129/G-Maiden/main/release/channels/dev.json";
pub const CLOSED_BETA_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/Freshair129/G-Maiden/main/release/channels/closed-beta.json";
pub const STABLE_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/Freshair129/G-Maiden/main/release/channels/stable.json";

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReleaseChannel {
    Dev,
    ClosedBeta,
    #[default]
    Stable,
}

impl ReleaseChannel {
    pub const fn manifest_url(self) -> &'static str {
        match self {
            Self::Dev => DEV_MANIFEST_URL,
            Self::ClosedBeta => CLOSED_BETA_MANIFEST_URL,
            Self::Stable => STABLE_MANIFEST_URL,
        }
    }

    pub const fn is_restricted(self) -> bool {
        !matches!(self, Self::Stable)
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ChannelSource {
    SignedDeveloperOverride,
    AccountEntitlement,
    InstallerDefault,
    #[default]
    StableFallback,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct ChannelInputs {
    /// This value must only be populated after a detached signature has been
    /// verified by the caller. Unsigned local preferences must never reach it.
    pub signed_developer_override: Option<ReleaseChannel>,
    /// Server-authoritative account entitlement. Public/unknown accounts use None.
    pub account_entitlement: Option<ReleaseChannel>,
    /// Build- or installer-provisioned default. Restricted defaults are allowed
    /// only for installers distributed to the matching restricted audience.
    pub installer_default: Option<ReleaseChannel>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ResolvedChannel {
    pub channel: ReleaseChannel,
    pub source: ChannelSource,
    pub manifest_url: String,
    pub signature_verification_required: bool,
}

impl ResolvedChannel {
    fn new(channel: ReleaseChannel, source: ChannelSource) -> Self {
        Self {
            channel,
            source,
            manifest_url: channel.manifest_url().to_string(),
            signature_verification_required: true,
        }
    }
}

pub fn resolve(inputs: &ChannelInputs) -> ResolvedChannel {
    if let Some(channel) = inputs.signed_developer_override {
        return ResolvedChannel::new(channel, ChannelSource::SignedDeveloperOverride);
    }
    if let Some(channel) = inputs.account_entitlement {
        return ResolvedChannel::new(channel, ChannelSource::AccountEntitlement);
    }
    if let Some(channel) = inputs.installer_default {
        return ResolvedChannel::new(channel, ChannelSource::InstallerDefault);
    }
    ResolvedChannel::new(ReleaseChannel::Stable, ChannelSource::StableFallback)
}

pub fn stable_fallback() -> ResolvedChannel {
    ResolvedChannel::new(ReleaseChannel::Stable, ChannelSource::StableFallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolution_order_matches_release_architecture() {
        let inputs = ChannelInputs {
            signed_developer_override: Some(ReleaseChannel::Dev),
            account_entitlement: Some(ReleaseChannel::ClosedBeta),
            installer_default: Some(ReleaseChannel::Stable),
        };
        let resolved = resolve(&inputs);
        assert_eq!(resolved.channel, ReleaseChannel::Dev);
        assert_eq!(resolved.source, ChannelSource::SignedDeveloperOverride);
    }

    #[test]
    fn account_entitlement_beats_installer_default() {
        let resolved = resolve(&ChannelInputs {
            signed_developer_override: None,
            account_entitlement: Some(ReleaseChannel::ClosedBeta),
            installer_default: Some(ReleaseChannel::Dev),
        });
        assert_eq!(resolved.channel, ReleaseChannel::ClosedBeta);
        assert_eq!(resolved.source, ChannelSource::AccountEntitlement);
    }

    #[test]
    fn unknown_or_failed_resolution_is_stable() {
        let resolved = resolve(&ChannelInputs::default());
        assert_eq!(resolved.channel, ReleaseChannel::Stable);
        assert_eq!(resolved.source, ChannelSource::StableFallback);
        assert_eq!(resolved.manifest_url, STABLE_MANIFEST_URL);
    }

    #[test]
    fn every_channel_keeps_signature_verification_enabled() {
        for channel in [
            ReleaseChannel::Dev,
            ReleaseChannel::ClosedBeta,
            ReleaseChannel::Stable,
        ] {
            let resolved = resolve(&ChannelInputs {
                signed_developer_override: None,
                account_entitlement: Some(channel),
                installer_default: None,
            });
            assert!(resolved.signature_verification_required);
            assert!(!resolved.manifest_url.is_empty());
        }
    }

    #[test]
    fn restricted_channels_are_never_the_implicit_default() {
        let resolved = stable_fallback();
        assert!(!resolved.channel.is_restricted());
    }
}
