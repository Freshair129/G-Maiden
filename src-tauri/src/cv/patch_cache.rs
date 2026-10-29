//! Exact classifier-input memoization; identity and presence still require fresh capture.
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

const MAX_ENTRIES: usize = 512;
const MAX_WORDS: usize = 3 * 32 * 32;
type Classification = (usize, f32);
struct Entry {
    input: Vec<u32>,
    result: Classification,
}
#[derive(Default)]
pub struct PatchCache {
    previous: HashMap<u64, Entry>,
    current: HashMap<u64, Entry>,
    pub hits: usize,
    pub misses: usize,
}
impl PatchCache {
    pub fn begin_frame(&mut self) {
        std::mem::swap(&mut self.previous, &mut self.current);
        self.current.clear();
        self.hits = 0;
        self.misses = 0;
    }
    pub fn classify(
        &mut self,
        input: Vec<u32>,
        infer: impl FnOnce() -> Option<Classification>,
    ) -> Option<Classification> {
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        input.hash(&mut hash);
        self.classify_key(hash.finish(), input, infer)
    }
    fn classify_key(
        &mut self,
        key: u64,
        input: Vec<u32>,
        infer: impl FnOnce() -> Option<Classification>,
    ) -> Option<Classification> {
        if let Some(entry) = self.current.get(&key).or_else(|| self.previous.get(&key)) {
            // A hash collision never licenses reuse; compare every f32 input bit.
            if entry.input == input {
                let result = entry.result;
                self.hits += 1;
                if !self.current.contains_key(&key) && self.current.len() < MAX_ENTRIES {
                    let entry = self.previous.remove(&key).expect("matched previous entry");
                    self.current.insert(key, entry);
                }
                return Some(result);
            }
        }
        self.misses += 1;
        let result = infer()?;
        if !input.is_empty() && input.len() <= MAX_WORDS && self.current.len() < MAX_ENTRIES {
            self.current.insert(key, Entry { input, result });
        }
        Some(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identical_inputs_reuse_but_changed_pixels_and_hash_collisions_infer() {
        let mut cache = PatchCache::default();
        assert_eq!(
            cache.classify_key(1, vec![10], || Some((2, 0.9))),
            Some((2, 0.9))
        );
        cache.begin_frame();
        assert_eq!(
            cache.classify_key(1, vec![10], || panic!("unchanged")),
            Some((2, 0.9))
        );
        assert_eq!(
            cache.classify_key(1, vec![11], || Some((3, 0.8))),
            Some((3, 0.8))
        );
        assert_eq!((cache.hits, cache.misses), (1, 1));
    }
    #[test]
    fn failed_inference_is_retried_and_old_inputs_expire() {
        let mut cache = PatchCache::default();
        assert_eq!(cache.classify(vec![1], || None), None);
        assert_eq!(cache.classify(vec![1], || Some((0, 1.))), Some((0, 1.)));
        cache.begin_frame();
        cache.begin_frame();
        assert_eq!(cache.classify(vec![1], || Some((2, 0.8))), Some((2, 0.8)));
    }
    #[test]
    fn bounds_memory_without_dropping_uncached_classifications() {
        let mut cache = PatchCache::default();
        for value in 0..MAX_ENTRIES + 10 {
            assert_eq!(
                cache.classify(vec![value as u32], || Some((value, 1.))),
                Some((value, 1.))
            );
        }
        assert_eq!(cache.current.len(), MAX_ENTRIES);
        cache.begin_frame();
        for value in 0..MAX_ENTRIES + 10 {
            cache.classify(vec![value as u32], || Some((value, 1.)));
        }
        assert!(cache.current.len() + cache.previous.len() <= 2 * MAX_ENTRIES);
        let mut cache = PatchCache::default();
        cache.classify(vec![0; MAX_WORDS + 1], || Some((1, 1.)));
        assert!(cache.current.is_empty());
    }
}
