//! Canonical filesystem announcer manifests; no filename-derived event identity.
use super::{
    pack_io::{Manifest, ManifestMapping},
    path_safety::safe_pack_path,
};
use serde::Deserialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const MAX_MANIFEST: u64 = 2 * 1024 * 1024;
pub(super) const MAX_MEDIA: u64 = 32 * 1024 * 1024;
const MAX_PACKAGE: u64 = 512 * 1024 * 1024;

#[derive(Deserialize)]
pub(super) struct Registry {
    schema_version: u32,
    pub announcer_id: String,
    name: String,
    revision: u32,
    locale: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    author_gid: Option<String>,
    #[serde(default)]
    description: String,
    sounds: Vec<Sound>,
    events: BTreeMap<String, Vec<Mapping>>,
    banners: Vec<Banner>,
    components: Vec<Component>,
    unmapped_sound_ids: Vec<String>,
}
#[derive(Deserialize)]
struct Sound {
    sound_id: String,
    role: String,
    label: String,
    path: String,
    sha256: String,
}
#[derive(Deserialize)]
struct Mapping {
    sound_id: String,
    banner_id: String,
}
#[derive(Deserialize)]
struct Component {
    component_id: String,
    kind: String,
}
#[derive(Deserialize)]
struct Instance {
    instance_id: String,
    slot: String,
    component_id: String,
}
#[derive(Deserialize)]
struct Cue {
    cue_id: String,
    sound_id: String,
    time_seconds: f64,
    gain: f64,
}
#[derive(Deserialize)]
struct Visual {
    root: String,
    video: String,
    sha256: String,
    silent: bool,
}
#[derive(Deserialize)]
struct Config {
    duration_seconds: f64,
    #[serde(default)]
    visual_tail_ms: u32,
}
#[derive(Deserialize)]
struct Banner {
    banner_id: String,
    event_key: String,
    original_sound_id: String,
    playback_sound_id: String,
    visual_source: Visual,
    components: Vec<Instance>,
    cues: Vec<Cue>,
    config: Config,
}

#[derive(Clone, Debug)]
pub(crate) struct Pair {
    pub banner_id: String,
    pub original: PathBuf,
    pub original_hash: String,
    pub mixed: PathBuf,
    pub mixed_hash: String,
    pub samples: usize,
    pub video: PathBuf,
    pub video_hash: String,
    pub visual_tail_ms: u32,
}
impl Pair {
    pub(crate) fn matches(&self, original: &[u8; 32], played: &[u8; 32]) -> bool {
        crate::vrzo_mix::hex_digest(original) == self.original_hash
            && crate::vrzo_mix::hex_digest(played) == self.mixed_hash
    }
}
pub(super) type Pairs = HashMap<(String, PathBuf), std::sync::Arc<Pair>>;

pub(crate) fn valid_id(value: &str, prefix: &str) -> bool {
    value.strip_prefix(prefix).is_some_and(|id| {
        let parts: Vec<_> = id.split('-').collect();
        parts.len() == 5
            && [8, 4, 4, 4, 12].iter().zip(parts).all(|(n, s)| {
                s.len() == *n
                    && s.bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            })
    })
}
fn require(ok: bool, reason: &str) -> Result<(), String> {
    if ok {
        Ok(())
    } else {
        Err(format!("Invalid announcer manifest: {reason}"))
    }
}
pub(super) fn manifest_path(root: &Path) -> Result<Option<PathBuf>, String> {
    let mut matches = Vec::new();
    for (index, e) in fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .take(1025)
        .enumerate()
    {
        require(index < 1024, "directory entry limit")?;
        let e = e.map_err(|e| e.to_string())?;
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with("ann_") && name.ends_with(".json") {
            matches.push(e.path());
        }
    }
    require(matches.len() <= 1, "multiple announcer manifests")?;
    Ok(matches.pop())
}
pub(super) fn read(root: &Path) -> Result<Registry, String> {
    let path = manifest_path(root)?.ok_or("Missing ann_<UUID>.json")?;
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("Manifest filename")?;
    let path = safe_pack_path(root, name).ok_or("Unsafe manifest path")?;
    let raw = bounded_bytes(&path, MAX_MANIFEST)?;
    let registry: Registry =
        serde_json::from_slice(&raw).map_err(|e| format!("Announcer JSON: {e}"))?;
    require(
        name == format!("{}.json", registry.announcer_id),
        "manifest filename/ID mismatch",
    )?;
    registry.validate()?;
    Ok(registry)
}
pub(super) fn bounded_bytes(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    require(metadata.is_file() && metadata.len() <= max, "asset size")?;
    let mut bytes = Vec::new();
    file.take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    require(bytes.len() as u64 <= max, "asset grew past limit")?;
    Ok(bytes)
}
pub(super) fn verified_bytes(path: &Path, expected: &str, max: u64) -> Result<Vec<u8>, String> {
    let bytes = bounded_bytes(path, max)?;
    let actual: String = ring::digest::digest(&ring::digest::SHA256, &bytes)
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    require(actual == expected, "asset SHA-256 mismatch")?;
    Ok(bytes)
}
fn hash_ok(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn local_path(s: &str, folder: &str, id: &str, ext: &str) -> bool {
    s == format!("{folder}/{id}.{ext}")
}
impl Registry {
    fn validate(&self) -> Result<(), String> {
        require(
            self.schema_version == 1 && self.revision > 0 && valid_id(&self.announcer_id, "ann_"),
            "schema or announcer ID",
        )?;
        require(
            !self.name.trim().is_empty() && self.name.len() <= 256 && self.locale.len() <= 32,
            "display metadata",
        )?;
        require(
            !self.sounds.is_empty()
                && self.sounds.len() <= 256
                && self.banners.len() <= 128
                && self.components.len() <= 1024,
            "registry bounds",
        )?;
        let mut all = HashSet::new();
        let mut insert = |id: &str, prefix| {
            require(
                valid_id(id, prefix) && all.insert(id.to_owned()),
                "invalid/duplicate ID",
            )
        };
        insert(&self.announcer_id, "ann_")?;
        let mut sounds = HashMap::new();
        for s in &self.sounds {
            insert(&s.sound_id, "snd_")?;
            require(
                matches!(
                    s.role.as_str(),
                    "original_voice" | "mixed_voice_sfx" | "sfx"
                ) && s.label.len() <= 512,
                "sound role/label",
            )?;
            require(
                hash_ok(&s.sha256) && local_path(&s.path, "audio", &s.sound_id, "wav"),
                "sound path/hash",
            )?;
            sounds.insert(s.sound_id.as_str(), s);
        }
        let mut components = HashMap::new();
        for c in &self.components {
            insert(&c.component_id, "cmp_")?;
            components.insert(c.component_id.as_str(), c.kind.as_str());
        }
        let mut banners = HashMap::new();
        for b in &self.banners {
            insert(&b.banner_id, "bnr_")?;
            require(
                sounds
                    .get(b.original_sound_id.as_str())
                    .is_some_and(|s| s.role == "original_voice")
                    && sounds
                        .get(b.playback_sound_id.as_str())
                        .is_some_and(|s| s.role == "mixed_voice_sfx"),
                "banner sound role/reference",
            )?;
            require(
                b.visual_source.root == "."
                    && b.visual_source.silent
                    && hash_ok(&b.visual_source.sha256)
                    && local_path(&b.visual_source.video, "video", &b.banner_id, "webm"),
                "silent visual path/hash",
            )?;
            require(
                b.config.duration_seconds.is_finite()
                    && b.config.duration_seconds > 0.0
                    && b.config.duration_seconds <= 15.0
                    && b.config.visual_tail_ms <= 3200
                    && b.components.len() <= 16
                    && b.cues.len() <= 64,
                "banner bounds",
            )?;
            let mut slots = HashSet::new();
            for c in &b.components {
                insert(&c.instance_id, "ins_")?;
                require(
                    slots.insert(c.slot.as_str())
                        && components.get(c.component_id.as_str()) == Some(&c.slot.as_str()),
                    "component reference/slot",
                )?;
            }
            for c in &b.cues {
                insert(&c.cue_id, "cue_")?;
                require(
                    sounds
                        .get(c.sound_id.as_str())
                        .is_some_and(|s| s.role == "sfx")
                        && c.time_seconds.is_finite()
                        && (0.0..=b.config.duration_seconds).contains(&c.time_seconds)
                        && c.gain.is_finite()
                        && (0.0..=1.0).contains(&c.gain),
                    "cue reference/timing",
                )?;
            }
            banners.insert(b.banner_id.as_str(), b);
        }
        let mut used_banners = HashSet::new();
        let mut mapped = HashSet::new();
        require(
            !self.events.is_empty() && self.events.len() <= super::events::EVENTS.len(),
            "event count",
        )?;
        for (event, mappings) in &self.events {
            require(
                super::events::event_ids().any(|known| known == event)
                    && !mappings.is_empty()
                    && mappings.len() <= 128,
                "unknown/empty event",
            )?;
            let mut originals = HashSet::new();
            for m in mappings {
                let b = banners
                    .get(m.banner_id.as_str())
                    .ok_or("Missing banner reference")?;
                require(
                    b.event_key == *event
                        && b.original_sound_id == m.sound_id
                        && originals.insert(m.sound_id.as_str())
                        && used_banners.insert(m.banner_id.as_str()),
                    "event/original/banner pairing",
                )?;
                mapped.insert(m.sound_id.as_str());
            }
        }
        require(
            used_banners.len() == self.banners.len(),
            "unreferenced banner",
        )?;
        let mut unmapped = HashSet::new();
        for id in &self.unmapped_sound_ids {
            require(
                sounds
                    .get(id.as_str())
                    .is_some_and(|s| s.role == "original_voice")
                    && !mapped.contains(id.as_str())
                    && unmapped.insert(id.as_str()),
                "unmapped original conflict",
            )?;
        }
        require(
            self.sounds
                .iter()
                .filter(|s| s.role == "original_voice")
                .all(|s| {
                    mapped.contains(s.sound_id.as_str()) || unmapped.contains(s.sound_id.as_str())
                }),
            "unclassified original",
        )
    }
    pub(super) fn project(&self) -> Manifest {
        Manifest {
            id: self.announcer_id.clone(),
            name: self.name.clone(),
            version: self.revision.to_string(),
            locale: self.locale.clone(),
            author: self.author.clone(),
            author_gid: self.author_gid.clone(),
            description: self.description.clone(),
            mappings: self
                .events
                .iter()
                .map(|(event, mappings)| {
                    (
                        event.clone(),
                        ManifestMapping {
                            clips: mappings
                                .iter()
                                .map(|m| format!("audio/{}.wav", m.sound_id))
                                .collect(),
                            ..Default::default()
                        },
                    )
                })
                .collect(),
            ..Default::default()
        }
    }
    pub(super) fn files(&self) -> Vec<(String, String)> {
        self.sounds
            .iter()
            .map(|s| (s.path.clone(), s.sha256.clone()))
            .chain(self.banners.iter().map(|b| {
                (
                    b.visual_source.video.clone(),
                    b.visual_source.sha256.clone(),
                )
            }))
            .collect()
    }
    pub(super) fn admit(&self, root: &Path) -> Result<Pairs, String> {
        let mut total = 0u64;
        let mut sample_counts = HashMap::new();
        for (rel, hash) in self.files() {
            let path = safe_pack_path(root, &rel).ok_or("Missing or unsafe media")?;
            let bytes = verified_bytes(
                &path,
                &hash,
                if rel.starts_with("audio/") {
                    16 * 1024 * 1024
                } else {
                    MAX_MEDIA
                },
            )?;
            total = total.saturating_add(bytes.len() as u64);
            require(total <= MAX_PACKAGE, "package too large")?;
            if rel.starts_with("audio/") {
                use rodio::Source;
                let decoder = rodio::Decoder::new(std::io::Cursor::new(bytes.clone()))
                    .map_err(|_| "Invalid WAV")?;
                let rate = decoder.sample_rate();
                require(
                    bytes.starts_with(b"RIFF")
                        && bytes.get(8..12) == Some(b"WAVE")
                        && decoder.channels() == 1
                        && matches!(rate, 44100 | 48000),
                    "WAV must be mono 44.1/48kHz",
                )?;
                let count = decoder.take(2 * 1024 * 1024 + 1).count();
                require(count > 0 && count <= 2 * 1024 * 1024, "decoded audio limit")?;
                if self
                    .sounds
                    .iter()
                    .any(|s| s.path == rel && s.role == "mixed_voice_sfx")
                {
                    crate::vrzo_mix::decode_mix(&bytes, &hash, count).map_err(str::to_owned)?;
                }
                sample_counts.insert(rel, (count, rate));
            } else {
                require(
                    bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]),
                    "invalid WebM header",
                )?;
            }
        }
        let sounds: HashMap<_, _> = self
            .sounds
            .iter()
            .map(|s| (s.sound_id.as_str(), s))
            .collect();
        let mut pairs = HashMap::new();
        for b in &self.banners {
            let original = sounds[b.original_sound_id.as_str()];
            let mixed = sounds[b.playback_sound_id.as_str()];
            let (samples, _) = sample_counts[&mixed.path];
            let (original_samples, rate) = sample_counts[&original.path];
            require(
                (original_samples as f64 * 48000.0 / rate as f64 - samples as f64).abs() <= 1.0001,
                "mixed/original duration mismatch",
            )?;
            let original_path =
                safe_pack_path(root, &original.path).ok_or("Original disappeared")?;
            pairs.insert(
                (b.event_key.clone(), original_path.clone()),
                std::sync::Arc::new(Pair {
                    banner_id: b.banner_id.clone(),
                    original: original_path,
                    original_hash: original.sha256.clone(),
                    mixed: safe_pack_path(root, &mixed.path).ok_or("Mix disappeared")?,
                    mixed_hash: mixed.sha256.clone(),
                    samples,
                    video: safe_pack_path(root, &b.visual_source.video)
                        .ok_or("Video disappeared")?,
                    video_hash: b.visual_source.sha256.clone(),
                    visual_tail_ms: b.config.visual_tail_ms,
                }),
            );
        }
        Ok(pairs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("fixtures/id-manifest.json")).unwrap()
    }
    fn parse(value: serde_json::Value) -> Result<Registry, String> {
        let r: Registry = serde_json::from_value(value).map_err(|e| e.to_string())?;
        r.validate()?;
        Ok(r)
    }
    #[test]
    fn rejects_duplicate_dangling_role_pairing_and_path_substitutions() {
        assert!(parse(fixture()).is_ok());
        for field in [
            "schema",
            "duplicate",
            "reference",
            "role",
            "event",
            "visual",
            "hash",
            "path",
            "unmapped",
            "component",
            "cue",
        ] {
            let mut v = fixture();
            match field {
                "schema" => v["schema_version"] = 2.into(),
                "duplicate" => {
                    let s = v["sounds"][0].clone();
                    v["sounds"].as_array_mut().unwrap().push(s);
                }
                "reference" => {
                    v["events"]["match_start"][0]["sound_id"] =
                        "snd_00000000-0000-0000-0000-000000000000".into()
                }
                "role" => v["sounds"][0]["role"] = "sfx".into(),
                "event" => v["banners"][0]["event_key"] = "kill".into(),
                "visual" => v["banners"][0]["visual_source"]["root"] = "../outside".into(),
                "hash" => v["sounds"][0]["sha256"] = "bad".into(),
                "path" => v["sounds"][0]["path"] = "audio/../../secret.wav".into(),
                "unmapped" => {
                    v["unmapped_sound_ids"] = serde_json::json!([v["sounds"][0]["sound_id"]])
                }
                "component" => {
                    v["banners"][0]["components"][0]["component_id"] =
                        "cmp_00000000-0000-0000-0000-000000000000".into()
                }
                "cue" => v["banners"][0]["cues"][0]["gain"] = 2.into(),
                _ => unreachable!(),
            }
            assert!(parse(v).is_err(), "{field}");
        }
    }
    #[test]
    fn identity_and_projection_use_ids_not_legacy_names() {
        let mut v = fixture();
        v["banners"][0]["legacy_clip_id"] = "totally_unrelated".into();
        let r = parse(v).unwrap();
        let projection = r.project();
        assert_eq!(projection.id, r.announcer_id);
        assert_eq!(
            projection.mappings["match_start"].clips,
            vec![format!("audio/{}.wav", r.events["match_start"][0].sound_id)]
        );
        for bad in [
            "ann_../../secrets",
            "ann_C4d92f17-167a-504b-9393-64fd959981cd",
            "ann_c4d92f17-167a-504b-9393-64fd959981cd/foo",
        ] {
            assert!(!valid_id(bad, "ann_"));
        }
    }
    #[test]
    #[ignore = "requires the separately supplied Studio media package"]
    fn real_studio_package_resolves_all_21_pairs() {
        let root = std::env::var("GM_ID_PACKAGE_FIXTURE").expect("set GM_ID_PACKAGE_FIXTURE");
        let registry = read(Path::new(&root)).unwrap();
        let pairs = registry.admit(Path::new(&root)).unwrap();
        assert_eq!(pairs.len(), 21);
        assert_eq!(registry.events.len(), 15);
        assert_eq!(registry.sounds.len(), 63);
        let temp = std::env::temp_dir().join(format!(
            "gm-id-integration-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&temp).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                crate::voice_api::paths::set_test_voice_root(None);
                crate::voice_api::pack_io::clear_resolved_cache_for_test();
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(temp.clone());
        crate::voice_api::paths::set_test_voice_root(Some(temp.clone()));
        let container = temp.join("source.gann");
        g_ann_package::create(
            Path::new(&root),
            &format!("{}.json", registry.announcer_id),
            &container,
        )
        .unwrap();
        let imported = crate::voice_api::import_file(&container).unwrap();
        assert_eq!(imported.imported, vec![registry.announcer_id.clone()]);
        assert!(crate::voice_api::pack_io::read_active_pack_id().is_none());
        assert!(crate::voice_api::import_file(&container).is_ok());
        crate::voice_api::activate_if_exists(&registry.announcer_id).unwrap();
        let selected = crate::voice_api::select_announcer_clip("double_kill").unwrap();
        let pair = selected.pair.as_ref().unwrap();
        assert!(crate::voice_api::preview_variant(
            &registry.announcer_id,
            "double_kill",
            selected.path.file_stem().unwrap().to_str().unwrap()
        )
        .is_some());
        assert!(crate::voice_api::pack_io::id_video(
            &registry.announcer_id,
            &pair.banner_id,
            selected.revision
        )
        .is_some());
        assert!(crate::voice_api::select_announcer_clip("death").is_none());
        crate::voice_api::pack_io::write_active_pack_id("previous-package").unwrap();
        assert!(crate::voice_api::pack_io::id_video(
            &registry.announcer_id,
            &pair.banner_id,
            selected.revision
        )
        .is_none());
        let installed = temp.join("packs").join(&registry.announcer_id);
        let r = read(&installed).unwrap();
        let sound = &r.sounds[0];
        fs::write(installed.join(&sound.path), b"changed").unwrap();
        assert!(r.admit(&installed).is_err());
        assert!(crate::voice_api::activate_if_exists(&registry.announcer_id).is_err());
        assert_eq!(
            crate::voice_api::pack_io::read_active_pack_id().as_deref(),
            Some("previous-package")
        );
        fs::remove_file(installed.join(&sound.path)).unwrap();
        assert!(r.admit(&installed).is_err());
    }
}
