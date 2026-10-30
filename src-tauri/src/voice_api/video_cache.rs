//! Verified media snapshots; no decoding or playback during predictive warmup.
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::SystemTime;

const MAX_BYTES: usize = 24 * 1024 * 1024;
const MAX_ENTRIES: usize = 6;

#[derive(Clone, PartialEq, Eq)]
struct Fingerprint { len: u64, modified: SystemTime }
fn fingerprint(path: &Path) -> Option<Fingerprint> {
    let metadata = path.metadata().ok()?;
    metadata.is_file().then_some(Fingerprint { len: metadata.len(), modified: metadata.modified().ok()? })
}
struct Entry { path: PathBuf, hash: String, file: Fingerprint, bytes: Arc<Vec<u8>> }
#[derive(Default)]
struct Cache { revision: u64, entries: VecDeque<Entry>, bytes: usize }
impl Cache {
    fn reset(&mut self, revision: u64) { self.revision = revision; self.entries.clear(); self.bytes = 0; }
    fn get(&mut self, revision: u64, path: &Path, hash: &str, file: &Fingerprint) -> Option<Arc<Vec<u8>>> {
        if revision != self.revision { return None; }
        let index = self.entries.iter().position(|e| e.path == path)?;
        let entry = self.entries.remove(index)?;
        if entry.hash != hash || entry.file != *file { self.bytes -= entry.bytes.len(); return None; }
        let bytes = Arc::clone(&entry.bytes);
        self.entries.push_front(entry);
        Some(bytes)
    }
    fn insert(&mut self, revision: u64, entry: Entry) -> bool {
        if revision != self.revision || entry.bytes.len() > MAX_BYTES { return false; }
        if let Some(index) = self.entries.iter().position(|e| e.path == entry.path) {
            self.bytes -= self.entries.remove(index).expect("existing index").bytes.len();
        }
        while self.entries.len() >= MAX_ENTRIES || self.bytes + entry.bytes.len() > MAX_BYTES {
            if let Some(old) = self.entries.pop_back() { self.bytes -= old.bytes.len(); } else { return false; }
        }
        self.bytes += entry.bytes.len(); self.entries.push_front(entry); true
    }
}
fn cache() -> &'static Mutex<Cache> { static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new(); CACHE.get_or_init(Mutex::default) }

pub(super) fn reset(revision: u64) { if let Ok(mut cache) = cache().lock() { cache.reset(revision); } }

pub(super) fn verified(revision: u64, path: &Path, hash: &str) -> Option<Arc<Vec<u8>>> {
    let before = fingerprint(path)?;
    if let Some(bytes) = cache().lock().ok()?.get(revision, path, hash, &before) {
        eprintln!("[G-BannerCache] hit revision={revision} bytes={}", bytes.len());
        return Some(bytes);
    }
    let bytes = Arc::new(super::id_manifest::verified_bytes(path, hash, super::id_manifest::MAX_MEDIA).ok()?);
    if fingerprint(path)? != before { return None; }
    let entry = Entry { path: path.to_owned(), hash: hash.to_owned(), file: before, bytes: Arc::clone(&bytes) };
    let mut cache = cache().lock().ok()?;
    if cache.revision != revision { return None; }
    if bytes.len() <= MAX_BYTES { cache.insert(revision, entry); }
    eprintln!("[G-BannerCache] verified revision={revision} bytes={}", bytes.len());
    Some(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn file() -> Fingerprint { Fingerprint { len: 4, modified: SystemTime::UNIX_EPOCH } }
    fn entry(path: &str, bytes: usize) -> Entry { Entry { path: path.into(), hash: "verified".into(), file: file(), bytes: Arc::new(vec![1; bytes]) } }
    #[test]
    fn cache_reuses_verified_bytes_and_rejects_changed_identity() {
        let mut c = Cache::default(); c.reset(7);
        assert!(c.insert(7, entry("first", 4)));
        let a = c.get(7, Path::new("first"), "verified", &file()).unwrap();
        let b = c.get(7, Path::new("first"), "verified", &file()).unwrap();
        assert!(Arc::ptr_eq(&a, &b));
        assert!(c.get(7, Path::new("first"), "changed", &file()).is_none());
        assert_eq!(c.bytes, 0);
        c.insert(7, entry("first", 4));
        assert!(c.get(7, Path::new("first"), "verified", &Fingerprint { len: 5, ..file() }).is_none());
    }
    #[test]
    fn generation_reset_rejects_late_warmup_and_old_reads() {
        let mut c = Cache::default(); c.reset(1); c.insert(1, entry("first", 4)); c.reset(2);
        assert!(!c.insert(1, entry("late", 4)));
        assert!(c.get(1, Path::new("first"), "verified", &file()).is_none());
        assert_eq!(c.bytes, 0);
    }
    #[test]
    fn cache_limits_bytes_and_entries_and_evicts_least_recent() {
        let mut c = Cache::default(); c.reset(1);
        for n in 0..MAX_ENTRIES { c.insert(1, entry(&n.to_string(), 4)); }
        c.get(1, Path::new("0"), "verified", &file());
        c.insert(1, entry("next", 4));
        assert!(c.get(1, Path::new("1"), "verified", &file()).is_none());
        assert!(c.get(1, Path::new("0"), "verified", &file()).is_some());
        c.insert(1, entry("big", MAX_BYTES));
        assert_eq!(c.entries.len(), 1); assert_eq!(c.bytes, MAX_BYTES);
        assert!(!c.insert(1, entry("oversize", MAX_BYTES + 1)));
    }
}
