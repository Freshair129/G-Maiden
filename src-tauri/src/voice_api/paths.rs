//! Voice-root path resolution + the test-only root override. Split out of
//! the original `voice_api.rs` monolith (facade refactor, no behavior
//! change).
//!
//! CRITICAL: `voice_root`/`packs_dir`/`active_path`/`pack_dir`/
//! `discover_pack_dirs`/`create_pack_skeleton` are kept together in this one
//! file — `voice_root()` reads the `cfg(test)` thread_local override, and
//! everything else in this file is built directly or indirectly on top of it.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::audio;

use super::pack_io::{self, Manifest};

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

pub(crate) fn voice_root() -> PathBuf {
    #[cfg(test)]
    {
        if let Some(p) = TEST_VOICE_ROOT.with(|cell| cell.borrow().clone()) {
            return p;
        }
    }
    audio::voice_cache_dir()
}

pub(crate) fn packs_dir() -> PathBuf {
    voice_root().join("packs")
}

pub(crate) fn active_path() -> PathBuf {
    voice_root().join("active-pack.txt")
}

pub(crate) fn pack_dir(pack_id: &str) -> Result<PathBuf, String> {
    let id = pack_io::sanitize_id(pack_id);
    let dir = packs_dir().join(id);
    if !dir.is_dir() {
        return Err(format!("voice pack not found: {pack_id}"));
    }
    Ok(dir)
}

pub(crate) fn discover_pack_dirs(packs: &Path) -> Vec<PathBuf> {
    fs::read_dir(packs)
        .ok()
        .into_iter()
        .flat_map(|it| it.flatten())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect()
}

pub(crate) fn create_pack_skeleton(
    dir: &Path,
    id: &str,
    name: &str,
    locale: &str,
) -> Result<(), String> {
    fs::create_dir_all(dir.join("clips")).map_err(|e| format!("create clips dir: {e}"))?;
    fs::create_dir_all(dir.join("banners")).map_err(|e| format!("create banners dir: {e}"))?;
    if !dir.join("manifest.json").is_file() {
        let manifest = Manifest {
            id: id.into(),
            name: name.into(),
            version: "0.1.0".into(),
            locale: locale.into(),
            author: String::new(),
            author_gid: None,
            description: "User voice pack".into(),
            cover_image: String::new(),
            mappings: BTreeMap::new(),
        };
        pack_io::write_manifest(dir, &manifest)?;
    }
    Ok(())
}
