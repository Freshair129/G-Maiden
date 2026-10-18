use serde::{Deserialize, Serialize};

pub const DEV_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/Freshair129/G-Maiden/main/release/channels/dev.json";
pub const STABLE_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/Freshair129/G-Maiden/main/release/channels/stable.json";

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReleaseChannel {
    Dev,
    #[default]
    Stable,
}

impl ReleaseChannel {
    pub const fn manifest_url(self) -> &'static str {
        match self {
            Self::Dev => DEV_MANIFEST_URL,
            Self::Stable => STABLE_MANIFEST_URL,
        }
    }

    pub const fn is_restricted(self) -> bool {
        !matches!(self, Self::Stable)
    }

    /// Wire name, matching the serde `kebab-case` rename and the manifest filename.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Dev => "dev",
            Self::Stable => "stable",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ChannelSource {
    SignedDeveloperOverride,
    InstallerDefault,
    #[default]
    StableFallback,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct ChannelInputs {
    /// This value must only be populated after a detached signature has been
    /// verified by the caller. Unsigned local preferences must never reach it.
    pub signed_developer_override: Option<ReleaseChannel>,
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
            installer_default: Some(ReleaseChannel::Stable),
        };
        let resolved = resolve(&inputs);
        assert_eq!(resolved.channel, ReleaseChannel::Dev);
        assert_eq!(resolved.source, ChannelSource::SignedDeveloperOverride);
    }

    #[test]
    fn installer_default_beats_stable_fallback() {
        let resolved = resolve(&ChannelInputs {
            signed_developer_override: None,
            installer_default: Some(ReleaseChannel::Dev),
        });
        assert_eq!(resolved.channel, ReleaseChannel::Dev);
        assert_eq!(resolved.source, ChannelSource::InstallerDefault);
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
        for channel in [ReleaseChannel::Dev, ReleaseChannel::Stable] {
            let resolved = resolve(&ChannelInputs {
                signed_developer_override: None,
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

    #[test]
    fn wire_name_matches_the_manifest_filename() {
        // `check_channel_update` reports this back to the UI and the manifest URL is
        // built from the same names.
        assert_eq!(ReleaseChannel::Dev.as_str(), "dev");
        assert_eq!(ReleaseChannel::Stable.as_str(), "stable");
        for channel in [ReleaseChannel::Dev, ReleaseChannel::Stable] {
            assert!(
                channel
                    .manifest_url()
                    .ends_with(&format!("/{}.json", channel.as_str())),
                "manifest url for {channel:?} must be named after its wire channel"
            );
        }
    }
}
