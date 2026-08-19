//! Manifest read/write, pack assembly (`build_pack`/`default_pack`), asset
//! discovery, and id/filename sanitizing. Split out of the original
//! `voice_api.rs` monolith (facade refactor, no behavior change).
//!
//! `Manifest`/`ManifestMapping` live here rather than in `types.rs` — they
//! are pack-storage implementation details (never serialized directly to the
//! frontend; `build_pack`/`default_pack` project them into the public
//! `VoicePack`/`VoiceEvent`/`VoiceMapping` DTOs), so they sit next to the
//! code that reads/writes them.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::audio;

use super::banner::read_banner_data_url;
use super::events::{EVENTS, GROUPS};
use super::path_safety::{resolve_existing_clips, safe_pack_path};
use super::paths::{active_path, packs_dir, voice_root};
use super::types::{VoiceAssetOption, VoiceEvent, VoiceMapping, VoicePack, DEFAULT_PACK_ID};

#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Manifest {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) locale: String,
    pub(crate) author: String,
    /// Optional creator GID (SPEC-2026-08-09 §4). Unsigned display metadata —
    /// never identity proof. Absent for packs made before Phase 2.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) author_gid: Option<String>,
    pub(crate) description: String,
    /// Pack-level cover image (relative path within the pack dir). Empty when
    /// the pack didn't ship one — build_pack() will fall back to the first
    /// banner file so packs still have a visible tile in the inventory.
    #[serde(default)]
    pub(crate) cover_image: String,
    pub(crate) mappings: BTreeMap<String, ManifestMapping>,
}

#[derive(Deserialize, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManifestMapping {
    pub(crate) text: String,
    pub(crate) thai: String,
    pub(crate) banner: String,
    pub(crate) banner_asset: String,
    pub(crate) clips: Vec<String>,
}

pub(crate) fn read_manifest(dir: &Path) -> Result<Manifest, String> {
    let path = dir.join("manifest.json");
    let raw = fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse {}: {e}", path.display()))
}

pub(crate) fn write_manifest(dir: &Path, manifest: &Manifest) -> Result<(), String> {
    let path = dir.join("manifest.json");
    let raw =
        serde_json::to_string_pretty(manifest).map_err(|e| format!("serialize manifest: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("write {}: {e}", path.display()))?;
    // Unconditional, even though `dir` might not be the currently-active
    // pack's dir (editing a pack you haven't equipped yet). A rebuild that
    // re-reads the SAME active pack is a harmless no-op; the alternative is
    // threading a "is this the active pack" check through every caller for a
    // cost that only matters on an explicit, human-paced admin action.
    rebuild_resolved_cache();
    Ok(())
}

pub(crate) fn build_pack(dir: &Path) -> Result<VoicePack, String> {
    let manifest = read_manifest(dir)?;
    let clips = list_assets(dir, "clips", &["wav", "mp3", "ogg", "m4a"]);
    let banners = list_assets(dir, "banners", &["png", "jpg", "jpeg", "webp", "svg"]);

    // Cover image resolution — pack tiles need SOMETHING to show, so:
    //   1. `manifest.coverImage` (what G-AnnStudio writes when it ships a pack)
    //   2. first banner alphabetically (banners are sorted by list_assets)
    //   3. neither → cover_image = "" and cover_image_url = None; the inventory
    //      renders a gradient placeholder client-side.
    let (cover_image, cover_image_url) = if !manifest.cover_image.is_empty() {
        // manifest.coverImage is attacker-influenced exactly like clips[] and
        // bannerAsset (see safe_pack_path) — this path runs on every
        // `state()` call, i.e. merely opening Audio Settings, not just on a
        // fired event, so it must be validated too.
        let url = safe_pack_path(dir, &manifest.cover_image).and_then(|path| read_banner_data_url(&path));
        (manifest.cover_image.clone(), url)
    } else if let Some(first) = banners.first() {
        let path = dir.join(first.path.replace('\\', "/"));
        (first.path.clone(), read_banner_data_url(&path))
    } else {
        (String::new(), None)
    };

    let mut covered = 0;

    let items = EVENTS
        .iter()
        .map(|event| {
            let accent = GROUPS
                .iter()
                .find(|group| group.id == event.group)
                .map(|group| group.accent)
                .unwrap_or("#8fd3ff");
            let mapping = manifest.mappings.get(event.id).map(|raw| {
                covered += 1;
                // raw.clips / raw.banner_asset are manifest-derived (same
                // attacker-influenced fields as everywhere else in this
                // file) — validate through safe_pack_path before building a
                // VoiceAssetOption, instead of the unguarded asset_option()
                // join that collect_assets()'s directory-walk results use
                // (those are already safe: they come from files we found on
                // disk, not from manifest strings).
                let clip_options = raw
                    .clips
                    .iter()
                    .filter_map(|rel| {
                        let full = safe_pack_path(dir, rel)?;
                        Some(VoiceAssetOption {
                            path: rel.replace('\\', "/"),
                            name: full.file_name()?.to_string_lossy().to_string(),
                            url: full.to_string_lossy().to_string(),
                        })
                    })
                    .collect::<Vec<_>>();
                let clip_url = clip_options.first().map(|clip| clip.url.clone());
                let banner_url = if raw.banner_asset.is_empty() {
                    None
                } else {
                    safe_pack_path(dir, &raw.banner_asset)
                        .map(|full| full.to_string_lossy().to_string())
                };
                VoiceMapping {
                    text: raw.text.clone(),
                    thai: raw.thai.clone(),
                    banner: raw.banner.clone(),
                    banner_asset: raw.banner_asset.clone(),
                    banner_url,
                    clip: raw.clips.first().cloned().unwrap_or_default(),
                    clips: raw.clips.clone(),
                    has_clip: !clip_options.is_empty(),
                    clip_count: clip_options.len(),
                    clip_url,
                    clip_options,
                }
            });
            let default_clips = audio::default_event_clips(event.id);
            VoiceEvent {
                id: event.id.into(),
                group: event.group.into(),
                label: event.label.into(),
                subtitle: event.subtitle.into(),
                thai: event.thai.into(),
                accent: accent.into(),
                mapping,
                default_clip_count: default_clips.len(),
                default_clip_url: default_clips
                    .first()
                    .map(|p| p.to_string_lossy().to_string()),
            }
        })
        .collect::<Vec<_>>();

    Ok(VoicePack {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        locale: manifest.locale,
        author: manifest.author,
        author_gid: manifest.author_gid,
        description: manifest.description,
        path: dir.to_string_lossy().to_string(),
        covered_events: covered,
        total_events: EVENTS.len(),
        clips: clips.len(),
        available_clips: clips,
        available_banners: banners,
        items,
        cover_image,
        cover_image_url,
        built_in: false,
    })
}

/// Synthesize the bundled `voice-pack-default/` folder (flat `{event}/*.mp3`
/// layout, no manifest) into a first-class, read-only [`VoicePack`] so the
/// inventory always shows the pack that actually voices Maiden out of the box.
/// `None` when the bundled folder is missing entirely (dev tree without assets).
pub(crate) fn default_pack() -> Option<VoicePack> {
    let dir = audio::default_pack_dir()?;
    let mut covered = 0;
    let mut total_clips = 0;

    let items = EVENTS
        .iter()
        .map(|event| {
            let accent = GROUPS
                .iter()
                .find(|group| group.id == event.group)
                .map(|group| group.accent)
                .unwrap_or("#8fd3ff");
            let clips = audio::default_event_clips(event.id);
            let clip_options = clips
                .iter()
                .filter_map(|full| {
                    Some(VoiceAssetOption {
                        path: format!(
                            "{}/{}",
                            event.id,
                            full.file_name()?.to_string_lossy()
                        ),
                        name: full.file_name()?.to_string_lossy().to_string(),
                        url: full.to_string_lossy().to_string(),
                    })
                })
                .collect::<Vec<_>>();
            let mapping = if clip_options.is_empty() {
                None
            } else {
                covered += 1;
                total_clips += clip_options.len();
                Some(VoiceMapping {
                    text: event.label.to_string(),
                    thai: event.thai.to_string(),
                    banner: String::new(),
                    banner_asset: String::new(),
                    banner_url: None,
                    clip: clip_options
                        .first()
                        .map(|c| c.path.clone())
                        .unwrap_or_default(),
                    clips: clip_options.iter().map(|c| c.path.clone()).collect(),
                    has_clip: true,
                    clip_count: clip_options.len(),
                    clip_url: clip_options.first().map(|c| c.url.clone()),
                    clip_options,
                })
            };
            VoiceEvent {
                id: event.id.into(),
                group: event.group.into(),
                label: event.label.into(),
                subtitle: event.subtitle.into(),
                thai: event.thai.into(),
                accent: accent.into(),
                mapping,
                // On the default card itself the "fallback" IS the pack.
                default_clip_count: clips.len(),
                default_clip_url: clips.first().map(|p| p.to_string_lossy().to_string()),
            }
        })
        .collect::<Vec<_>>();

    Some(VoicePack {
        id: DEFAULT_PACK_ID.to_string(),
        name: "Maiden Default (ไทย)".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        locale: "th-TH".to_string(),
        author: "G-Maiden".to_string(),
        author_gid: None,
        description: "เสียงไทยมาตรฐานที่ติดตั้งมากับแอป — ใช้เป็นเสียงสำรองให้ทุกแพ็กเสมอ".to_string(),
        path: dir.to_string_lossy().to_string(),
        covered_events: covered,
        total_events: EVENTS.len(),
        clips: total_clips,
        available_clips: Vec::new(),
        available_banners: Vec::new(),
        items,
        cover_image: String::new(),
        cover_image_url: None,
        built_in: true,
    })
}

pub(crate) fn list_assets(dir: &Path, folder: &str, extensions: &[&str]) -> Vec<VoiceAssetOption> {
    let root = dir.join(folder);
    let mut out = Vec::new();
    collect_assets(dir, &root, extensions, &mut out);
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

pub(crate) fn collect_assets(
    base: &Path,
    dir: &Path,
    extensions: &[&str],
    out: &mut Vec<VoiceAssetOption>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_assets(base, &path, extensions, out);
            continue;
        }
        let Some(ext) = path
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| x.to_ascii_lowercase())
        else {
            continue;
        };
        if extensions.iter().any(|allowed| *allowed == ext) {
            if let Some(asset) = asset_option(
                base,
                path.strip_prefix(base)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .as_ref(),
            ) {
                out.push(asset);
            }
        }
    }
}

pub(crate) fn asset_option(base: &Path, rel: &str) -> Option<VoiceAssetOption> {
    let normalized = rel.replace('\\', "/");
    let full = base.join(&normalized);
    if !full.is_file() {
        return None;
    }
    Some(VoiceAssetOption {
        path: normalized.clone(),
        name: full.file_name()?.to_string_lossy().to_string(),
        url: full.to_string_lossy().to_string(),
    })
}

// ── Resolved-clip cache (audit H8) ───────────────────────────────────────────
//
// `active_event_clips` used to do this on every call, live, from the G-Signal
// gank path: read `active-pack.txt`, read + parse `manifest.json`, then for
// every clip in the mapping stat the file AND canonicalize both the pack dir
// and the candidate to check containment (`resolve_existing_clips`) — ~9
// filesystem syscalls plus a JSON parse, on a hop with a ≤300ms total budget.
// A pack switch or a manifest edit is a rare, explicit, admin-UI action; a
// gank alert firing is not. There is no reason the second should ever pay for
// the first.
//
// So the resolution now happens ONCE, eagerly, at the moment something that
// could change the answer actually changes — not on read. `active_event_clips`
// becomes a HashMap lookup behind one mutex lock: no disk I/O, no JSON parse,
// no canonicalize, on the hot path, ever.
struct ResolvedCache {
    /// Which pack this cache reflects — not currently read back by anyone
    /// (`cached_event_clips` only serves the map), but kept for the obvious
    /// future need (a debug/status surface showing what's cached) and because
    /// a struct that names its own cache key is easier to reason about in six
    /// months than a bare `HashMap`.
    #[allow(dead_code)]
    pack_id: String,
    clips_by_event: HashMap<String, Vec<PathBuf>>,
}

// Production: one process-global slot — there is exactly one active pack per
// running app. Test: a `thread_local`, for the SAME reason `voice_root()`'s
// override two files over is one (see that file's doc comment) — this cache
// is written by `write_active_pack_id`/`write_manifest`, which every existing
// pack-lifecycle test already calls against its own scratch `voice_root()`, so
// a single shared static here would let one test's pack silently answer
// another's `cached_event_clips` query whenever cargo schedules two tests
// onto the same worker thread. A real, non-hot-path-only staleness bug in
// production would need to survive a full pack switch to matter this same
// way; in a test binary "some other test just ran on this thread" is the
// normal case, not the exotic one.
#[cfg(not(test))]
static RESOLVED_CACHE: Mutex<Option<ResolvedCache>> = Mutex::new(None);
#[cfg(test)]
thread_local! {
    static RESOLVED_CACHE: std::cell::RefCell<Option<ResolvedCache>> = const { std::cell::RefCell::new(None) };
}

#[cfg(not(test))]
fn store_resolved_cache(next: Option<ResolvedCache>) {
    if let Ok(mut cache) = RESOLVED_CACHE.lock() {
        *cache = next;
    }
}
#[cfg(test)]
fn store_resolved_cache(next: Option<ResolvedCache>) {
    RESOLVED_CACHE.with(|cell| *cell.borrow_mut() = next);
}

#[cfg(not(test))]
fn with_resolved_cache<R>(f: impl FnOnce(Option<&ResolvedCache>) -> R) -> R {
    match RESOLVED_CACHE.lock() {
        Ok(guard) => f(guard.as_ref()),
        Err(_) => f(None),
    }
}
#[cfg(test)]
fn with_resolved_cache<R>(f: impl FnOnce(Option<&ResolvedCache>) -> R) -> R {
    RESOLVED_CACHE.with(|cell| f(cell.borrow().as_ref()))
}

/// Recompute the cache from whatever pack is active on disk RIGHT NOW.
///
/// Infallible by design: a rebuild that can't complete (no active pack, a
/// manifest that fails to parse) clears the cache to `None` rather than
/// erroring, which makes `cached_event_clips` return `None` for every event —
/// exactly the "no active-pack clips, fall through to legacy/default" behavior
/// the old live-resolution code had on any read failure. Never fails the
/// caller's write, which has already landed on disk by the time this runs.
///
/// Called from every place that can change what `active_event_clips` would
/// return: [`write_active_pack_id`] and [`write_manifest`] below cover six of
/// the seven real command-level mutation sites for free (`activate_if_exists`,
/// `action("activate")`, `create_template`, `import_archive`, `map_event`,
/// `update_pack` — every "activate a pack" / "edit its manifest" command in
/// `commands.rs` and `banner.rs` bottoms out in one of those two functions).
/// The seventh — `commands::upload_asset` adding a clip FILE without touching
/// manifest.json — calls this directly, because
/// `resolve_existing_clips`'s existence check cares about that even though no
/// manifest byte changed. Also called once at app startup (`lib.rs`) so a
/// pack left active from a prior session is warm before the first alert, not
/// just after the first pack switch.
///
/// Also called from every test-root teardown guard (mirroring
/// `set_test_voice_root(None)`) so a pooled worker thread starts the next
/// test's pack-lifecycle assertions from a clean cache, not the previous
/// test's leftovers.
pub(crate) fn rebuild_resolved_cache() {
    let next = (|| {
        let id = read_active_pack_id()?;
        let dir = packs_dir().join(sanitize_id(&id));
        let manifest = read_manifest(&dir).ok()?;
        let mut clips_by_event = HashMap::with_capacity(manifest.mappings.len());
        for (event, mapping) in &manifest.mappings {
            clips_by_event.insert(event.clone(), resolve_existing_clips(&dir, &mapping.clips));
        }
        Some(ResolvedCache { pack_id: id, clips_by_event })
    })();
    store_resolved_cache(next);
}

/// Drop the cache without recomputing it — for test teardown, where there may
/// be no active pack left to resolve against (the temp root is about to be
/// deleted) and the only thing that matters is not leaking into the next test.
#[cfg(test)]
pub(crate) fn clear_resolved_cache_for_test() {
    store_resolved_cache(None);
}

/// O(1) read of the cache [`rebuild_resolved_cache`] built. `None` when there
/// is no active pack or its manifest is unreadable — callers already treat
/// that as "fall through to the legacy flat dir / bundled default pack".
pub(crate) fn cached_event_clips(event: &str) -> Option<Vec<PathBuf>> {
    with_resolved_cache(|cache| cache?.clips_by_event.get(event).cloned())
}

pub(crate) fn read_active_pack_id() -> Option<String> {
    fs::read_to_string(active_path())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn write_active_pack_id(id: &str) -> Result<(), String> {
    let root = voice_root();
    fs::create_dir_all(&root).map_err(|e| format!("create voice root: {e}"))?;
    fs::write(active_path(), id).map_err(|e| format!("write active pack: {e}"))?;
    rebuild_resolved_cache();
    Ok(())
}

pub(crate) fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let mut file = fs::File::create(path).map_err(|e| format!("create {}: {e}", path.display()))?;
    file.write_all(bytes)
        .map_err(|e| format!("write {}: {e}", path.display()))
}

pub(crate) fn sanitize_id(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

pub(crate) fn sanitize_file_name(value: &str) -> String {
    Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ' '))
        .collect::<String>()
}
