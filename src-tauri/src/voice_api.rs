use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::audio;

#[derive(Clone, Copy)]
struct GroupDef {
    id: &'static str,
    label: &'static str,
    accent: &'static str,
}

#[derive(Clone, Copy)]
struct EventDef {
    id: &'static str,
    group: &'static str,
    label: &'static str,
    subtitle: &'static str,
    thai: &'static str,
}

const GROUPS: &[GroupDef] = &[
    GroupDef {
        id: "warning",
        label: "แจ้งเตือน",
        accent: "#ff6370",
    },
    GroupDef {
        id: "combat",
        label: "คิล / มัลติคิล",
        accent: "#ffe24a",
    },
    GroupDef {
        id: "streak",
        label: "สตรีค",
        accent: "#ff9b45",
    },
    GroupDef {
        id: "state",
        label: "สถานะ",
        accent: "#66f2b5",
    },
    GroupDef {
        id: "advisor",
        label: "คำแนะนำ",
        accent: "#8fd3ff",
    },
];

const EVENTS: &[EventDef] = &[
    EventDef {
        id: "danger",
        group: "warning",
        label: "Danger",
        subtitle: "High danger warning",
        thai: "อันตราย",
    },
    EventDef {
        id: "gank",
        group: "warning",
        label: "Gank",
        subtitle: "Incoming gank",
        thai: "แก๊งค์",
    },
    EventDef {
        id: "revision",
        group: "warning",
        label: "Revision",
        subtitle: "Belief revision",
        thai: "ยกเลิกเตือน",
    },
    EventDef {
        id: "hpLow",
        group: "warning",
        label: "HP Low",
        subtitle: "Health is low",
        thai: "เลือดต่ำ",
    },
    EventDef {
        id: "manaLow",
        group: "warning",
        label: "Mana Low",
        subtitle: "Mana is low",
        thai: "มานาต่ำ",
    },
    EventDef {
        id: "first_blood",
        group: "combat",
        label: "First Blood",
        subtitle: "First blood",
        thai: "เลือดแรก",
    },
    EventDef {
        id: "kill",
        group: "combat",
        label: "Kill",
        subtitle: "Hero kill",
        thai: "คิล",
    },
    EventDef {
        id: "double_kill",
        group: "combat",
        label: "Double Kill",
        subtitle: "Double kill",
        thai: "ดับเบิลคิล",
    },
    EventDef {
        id: "triple_kill",
        group: "combat",
        label: "Triple Kill",
        subtitle: "Triple kill",
        thai: "ทริปเปิลคิล",
    },
    EventDef {
        id: "ultra_kill",
        group: "combat",
        label: "Ultra Kill",
        subtitle: "Ultra kill",
        thai: "อัลตร้า",
    },
    EventDef {
        id: "rampage",
        group: "combat",
        label: "Rampage",
        subtitle: "Rampage",
        thai: "แรมเพจ",
    },
    EventDef {
        id: "killing_spree",
        group: "streak",
        label: "Killing Spree",
        subtitle: "Killing spree",
        thai: "สปรี",
    },
    EventDef {
        id: "dominating",
        group: "streak",
        label: "Dominating",
        subtitle: "Dominating",
        thai: "ครอบครอง",
    },
    EventDef {
        id: "mega_kill",
        group: "streak",
        label: "Mega Kill",
        subtitle: "Mega kill",
        thai: "เมก้าคิล",
    },
    EventDef {
        id: "unstoppable",
        group: "streak",
        label: "Unstoppable",
        subtitle: "Unstoppable",
        thai: "หยุดไม่ได้",
    },
    EventDef {
        id: "wicked_sick",
        group: "streak",
        label: "Wicked Sick",
        subtitle: "Wicked sick",
        thai: "โหดจัด",
    },
    EventDef {
        id: "monster_kill",
        group: "streak",
        label: "Monster Kill",
        subtitle: "Monster kill",
        thai: "มอนสเตอร์คิล",
    },
    EventDef {
        id: "godlike",
        group: "streak",
        label: "Godlike",
        subtitle: "Godlike",
        thai: "เทพเจ้า",
    },
    EventDef {
        id: "beyond_godlike",
        group: "streak",
        label: "Beyond Godlike",
        subtitle: "Beyond godlike",
        thai: "เหนือเทพเจ้า",
    },
    EventDef {
        id: "levelUp",
        group: "state",
        label: "Level Up",
        subtitle: "Level up",
        thai: "เลเวลอัพ",
    },
    EventDef {
        id: "match_start",
        group: "state",
        label: "Match Start",
        subtitle: "Match start",
        thai: "เริ่มเกม",
    },
    EventDef {
        id: "death",
        group: "state",
        label: "Death",
        subtitle: "Hero died",
        thai: "ตาย",
    },
    EventDef {
        id: "respawn",
        group: "state",
        label: "Respawn",
        subtitle: "Respawn",
        thai: "เกิดใหม่",
    },
    EventDef {
        id: "advice",
        group: "advisor",
        label: "Advice",
        subtitle: "Advisor line",
        thai: "คำแนะนำ",
    },
];

pub fn event_ids() -> impl Iterator<Item = &'static str> {
    EVENTS.iter().map(|event| event.id)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceAssetOption {
    path: String,
    name: String,
    url: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceMapping {
    text: String,
    thai: String,
    banner: String,
    banner_asset: String,
    banner_url: Option<String>,
    clip: String,
    clips: Vec<String>,
    has_clip: bool,
    clip_count: usize,
    clip_url: Option<String>,
    clip_options: Vec<VoiceAssetOption>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceEvent {
    id: String,
    group: String,
    label: String,
    subtitle: String,
    thai: String,
    accent: String,
    mapping: Option<VoiceMapping>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoicePack {
    id: String,
    name: String,
    version: String,
    locale: String,
    author: String,
    description: String,
    path: String,
    covered_events: usize,
    total_events: usize,
    clips: usize,
    available_clips: Vec<VoiceAssetOption>,
    available_banners: Vec<VoiceAssetOption>,
    items: Vec<VoiceEvent>,
    /// Relative path within the pack dir to the pack's cover image (from
    /// manifest.coverImage OR the alphabetically-first banner as fallback).
    /// Empty string when no cover can be resolved.
    cover_image: String,
    /// Cover image inlined as a `data:` URL for the inventory grid — same
    /// mechanism as the fired-banner path so the overlay CSP has nothing new
    /// to allow. `None` → the frontend renders a gradient placeholder.
    cover_image_url: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceGroup {
    id: String,
    label: String,
    accent: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceState {
    root_dir: String,
    packs_dir: String,
    cache_dir: String,
    active_pack_id: Option<String>,
    active_pack: Option<VoicePack>,
    packs: Vec<VoicePack>,
    groups: Vec<VoiceGroup>,
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
    pack_id: String,
    event_id: String,
    text: String,
    thai: String,
    banner: String,
    banner_asset: String,
    clips: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackRequest {
    pack_id: String,
    name: String,
    version: String,
    locale: String,
    author: String,
    description: String,
    #[serde(default)]
    cover_image: String,
}

#[derive(Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    id: String,
    name: String,
    version: String,
    locale: String,
    author: String,
    description: String,
    /// Pack-level cover image (relative path within the pack dir). Empty when
    /// the pack didn't ship one — build_pack() will fall back to the first
    /// banner file so packs still have a visible tile in the inventory.
    #[serde(default)]
    cover_image: String,
    mappings: BTreeMap<String, ManifestMapping>,
}

#[derive(Deserialize, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct ManifestMapping {
    text: String,
    thai: String,
    banner: String,
    banner_asset: String,
    clips: Vec<String>,
}

pub fn state() -> Result<VoiceState, String> {
    let root = voice_root();
    let packs = packs_dir();
    fs::create_dir_all(&packs).map_err(|e| format!("create voice packs dir: {e}"))?;

    let mut pack_dirs = discover_pack_dirs(&packs);
    if pack_dirs.is_empty() {
        let starter = packs.join("maiden-custom");
        create_pack_skeleton(&starter, "maiden-custom", "Maiden Custom", "th-TH")?;
        pack_dirs.push(starter);
    }

    let active_id = read_active_pack_id().or_else(|| {
        pack_dirs
            .first()
            .and_then(|dir| dir.file_name())
            .map(|name| name.to_string_lossy().to_string())
    });

    let mut packs_out = Vec::new();
    for dir in pack_dirs {
        packs_out.push(build_pack(&dir)?);
    }
    packs_out.sort_by(|a, b| a.name.cmp(&b.name));

    let active_pack_id = active_id.or_else(|| packs_out.first().map(|pack| pack.id.clone()));
    let active_pack = active_pack_id
        .as_ref()
        .and_then(|id| packs_out.iter().find(|pack| &pack.id == id).cloned());

    Ok(VoiceState {
        root_dir: root.to_string_lossy().to_string(),
        packs_dir: packs.to_string_lossy().to_string(),
        cache_dir: audio::voice_cache_dir().to_string_lossy().to_string(),
        active_pack_id,
        active_pack,
        packs: packs_out,
        groups: GROUPS
            .iter()
            .map(|g| VoiceGroup {
                id: g.id.into(),
                label: g.label.into(),
                accent: g.accent.into(),
            })
            .collect(),
    })
}

pub fn action(action: &str, pack_id: Option<&str>) -> Result<VoiceState, String> {
    match action {
        "activate" => {
            let id = pack_id.ok_or_else(|| "missing packId".to_string())?;
            write_active_pack_id(id)?;
            state()
        }
        "rescan" => state(),
        "open-root" => {
            let dir = voice_root();
            fs::create_dir_all(&dir).map_err(|e| format!("create voice root: {e}"))?;
            let _ = std::process::Command::new("explorer")
                .arg(dir.as_os_str())
                .spawn();
            state()
        }
        _ => Err(format!("unknown voice action: {action}")),
    }
}

pub fn create_template(pack_id: &str, name: &str, locale: &str) -> Result<VoiceState, String> {
    let id = sanitize_id(pack_id);
    if id.is_empty() {
        return Err("pack id is required".into());
    }
    let dir = packs_dir().join(&id);
    create_pack_skeleton(&dir, &id, name, locale)?;
    write_active_pack_id(&id)?;
    state()
}

pub fn upload_asset(
    pack_id: &str,
    kind: &str,
    name: &str,
    bytes: &[u8],
) -> Result<UploadResult, String> {
    let base = pack_dir(pack_id)?;
    let folder = match kind {
        "clip" => "clips",
        "banner" => "banners",
        _ => return Err("kind must be clip or banner".into()),
    };
    let file_name = sanitize_file_name(name);
    if file_name.is_empty() {
        return Err("file name is required".into());
    }
    let rel = format!("{folder}/{file_name}");
    let dest = base.join(&rel);
    write_bytes(&dest, bytes)?;
    Ok(UploadResult {
        path: rel.replace('\\', "/"),
    })
}

pub fn import_archive(name: &str, bytes: &[u8]) -> Result<ImportResult, String> {
    let id = sanitize_id(
        Path::new(name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("imported-pack"),
    );
    let id = if id.is_empty() {
        "imported-pack".to_string()
    } else {
        id
    };
    let root = voice_root();
    let imports = root.join("imports");
    fs::create_dir_all(&imports).map_err(|e| format!("create imports dir: {e}"))?;
    let archive = imports.join(format!("{id}.zip"));
    write_bytes(&archive, bytes)?;

    let dest = packs_dir().join(&id);
    fs::create_dir_all(&dest).map_err(|e| format!("create import dir: {e}"))?;

    extract_pack_zip(bytes, &dest, &id)?;

    if !dest.join("manifest.json").is_file() {
        create_pack_skeleton(&dest, &id, name, "th-TH")?;
    }
    write_active_pack_id(&id)?;
    Ok(ImportResult { imported: vec![id] })
}

/// In-process, zip-slip-safe extraction of an imported pack archive.
///
/// Replaces the previous `Expand-Archive` shell-out, whose safety depended
/// entirely on the .NET implementation (no app-level validation at all) —
/// and, as a side benefit, removes a `powershell.exe` spawn entirely, so
/// there's no `CREATE_NO_WINDOW` concern left on this path (a spawn without
/// it flashes a console and has been known to minimize a focused Dota 2
/// window; see `governor.rs`/`tts.rs`/`master.rs`/`setup.rs` for the existing
/// pattern this codebase uses everywhere it *does* still spawn PowerShell).
///
/// `zip` is already pulled in transitively via `tauri-plugin-updater` at the
/// same major version (`4`), so this adds it as an explicit, minimally
/// featured (`default-features = false`, `features = ["deflate"]`) direct
/// dependency rather than a brand-new one.
///
/// Validates EVERY entry before writing ANY of them (two-pass): an entry is
/// refused if `ZipFile::enclosed_name()` returns `None` — the zip crate's own
/// component-based check, which rejects absolute paths, drive/UNC/verbatim
/// prefixes, and any entry whose `..` count would walk it outside the
/// archive root — or if `ZipFile::is_symlink()` is true. Unlike
/// `ZipArchive::extract()` (which *would* create a symlink if its target
/// happens to resolve inside the destination), we refuse symlink entries
/// outright: a voice pack directory should never contain a live symlink. On
/// the first unsafe entry the whole import is refused and nothing is
/// written under `dest` (pass 1 touches no files).
fn extract_pack_zip(bytes: &[u8], dest: &Path, pack_id: &str) -> Result<(), String> {
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("open zip: {e}"))?;

    // Pass 1 — validate every entry before writing anything.
    let mut entries = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| format!("read zip entry {i}: {e}"))?;
        let raw_name = file.name().to_string();
        let is_dir = file.is_dir();
        let is_symlink = file.is_symlink();
        let enclosed = file.enclosed_name();
        drop(file);

        let Some(rel) = enclosed else {
            eprintln!(
                "[G-Maiden] voice pack import '{pack_id}': refused unsafe archive entry '{raw_name}'"
            );
            return Err("archive contains an unsafe entry path".into());
        };
        if is_symlink {
            eprintln!(
                "[G-Maiden] voice pack import '{pack_id}': refused symlink archive entry '{raw_name}'"
            );
            return Err("archive contains a symlink entry".into());
        }
        entries.push((i, rel, is_dir));
    }

    // Pass 2 — every entry validated; now actually extract, confined to `dest`
    // by construction (`enclosed_name()` already guarantees no `..`/absolute
    // escape, so a plain `dest.join(rel)` cannot land outside it).
    for (i, rel, is_dir) in entries {
        let outpath = dest.join(&rel);
        if is_dir {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("create {}: {e}", outpath.display()))?;
            continue;
        }
        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("read zip entry {i}: {e}"))?;
        let mut outfile = fs::File::create(&outpath)
            .map_err(|e| format!("create {}: {e}", outpath.display()))?;
        std::io::copy(&mut file, &mut outfile)
            .map_err(|e| format!("write {}: {e}", outpath.display()))?;
    }
    Ok(())
}

pub fn map_event(payload: MapEventRequest) -> Result<VoiceState, String> {
    let dir = pack_dir(&payload.pack_id)?;
    let mut manifest = read_manifest(&dir)?;
    manifest.mappings.insert(
        payload.event_id,
        ManifestMapping {
            text: payload.text,
            thai: payload.thai,
            banner: payload.banner,
            banner_asset: payload.banner_asset,
            clips: payload.clips,
        },
    );
    write_manifest(&dir, &manifest)?;
    state()
}

pub fn update_pack(payload: UpdatePackRequest) -> Result<VoiceState, String> {
    let dir = pack_dir(&payload.pack_id)?;
    let mut manifest = read_manifest(&dir)?;
    manifest.name = payload.name;
    manifest.version = payload.version;
    manifest.locale = payload.locale;
    manifest.author = payload.author;
    manifest.description = payload.description;
    manifest.cover_image = payload.cover_image;
    write_manifest(&dir, &manifest)?;
    state()
}

/// Absolute paths to the clips the ACTIVE pack maps to `event`. The active pack
/// (its manifest) is the source of truth for playback, so a fired announcer event
/// voices the pack's clips and its banner together — the "bundle" contract.
/// Existing files only; empty when there is no active pack / manifest / mapping.
pub fn active_event_clips(event: &str) -> Vec<PathBuf> {
    let Some(id) = read_active_pack_id() else {
        return Vec::new();
    };
    let dir = packs_dir().join(sanitize_id(&id));
    let Ok(manifest) = read_manifest(&dir) else {
        return Vec::new();
    };
    let Some(mapping) = manifest.mappings.get(event) else {
        return Vec::new();
    };
    resolve_existing_clips(&dir, &mapping.clips)
}

/// Safely resolve a manifest-relative asset path — a `clips[]` entry,
/// `bannerAsset`, or `coverImage` — against `pack_dir`.
///
/// `manifest.json` is attacker-influenced: it ships inside imported `.zip`
/// packs, and `POST /announcer/install` on the unauthenticated `:3000` GSI
/// server can auto-activate any pack already on disk. Joining a raw manifest
/// string onto a directory with no validation is a path-traversal /
/// arbitrary-local-file primitive — the resolved path gets **played**
/// (`audio::play_file`) or **base64-inlined onto the Tauri event bus**
/// (`fired_banner` -> `announcer-banner`, and the pack inventory's cover /
/// clip tiles), so this one helper is the single choke point every call site
/// below must go through.
///
/// Returns `None` for anything unsafe; the caller treats that exactly like a
/// missing clip (skips the entry — the existing missing/fallback handling
/// covers it, nothing new to plumb through). Returns `Some(path)` only when
/// the path is safe AND currently resolves to a regular file:
///
/// - Rejects (before touching the filesystem) any relative string whose
///   *parsed* `Path::components()` contain a `Prefix` (drive letter `C:\`,
///   UNC `\\server\share`, verbatim `\\?\`), a `RootDir` (leading `/` or
///   `\`), or a `ParentDir` (`..`) anywhere. Checked on both the raw string
///   and the `\`->`/`-normalized form (matching the existing normalization
///   convention used elsewhere in this file), so this is structural —
///   immune to separator-mixing tricks — not a substring match. Zero
///   syscalls.
/// - A path that clears the structural check but doesn't exist as a file
///   (missing, or resolves to a directory) also returns `None` — same
///   "missing" bucket, no special-case needed by callers.
/// - Only when the target DOES exist as a file do we pay for
///   `fs::canonicalize` on both `pack_dir` and the candidate and require the
///   candidate's canonical form to sit inside the canonical pack dir. This
///   is what catches a symlink planted inside the pack whose target escapes
///   it — the structural component check alone can't see through a symlink.
///   This is the only extra cost versus the pre-fix code path (which was a
///   single `is_file()` stat): one stat (unchanged) + two canonicalize calls,
///   paid only for entries that actually exist.
///
/// Rejections are logged once via `eprintln!` with the pack id (from
/// `pack_dir`'s file name) and the *relative* string only — never an
/// absolute path. `:3000` has no auth, so error/log detail must not leak the
/// install directory (same precedent as `gsi.rs run_announcer_install`).
fn safe_pack_path(pack_dir: &Path, rel: &str) -> Option<PathBuf> {
    safe_pack_path_canon(pack_dir, None, rel)
}

/// Like [`safe_pack_path`] but accepts a pre-canonicalized `pack_dir`, so a
/// caller resolving many clips at once (the G-Signal gank path via
/// [`resolve_existing_clips`], which has a ≤300ms budget) pays the pack-dir
/// `canonicalize` once per call instead of once per clip. `None` = canonicalize
/// it here (single-shot callers).
fn safe_pack_path_canon(pack_dir: &Path, canon_dir: Option<&Path>, rel: &str) -> Option<PathBuf> {
    let normalized = rel.replace('\\', "/");
    if has_unsafe_component(rel) || has_unsafe_component(&normalized) {
        eprintln!(
            "[G-Maiden] voice pack '{}': rejected unsafe manifest path '{normalized}'",
            pack_id_for_log(pack_dir)
        );
        return None;
    }
    if normalized.trim().is_empty() {
        return None;
    }

    let candidate = pack_dir.join(&normalized);
    match fs::metadata(&candidate) {
        Ok(meta) if meta.is_file() => {
            // Resolve the containment base once (reuse the caller's if given).
            let canon_dir_owned;
            let base = match canon_dir {
                Some(d) => d,
                None => match fs::canonicalize(pack_dir) {
                    Ok(d) => {
                        canon_dir_owned = d;
                        canon_dir_owned.as_path()
                    }
                    // canonicalize erroring on a dir we're serving from is
                    // exotic (a race); fail closed rather than trust it.
                    Err(_) => return None,
                },
            };
            match fs::canonicalize(&candidate) {
                Ok(canon_candidate) if canon_candidate.starts_with(base) => Some(candidate),
                Ok(_) => {
                    eprintln!(
                        "[G-Maiden] voice pack '{}': rejected symlink escape at '{normalized}'",
                        pack_id_for_log(pack_dir)
                    );
                    None
                }
                Err(_) => None,
            }
        }
        // Exists but isn't a regular file (a directory, e.g. an empty/`.`
        // manifest entry), or doesn't exist at all — either way, "missing".
        _ => None,
    }
}

/// Structural traversal/absolute-path check shared by both the raw and
/// normalized forms of a manifest string in [`safe_pack_path`]. Operates on
/// parsed `Path::components()`, not substring matching, so it's immune to
/// `foo/../bar` tricks and mixed `/`/`\` separators.
fn has_unsafe_component(s: &str) -> bool {
    Path::new(s).components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    })
}

fn pack_id_for_log(pack_dir: &Path) -> String {
    pack_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "?".to_string())
}

/// Resolve a manifest mapping's `clips` (paths relative to the pack dir) to
/// absolute paths, keeping only the ones that are safe AND actually exist on
/// disk. Shared by live playback (`active_event_clips`) and `install_report`
/// below so both always agree on what counts as "this event has a clip".
fn resolve_existing_clips(dir: &Path, clips: &[String]) -> Vec<PathBuf> {
    // Canonicalize the pack dir once for the whole clip list — this runs on the
    // ≤300ms gank path, so we don't repeat it per clip (gate WARN 2026-07-10).
    let canon_dir = fs::canonicalize(dir).ok();
    clips
        .iter()
        .filter_map(|rel| safe_pack_path_canon(dir, canon_dir.as_deref(), rel))
        .collect()
}

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
fn fired_banner_from(pack_id: Option<String>, event: &str) -> FiredBanner {
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
pub fn preview_clip(pack_id: &str, event: &str) -> Option<PathBuf> {
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
fn read_banner_data_url(path: &Path) -> Option<String> {
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

fn image_mime(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// Standard base64 (RFC 4648) — small and dependency-free. Shared with
/// `capture.rs` for inlining the live minimap PNG onto the event bus.
pub(crate) fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

// Test-only root override. `voice_cache_dir()` is resolved from the exe path /
// dev-tree with no injection point, so the install-report/activation unit
// tests below need something to redirect `voice_root()` at a scratch temp dir.
// `thread_local` keeps each `#[test]` thread's override isolated from the
// others (Rust runs tests on separate threads by default) without touching
// any production code path — non-test builds never read this.
#[cfg(test)]
thread_local! {
    static TEST_VOICE_ROOT: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
pub(crate) fn set_test_voice_root(path: Option<PathBuf>) {
    TEST_VOICE_ROOT.with(|cell| *cell.borrow_mut() = path);
}

fn voice_root() -> PathBuf {
    #[cfg(test)]
    {
        if let Some(p) = TEST_VOICE_ROOT.with(|cell| cell.borrow().clone()) {
            return p;
        }
    }
    audio::voice_cache_dir()
}

fn packs_dir() -> PathBuf {
    voice_root().join("packs")
}

fn active_path() -> PathBuf {
    voice_root().join("active-pack.txt")
}

fn pack_dir(pack_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_id(pack_id);
    let dir = packs_dir().join(id);
    if !dir.is_dir() {
        return Err(format!("voice pack not found: {pack_id}"));
    }
    Ok(dir)
}

fn discover_pack_dirs(packs: &Path) -> Vec<PathBuf> {
    fs::read_dir(packs)
        .ok()
        .into_iter()
        .flat_map(|it| it.flatten())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect()
}

fn create_pack_skeleton(dir: &Path, id: &str, name: &str, locale: &str) -> Result<(), String> {
    fs::create_dir_all(dir.join("clips")).map_err(|e| format!("create clips dir: {e}"))?;
    fs::create_dir_all(dir.join("banners")).map_err(|e| format!("create banners dir: {e}"))?;
    if !dir.join("manifest.json").is_file() {
        let manifest = Manifest {
            id: id.into(),
            name: name.into(),
            version: "0.1.0".into(),
            locale: locale.into(),
            author: String::new(),
            description: "User voice pack".into(),
            cover_image: String::new(),
            mappings: BTreeMap::new(),
        };
        write_manifest(dir, &manifest)?;
    }
    Ok(())
}

fn read_manifest(dir: &Path) -> Result<Manifest, String> {
    let path = dir.join("manifest.json");
    let raw = fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse {}: {e}", path.display()))
}

fn write_manifest(dir: &Path, manifest: &Manifest) -> Result<(), String> {
    let path = dir.join("manifest.json");
    let raw =
        serde_json::to_string_pretty(manifest).map_err(|e| format!("serialize manifest: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("write {}: {e}", path.display()))
}

fn build_pack(dir: &Path) -> Result<VoicePack, String> {
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
            VoiceEvent {
                id: event.id.into(),
                group: event.group.into(),
                label: event.label.into(),
                subtitle: event.subtitle.into(),
                thai: event.thai.into(),
                accent: accent.into(),
                mapping,
            }
        })
        .collect::<Vec<_>>();

    Ok(VoicePack {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        locale: manifest.locale,
        author: manifest.author,
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
    })
}

fn list_assets(dir: &Path, folder: &str, extensions: &[&str]) -> Vec<VoiceAssetOption> {
    let root = dir.join(folder);
    let mut out = Vec::new();
    collect_assets(dir, &root, extensions, &mut out);
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

fn collect_assets(base: &Path, dir: &Path, extensions: &[&str], out: &mut Vec<VoiceAssetOption>) {
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

fn asset_option(base: &Path, rel: &str) -> Option<VoiceAssetOption> {
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

fn read_active_pack_id() -> Option<String> {
    fs::read_to_string(active_path())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn write_active_pack_id(id: &str) -> Result<(), String> {
    let root = voice_root();
    fs::create_dir_all(&root).map_err(|e| format!("create voice root: {e}"))?;
    fs::write(active_path(), id).map_err(|e| format!("write active pack: {e}"))
}

fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let mut file = fs::File::create(path).map_err(|e| format!("create {}: {e}", path.display()))?;
    file.write_all(bytes)
        .map_err(|e| format!("write {}: {e}", path.display()))
}

fn sanitize_id(value: &str) -> String {
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

fn sanitize_file_name(value: &str) -> String {
    Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ' '))
        .collect::<String>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_rfc4648_vectors() {
        // Canonical RFC 4648 §10 test vectors — a wrong encoder = broken banners.
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64_handles_high_bytes() {
        assert_eq!(base64_encode(&[0xff, 0xff, 0xff]), "////");
        assert_eq!(base64_encode(&[0x00, 0x00, 0x00]), "AAAA");
    }

    #[test]
    fn image_mime_maps_known_extensions() {
        assert_eq!(image_mime("PNG"), "image/png");
        assert_eq!(image_mime("jpg"), "image/jpeg");
        assert_eq!(image_mime("jpeg"), "image/jpeg");
        assert_eq!(image_mime("svg"), "image/svg+xml");
        assert_eq!(image_mime("bmp"), "application/octet-stream");
    }

    #[test]
    fn sanitize_id_collapses_path_traversal_to_a_plain_name() {
        // A malicious "packId" like "../../evil" must never let a caller of
        // packs_dir().join(sanitize_id(..)) walk outside packs/. sanitize_id
        // maps every non alnum/-/_ char (including '.' and '/') to '-', then
        // trims leading/trailing '-', so this collapses to a bare "evil" —
        // still confined under packs_dir(), never an actual traversal.
        assert_eq!(sanitize_id("../../evil"), "evil");
        assert_eq!(sanitize_id("..\\..\\evil"), "evil");
        assert_eq!(sanitize_id("/etc/passwd"), "etc-passwd");
    }

    /// Scratch dir for the install-report / activation tests below, isolated
    /// per test via `set_test_voice_root` (thread_local — see its comment).
    fn temp_root(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("gmaiden-voice-api-test-{tag}-{}", nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_pack(root: &Path, id: &str, mappings: BTreeMap<String, ManifestMapping>) -> PathBuf {
        let dir = root.join("packs").join(id);
        fs::create_dir_all(dir.join("clips")).unwrap();
        let manifest = Manifest {
            id: id.to_string(),
            name: "Test Pack".into(),
            version: "0.1.0".into(),
            locale: "th-TH".into(),
            author: String::new(),
            description: String::new(),
            cover_image: String::new(),
            mappings,
        };
        write_manifest(&dir, &manifest).unwrap();
        dir
    }

    fn mapping(clips: &[&str]) -> ManifestMapping {
        ManifestMapping {
            text: String::new(),
            thai: String::new(),
            banner: String::new(),
            banner_asset: String::new(),
            clips: clips.iter().map(|c| c.to_string()).collect(),
        }
    }

    struct RootGuard(PathBuf);
    impl Drop for RootGuard {
        fn drop(&mut self) {
            set_test_voice_root(None);
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn install_report_happy_path_counts_existing_clips() {
        let root = temp_root("happy");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());

        let pack_dir = write_pack(
            &root,
            "demo",
            BTreeMap::from([("kill".to_string(), mapping(&["clips/kill_01.wav", "clips/kill_02.wav"]))]),
        );
        fs::write(pack_dir.join("clips/kill_01.wav"), b"x").unwrap();
        fs::write(pack_dir.join("clips/kill_02.wav"), b"x").unwrap();

        let report = install_report("demo").expect("report");
        assert_eq!(report.pack_id, "demo");
        assert_eq!(report.counts.get("kill"), Some(&2));
        assert!(!report.unmapped_events.contains(&"kill".to_string()));
        assert!(report.missing_clips.is_empty());

        activate_if_exists("demo").expect("activate");
        let active = fs::read_to_string(root.join("active-pack.txt")).unwrap();
        assert_eq!(active.trim(), "demo");
    }

    #[test]
    fn install_report_flags_mapped_but_missing_clip() {
        let root = temp_root("missing-clip");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());

        let pack_dir = write_pack(
            &root,
            "demo",
            BTreeMap::from([("kill".to_string(), mapping(&["clips/kill_01.wav", "clips/ghost.wav"]))]),
        );
        fs::write(pack_dir.join("clips/kill_01.wav"), b"x").unwrap();
        // clips/ghost.wav intentionally never written.

        let report = install_report("demo").expect("report");
        assert_eq!(report.counts.get("kill"), Some(&1));
        assert!(report
            .missing_clips
            .iter()
            .any(|c| c == "clips/ghost.wav"));
    }

    #[test]
    fn install_report_flags_event_with_zero_clips_as_unmapped() {
        let root = temp_root("zero-clip");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());

        write_pack(
            &root,
            "demo",
            BTreeMap::from([("kill".to_string(), mapping(&[]))]),
        );

        let report = install_report("demo").expect("report");
        assert_eq!(report.counts.get("kill"), Some(&0));
        assert!(report.unmapped_events.contains(&"kill".to_string()));
    }

    #[test]
    fn real_pack_mrijgajn_maps_voice_and_banners() {
        // Exercises the manifest reader against the REAL committed announcer pack
        // (G-Maiden `2a7ba551`, blessed as reader test data by CR-009 §3): the
        // local half of CR-009's still-pending "install → activate → hear/see in
        // Dota" gate — it proves the pack's voice + banner mapping resolves.
        // cargo test runs from `src-tauri/`, so the repo assets are one level up.
        let root = PathBuf::from("../assets/voice-cache");
        if !root.join("packs/pack_mrijgajn/manifest.json").is_file() {
            eprintln!("skip: pack_mrijgajn not present under {}", root.display());
            return;
        }
        // Reset the override on the way out. Do NOT delete the dir — unlike the
        // scratch-tempdir tests above, this points at the real repo asset.
        struct Reset;
        impl Drop for Reset {
            fn drop(&mut self) {
                set_test_voice_root(None);
            }
        }
        let _reset = Reset;
        set_test_voice_root(Some(root));

        let report = install_report("pack_mrijgajn").expect("report for real pack");

        // Core integrity: every mapped clip resolves to a real, in-bounds file —
        // no dangling or path-escaping references.
        assert!(
            report.missing_clips.is_empty(),
            "pack has dangling/unsafe clip refs: {:?}",
            report.missing_clips
        );

        // Each of the 13 mapped events resolves >=1 clip; two have two takes.
        for ev in [
            "death", "dominating", "double_kill", "first_blood", "kill",
            "killing_spree", "mega_kill", "monster_kill", "respawn",
            "triple_kill", "ultra_kill", "unstoppable", "wicked_sick",
        ] {
            assert!(
                report.counts.get(ev).copied().unwrap_or(0) >= 1,
                "mapped event {ev} resolved no clips"
            );
            assert!(
                !report.unmapped_events.contains(&ev.to_string()),
                "{ev} wrongly reported unmapped"
            );
        }
        assert_eq!(report.counts.get("death"), Some(&2));
        assert_eq!(report.counts.get("mega_kill"), Some(&2));

        // Events the pack doesn't cover fall through cleanly (count 0, unmapped).
        for ev in ["danger", "gank", "match_start", "advice"] {
            assert_eq!(report.counts.get(ev), Some(&0), "{ev} unexpectedly mapped");
            assert!(report.unmapped_events.contains(&ev.to_string()));
        }

        // Banner resolution: a mapped event inlines its webp as a data: URL and
        // carries the event's default Thai caption; an unmapped event yields no
        // image but still the default caption (overlay falls back to its card).
        let kill = fired_banner_from(Some("pack_mrijgajn".to_string()), "kill");
        assert!(
            kill.banner_data
                .as_deref()
                .unwrap_or("")
                .starts_with("data:image/webp;base64,"),
            "kill banner did not resolve to a webp data URL"
        );
        assert_eq!(kill.thai, "คิล");

        let danger = fired_banner_from(Some("pack_mrijgajn".to_string()), "danger");
        assert!(danger.banner_data.is_none());
        assert_eq!(danger.thai, "อันตราย");
    }

    #[test]
    fn install_report_errs_for_nonexistent_pack_and_activation_is_skipped() {
        let root = temp_root("no-pack");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());

        assert!(install_report("does-not-exist").is_err());
        assert!(activate_if_exists("does-not-exist").is_err());
        assert!(!root.join("active-pack.txt").is_file());
    }

    #[test]
    fn traversal_pack_id_resolves_only_under_packs_dir_never_escapes() {
        let root = temp_root("traversal");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());

        // No pack named "evil" exists anywhere — including outside packs/ at
        // the literal relative path "../../evil" the raw id spells out. Since
        // sanitize_id collapses it to "evil" and packs_dir().join(..) confines
        // the lookup under root/packs/, this must fail exactly like any other
        // unknown id — never read/activate something outside packs_dir().
        assert!(install_report("../../evil").is_err());
        assert!(activate_if_exists("../../evil").is_err());
        assert!(!root.join("active-pack.txt").is_file());
    }

    // -- Gap 1: manifest-relative path traversal (safe_pack_path) -------

    #[test]
    fn safe_pack_path_rejects_dot_dot_traversal() {
        let root = temp_root("safe-path-dotdot");
        let _guard = RootGuard(root.clone());
        let dir = write_pack(&root, "demo", BTreeMap::new());

        assert!(safe_pack_path(&dir, "../../../../Windows/System32/config/SAM").is_none());
        assert!(safe_pack_path(&dir, "..\\..\\..\\..\\Windows\\System32\\config\\SAM").is_none());
        // `..` buried mid-path must be caught too — not just a leading match.
        assert!(safe_pack_path(&dir, "clips/../../evil.wav").is_none());
    }

    #[test]
    fn safe_pack_path_rejects_absolute_paths() {
        let root = temp_root("safe-path-absolute");
        let _guard = RootGuard(root.clone());
        let dir = write_pack(&root, "demo", BTreeMap::new());

        assert!(safe_pack_path(&dir, "C:\\Windows\\notepad.exe").is_none());
        assert!(safe_pack_path(&dir, "/etc/passwd").is_none());
    }

    #[test]
    fn safe_pack_path_rejects_unc_and_verbatim_prefixes() {
        let root = temp_root("safe-path-unc");
        let _guard = RootGuard(root.clone());
        let dir = write_pack(&root, "demo", BTreeMap::new());

        assert!(safe_pack_path(&dir, "\\\\server\\share\\evil.wav").is_none());
        assert!(safe_pack_path(&dir, "\\\\?\\C:\\Windows\\notepad.exe").is_none());
    }

    #[test]
    fn safe_pack_path_accepts_well_formed_nested_path() {
        let root = temp_root("safe-path-nested");
        let _guard = RootGuard(root.clone());
        let dir = write_pack(&root, "demo", BTreeMap::new());
        fs::create_dir_all(dir.join("clips/sub")).unwrap();
        fs::write(dir.join("clips/sub/kill_01.wav"), b"x").unwrap();

        // No false positive: a legitimate nested path inside the pack must
        // still resolve, canonicalize-containment check included.
        assert_eq!(
            safe_pack_path(&dir, "clips/sub/kill_01.wav"),
            Some(dir.join("clips/sub/kill_01.wav"))
        );
    }

    #[test]
    fn safe_pack_path_treats_missing_file_as_none_not_error() {
        let root = temp_root("safe-path-missing");
        let _guard = RootGuard(root.clone());
        let dir = write_pack(&root, "demo", BTreeMap::new());

        // Safe by construction, but nothing on disk — same bucket as a
        // rejected path from the caller's point of view (both are skipped),
        // yet this path never touches the eprintln-tagged rejection branch.
        assert!(safe_pack_path(&dir, "clips/does_not_exist.wav").is_none());
    }

    #[test]
    fn safe_pack_path_rejects_symlink_escape_when_creatable() {
        let root = temp_root("safe-path-symlink");
        let _guard = RootGuard(root.clone());
        let dir = write_pack(&root, "demo", BTreeMap::new());

        let outside = root.join("outside-secret.txt");
        fs::write(&outside, b"secret").unwrap();
        let link = dir.join("clips").join("escape.wav");

        #[cfg(windows)]
        let created = std::os::windows::fs::symlink_file(&outside, &link).is_ok();
        #[cfg(not(windows))]
        let created = std::os::unix::fs::symlink(&outside, &link).is_ok();

        if !created {
            // Most sandboxed/CI Windows accounts lack
            // SeCreateSymbolicLinkPrivilege — covered instead by
            // `canonicalize_containment_predicate_direct` below, which
            // exercises the exact same starts_with() containment math this
            // branch relies on, without needing symlink-creation rights.
            eprintln!(
                "skipping safe_pack_path_rejects_symlink_escape_when_creatable: \
                 no permission to create symlinks in this environment"
            );
            return;
        }
        assert!(safe_pack_path(&dir, "clips/escape.wav").is_none());
    }

    /// Direct test of the canonicalize + `starts_with` containment predicate
    /// `safe_pack_path` uses to catch a symlink escape, independent of
    /// whether this environment can actually create a symlink (see above).
    #[test]
    fn canonicalize_containment_predicate_direct() {
        let root = temp_root("containment-predicate");
        let _guard = RootGuard(root.clone());
        let pack_dir = root.join("packs").join("demo");
        let sibling_dir = root.join("packs").join("other");
        fs::create_dir_all(pack_dir.join("clips")).unwrap();
        fs::create_dir_all(&sibling_dir).unwrap();
        fs::write(pack_dir.join("clips/kill_01.wav"), b"x").unwrap();
        fs::write(sibling_dir.join("secret.txt"), b"x").unwrap();

        let canon_pack = fs::canonicalize(&pack_dir).unwrap();
        let canon_inside = fs::canonicalize(pack_dir.join("clips/kill_01.wav")).unwrap();
        let canon_outside = fs::canonicalize(sibling_dir.join("secret.txt")).unwrap();

        assert!(
            canon_inside.starts_with(&canon_pack),
            "a legitimate nested file must be considered contained"
        );
        assert!(
            !canon_outside.starts_with(&canon_pack),
            "a file in a sibling directory must NOT be considered contained — \
             this is exactly the check that rejects a symlink whose real \
             target canonicalizes to a path like `canon_outside`"
        );
    }

    #[test]
    fn fired_banner_ignores_traversal_banner_asset() {
        let root = temp_root("banner-traversal");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());

        let mut evil_mapping = mapping(&[]);
        evil_mapping.banner_asset = "../../../../Windows/win.ini".to_string();
        write_pack(
            &root,
            "demo",
            BTreeMap::from([("kill".to_string(), evil_mapping)]),
        );
        write_active_pack_id("demo").unwrap();

        // Falls back to the built-in card (no banner_data) instead of
        // resolving the traversal and inlining whatever it points at.
        let banner = fired_banner("kill");
        assert!(banner.banner_data.is_none());
        assert_eq!(banner.event, "kill");
    }

    #[test]
    fn preview_clip_ignores_traversal_and_finds_real_clip_after() {
        let root = temp_root("preview-clip-traversal");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());

        let dir = write_pack(
            &root,
            "demo",
            BTreeMap::from([(
                "kill".to_string(),
                mapping(&["../../evil.wav", "clips/kill_01.wav"]),
            )]),
        );
        fs::write(dir.join("clips/kill_01.wav"), b"x").unwrap();

        // The traversal entry is skipped; the real clip after it is still found.
        let clip = preview_clip("demo", "kill");
        assert_eq!(clip, Some(dir.join("clips/kill_01.wav")));
    }

    #[test]
    fn install_report_rejects_traversal_clip_as_missing() {
        let root = temp_root("install-report-traversal");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());

        write_pack(
            &root,
            "demo",
            BTreeMap::from([(
                "kill".to_string(),
                mapping(&["../../../evil.wav"]),
            )]),
        );

        let report = install_report("demo").expect("report");
        assert_eq!(report.counts.get("kill"), Some(&0));
        assert!(report.missing_clips.iter().any(|c| c == "../../../evil.wav"));
        assert!(report.unmapped_events.contains(&"kill".to_string()));
    }

    // -- Gap 2: zip-slip on archive import (extract_pack_zip) -----------

    /// Builds an in-memory `.zip` with the given (entry name, contents)
    /// pairs, using `Stored` (uncompressed) so the test needs no codec
    /// feature beyond what the crate always provides.
    fn build_test_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let cursor = std::io::Cursor::new(&mut buf);
            let mut writer = zip::ZipWriter::new(cursor);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            for (name, data) in entries {
                writer.start_file(*name, options).unwrap();
                writer.write_all(data).unwrap();
            }
            writer.finish().unwrap();
        }
        buf
    }

    #[test]
    fn extract_pack_zip_refuses_traversal_entry_and_writes_nothing() {
        let root = temp_root("zip-traversal");
        let _guard = RootGuard(root.clone());
        let dest = root.join("dest");
        let bytes = build_test_zip(&[
            ("manifest.json", b"{}" as &[u8]),
            ("../evil.txt", b"pwned"),
        ]);

        assert!(extract_pack_zip(&bytes, &dest, "demo").is_err());
        assert!(!root.join("evil.txt").is_file());
        // Two-pass validation: pass 1 rejected before pass 2 wrote anything,
        // so not even the well-formed sibling entry landed.
        assert!(!dest.join("manifest.json").is_file());
    }

    #[test]
    fn extract_pack_zip_refuses_absolute_path_entry() {
        let root = temp_root("zip-absolute");
        let _guard = RootGuard(root.clone());
        let dest = root.join("dest");
        let bytes = build_test_zip(&[("/evil.txt", b"pwned" as &[u8])]);

        assert!(extract_pack_zip(&bytes, &dest, "demo").is_err());
        assert!(!std::path::Path::new("/evil.txt").is_file());
    }

    #[test]
    fn extract_pack_zip_imports_clean_archive() {
        let root = temp_root("zip-clean");
        let _guard = RootGuard(root.clone());
        let dest = root.join("dest");
        fs::create_dir_all(&dest).unwrap();
        let bytes = build_test_zip(&[
            ("manifest.json", b"{}" as &[u8]),
            ("clips/kill_01.wav", b"clipdata"),
        ]);

        extract_pack_zip(&bytes, &dest, "demo").expect("clean archive should import");
        assert!(dest.join("manifest.json").is_file());
        assert!(dest.join("clips/kill_01.wav").is_file());
        assert_eq!(fs::read(dest.join("clips/kill_01.wav")).unwrap(), b"clipdata");
    }
}
