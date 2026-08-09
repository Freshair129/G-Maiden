//! Manifest read/write, pack assembly (`build_pack`/`default_pack`), asset
//! discovery, and id/filename sanitizing. Split out of the original
//! `voice_api.rs` monolith (facade refactor, no behavior change).
//!
//! `Manifest`/`ManifestMapping` live here rather than in `types.rs` — they
//! are pack-storage implementation details (never serialized directly to the
//! frontend; `build_pack`/`default_pack` project them into the public
//! `VoicePack`/`VoiceEvent`/`VoiceMapping` DTOs), so they sit next to the
//! code that reads/writes them.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::audio;

use super::banner::read_banner_data_url;
use super::events::{EVENTS, GROUPS};
use super::path_safety::safe_pack_path;
use super::paths::{active_path, voice_root};
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
    fs::write(&path, raw).map_err(|e| format!("write {}: {e}", path.display()))
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

pub(crate) fn read_active_pack_id() -> Option<String> {
    fs::read_to_string(active_path())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn write_active_pack_id(id: &str) -> Result<(), String> {
    let root = voice_root();
    fs::create_dir_all(&root).map_err(|e| format!("create voice root: {e}"))?;
    fs::write(active_path(), id).map_err(|e| format!("write active pack: {e}"))
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
