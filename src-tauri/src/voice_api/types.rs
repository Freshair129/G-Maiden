//! GANN registry inventory DTOs, serialized with camelCase field names.

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceAssetOption {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) url: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceMapping {
    pub(crate) text: String,
    pub(crate) thai: String,
    pub(crate) banner: String,
    pub(crate) banner_asset: String,
    pub(crate) banner_url: Option<String>,
    pub(crate) clip: String,
    pub(crate) clips: Vec<String>,
    pub(crate) has_clip: bool,
    pub(crate) clip_count: usize,
    pub(crate) clip_url: Option<String>,
    pub(crate) clip_options: Vec<VoiceAssetOption>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceEvent {
    pub(crate) id: String,
    pub(crate) group: String,
    pub(crate) label: String,
    pub(crate) subtitle: String,
    pub(crate) thai: String,
    pub(crate) accent: String,
    pub(crate) mapping: Option<VoiceMapping>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoicePack {
    pub(crate) id: String,
    pub(crate) installation_id: Option<String>,
    pub(crate) announcer_id: String,
    pub(crate) capabilities: VoicePackCapabilities,
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) locale: String,
    pub(crate) author: String,
    /// Optional creator GID (SPEC-2026-08-09 §4) surfaced from the pack
    /// manifest — unsigned display metadata, never identity proof. Absent
    /// for packs made before Phase 2 or with no author GID set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) author_gid: Option<String>,
    pub(crate) description: String,
    pub(crate) path: String,
    pub(crate) covered_events: usize,
    pub(crate) total_events: usize,
    pub(crate) clips: usize,
    pub(crate) available_clips: Vec<VoiceAssetOption>,
    pub(crate) available_banners: Vec<VoiceAssetOption>,
    pub(crate) items: Vec<VoiceEvent>,
    /// Explicit optional cover metadata; event visuals always use the paired video.
    pub(crate) cover_image: String,
    /// Inventory cover URL, absent when the GANN registry has no cover.
    pub(crate) cover_image_url: Option<String>,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoicePackCapabilities {
    pub(crate) event_preview: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceGroup {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) accent: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceState {
    pub(crate) authoring_enabled: bool,
    pub(crate) root_dir: String,
    pub(crate) packs_dir: String,
    pub(crate) cache_dir: String,
    pub(crate) active_pack_id: Option<String>,
    pub(crate) active_pack: Option<VoicePack>,
    pub(crate) packs: Vec<VoicePack>,
    pub(crate) groups: Vec<VoiceGroup>,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub imported: Vec<String>,
}
