use std::sync::{Mutex, MutexGuard};

pub struct OutputAdmission(Mutex<()>);
impl Default for OutputAdmission {
    fn default() -> Self {
        Self::new()
    }
}
impl OutputAdmission {
    pub const fn new() -> Self {
        Self(Mutex::new(()))
    }
    pub fn try_enter(&self) -> Option<MutexGuard<'_, ()>> {
        self.0.try_lock().ok()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlaybackResult {
    Admitted,
    Rejected,
}

pub struct PlaybackReceipt {
    callback: Option<Box<dyn FnOnce(PlaybackResult) + Send>>,
    admitted: bool,
}
impl PlaybackReceipt {
    pub fn new(callback: impl FnOnce(PlaybackResult) + Send + 'static) -> Self {
        Self {
            callback: Some(Box::new(callback)),
            admitted: false,
        }
    }
    pub fn admit(mut self) {
        self.admitted = true;
    }
}
impl Drop for PlaybackReceipt {
    fn drop(&mut self) {
        if let Some(callback) = self.callback.take() {
            callback(if self.admitted {
                PlaybackResult::Admitted
            } else {
                PlaybackResult::Rejected
            });
        }
    }
}

pub fn attempt_commit(admit: impl FnOnce(&mut dyn FnMut()), action: impl FnOnce()) -> bool {
    let mut action = Some(action);
    let mut committed = false;
    admit(&mut || {
        if let Some(action) = action.take() {
            action();
            committed = true;
        }
    });
    committed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    #[test]
    fn queued_or_dropped_audio_is_not_admitted() {
        let result = Arc::new(Mutex::new(Vec::new()));
        let output = result.clone();
        let receipt = PlaybackReceipt::new(move |r| output.lock().unwrap().push(r));
        drop(receipt);
        assert_eq!(*result.lock().unwrap(), vec![PlaybackResult::Rejected]);
    }
    #[test]
    fn successful_sink_admission_notifies_exactly_once() {
        let calls = Arc::new(AtomicUsize::new(0));
        let output = calls.clone();
        PlaybackReceipt::new(move |r| {
            assert_eq!(r, PlaybackResult::Admitted);
            output.fetch_add(1, Ordering::SeqCst);
        })
        .admit();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn output_admission_is_shared_and_nonblocking_until_previous_publisher_exits() {
        let gate = Arc::new(OutputAdmission::new());
        let guard = gate.try_enter().unwrap();
        let other = gate.clone();
        assert!(!std::thread::spawn(move || other.try_enter().is_some())
            .join()
            .unwrap());
        drop(guard);
        assert!(gate.try_enter().is_some());
    }
    #[test]
    fn revocation_before_native_commit_rejects_prepared_audio_and_duplicate_commit_is_one_shot() {
        let generation = Mutex::new(1);
        let expected = *generation.lock().unwrap();
        *generation.lock().unwrap() = 2;
        let mut played = false;
        assert!(!attempt_commit(
            |commit| {
                let current = generation.lock().unwrap();
                if *current == expected {
                    commit();
                }
            },
            || played = true
        ));
        assert!(!played);
        let mut count = 0;
        assert!(attempt_commit(
            |commit| {
                commit();
                commit();
            },
            || count += 1
        ));
        assert_eq!(count, 1);
    }
}
