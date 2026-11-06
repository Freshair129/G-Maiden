//! Admission and deadline for the bounded related-WebView startup experiment.

pub const PACKAGED_ROOT: &str = "http://tauri.localhost/";
pub const DEVELOPMENT_ROOT: &str = "http://localhost:5173/";
pub const DEADLINE_MS: u64 = 15_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SelectedRoot(&'static str);

impl SelectedRoot {
    pub fn select(framework_dev: bool, configured_dev: Option<&str>) -> Result<Self, &'static str> {
        if !framework_dev {
            return Ok(Self(PACKAGED_ROOT));
        }
        if configured_dev == Some(DEVELOPMENT_ROOT) {
            Ok(Self(DEVELOPMENT_ROOT))
        } else {
            Err("development requires the configured localhost:5173 root")
        }
    }

    pub fn as_str(self) -> &'static str {
        self.0
    }

    pub fn trusts(self, url: &str) -> bool {
        url == self.0
    }
}

pub fn dispatch_visibility<E>(
    enqueue: impl FnOnce(Box<dyn FnOnce() + Send>) -> Result<(), E>,
    latest: impl FnOnce() -> Option<bool> + Send + 'static,
    apply: impl FnOnce(Option<bool>) + Send + 'static,
) -> Result<(), E> {
    // Read on the serialized native thread: an older producer can enqueue
    // after a newer hide has already completed.
    enqueue(Box::new(move || apply(latest())))
}

#[derive(Debug, PartialEq, Eq)]
pub enum Phase {
    AwaitingControl,
    Requested,
    Creating,
    AwaitingReady,
    Ready,
    Failed,
}

pub struct Bootstrap {
    root: SelectedRoot,
    pub phase: Phase,
    pub visible: bool,
    loaded: bool,
}

impl Default for Bootstrap {
    fn default() -> Self {
        Self::new(SelectedRoot(PACKAGED_ROOT))
    }
}

impl Bootstrap {
    pub fn new(root: SelectedRoot) -> Self {
        Self {
            root,
            phase: Phase::AwaitingControl,
            visible: false,
            loaded: false,
        }
    }

    pub fn root(&self) -> SelectedRoot {
        self.root
    }

    pub fn request(&mut self, url: &str, now: u64) -> bool {
        self.expire(now);
        if self.phase != Phase::AwaitingControl || !self.root.trusts(url) {
            return false;
        }
        self.phase = Phase::Requested;
        true
    }
    pub fn admit(&mut self, control: &str, target: &str, now: u64) -> bool {
        self.expire(now);
        if self.phase != Phase::Requested || !self.root.trusts(control) || !self.root.trusts(target)
        {
            return false;
        }
        self.phase = Phase::Creating;
        true
    }
    pub fn created(&mut self, now: u64) -> bool {
        self.expire(now);
        if self.phase != Phase::Creating {
            return false;
        }
        self.phase = Phase::AwaitingReady;
        true
    }
    pub fn loaded(&mut self, label: &str, url: &str, now: u64) -> bool {
        self.expire(now);
        if !matches!(self.phase, Phase::Creating | Phase::AwaitingReady)
            || label != "overlay"
            || !self.root.trusts(url)
        {
            return false;
        }
        self.loaded = true;
        true
    }
    pub fn ready(&mut self, label: &str, url: &str, now: u64) -> Result<bool, &'static str> {
        self.expire(now);
        if label != "overlay" || !self.root.trusts(url) {
            return Err("untrusted overlay readiness");
        }
        if self.phase == Phase::Ready {
            return Ok(false);
        }
        if self.phase != Phase::AwaitingReady || !self.loaded {
            return Err("overlay bootstrap unavailable");
        }
        self.phase = Phase::Ready;
        Ok(true)
    }
    pub fn expire(&mut self, now: u64) -> bool {
        if now >= DEADLINE_MS && !matches!(self.phase, Phase::Ready | Phase::Failed) {
            self.fail();
            return true;
        }
        false
    }
    pub fn fail(&mut self) {
        self.phase = Phase::Failed;
    }
    pub fn visibility(&mut self, visible: bool) -> Option<bool> {
        self.visible = visible;
        (self.phase == Phase::Ready).then_some(visible)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::{Arc, Barrier, Mutex};

    type MainQueue = Arc<Mutex<VecDeque<Box<dyn FnOnce() + Send>>>>;

    #[test]
    fn framework_development_completes_popup_load_and_native_ready() {
        let root = SelectedRoot::select(true, Some("http://localhost:5173/")).unwrap();
        assert_eq!(root.as_str(), "http://localhost:5173/");
        let mut state = Bootstrap::new(root);
        assert!(state.request("http://localhost:5173/", 1));
        assert!(state.admit("http://localhost:5173/", "http://localhost:5173/", 2));
        assert!(state.created(3));
        assert!(state.loaded("overlay", "http://localhost:5173/", 4));
        assert_eq!(
            state.ready("overlay", "http://localhost:5173/", 5),
            Ok(true)
        );
        assert_eq!(
            state.ready("overlay", "http://localhost:5173/", 6),
            Ok(false)
        );
    }

    #[test]
    fn each_framework_mode_rejects_the_other_root_at_every_boundary() {
        for (framework_dev, allowed, denied) in [
            (false, "http://tauri.localhost/", "http://localhost:5173/"),
            (true, "http://localhost:5173/", "http://tauri.localhost/"),
        ] {
            let root = SelectedRoot::select(framework_dev, Some("http://localhost:5173/")).unwrap();
            assert!(root.trusts(allowed));
            assert!(!root.trusts(denied));
            let mut state = Bootstrap::new(root);
            assert!(!state.request(denied, 1));
            assert!(state.request(allowed, 2));
            assert!(!state.admit(denied, allowed, 3));
            assert!(!state.admit(allowed, denied, 3));
            assert!(state.admit(allowed, allowed, 4));
            assert!(state.created(5));
            assert!(!state.loaded("overlay", denied, 6));
            assert!(state.loaded("overlay", allowed, 7));
            assert!(state.ready("overlay", denied, 8).is_err());
            assert_eq!(state.ready("overlay", allowed, 9), Ok(true));
        }
    }

    #[test]
    fn missing_or_changed_development_configuration_fails_closed() {
        for configured in [
            None,
            Some("http://localhost:5173"),
            Some("http://localhost:5174/"),
            Some("http://127.0.0.1:5173/"),
            Some("https://localhost:5173/"),
            Some("http://user@localhost:5173/"),
            Some("http://localhost:5173/path"),
            Some("http://localhost:5173/?x=1"),
            Some("http://localhost:5173/#x"),
            Some("http://evil.test:5173/"),
            Some("about:blank"),
        ] {
            assert!(
                SelectedRoot::select(true, configured).is_err(),
                "accepted {configured:?}"
            );
        }
    }

    #[test]
    fn framework_production_ignores_dev_configuration_even_in_debug_test_build() {
        for configured in [
            None,
            Some("http://localhost:5173/"),
            Some("https://evil.test/"),
            Some("malformed"),
        ] {
            let root = SelectedRoot::select(false, configured).unwrap();
            assert_eq!(root.as_str(), "http://tauri.localhost/");
            assert!(!root.trusts("http://localhost:5173/"));
            assert!(!root.trusts("https://evil.test/"));
        }
    }

    fn enqueue_visibility(
        queue: MainQueue,
        state: Arc<Mutex<Bootstrap>>,
        native: Arc<Mutex<Vec<bool>>>,
        before_enqueue: Option<(Arc<Barrier>, Arc<Barrier>)>,
    ) {
        dispatch_visibility(
            move |action| {
                if let Some((read_or_queued, resume)) = before_enqueue {
                    read_or_queued.wait();
                    resume.wait();
                }
                queue.lock().unwrap().push_back(action);
                Ok::<(), ()>(())
            },
            move || {
                let state = state.lock().unwrap();
                (state.phase == Phase::Ready).then_some(state.visible)
            },
            move |visible| {
                if let Some(visible) = visible {
                    native.lock().unwrap().push(visible);
                }
            },
        )
        .unwrap();
    }

    fn drain_main(queue: &MainQueue) {
        loop {
            let action = queue.lock().unwrap().pop_front();
            match action {
                Some(action) => action(),
                None => break,
            }
        }
    }

    #[test]
    fn delayed_ready_application_cannot_override_completed_newer_hide() {
        let mut ready = creating();
        assert!(ready.created(10));
        assert!(ready.loaded("overlay", PACKAGED_ROOT, 11));
        assert_eq!(ready.ready("overlay", PACKAGED_ROOT, 12), Ok(true));
        ready.visibility(true);
        let state = Arc::new(Mutex::new(ready));
        let queue: MainQueue = Arc::default();
        let native = Arc::new(Mutex::new(Vec::new()));
        let paused = Arc::new(Barrier::new(2));
        let resume = Arc::new(Barrier::new(2));
        let worker = {
            let (queue, state, native, paused, resume) = (
                Arc::clone(&queue),
                Arc::clone(&state),
                Arc::clone(&native),
                Arc::clone(&paused),
                Arc::clone(&resume),
            );
            std::thread::spawn(move || {
                enqueue_visibility(queue, state, native, Some((paused, resume)))
            })
        };
        paused.wait();
        state.lock().unwrap().visibility(false);
        enqueue_visibility(
            Arc::clone(&queue),
            Arc::clone(&state),
            Arc::clone(&native),
            None,
        );
        drain_main(&queue);
        assert_eq!(*native.lock().unwrap(), vec![false]);
        resume.wait();
        worker.join().unwrap();
        drain_main(&queue);
        assert_eq!(*native.lock().unwrap(), vec![false, false]);
    }

    #[test]
    fn queued_visibility_is_revalidated_after_terminal_failure() {
        let mut ready = creating();
        assert!(ready.created(10));
        assert!(ready.loaded("overlay", PACKAGED_ROOT, 11));
        assert_eq!(ready.ready("overlay", PACKAGED_ROOT, 12), Ok(true));
        ready.visibility(true);
        let state = Arc::new(Mutex::new(ready));
        let queue: MainQueue = Arc::default();
        let native = Arc::new(Mutex::new(Vec::new()));
        enqueue_visibility(
            Arc::clone(&queue),
            Arc::clone(&state),
            Arc::clone(&native),
            None,
        );
        state.lock().unwrap().fail();
        drain_main(&queue);
        assert!(native.lock().unwrap().is_empty());
    }

    fn creating() -> Bootstrap {
        let mut state = Bootstrap::default();
        assert!(state.request("http://tauri.localhost/", 5));
        assert!(state.admit("http://tauri.localhost/", "http://tauri.localhost/", 6));
        state
    }

    #[test]
    fn only_exact_packaged_root_is_trusted() {
        let root = SelectedRoot::select(false, None).unwrap();
        assert!(root.trusts("http://tauri.localhost/"));
        for url in [
            "https://tauri.localhost/",
            "http://evil.test/",
            "http://tauri.localhost.evil/",
            "http://user@tauri.localhost/",
            "http://tauri.localhost:80/",
            "http://tauri.localhost/index.html",
            "http://tauri.localhost/?x=1",
            "http://tauri.localhost/#x",
            "about:blank",
            "http://localhost:5173/",
        ] {
            assert!(!root.trusts(url), "accepted {url}");
        }
    }

    #[test]
    fn admits_exactly_one_expected_popup_after_control_load() {
        let mut state = Bootstrap::default();
        assert!(!state.admit(PACKAGED_ROOT, PACKAGED_ROOT, 1));
        assert!(!state.request("http://evil.test/", 2));
        assert!(state.request(PACKAGED_ROOT, 3));
        assert!(!state.request(PACKAGED_ROOT, 4));
        assert!(!state.admit("http://evil.test/", PACKAGED_ROOT, 5));
        assert!(!state.admit(PACKAGED_ROOT, "http://evil.test/", 5));
        assert!(state.admit(PACKAGED_ROOT, PACKAGED_ROOT, 6));
        assert!(!state.admit(PACKAGED_ROOT, PACKAGED_ROOT, 7));
    }

    #[test]
    fn ready_requires_created_loaded_overlay_and_is_idempotent() {
        let mut state = creating();
        assert!(state.ready("overlay", PACKAGED_ROOT, 7).is_err());
        assert!(state.created(8));
        assert!(state.ready("overlay", PACKAGED_ROOT, 9).is_err());
        assert!(!state.loaded("control", PACKAGED_ROOT, 10));
        assert!(!state.loaded("overlay", "about:blank", 10));
        assert!(state.loaded("overlay", PACKAGED_ROOT, 11));
        assert!(state.ready("control", PACKAGED_ROOT, 12).is_err());
        assert!(state.ready("overlay", "about:blank", 12).is_err());
        assert_eq!(state.ready("overlay", PACKAGED_ROOT, 13), Ok(true));
        assert_eq!(state.ready("overlay", PACKAGED_ROOT, 16_000), Ok(false));
        assert!(!state.expire(16_001));
    }

    #[test]
    fn latest_visibility_intent_survives_delayed_creation() {
        let mut state = creating();
        assert_eq!(state.visibility(true), None);
        assert_eq!(state.visibility(false), None);
        assert_eq!(state.visibility(true), None);
        assert!(state.created(10));
        assert!(state.loaded("overlay", PACKAGED_ROOT, 11));
        assert_eq!(state.ready("overlay", PACKAGED_ROOT, 12), Ok(true));
        assert!(state.visible);
        assert_eq!(state.visibility(false), Some(false));
    }

    #[test]
    fn deadline_is_terminal_even_without_timer_callback() {
        let mut state = creating();
        assert!(state.created(10));
        assert!(state.loaded("overlay", PACKAGED_ROOT, 11));
        assert!(state.ready("overlay", PACKAGED_ROOT, 15_000).is_err());
        assert_eq!(state.phase, Phase::Failed);
        assert!(!state.created(15_001));
        assert!(!state.loaded("overlay", PACKAGED_ROOT, 15_002));
        assert!(!state.request(PACKAGED_ROOT, 15_003));
        assert!(!state.admit(PACKAGED_ROOT, PACKAGED_ROOT, 15_004));
        assert!(state.ready("overlay", PACKAGED_ROOT, 15_005).is_err());
        assert_eq!(state.visibility(true), None);
    }

    #[test]
    fn failed_creation_cannot_be_revived_by_late_callbacks() {
        let mut state = creating();
        state.fail();
        assert!(!state.created(8));
        assert!(!state.loaded("overlay", PACKAGED_ROOT, 9));
        assert!(state.ready("overlay", PACKAGED_ROOT, 10).is_err());
        assert!(!state.admit(PACKAGED_ROOT, PACKAGED_ROOT, 11));
    }

    #[test]
    fn timeout_covers_control_never_loading_and_child_creation() {
        let mut state = Bootstrap::default();
        assert!(!state.expire(14_999));
        assert!(state.expire(15_000));
        assert!(!state.expire(15_001));
        let mut state = creating();
        assert!(!state.created(15_000));
        assert_eq!(state.phase, Phase::Failed);
    }
}
