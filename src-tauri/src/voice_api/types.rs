//! Serde DTOs + request payloads for the voice-pack API surface. Split out of
//! the original `voice_api.rs` monolith (facade refactor, no behavior change).
//! Fields are `pub(crate)` (rather than the original bare-private, which was
//! sufficient when everything lived in one file) because construction and
//! reads now happen from sibling submodules (`commands.rs`, `pack_io.rs`).

use serde::{Deserialize, Serialize};

/// Reserved id for the bundled default pack (`voice-pack-default/` next to the
/// exe). It is surfaced as a first-class, read-only pack in the inventory —
/// the same pattern CS2 uses for the default music kit — so the user can SEE
/// and re-equip what actually voices Maiden out of the box. There is no
/// manifest behind this id: "equipping" it just writes the id to
/// `active-pack.txt`, and because `active_event_clips` finds no manifest for
/// it, playback naturally falls through to the flat voice-cache and then the
/// bundled default clips — exactly the out-of-the-box chain.
pub const DEFAULT_PACK_ID: &str = "voice-pack-default";

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
    /// How many clips the bundled default pack ships for this event. Lets the
    /// UI report the REAL fallback chain (pack clip → default clip → TTS)
    /// instead of a flat "missing" for anything the pack doesn't map.
    pub(crate) default_clip_count: usize,
    /// Absolute path of the first bundled default clip for this event, so the
    /// UI can preview what will actually be heard when the pack has no clip.
    pub(crate) default_clip_url: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoicePack {
    pub(crate) id: String,
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
    /// Relative path within the pack dir to the pack's cover image (from
    /// manifest.coverImage OR the alphabetically-first banner as fallback).
    /// Empty string when no cover can be resolved.
    pub(crate) cover_image: String,
    /// Cover image inlined as a `data:` URL for the inventory grid — same
    /// mechanism as the fired-banner path so the overlay CSP has nothing new
    /// to allow. `None` → the frontend renders a gradient placeholder.
    pub(crate) cover_image_url: Option<String>,
    /// True only for the synthesized bundled-default pack ([`DEFAULT_PACK_ID`]).
    /// The UI treats built-in packs as read-only (no mapping editor, no
    /// uploads) and pins them first in the grid.
    pub(crate) built_in: bool,
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
    pub(crate) root_dir: String,
    pub(crate) packs_dir: String,
    pub(crate) cache_dir: String,
    pub(crate) active_pack_id: Option<String>,
    pub(crate) active_pack: Option<VoicePack>,
    pub(crate) packs: Vec<VoicePack>,
    pub(crate) groups: Vec<VoiceGroup>,
}

#[derive(Serialize)]
pub struct UploadResult {
    pub path: String,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub imported: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEventRequest {
    pub(crate) pack_id: String,
    pub(crate) event_id: String,
    pub(crate) text: String,
    pub(crate) thai: String,
    pub(crate) banner: String,
    pub(crate) banner_asset: String,
    pub(crate) clips: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackRequest {
    pub(crate) pack_id: String,
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) locale: String,
    pub(crate) author: String,
    pub(crate) description: String,
    #[serde(default)]
    pub(crate) cover_image: String,
}
