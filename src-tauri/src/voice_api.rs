use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

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
    GroupDef { id: "warning", label: "แจ้งเตือน", accent: "#ff6370" },
    GroupDef { id: "combat", label: "คิล / มัลติคิล", accent: "#ffe24a" },
    GroupDef { id: "streak", label: "สตรีค", accent: "#ff9b45" },
    GroupDef { id: "state", label: "สถานะ", accent: "#66f2b5" },
    GroupDef { id: "advisor", label: "คำแนะนำ", accent: "#8fd3ff" },
];

const EVENTS: &[EventDef] = &[
    EventDef { id: "danger", group: "warning", label: "Danger", subtitle: "High danger warning", thai: "อันตราย" },
    EventDef { id: "gank", group: "warning", label: "Gank", subtitle: "Incoming gank", thai: "แก๊งค์" },
    EventDef { id: "revision", group: "warning", label: "Revision", subtitle: "Belief revision", thai: "ยกเลิกเตือน" },
    EventDef { id: "hpLow", group: "warning", label: "HP Low", subtitle: "Health is low", thai: "เลือดต่ำ" },
    EventDef { id: "manaLow", group: "warning", label: "Mana Low", subtitle: "Mana is low", thai: "มานาต่ำ" },
    EventDef { id: "first_blood", group: "combat", label: "First Blood", subtitle: "First blood", thai: "เลือดแรก" },
    EventDef { id: "kill", group: "combat", label: "Kill", subtitle: "Hero kill", thai: "คิล" },
    EventDef { id: "double_kill", group: "combat", label: "Double Kill", subtitle: "Double kill", thai: "ดับเบิลคิล" },
    EventDef { id: "triple_kill", group: "combat", label: "Triple Kill", subtitle: "Triple kill", thai: "ทริปเปิลคิล" },
    EventDef { id: "ultra_kill", group: "combat", label: "Ultra Kill", subtitle: "Ultra kill", thai: "อัลตร้า" },
    EventDef { id: "rampage", group: "combat", label: "Rampage", subtitle: "Rampage", thai: "แรมเพจ" },
    EventDef { id: "killing_spree", group: "streak", label: "Killing Spree", subtitle: "Killing spree", thai: "สปรี" },
    EventDef { id: "dominating", group: "streak", label: "Dominating", subtitle: "Dominating", thai: "ครอบครอง" },
    EventDef { id: "mega_kill", group: "streak", label: "Mega Kill", subtitle: "Mega kill", thai: "เมก้าคิล" },
    EventDef { id: "unstoppable", group: "streak", label: "Unstoppable", subtitle: "Unstoppable", thai: "หยุดไม่ได้" },
    EventDef { id: "wicked_sick", group: "streak", label: "Wicked Sick", subtitle: "Wicked sick", thai: "โหดจัด" },
    EventDef { id: "monster_kill", group: "streak", label: "Monster Kill", subtitle: "Monster kill", thai: "มอนสเตอร์คิล" },
    EventDef { id: "godlike", group: "streak", label: "Godlike", subtitle: "Godlike", thai: "เทพเจ้า" },
    EventDef { id: "beyond_godlike", group: "streak", label: "Beyond Godlike", subtitle: "Beyond godlike", thai: "เหนือเทพเจ้า" },
    EventDef { id: "levelUp", group: "state", label: "Level Up", subtitle: "Level up", thai: "เลเวลอัพ" },
    EventDef { id: "match_start", group: "state", label: "Match Start", subtitle: "Match start", thai: "เริ่มเกม" },
    EventDef { id: "death", group: "state", label: "Death", subtitle: "Hero died", thai: "ตาย" },
    EventDef { id: "respawn", group: "state", label: "Respawn", subtitle: "Respawn", thai: "เกิดใหม่" },
    EventDef { id: "advice", group: "advisor", label: "Advice", subtitle: "Advisor line", thai: "คำแนะนำ" },
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
            .map(|g| VoiceGroup { id: g.id.into(), label: g.label.into(), accent: g.accent.into() })
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
            let _ = std::process::Command::new("explorer").arg(dir.as_os_str()).spawn();
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

pub fn upload_asset(pack_id: &str, kind: &str, name: &str, bytes: &[u8]) -> Result<UploadResult, String> {
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
    Ok(UploadResult { path: rel.replace('\\', "/") })
}

pub fn import_archive(name: &str, bytes: &[u8]) -> Result<ImportResult, String> {
    let id = sanitize_id(Path::new(name).file_stem().and_then(|s| s.to_str()).unwrap_or("imported-pack"));
    let id = if id.is_empty() { "imported-pack".to_string() } else { id };
    let root = voice_root();
    let imports = root.join("imports");
    fs::create_dir_all(&imports).map_err(|e| format!("create imports dir: {e}"))?;
    let archive = imports.join(format!("{id}.zip"));
    write_bytes(&archive, bytes)?;

    let dest = packs_dir().join(&id);
    fs::create_dir_all(&dest).map_err(|e| format!("create import dir: {e}"))?;

    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
            ])
            .arg(&archive)
            .arg(&dest)
            .status()
            .map_err(|e| format!("expand zip: {e}"))?;
        if !status.success() {
            return Err("Expand-Archive failed".into());
        }
    }

    if !dest.join("manifest.json").is_file() {
        create_pack_skeleton(&dest, &id, name, "th-TH")?;
    }
    write_active_pack_id(&id)?;
    Ok(ImportResult { imported: vec![id] })
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
    write_manifest(&dir, &manifest)?;
    state()
}

/// Absolute paths to the clips the ACTIVE pack maps to `event`. The active pack
/// (its manifest) is the source of truth for playback, so a fired announcer event
/// voices the pack's clips and its banner together — the "bundle" contract.
/// Existing files only; empty when there is no active pack / manifest / mapping.
pub fn active_event_clips(event: &str) -> Vec<PathBuf> {
    let Some(id) = read_active_pack_id() else { return Vec::new() };
    let dir = packs_dir().join(sanitize_id(&id));
    let Ok(manifest) = read_manifest(&dir) else { return Vec::new() };
    let Some(mapping) = manifest.mappings.get(event) else { return Vec::new() };
    mapping
        .clips
        .iter()
        .map(|rel| dir.join(rel.replace('\\', "/")))
        .filter(|path| path.is_file())
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
    let mut banner_text = def.map(|d| d.label.to_string()).unwrap_or_else(|| event.to_string());
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
                    let path = dir.join(mapping.banner_asset.replace('\\', "/"));
                    banner_data = read_banner_data_url(&path);
                }
            }
        }
    }

    FiredBanner { event: event.to_string(), banner_data, banner_text, thai }
}

/// A clip mapped to `event` in a SPECIFIC pack, to play during an overlay preview
/// (first mapped, existing file). `None` when the pack maps no playable clip.
pub fn preview_clip(pack_id: &str, event: &str) -> Option<PathBuf> {
    let dir = packs_dir().join(sanitize_id(pack_id));
    let manifest = read_manifest(&dir).ok()?;
    let mapping = manifest.mappings.get(event)?;
    mapping
        .clips
        .iter()
        .map(|rel| dir.join(rel.replace('\\', "/")))
        .find(|path| path.is_file())
}

/// Read an image file into a base64 `data:` URL, or `None` if missing/too large.
fn read_banner_data_url(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_BANNER_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or_default();
    Some(format!("data:{};base64,{}", image_mime(ext), base64_encode(&bytes)))
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

/// Standard base64 (RFC 4648) — small and dependency-free.
fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn voice_root() -> PathBuf {
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
    let raw = serde_json::to_string_pretty(manifest).map_err(|e| format!("serialize manifest: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("write {}: {e}", path.display()))
}

fn build_pack(dir: &Path) -> Result<VoicePack, String> {
    let manifest = read_manifest(dir)?;
    let clips = list_assets(dir, "clips", &["wav", "mp3", "ogg", "m4a"]);
    let banners = list_assets(dir, "banners", &["png", "jpg", "jpeg", "webp", "svg"]);
    let mut covered = 0;

    let items = EVENTS
        .iter()
        .map(|event| {
            let accent = GROUPS.iter().find(|group| group.id == event.group).map(|group| group.accent).unwrap_or("#8fd3ff");
            let mapping = manifest.mappings.get(event.id).map(|raw| {
                covered += 1;
                let clip_options = raw
                    .clips
                    .iter()
                    .filter_map(|rel| asset_option(dir, rel))
                    .collect::<Vec<_>>();
                let clip_url = clip_options.first().map(|clip| clip.url.clone());
                let banner_url = if raw.banner_asset.is_empty() {
                    None
                } else {
                    asset_option(dir, &raw.banner_asset).map(|asset| asset.url)
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
    let Ok(entries) = fs::read_dir(dir) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_assets(base, &path, extensions, out);
            continue;
        }
        let Some(ext) = path.extension().and_then(|x| x.to_str()).map(|x| x.to_ascii_lowercase()) else { continue; };
        if extensions.iter().any(|allowed| *allowed == ext) {
            if let Some(asset) = asset_option(base, path.strip_prefix(base).unwrap_or(&path).to_string_lossy().as_ref()) {
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
    fs::read_to_string(active_path()).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
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
    file.write_all(bytes).map_err(|e| format!("write {}: {e}", path.display()))
}

fn sanitize_id(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
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
}
