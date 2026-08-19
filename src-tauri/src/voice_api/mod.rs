//! Voice-pack API: announcer event contract, pack storage/assembly, banner
//! resolution, and the Tauri-facing commands.
//!
//! Split out of a single `voice_api.rs` file into this directory module as a
//! pure facade refactor — the `voice_api::` module path is unchanged for
//! every external consumer (`lib.rs`, `gsi.rs`, `audio.rs`, `capture.rs`);
//! this file re-exports the exact same public surface the old single file
//! exposed.
//!
//! Submodules:
//! - `events` — the announcer event/group contract (`EVENTS`, `GROUPS`,
//!   `event_ids`).
//! - `types` — the serde DTOs + request payloads returned/consumed by the
//!   Tauri commands.
//! - `pack_io` — manifest read/write, pack assembly (`build_pack`/
//!   `default_pack`), asset discovery, id/filename sanitizing. Also owns the
//!   private `Manifest`/`ManifestMapping` storage types.
//! - `path_safety` — `safe_pack_path` and friends: the path-traversal /
//!   symlink-escape hardening every manifest-relative path must go through.
//! - `banner` — the announcer "queue banner" bundle (`FiredBanner`) and the
//!   pack install report used by `POST /announcer/install`.
//! - `base64` — the small dependency-free base64 encoder shared with
//!   `capture.rs`.
//! - `paths` — voice-root path resolution, including the `#[cfg(test)]`
//!   thread-local root override.
//! - `commands` — the Tauri-facing command functions (`state`, `action`,
//!   `create_template`, `upload_asset`, `import_archive`, `map_event`,
//!   `update_pack`, `active_event_clips`, `active_pack_name`) plus the
//!   internal `extract_pack_zip`.

mod banner;
mod base64;
mod commands;
mod events;
mod pack_io;
mod path_safety;
mod paths;
mod types;

#[cfg(test)]
mod tests;

// These re-exports preserve the exact public surface the old single-file
// `voice_api.rs` exposed (every item that was `pub` at the top of that file
// is `pub` here too), even though not every one of them is currently named
// via a `voice_api::X` path elsewhere in this crate — e.g. `FiredBanner` is
// only ever used through `fired_banner()`'s return type inference, never
// spelled out. `#[allow(unused_imports)]` keeps that facade-preservation
// intentional instead of tripping `-D warnings`.
#[allow(unused_imports)]
pub use banner::{
    activate_if_exists, fired_banner, install_report, preview_banner, preview_clip, FiredBanner,
    InstallReport,
};
pub use commands::{
    action, active_event_clips, active_pack_name, create_template, import_archive, map_event,
    state, update_pack, upload_asset,
};
pub use events::event_ids;
#[allow(unused_imports)]
pub use types::{
    ImportResult, MapEventRequest, UpdatePackRequest, UploadResult, VoiceAssetOption, VoiceEvent,
    VoiceGroup, VoiceMapping, VoicePack, VoiceState, DEFAULT_PACK_ID,
};

/// Shared with `capture.rs` for inlining the live minimap PNG onto the event
/// bus (`crate::voice_api::base64_encode`).
pub(crate) use base64::base64_encode;

/// Test-only voice-root override, also used directly from `gsi.rs`'s own
/// `#[cfg(test)] mod tests` (`crate::voice_api::set_test_voice_root`).
#[cfg(test)]
pub(crate) use paths::set_test_voice_root;

/// Warm the resolved-clip cache (audit H8) once at app startup, so a pack left
/// active from a prior session is already cached before the first event fires
/// — not just after the first pack switch. See `pack_io::rebuild_resolved_cache`.
pub(crate) use pack_io::rebuild_resolved_cache;

/// Test-only cache teardown, paired with `set_test_voice_root(None)` in every
/// pack-lifecycle test's `Drop` guard — same reason, same pattern: a pooled
/// worker thread must not start the next test with this test's cached pack
/// still answering `cached_event_clips`. See `pack_io`'s cache doc comment.
#[cfg(test)]
pub(crate) use pack_io::clear_resolved_cache_for_test;
