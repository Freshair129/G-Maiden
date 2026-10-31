//! Verified GANN snapshot projection, media integrity, cache generations and Store provenance.
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};

use base64::Engine as _;
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};

use crate::audio;

use super::events::{EVENTS, GROUPS};
use super::path_safety::{resolve_existing_clips, safe_pack_path};
use super::paths::{active_path, packs_dir, voice_root};
use super::types::{VoiceAssetOption, VoiceEvent, VoiceMapping, VoicePack};

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
    /// Explicit inventory cover metadata; empty when absent from the registry.
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

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoreInstallRecord {
    pub(crate) version: u8,
    pub(crate) user_id: String,
    pub(crate) item_id: String,
    pub(crate) pack_id: String,
    pub(crate) issued_at: String,
    #[serde(default)]
    pub(crate) archive_sha256: String,
    pub(crate) signature: String,
}

const STORE_INSTALL_PUBLIC_KEY: [u8; 32] = [
    0x79, 0xe2, 0x56, 0xed, 0x1d, 0x81, 0x6f, 0x08, 0x3a, 0x0c, 0xb9, 0x80, 0x2a, 0x6f, 0x59, 0x00,
    0x30, 0x45, 0xf9, 0xc1, 0x0a, 0x38, 0x16, 0x17, 0xc1, 0xea, 0x9a, 0x9f, 0xae, 0xc1, 0xa8, 0x7a,
];

fn store_installations_path() -> PathBuf {
    voice_root().join("store-installations.json")
}

pub(crate) fn verify_store_install(record: &StoreInstallRecord) -> bool {
    if record.version != 2
        || record.user_id.len() > 64
        || record.item_id.len() > 64
        || record.pack_id.is_empty()
        || record.pack_id.len() > 96
        || record.issued_at.len() > 64
        || sanitize_id(&record.pack_id) != record.pack_id
        || !is_sha256_hex(&record.archive_sha256)
    {
        return false;
    }
    let Ok(signature) = base64::engine::general_purpose::STANDARD.decode(&record.signature) else {
        return false;
    };
    if signature.len() != 64 {
        return false;
    }
    verify_store_install_signature(record, &signature, &STORE_INSTALL_PUBLIC_KEY)
}

fn verify_store_install_signature(
    record: &StoreInstallRecord,
    signature: &[u8],
    public_key: &[u8; 32],
) -> bool {
    let message = format!(
        "gmaiden-store-install-v2\n{}\n{}\n{}\n{}\n{}",
        record.user_id, record.item_id, record.pack_id, record.issued_at, record.archive_sha256
    );
    UnparsedPublicKey::new(&ED25519, public_key)
        .verify(message.as_bytes(), signature)
        .is_ok()
}

pub(crate) fn record_store_install(record: StoreInstallRecord) -> Result<(), String> {
    if !verify_store_install(&record) {
        return Err("หลักฐานติดตั้ง Store ไม่ถูกต้อง".into());
    }
    let path = store_installations_path();
    let mut records = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<StoreInstallRecord>>(&raw).ok())
        .unwrap_or_default();
    records.retain(|existing| {
        existing.item_id != record.item_id && existing.pack_id != record.pack_id
    });
    records.push(record);
    let raw = serde_json::to_vec_pretty(&records)
        .map_err(|e| format!("serialize Store installation record: {e}"))?;
    fs::write(path, raw).map_err(|e| format!("save Store installation record: {e}"))
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn sha256_hex(bytes: &[u8]) -> String {
    ring::digest::digest(&ring::digest::SHA256, bytes)
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn archive_hash_matches(record: &StoreInstallRecord, bytes: &[u8]) -> bool {
    verify_store_install(record) && content_matches_hash(&record.archive_sha256, bytes)
}

fn content_matches_hash(expected_hash: &str, bytes: &[u8]) -> bool {
    is_sha256_hex(expected_hash) && sha256_hex(bytes) == expected_hash
}

pub(crate) fn open_verified_store_clip(path: &Path) -> Result<Option<fs::File>, String> {
    let Ok(packs_root) = packs_dir().canonicalize() else {
        return Ok(None);
    };
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("resolve Store clip: {e}"))?;
    let Ok(relative) = canonical_path.strip_prefix(&packs_root) else {
        return Ok(None);
    };
    let mut components = relative.components();
    let Some(pack_component) = components.next() else {
        return Err("ตำแหน่งคลิป Store ไม่ถูกต้อง".into());
    };
    let pack_id = pack_component
        .as_os_str()
        .to_str()
        .ok_or_else(|| "รหัสแพ็ก Store ไม่ถูกต้อง".to_string())?;
    let clip_path = components.as_path();
    if super::id_manifest::valid_id(pack_id, "ann_") {
        return super::id_container::open_local_clip(pack_id, clip_path).map(Some);
    }
    Err("Event audio must come from an admitted GANN package".into())
}

pub(crate) fn validate_store_clip_integrity(path: &Path) -> Result<(), String> {
    open_verified_store_clip(path).map(|_| ())
}

pub(crate) fn read_manifest(dir: &Path) -> Result<Manifest, String> {
    super::id_manifest::read(dir).map(|registry| registry.project())
}
pub(crate) fn build_pack(dir: &Path) -> Result<VoicePack, String> {
    let manifest = read_manifest(dir)?;
    let clips = manifest
        .mappings
        .values()
        .flat_map(|mapping| mapping.clips.iter())
        .filter_map(|path| asset_option(dir, path))
        .collect::<Vec<_>>();
    let banners = Vec::new();
    let cover_image = String::new();
    let cover_image_url = None;
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
        author_gid: manifest.author_gid,
        description: if super::id_container::is_local_package(
            dir.file_name().and_then(|s| s.to_str()).unwrap_or(""),
        ) {
            format!("Local .gann · {}", manifest.description)
        } else {
            manifest.description
        },
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
// Resolution and verification occur before publishing one immutable generation.
struct ResolvedCache {
    revision: u64,
    pack_id: String,
    pack_name: String,
    clips_by_event: HashMap<String, Vec<PathBuf>>,
    pairs: super::id_manifest::Pairs,
}

// Each runtime owns one generation; parallel tests keep their voice-root override isolated.
#[cfg(not(test))]
static RESOLVED_CACHE: Mutex<Option<ResolvedCache>> = Mutex::new(None);
#[cfg(test)]
thread_local! {
    static RESOLVED_CACHE: std::cell::RefCell<Option<ResolvedCache>> = const { std::cell::RefCell::new(None) };
}

#[cfg(not(test))]
fn store_resolved_cache(mut next: Option<ResolvedCache>) {
    if let Ok(mut cache) = RESOLVED_CACHE.lock() {
        stamp_cache(&mut next);
        super::video_cache::reset(next.as_ref().map_or(0, |c| c.revision));
        *cache = next;
    }
    prewarm_likely_videos(&["first_blood", "double_kill", "kill"]);
}
#[cfg(test)]
fn store_resolved_cache(mut next: Option<ResolvedCache>) {
    stamp_cache(&mut next);
    super::video_cache::reset(next.as_ref().map_or(0, |c| c.revision));
    RESOLVED_CACHE.with(|cell| *cell.borrow_mut() = next);
}

#[cfg(not(test))]
fn prewarm_likely_videos(events: &[&str]) {
    super::visual_warm::publish(visual_candidates_for(events));
    let snapshot = with_resolved_cache(|cache| {
        let c = cache?;
        let videos = events
            .iter()
            .filter_map(|event| {
                let path = c.clips_by_event.get(*event)?.first()?;
                Some(c.pairs.get(&(event.to_string(), path.clone()))?.clone())
            })
            .collect::<Vec<_>>();
        Some((c.pack_id.clone(), c.revision, videos))
    });
    if let Some(plan) = snapshot {
        queue_warm_videos(plan);
    }
}

#[cfg(not(test))]
fn queue_warm_videos(plan: (String, u64, Vec<Arc<super::id_manifest::Pair>>)) {
    type Plan = (String, u64, Vec<Arc<super::id_manifest::Pair>>);
    #[derive(Default)]
    struct WarmState {
        running: bool,
        latest_revision: u64,
        pending: Option<Plan>,
    }
    static WARM: OnceLock<Mutex<WarmState>> = OnceLock::new();
    let state = WARM.get_or_init(Mutex::default);
    let Ok(mut guard) = state.lock() else {
        return;
    };
    if plan.1 < guard.latest_revision {
        return;
    }
    guard.latest_revision = plan.1;
    // One worker and one latest pending hint; a new generation is never lost.
    guard.pending = Some(plan);
    if guard.running {
        return;
    }
    guard.running = true;
    drop(guard);
    if std::thread::Builder::new()
        .name("g-banner-prewarm".into())
        .spawn(move || loop {
            let next = {
                let Ok(mut guard) = state.lock() else {
                    return;
                };
                let next = guard.pending.take();
                if next.is_none() {
                    guard.running = false;
                }
                next
            };
            let Some((pack, revision, videos)) = next else {
                return;
            };
            for pair in videos {
                if id_video(&pack, &pair.banner_id, revision).is_none() {
                    break;
                }
                let ready =
                    super::video_cache::verified(revision, &pair.video, &pair.video_hash).is_some();
                eprintln!(
                    "[G-BannerCache] warm revision={revision} banner={} ready={ready}",
                    pair.banner_id
                );
            }
        })
        .is_err()
    {
        if let Ok(mut guard) = state.lock() {
            guard.running = false;
        }
    }
}

pub fn prewarm_next_banner(event: &str) {
    #[cfg(not(test))]
    match event {
        "match_start" => prewarm_likely_videos(&["first_blood", "double_kill", "kill"]),
        "first_blood" | "kill" => prewarm_likely_videos(&["double_kill"]),
        "double_kill" => prewarm_likely_videos(&["triple_kill"]),
        "triple_kill" => prewarm_likely_videos(&["ultra_kill"]),
        "ultra_kill" => prewarm_likely_videos(&["rampage"]),
        _ => {}
    }
    #[cfg(test)]
    let _ = event;
}

pub(crate) fn current_announcer_revision() -> Option<u64> {
    with_resolved_cache(|cache| cache.map(|c| c.revision))
}
pub(crate) fn announcer_revision_current(revision: u64) -> bool {
    with_resolved_cache(|cache| cache.is_some_and(|c| c.revision == revision))
}

static LAST_REVISION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn stamp_cache(next: &mut Option<ResolvedCache>) {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    let revision = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    LAST_REVISION.fetch_max(revision, std::sync::atomic::Ordering::AcqRel);
    if let Some(cache) = next {
        cache.revision = revision;
    }
}

fn visual_candidates_for(events: &[&str]) -> super::visual_warm::Candidates {
    use super::visual_warm::{Candidate, Candidates};
    with_resolved_cache(|cache| {
        let Some(cache) = cache else {
            return Candidates {
                pack_id: None,
                revision: LAST_REVISION.load(std::sync::atomic::Ordering::Acquire),
                visuals: vec![],
            };
        };
        let mut visuals: Vec<Candidate> = Vec::new();
        for event in events.iter().take(3) {
            let Some(paths) = cache.clips_by_event.get(*event) else {
                continue;
            };
            let Some(pair) = paths
                .first()
                .and_then(|path| cache.pairs.get(&(event.to_string(), path.clone())))
            else {
                continue;
            };
            if !visuals.iter().any(|v| v.banner_id == pair.banner_id) {
                visuals.push(Candidate {
                    pack_id: cache.pack_id.clone(),
                    banner_id: pair.banner_id.clone(),
                    revision: cache.revision,
                    event: event.to_string(),
                });
            }
        }
        Candidates {
            pack_id: Some(cache.pack_id.clone()),
            revision: cache.revision,
            visuals,
        }
    })
}

pub(crate) fn visual_warm_candidates() -> super::visual_warm::Candidates {
    visual_candidates_for(&["first_blood", "double_kill", "kill"])
}

pub(crate) fn warm_announcer_variant(pack: &str, event: &str, clip_id: &str) -> Result<(), String> {
    let path =
        super::banner::preview_variant(pack, event, clip_id).ok_or("Unknown announcer variant")?;
    let selected = select_announcer_path(pack, event, &path).ok_or("Inactive announcer pack")?;
    let pair = selected.pair.ok_or("Variant has no ID visual")?;
    let candidate = super::visual_warm::Candidate {
        pack_id: selected.pack_id.clone(),
        banner_id: pair.banner_id.clone(),
        revision: selected.revision,
        event: event.to_owned(),
    };
    // Publishing a stale snapshot is harmless: the overlay and protocol fence revisions.
    super::visual_warm::publish(super::visual_warm::Candidates {
        pack_id: Some(selected.pack_id.clone()),
        revision: selected.revision,
        visuals: vec![candidate],
    });
    #[cfg(not(test))]
    queue_warm_videos((selected.pack_id, selected.revision, vec![pair]));
    Ok(())
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

/// Admit the selected GANN archive/registry/media before publishing its new generation.
/// Failure clears event coverage; no alternate pack or synthetic media is substituted.
static MUTATIONS: Mutex<()> = Mutex::new(());
#[cfg(test)]
type MutationHook = Arc<dyn Fn(&'static str, &str) + Send + Sync>;
#[cfg(test)]
static MUTATION_HOOK: Mutex<Option<MutationHook>> = Mutex::new(None);
#[cfg(test)]
pub(crate) fn set_mutation_hook(hook: Option<MutationHook>) {
    *MUTATION_HOOK.lock().unwrap() = hook;
}
#[cfg(test)]
fn mutation_hook(phase: &'static str, id: &str) {
    let hook = MUTATION_HOOK.lock().unwrap().clone();
    if let Some(hook) = hook {
        hook(phase, id);
    }
}
pub(crate) fn rebuild_resolved_cache() {
    let _guard = MUTATIONS.lock().unwrap_or_else(|e| e.into_inner());
    rebuild_resolved_cache_inner();
}
fn rebuild_resolved_cache_inner() {
    let next = (|| {
        let id = read_active_pack_id()?;
        #[cfg(test)]
        mutation_hook("read", &id);
        if !super::commands::is_pack_available(&id) {
            return None;
        }
        let dir = packs_dir().join(&id);
        let manifest = read_manifest(&dir).ok()?;
        let pairs = super::id_manifest::read(&dir).ok()?.admit(&dir).ok()?;
        let mut clips_by_event = HashMap::with_capacity(manifest.mappings.len());
        for (event, mapping) in &manifest.mappings {
            clips_by_event.insert(event.clone(), resolve_existing_clips(&dir, &mapping.clips));
        }
        Some(ResolvedCache {
            revision: 0,
            pack_id: id.clone(),
            pack_name: if manifest.name.is_empty() {
                id
            } else {
                manifest.name
            },
            clips_by_event,
            pairs,
        })
    })();
    #[cfg(test)]
    let published = next.as_ref().map(|cache| cache.pack_id.clone());
    store_resolved_cache(next);
    #[cfg(test)]
    if let Some(id) = published {
        mutation_hook("published", &id);
    }
    crate::audio::refresh_critical_cache();
    super::playback::changed();
}

/// Drop the cache without recomputing it — for test teardown, where there may
/// be no active pack left to resolve against (the temp root is about to be
/// deleted) and the only thing that matters is not leaking into the next test.
#[cfg(test)]
pub(crate) fn clear_resolved_cache_for_test() {
    store_resolved_cache(None);
}

/// Snapshot-only original lookup; unknown events remain unmapped.
#[cfg(test)]
pub(crate) fn cached_event_clips(event: &str) -> Option<Vec<PathBuf>> {
    with_resolved_cache(|cache| cache?.clips_by_event.get(event).cloned())
}

pub(crate) fn cached_event_playback_clips(event: &str) -> Option<Vec<PathBuf>> {
    with_resolved_cache(|cache| {
        let cache = cache?;
        Some(
            cache
                .clips_by_event
                .get(event)?
                .iter()
                .filter_map(|path| {
                    cache
                        .pairs
                        .get(&(event.to_owned(), path.clone()))
                        .map(|pair| pair.mixed.clone())
                })
                .collect(),
        )
    })
}
pub(crate) fn cached_audio_hash(pack: &str, path: &Path) -> Option<String> {
    with_resolved_cache(|cache| {
        let cache = cache?;
        if cache.pack_id != pack {
            return None;
        }
        cache.pairs.values().find_map(|pair| {
            if pair.original == path {
                Some(pair.original_hash.clone())
            } else if pair.mixed == path {
                Some(pair.mixed_hash.clone())
            } else {
                None
            }
        })
    })
}

#[derive(Clone, Debug)]
pub struct AnnouncerClip {
    pub revision: u64,
    pub pack_id: String,
    pub pack_name: String,
    pub path: PathBuf,
    pub(crate) pair: Option<Arc<super::id_manifest::Pair>>,
}

/// The selected pack and clip are read under the same cache lock. No ANN fallback.
pub fn select_announcer_clip(event: &str) -> Option<AnnouncerClip> {
    with_resolved_cache(|cache| {
        let cache = cache?;
        let path = audio::choose_clip(cache.clips_by_event.get(event)?.clone())?;
        Some(AnnouncerClip {
            revision: cache.revision,
            pack_id: cache.pack_id.clone(),
            pack_name: cache.pack_name.clone(),
            pair: Some(cache.pairs.get(&(event.to_owned(), path.clone()))?.clone()),
            path,
        })
    })
}

/// Resolve a named variant from the already admitted active generation.
pub(crate) fn select_announcer_variant(
    pack: &str,
    event: &str,
    clip_id: &str,
) -> Option<AnnouncerClip> {
    if clip_id.is_empty()
        || clip_id.len() > 64
        || !clip_id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_' || c == b'-')
    {
        return None;
    }
    with_resolved_cache(|cache| {
        let cache = cache?;
        if cache.pack_id != pack {
            return None;
        }
        let mut paths = cache.clips_by_event.get(event)?.iter().filter(|path| {
            path.file_stem().and_then(|s| s.to_str()) == Some(clip_id)
                && path.extension().and_then(|s| s.to_str()) == Some("wav")
        });
        let path = paths.next()?.clone();
        if paths.next().is_some() {
            return None;
        }
        Some(AnnouncerClip {
            revision: cache.revision,
            pack_id: cache.pack_id.clone(),
            pack_name: cache.pack_name.clone(),
            pair: Some(cache.pairs.get(&(event.to_owned(), path.clone()))?.clone()),
            path,
        })
    })
}

pub(crate) fn id_video(
    pack: &str,
    banner: &str,
    revision: u64,
) -> Option<Arc<super::id_manifest::Pair>> {
    with_resolved_cache(|cache| {
        let cache = cache?;
        if cache.pack_id != pack || cache.revision != revision {
            return None;
        }
        cache
            .pairs
            .values()
            .find(|pair| pair.banner_id == banner)
            .cloned()
    })
}

pub fn select_announcer_path(pack: &str, event: &str, path: &Path) -> Option<AnnouncerClip> {
    with_resolved_cache(|cache| {
        let cache = cache?;
        if cache.pack_id != pack || !cache.clips_by_event.get(event)?.iter().any(|p| p == path) {
            return None;
        }
        Some(AnnouncerClip {
            revision: cache.revision,
            pack_id: cache.pack_id.clone(),
            pack_name: cache.pack_name.clone(),
            pair: Some(
                cache
                    .pairs
                    .get(&(event.to_owned(), path.to_owned()))?
                    .clone(),
            ),
            path: path.to_owned(),
        })
    })
}

pub fn select_announcer_playback_path(event: &str, path: &Path) -> Option<AnnouncerClip> {
    with_resolved_cache(|cache| {
        let cache = cache?;
        let original = cache.clips_by_event.get(event)?.iter().find(|original| {
            cache
                .pairs
                .get(&(event.to_owned(), (*original).clone()))
                .is_some_and(|pair| pair.mixed == path)
        })?;
        Some(AnnouncerClip {
            revision: cache.revision,
            pack_id: cache.pack_id.clone(),
            pack_name: cache.pack_name.clone(),
            path: original.clone(),
            pair: Some(
                cache
                    .pairs
                    .get(&(event.to_owned(), original.clone()))?
                    .clone(),
            ),
        })
    })
}

pub fn with_current_announcer_clip<T>(
    event: &str,
    selected: &AnnouncerClip,
    admit: impl FnOnce() -> T,
) -> Option<T> {
    with_resolved_cache(|cache| {
        let cache = cache?;
        (cache.revision == selected.revision
            && cache.pack_id == selected.pack_id
            && cache
                .clips_by_event
                .get(event)
                .is_some_and(|clips| clips.contains(&selected.path)))
        .then(admit)
    })
}

pub(crate) fn read_active_pack_id() -> Option<String> {
    fs::read_to_string(active_path())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn write_active_pack_id(id: &str) -> Result<(), String> {
    #[cfg(test)]
    mutation_hook("attempt", id);
    let _guard = MUTATIONS.lock().unwrap_or_else(|e| e.into_inner());
    store_resolved_cache(None);
    fs::create_dir_all(voice_root()).map_err(|e| e.to_string())?;
    let result = fs::write(active_path(), id).map_err(|e| e.to_string());
    rebuild_resolved_cache_inner();
    result
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

#[cfg(test)]
mod integrity_tests {
    use super::*;
    use ring::signature::{Ed25519KeyPair, KeyPair};

    #[test]
    fn warm_descriptors_are_bounded_exact_ids_and_invalidated_with_a_new_generation() {
        let pack = "ann_c4d92f17-167a-504b-9393-64fd959981cd";
        let banner = "bnr_c4d92f17-167a-504b-9393-64fd959981cd";
        let path = PathBuf::from("private/audio/snd.wav");
        let pair = Arc::new(super::super::id_manifest::Pair {
            banner_id: banner.into(),
            original: path.clone(),
            original_hash: "a".repeat(64),
            mixed: PathBuf::from("private/mixed.wav"),
            mixed_hash: "b".repeat(64),
            samples: 1,
            video: PathBuf::from("private/video.webm"),
            video_hash: "c".repeat(64),
        });
        let events = ["first_blood", "double_kill", "kill", "rampage"];
        store_resolved_cache(Some(ResolvedCache {
            revision: 0,
            pack_id: pack.into(),
            pack_name: "Test".into(),
            clips_by_event: events
                .iter()
                .map(|event| (event.to_string(), vec![path.clone()]))
                .collect(),
            pairs: events
                .iter()
                .map(|event| ((event.to_string(), path.clone()), pair.clone()))
                .collect(),
        }));
        let candidates = visual_candidates_for(&events);
        assert_eq!(candidates.pack_id.as_deref(), Some(pack));
        assert_eq!(
            candidates.visuals.len(),
            1,
            "duplicate banner needs one paused decoder"
        );
        let candidate = &candidates.visuals[0];
        assert_eq!(candidate.banner_id, banner);
        assert_eq!(candidate.revision, candidates.revision);
        assert_eq!(candidate.event, "first_blood");
        assert!(!serde_json::to_string(&candidates)
            .unwrap()
            .contains("private"));
        assert!(id_video(pack, banner, candidates.revision).is_some());
        store_resolved_cache(None);
        let cleared = visual_warm_candidates();
        assert!(cleared.pack_id.is_none() && cleared.visuals.is_empty());
        assert!(cleared.revision > candidates.revision);
        assert!(id_video(pack, banner, candidates.revision).is_none());
    }

    #[test]
    fn install_receipt_signature_covers_the_archive_digest() {
        let key = Ed25519KeyPair::from_seed_unchecked(&[7u8; 32]).unwrap();
        let mut public_key = [0u8; 32];
        public_key.copy_from_slice(key.public_key().as_ref());
        let mut record = StoreInstallRecord {
            version: 2,
            user_id: "user-1".into(),
            item_id: "item-1".into(),
            pack_id: "demo".into(),
            issued_at: "2026-10-18T00:00:00Z".into(),
            archive_sha256: sha256_hex(b"trusted archive"),
            signature: String::new(),
        };
        let message = format!(
            "gmaiden-store-install-v2\n{}\n{}\n{}\n{}\n{}",
            record.user_id, record.item_id, record.pack_id, record.issued_at, record.archive_sha256
        );
        let signature = key.sign(message.as_bytes());

        assert!(verify_store_install_signature(
            &record,
            signature.as_ref(),
            &public_key
        ));
        record.archive_sha256 = sha256_hex(b"substituted archive");
        assert!(!verify_store_install_signature(
            &record,
            signature.as_ref(),
            &public_key
        ));
    }

    #[test]
    fn gann_snapshot_rejects_changed_clip_bytes() {
        let root = std::env::temp_dir().join(format!(
            "gann-store-hash-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        super::super::paths::set_test_voice_root(Some(root.clone()));
        let (id, _, mixed) = super::super::test_package::install(&root, 96, "kill");
        super::super::activate_if_exists(&id).unwrap();
        assert!(open_verified_store_clip(&mixed).unwrap().is_some());
        std::fs::write(&mixed, b"changed bytes").unwrap();
        assert!(open_verified_store_clip(&mixed).is_err());
        super::super::paths::set_test_voice_root(None);
        clear_resolved_cache_for_test();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn signed_archive_digest_rejects_substitution() {
        let expected = sha256_hex(b"trusted archive");
        assert!(content_matches_hash(&expected, b"trusted archive"));
        assert!(!content_matches_hash(&expected, b"substituted archive"));
        assert!(!content_matches_hash(&"g".repeat(64), b"trusted archive"));
    }
}
