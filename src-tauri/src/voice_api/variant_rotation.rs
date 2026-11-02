//! Non-preview event history, committed only after playback admission.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use std::sync::OnceLock;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

#[derive(Default)]
struct State {
    revision: Option<u64>,
    next_token: u64,
    pending: HashMap<String, u64>,
    last: HashMap<String, PathBuf>,
}

#[derive(Default)]
pub(crate) struct Coordinator {
    state: Mutex<State>,
    changed: Condvar,
}

pub(crate) struct Permit {
    coordinator: Arc<Coordinator>,
    revision: u64,
    event: String,
    token: u64,
    last: Option<PathBuf>,
    finished: bool,
}

#[cfg(not(test))]
pub(super) fn coordinator() -> Arc<Coordinator> {
    static COORDINATOR: OnceLock<Arc<Coordinator>> = OnceLock::new();
    COORDINATOR
        .get_or_init(|| Arc::new(Coordinator::default()))
        .clone()
}

#[cfg(test)]
pub(super) fn coordinator() -> Arc<Coordinator> {
    thread_local! {
        static COORDINATOR: Arc<Coordinator> = Arc::new(Coordinator::default());
    }
    COORDINATOR.with(Arc::clone)
}

impl Coordinator {
    pub(crate) fn reserve_current(
        self: &Arc<Self>,
        revision: u64,
        event: &str,
        wait: Duration,
        current: impl Fn() -> bool,
    ) -> Option<Permit> {
        if !current() {
            return None;
        }
        let permit = self.reserve(revision, event, wait)?;
        current().then_some(permit)
    }

    pub(crate) fn reserve(
        self: &Arc<Self>,
        revision: u64,
        event: &str,
        wait: Duration,
    ) -> Option<Permit> {
        let deadline = Instant::now().checked_add(wait)?;
        let mut state = self.state.lock().ok()?;
        loop {
            if state.revision.is_some_and(|current| revision < current) {
                return None;
            }
            if state.revision != Some(revision) {
                state.revision = Some(revision);
                state.pending.clear();
                state.last.clear();
                self.changed.notify_all();
            }
            if !state.pending.contains_key(event) {
                state.next_token = state.next_token.checked_add(1)?;
                let token = state.next_token;
                let last = state.last.get(event).cloned();
                state.pending.insert(event.to_owned(), token);
                return Some(Permit {
                    coordinator: self.clone(),
                    revision,
                    event: event.to_owned(),
                    token,
                    last,
                    finished: false,
                });
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return None;
            }
            let (next, timeout) = self.changed.wait_timeout(state, remaining).ok()?;
            state = next;
            if timeout.timed_out() {
                return None;
            }
        }
    }
}

impl Permit {
    pub(super) fn revision(&self) -> u64 {
        self.revision
    }

    pub(crate) fn last(&self) -> Option<&Path> {
        self.last.as_deref()
    }

    pub(super) fn admitted(mut self, path: PathBuf) {
        self.finish(Some(path));
    }

    fn finish(&mut self, played: Option<PathBuf>) {
        if self.finished {
            return;
        }
        if let Ok(mut state) = self.coordinator.state.lock() {
            if state.revision == Some(self.revision)
                && state.pending.get(&self.event) == Some(&self.token)
            {
                if let Some(path) = played {
                    state.last.insert(self.event.clone(), path);
                }
                state.pending.remove(&self.event);
                self.coordinator.changed.notify_all();
            }
        }
        self.finished = true;
    }
}

impl Drop for Permit {
    fn drop(&mut self) {
        self.finish(None);
    }
}

pub(super) fn eligible(clips: &[PathBuf], last: Option<&Path>) -> Vec<PathBuf> {
    let alternatives: Vec<_> = clips
        .iter()
        .filter(|p| Some(p.as_path()) != last)
        .cloned()
        .collect();
    if alternatives.is_empty() {
        clips.to_vec()
    } else {
        alternatives
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn admitted_pair_is_excluded_but_rejected_pair_is_not_recorded() {
        let c = Arc::new(Coordinator::default());
        let a = PathBuf::from("a");
        let b = PathBuf::from("b");
        c.reserve(1, "kill", Duration::ZERO)
            .unwrap()
            .admitted(a.clone());
        let permit = c.reserve(1, "kill", Duration::ZERO).unwrap();
        assert_eq!(
            eligible(&[a.clone(), b.clone()], permit.last()),
            vec![b.clone()]
        );
        drop(permit);
        let permit = c.reserve(1, "kill", Duration::ZERO).unwrap();
        assert_eq!(permit.last(), Some(a.as_path()));
        permit.admitted(b.clone());
        assert_eq!(
            c.reserve(1, "kill", Duration::ZERO).unwrap().last(),
            Some(b.as_path())
        );
    }
    #[test]
    fn one_choice_and_other_events_are_independent() {
        let c = Arc::new(Coordinator::default());
        let a = PathBuf::from("a");
        c.reserve(1, "kill", Duration::ZERO)
            .unwrap()
            .admitted(a.clone());
        assert_eq!(eligible(std::slice::from_ref(&a), Some(&a)), vec![a]);
        assert_eq!(c.reserve(1, "death", Duration::ZERO).unwrap().last(), None);
    }
    #[test]
    fn revision_change_invalidates_old_permits_and_resets_history() {
        let c = Arc::new(Coordinator::default());
        let a = PathBuf::from("a");
        c.reserve(1, "kill", Duration::ZERO)
            .unwrap()
            .admitted(a.clone());
        let old = c.reserve(1, "kill", Duration::ZERO).unwrap();
        let new = c.reserve(2, "kill", Duration::ZERO).unwrap();
        assert_eq!(new.last(), None);
        old.admitted(a);
        new.admitted(PathBuf::from("b"));
        assert_eq!(
            c.reserve(2, "kill", Duration::ZERO).unwrap().last(),
            Some(Path::new("b"))
        );
        assert!(c.reserve(1, "kill", Duration::ZERO).is_none());
    }
    #[test]
    fn overlapping_same_event_waits_for_admission_or_rejection() {
        let c = Arc::new(Coordinator::default());
        let first = c.reserve(1, "kill", Duration::ZERO).unwrap();
        assert!(c.reserve(1, "kill", Duration::ZERO).is_none());
        let other = c.reserve(1, "death", Duration::ZERO).unwrap();
        first.admitted(PathBuf::from("a"));
        assert_eq!(
            c.reserve(1, "kill", Duration::ZERO).unwrap().last(),
            Some(Path::new("a"))
        );
        drop(other);
    }

    #[test]
    fn waiting_trigger_sees_only_the_pair_that_was_admitted() {
        let c = Arc::new(Coordinator::default());
        let first = c.reserve(1, "kill", Duration::ZERO).unwrap();
        let worker = c.clone();
        let (ready, wait) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            ready.send(()).unwrap();
            worker
                .reserve(1, "kill", Duration::from_secs(2))
                .unwrap()
                .last()
                .map(Path::to_path_buf)
        });
        wait.recv().unwrap();
        first.admitted(PathBuf::from("a"));
        assert_eq!(thread.join().unwrap(), Some(PathBuf::from("a")));
    }

    #[test]
    fn cancelled_waiter_does_not_acquire_or_change_playback_history() {
        use std::sync::atomic::{AtomicBool, Ordering};
        let c = Arc::new(Coordinator::default());
        let first = c.reserve(1, "kill", Duration::ZERO).unwrap();
        let active = Arc::new(AtomicBool::new(true));
        let worker_active = active.clone();
        let worker_c = c.clone();
        let (ready, wait) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            ready.send(()).unwrap();
            worker_c
                .reserve_current(1, "kill", Duration::from_secs(2), || {
                    worker_active.load(Ordering::Acquire)
                })
                .is_some()
        });
        wait.recv().unwrap();
        active.store(false, Ordering::Release);
        drop(first);
        assert!(!thread.join().unwrap());
        assert_eq!(c.reserve(1, "kill", Duration::ZERO).unwrap().last(), None);
    }
}
