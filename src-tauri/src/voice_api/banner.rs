//! Announcer banner resolution (overlay "queue banner" bundle) + the pack
//! install report used by `POST /announcer/install`. Split out of the
//! original `voice_api.rs` monolith (facade refactor, no behavior change).

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::audio;

use super::base64::base64_encode;
use super::events::{event_ids, EVENTS};
use super::pack_io::{read_active_pack_id, read_manifest, sanitize_id, write_active_pack_id};
use super::path_safety::{resolve_existing_clips, safe_pack_path};
use super::paths::packs_dir;
use super::types::DEFAULT_PACK_ID;

/// Banner payload emitted to the overlay when an announcer event fires, so the
/// on-screen banner and the voiced clip come from the SAME pack.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FiredBanner {
    pub event: String,
    /// The active pack's banner image for this event as a self-contained `data:`
    /// URL (base64). We inline it rather than a file path so the overlay's strict
    /// CSP (`img-src 'self' data:`) renders it with no asset-protocol setup.
    /// `None` → the overlay falls back to its built-in card.
    pub banner_data: Option<String>,
    /// Caption: the pack's banner override if set, else the event's default label.
    pub banner_text: String,
    /// Thai line: the pack's override if set, else the event's default.
    pub thai: String,
    /// Absolute path of the clip that was voiced (set by the caller after
    /// picking it), so the overlay can play a silent copy for the reactive
    /// waveform. `None` when the event fired silent (no clip mapped).
    pub clip: Option<String>,
}

/// Cap on the banner image we inline into an event payload (keeps the event bus
/// light). Banners are small; anything larger is almost certainly a mistake.
const MAX_BANNER_BYTES: u64 = 3 * 1024 * 1024;

/// Resolve the banner for a just-fired announcer `event` against the active pack.
/// Used on the live GSI path (gsi.rs).
pub fn fired_banner(event: &str) -> FiredBanner {
    fired_banner_from(read_active_pack_id(), event)
}

/// Resolve the banner against a SPECIFIC pack — used by the overlay preview so a
/// user can see a pack's banner without it being the active one / being in-game.
pub fn preview_banner(pack_id: &str, event: &str) -> FiredBanner {
    fired_banner_from(Some(pack_id.to_string()), event)
}

/// Shared resolver. Always returns sensible defaults (event label/thai) so the
/// overlay can render even with no pack; `banner_data` is `Some` only when the
/// pack maps an existing, reasonably-sized image to this event.
pub(crate) fn fired_banner_from(pack_id: Option<String>, event: &str) -> FiredBanner {
    let def = EVENTS.iter().find(|e| e.id == event);
    let mut banner_text = def
        .map(|d| d.label.to_string())
        .unwrap_or_else(|| event.to_string());
    let mut thai = def.map(|d| d.thai.to_string()).unwrap_or_default();
    let mut banner_data = None;

    if let Some(id) = pack_id {
        let dir = packs_dir().join(sanitize_id(&id));
        if let Ok(manifest) = read_manifest(&dir) {
            if let Some(mapping) = manifest.mappings.get(event) {
                if !mapping.banner.is_empty() {
                    banner_text = mapping.banner.clone();
                }
                if !mapping.thai.is_empty() {
                    thai = mapping.thai.clone();
                }
                if !mapping.banner_asset.is_empty() {
                    if let Some(path) = safe_pack_path(&dir, &mapping.banner_asset) {
                        banner_data = read_banner_data_url(&path);
                    }
                }
            }
        }
    }

    FiredBanner {
        event: event.to_string(),
        banner_data,
        banner_text,
        thai,
        clip: None,
    }
}

/// A clip mapped to `event` in a SPECIFIC pack, to play during an overlay preview
/// (first mapped, existing file). `None` when the pack maps no playable clip.
/// The synthesized built-in pack has no manifest — previewing it resolves the
/// bundled default clip directly, so "Preview" on the default card is not silent.
pub fn preview_clip(pack_id: &str, event: &str) -> Option<PathBuf> {
    if sanitize_id(pack_id) == DEFAULT_PACK_ID {
        return audio::default_event_clips(event).into_iter().next();
    }
    let dir = packs_dir().join(sanitize_id(pack_id));
    let manifest = read_manifest(&dir).ok()?;
    let mapping = manifest.mappings.get(event)?;
    mapping.clips.iter().find_map(|rel| safe_pack_path(&dir, rel))
}

/// Real per-event report for a pack, used by `POST /announcer/install`
/// (`gsi.rs`). Replaces the old `audio::all_counts()` there, which counted
/// subfolders of the flat `voice-cache/` tree (and had no notion of a
/// manifest-based pack at all — it would happily count `packs/` and
/// `imports/` as if they were events).
pub struct InstallReport {
    pub pack_id: String,
    pub counts: BTreeMap<String, usize>,
    pub unmapped_events: Vec<String>,
    pub missing_clips: Vec<String>,
}

/// Build an [`InstallReport`] for `pack_id` by reading its manifest and
/// resolving every mapped clip against disk via the same
/// [`resolve_existing_clips`] helper `active_event_clips` uses — so the
/// numbers reported here always match what will actually play in-game.
/// Errs (and reports nothing) if the pack has no readable `manifest.json`;
/// callers MUST NOT activate a pack when this errs.
pub fn install_report(pack_id: &str) -> Result<InstallReport, String> {
    let id = sanitize_id(pack_id);
    if id.is_empty() {
        return Err("pack id is required".into());
    }
    let dir = packs_dir().join(&id);
    let manifest = read_manifest(&dir)?;

    let mut counts = BTreeMap::new();
    let mut unmapped_events = Vec::new();
    let mut missing_clips = Vec::new();

    for event in event_ids() {
        let Some(mapping) = manifest.mappings.get(event) else {
            counts.insert(event.to_string(), 0);
            unmapped_events.push(event.to_string());
            continue;
        };
        for rel in &mapping.clips {
            // Rejected (unsafe) and genuinely-missing entries both surface
            // here identically — see `safe_pack_path`'s doc comment for why
            // that's the deliberate, documented choice rather than an
            // omission: the JSON response shape stays exactly as before, and
            // the distinction is preserved only in the local eprintln log.
            if safe_pack_path(&dir, rel).is_none() {
                missing_clips.push(rel.clone());
            }
        }
        let existing = resolve_existing_clips(&dir, &mapping.clips).len();
        counts.insert(event.to_string(), existing);
        if existing == 0 {
            unmapped_events.push(event.to_string());
        }
    }

    Ok(InstallReport {
        pack_id: id,
        counts,
        unmapped_events,
        missing_clips,
    })
}

/// Activate `pack_id` — but ONLY if it already exists on disk (a readable
/// `manifest.json`). `:3000` has no auth, so any local process can hit
/// `POST /announcer/install`; limiting activation to packs already installed
/// means the worst a rogue local POST can do is swap between packs a human
/// already put on disk. This must never grow a path that creates, writes,
/// moves, or extracts files — that hardening is separate, deliberately
/// deferred work.
///
/// Reuses the exact same write the "activate" UI action uses
/// (`action("activate", ..)` -> `write_active_pack_id`) rather than a new
/// hand-rolled file write.
pub fn activate_if_exists(pack_id: &str) -> Result<(), String> {
    let id = sanitize_id(pack_id);
    if id.is_empty() {
        return Err("pack id is required".into());
    }
    if !packs_dir().join(&id).join("manifest.json").is_file() {
        return Err(format!("pack not found: {id}"));
    }
    write_active_pack_id(&id)
}

/// Read an image file into a base64 `data:` URL, or `None` if missing/too large.
pub(crate) fn read_banner_data_url(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_BANNER_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default();
    Some(format!(
        "data:{};base64,{}",
        image_mime(ext),
        base64_encode(&bytes)
    ))
}

pub(crate) fn image_mime(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}
