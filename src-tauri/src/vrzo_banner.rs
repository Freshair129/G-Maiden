//! Resolve a VRZO visual only for the exact selected, verified audio clip.
use std::io::Read;
use std::path::Path;
use std::sync::OnceLock;

use serde::Deserialize;

const MAX_CLIP_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Deserialize)]
struct Catalog {
    pack_id: String,
    entries: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    id: String,
    event: String,
    clip: String,
    audio_sha256: String,
    video_sha256: String,
    mixed_sha256: String,
    mixed_samples: usize,
}

pub(crate) struct MixedSelection {
    pub path: std::path::PathBuf,
    pub original_sha256: String,
    pub mixed_sha256: String,
    pub samples: usize,
}

pub(crate) fn mixed_selection(
    pack: &str,
    event: &str,
    selected: &Path,
    resource_root: &Path,
) -> Option<MixedSelection> {
    let entry = matching_entry(catalog()?, pack, event, selected)?;
    Some(MixedSelection {
        path: resource_root
            .join("vrzo-mixed")
            .join(format!("{}.wav", entry.id)),
        original_sha256: entry.audio_sha256.clone(),
        mixed_sha256: entry.mixed_sha256.clone(),
        samples: entry.mixed_samples,
    })
}

pub(crate) fn resolve_played_clip(
    pack: &str,
    event: &str,
    selected: &Path,
    original: &[u8; 32],
    played: &[u8; 32],
) -> Option<String> {
    let entry = matching_entry(catalog()?, pack, event, selected)?;
    (crate::vrzo_mix::hex_digest(original) == entry.audio_sha256
        && crate::vrzo_mix::hex_digest(played) == entry.mixed_sha256)
        .then(|| entry.id.clone())
}

fn catalog() -> Option<&'static Catalog> {
    static CATALOG: OnceLock<Option<Catalog>> = OnceLock::new();
    CATALOG
        .get_or_init(|| serde_json::from_str(include_str!("vrzo_catalog.json")).ok())
        .as_ref()
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn matching_entry<'a>(
    catalog: &'a Catalog,
    pack_id: &str,
    event: &str,
    selected_clip: &Path,
) -> Option<&'a Entry> {
    if pack_id != catalog.pack_id || !selected_clip.is_absolute() {
        return None;
    }
    let basename = selected_clip.file_name()?.to_str()?;
    let mut matches = catalog.entries.iter().filter(|entry| {
        !entry.id.is_empty()
            && entry.id.len() <= 64
            && entry
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_')
            && entry.event == event
            && basename == format!("{}.wav", entry.id)
            && Path::new(&entry.clip).file_name().and_then(|s| s.to_str()) == Some(basename)
            && valid_hash(&entry.audio_sha256)
            && valid_hash(&entry.video_sha256)
            && valid_hash(&entry.mixed_sha256)
            && (1..=2 * 1024 * 1024).contains(&entry.mixed_samples)
    });
    let entry = matches.next()?;
    if matches.next().is_some() {
        return None;
    }
    Some(entry)
}

fn matches_digest(path: &Path, expected: &str) -> bool {
    let Ok(file) = std::fs::File::open(path) else {
        return false;
    };
    let Ok(meta) = file.metadata() else {
        return false;
    };
    if !meta.is_file() || meta.len() > MAX_CLIP_BYTES {
        return false;
    }
    let mut input = file.take(MAX_CLIP_BYTES + 1);
    let mut hasher = ring::digest::Context::new(&ring::digest::SHA256);
    let mut length = 0u64;
    let mut buf = [0u8; 8192];
    loop {
        let Ok(n) = input.read(&mut buf) else {
            return false;
        };
        if n == 0 {
            break;
        }
        length += n as u64;
        if length > MAX_CLIP_BYTES {
            return false;
        }
        hasher.update(&buf[..n]);
    }
    let digest = hasher.finish();
    let actual: String = digest.as_ref().iter().map(|b| format!("{b:02x}")).collect();
    actual.eq_ignore_ascii_case(expected)
}

fn resolve_with_catalog(
    catalog: &Catalog,
    pack_id: &str,
    event: &str,
    selected_clip: &Path,
) -> Option<String> {
    let entry = matching_entry(catalog, pack_id, event, selected_clip)?;
    matches_digest(selected_clip, &entry.audio_sha256).then(|| entry.id.clone())
}

pub(crate) fn resolve_clip_id(pack_id: &str, event: &str, selected_clip: &Path) -> Option<String> {
    resolve_with_catalog(catalog()?, pack_id, event, selected_clip)
}

#[cfg(test)]
fn resolve_decoded_with_catalog(
    catalog: &Catalog,
    pack_id: &str,
    event: &str,
    selected_clip: &Path,
    digest: &[u8; 32],
) -> Option<String> {
    let entry = matching_entry(catalog, pack_id, event, selected_clip)?;
    let actual: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    actual
        .eq_ignore_ascii_case(&entry.audio_sha256)
        .then(|| entry.id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn example_catalog() -> Catalog {
        Catalog {
            pack_id: "pack_vrzo_20261028".into(),
            entries: vec![Entry {
                id: "kill_01".into(),
                event: "kill".into(),
                clip: "clips/spaced-v2/kill_01.wav".into(),
                audio_sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
                    .into(),
                video_sha256: "0123456789abcdef".repeat(4),
                mixed_sha256: "0123456789abcdef".repeat(4),
                mixed_samples: 48000,
            }],
        }
    }

    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "gm-vrzo-banner-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&root).unwrap();
            Self(root)
        }
        fn clip(&self) -> std::path::PathBuf {
            self.0.join("kill_01.wav")
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(self.clip());
            let _ = std::fs::remove_dir(&self.0);
        }
    }

    #[test]
    fn catalog_requires_correct_pack_event_absolute_path_and_clip_id() {
        let c = example_catalog();
        let f = Fixture::new();
        let p = f.clip();
        assert!(matching_entry(&c, "pack_vrzo_20261028", "kill", &p).is_some());
        assert!(matching_entry(&c, "other", "kill", &p).is_none());
        assert!(matching_entry(&c, "pack_vrzo_20261028", "death", &p).is_none());
        assert!(
            matching_entry(&c, "pack_vrzo_20261028", "kill", Path::new("kill_01.wav")).is_none()
        );
        assert!(
            matching_entry(&c, "pack_vrzo_20261028", "kill", &f.0.join("kill_02.wav")).is_none()
        );
    }

    #[test]
    fn ambiguous_and_invalid_catalog_entries_are_rejected() {
        let mut c = example_catalog();
        let f = Fixture::new();
        let duplicate = example_catalog().entries.remove(0);
        c.entries.push(duplicate);
        assert!(matching_entry(&c, "pack_vrzo_20261028", "kill", &f.clip()).is_none());
        c.entries.pop();
        c.entries[0].video_sha256 = "invalid".into();
        assert!(matching_entry(&c, "pack_vrzo_20261028", "kill", &f.clip()).is_none());
    }

    #[test]
    fn actual_clip_hash_is_required_and_tampering_or_missing_fails() {
        let c = example_catalog();
        let f = Fixture::new();
        let p = f.clip();
        assert_eq!(
            resolve_with_catalog(&c, "pack_vrzo_20261028", "kill", &p),
            None
        );
        std::fs::write(&p, b"abc").unwrap();
        assert_eq!(
            resolve_with_catalog(&c, "pack_vrzo_20261028", "kill", &p).as_deref(),
            Some("kill_01")
        );
        std::fs::write(&p, b"abd").unwrap();
        assert_eq!(
            resolve_with_catalog(&c, "pack_vrzo_20261028", "kill", &p),
            None
        );
    }

    #[test]
    fn decoded_digest_not_later_file_contents_decides_visual_identity() {
        let f = Fixture::new();
        let path = f.clip();
        let digest: [u8; 32] = ring::digest::digest(&ring::digest::SHA256, b"abc")
            .as_ref()
            .try_into()
            .unwrap();
        std::fs::write(&path, b"mutated-after-decode").unwrap();
        let c = example_catalog();
        assert_eq!(
            resolve_decoded_with_catalog(&c, "pack_vrzo_20261028", "kill", &path, &digest)
                .as_deref(),
            Some("kill_01")
        );
        assert!(
            resolve_decoded_with_catalog(&c, "pack_vrzo_20261028", "kill", &path, &[0; 32])
                .is_none()
        );
    }

    #[test]
    fn oversized_clip_is_rejected() {
        let c = example_catalog();
        let f = Fixture::new();
        let p = f.clip();
        let file = std::fs::File::create(&p).unwrap();
        file.set_len(MAX_CLIP_BYTES + 1).unwrap();
        assert_eq!(
            resolve_with_catalog(&c, "pack_vrzo_20261028", "kill", &p),
            None
        );
    }

    #[test]
    fn shipped_catalog_has_unique_valid_entries() {
        let c = catalog().expect("catalog parses");
        assert_eq!(c.pack_id, "pack_vrzo_20261028");
        assert!(!c.entries.is_empty());
        for e in &c.entries {
            let path = std::env::temp_dir().join(format!("{}.wav", e.id));
            assert!(matching_entry(c, &c.pack_id, &e.event, &path).is_some());
            let digest = |hex: &str| -> [u8; 32] {
                std::array::from_fn(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap())
            };
            let original = digest(&e.audio_sha256);
            let played = digest(&e.mixed_sha256);
            assert_eq!(
                resolve_played_clip(&c.pack_id, &e.event, &path, &original, &played),
                Some(e.id.clone())
            );
            assert!(resolve_played_clip(&c.pack_id, &e.event, &path, &[0; 32], &played).is_none());
            assert!(
                resolve_played_clip(&c.pack_id, &e.event, &path, &original, &[0; 32]).is_none()
            );
            let bytes = std::fs::read(
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("vrzo-mixed")
                    .join(format!("{}.wav", e.id)),
            )
            .unwrap();
            let (samples, actual) =
                crate::vrzo_mix::decode_mix(&bytes, &e.mixed_sha256, e.mixed_samples).unwrap();
            assert_eq!(samples.len(), e.mixed_samples);
            assert_eq!(actual, played);
        }
    }
}
