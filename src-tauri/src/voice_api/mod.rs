//! GANN-only event media, immutable playback generations and native command facade.

mod banner;
mod commands;
mod events;
mod id_manifest;
mod playback;
pub use id_container::container_sha256;
pub(crate) use playback::{
    app as playback_app, install as install_playback, play_event, play_selected, verify_visual,
};
mod id_container;
pub use id_container::import_file;

pub(crate) mod id_video;
mod pack_io;
mod path_safety;
mod paths;
mod types;
mod video_cache;
mod video_reads;
pub(crate) mod visual_warm;
pub(crate) use pack_io::{visual_warm_candidates, warm_announcer_variant};

#[cfg(test)]
pub(crate) mod test_package;
#[cfg(test)]
mod tests;

#[allow(unused_imports)]
pub use banner::{activate_if_exists, install_report, InstallReport};
pub use commands::{
    action, active_event_clips, ensure_dev_authoring, install_store_pack, is_pack_available, state,
};
pub use events::event_ids;
#[allow(unused_imports)]
pub use types::{
    ImportResult, VoiceAssetOption, VoiceEvent, VoiceGroup, VoiceMapping, VoicePack, VoiceState,
};

/// Test-only voice-root override, also used directly from `gsi.rs`'s own
/// `#[cfg(test)] mod tests` (`crate::voice_api::set_test_voice_root`).
#[cfg(test)]
pub(crate) use paths::set_test_voice_root;

pub(crate) use banner::preview_variant;
pub(crate) use pack_io::open_verified_store_clip;
pub(crate) use pack_io::prewarm_next_banner;
/// Warm the resolved-clip cache (audit H8) once at app startup, so a pack left
/// active from a prior session is already cached before the first event fires
/// — not just after the first pack switch. See `pack_io::rebuild_resolved_cache`.
pub(crate) use pack_io::rebuild_resolved_cache;
pub(crate) use pack_io::validate_store_clip_integrity;
pub(crate) use pack_io::{announcer_revision_current, current_announcer_revision};
pub use pack_io::{
    select_announcer_clip, select_announcer_path, select_announcer_playback_path,
    with_current_announcer_clip, AnnouncerClip,
};

/// Test-only cache teardown, paired with `set_test_voice_root(None)` in every
/// pack-lifecycle test's `Drop` guard — same reason, same pattern: a pooled
/// worker thread must not start the next test with this test's cached pack
/// still answering `cached_event_clips`. See `pack_io`'s cache doc comment.
#[cfg(test)]
pub(crate) use pack_io::clear_resolved_cache_for_test;

pub fn voice_root_id() -> Result<String, String> {
    g_ann_package::root_identity(&paths::voice_root())
}
