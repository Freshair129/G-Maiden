//! Voice-root resolution and a thread-local root override for isolated tests.
use std::fs;
use std::path::{Path, PathBuf};

use crate::audio;

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

/// Resolve an explicit installed revision, or the active announcer's immutable
/// cache. Callers use this on the control/preparation workers, never audio.
pub(crate) fn pack_dir(id: &str) -> PathBuf {
    if let Some(installer) = crate::package_ipc::installer() {
        if let Ok(records) = installer.installed() {
            let active = installer.selection().ok().and_then(|s| s.active);
            if let Some(record) = records.iter().find(|r| {
                r.installation_id.0 == id
                    || (r.artifact.announcer_id == id
                        && active.as_ref() == Some(&r.installation_id))
            }) {
                if let Ok(path) = installer.cache_path(&record.installation_id) {
                    return path;
                }
            }
        }
    }
    packs_dir().join(id)
}

pub(crate) fn active_path() -> PathBuf {
    voice_root().join("active-pack.txt")
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
