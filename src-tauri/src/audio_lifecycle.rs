use std::sync::{
    atomic::{AtomicU64, Ordering},
    mpsc, Arc,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlaybackLifecyclePhase {
    Started,
    Completed,
    Cancelled,
    Preempted,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlaybackLifecycleEvent {
    pub token: u64,
    pub playback_id: u64,
    pub phase: PlaybackLifecyclePhase,
    pub audio_sha256: Option<[u8; 32]>,
    pub played_audio_sha256: Option<[u8; 32]>,
}
pub struct PlaybackLifecycleObserver {
    pub(crate) mixed: Option<crate::vrzo_banner::MixedSelection>,
    token: u64,
    tx: mpsc::SyncSender<PlaybackLifecycleEvent>,
}
impl PlaybackLifecycleObserver {
    pub fn new(token: u64, tx: mpsc::SyncSender<PlaybackLifecycleEvent>) -> Self {
        Self {
            token,
            tx,
            mixed: None,
        }
    }
}
pub(super) struct Lifecycle {
    current: Arc<AtomicU64>,
    generation: Arc<AtomicU64>,
    next: u64,
    active: Option<(u64, PlaybackLifecycleObserver)>,
}
impl Lifecycle {
    pub(super) fn new(current: Arc<AtomicU64>, generation: Arc<AtomicU64>) -> Self {
        Self {
            current,
            generation,
            next: 0,
            active: None,
        }
    }
    pub(super) fn start(
        &mut self,
        observer: Option<PlaybackLifecycleObserver>,
        audio_sha256: Option<[u8; 32]>,
        played_audio_sha256: Option<[u8; 32]>,
    ) {
        self.finish(PlaybackLifecyclePhase::Preempted);
        let Some(id) = self.next.checked_add(1) else {
            return;
        };
        self.next = id;
        self.generation.store(id, Ordering::Release);
        let Some(observer) = observer else { return };
        self.current.store(id, Ordering::Release);
        let event = PlaybackLifecycleEvent {
            token: observer.token,
            playback_id: id,
            phase: PlaybackLifecyclePhase::Started,
            audio_sha256,
            played_audio_sha256,
        };
        if observer.tx.try_send(event).is_ok() {
            self.active = Some((id, observer));
        } else {
            self.current.store(0, Ordering::Release);
        }
    }
    pub(super) fn finish(&mut self, phase: PlaybackLifecyclePhase) {
        if phase == PlaybackLifecyclePhase::Cancelled {
            // Cancellation also revokes a natural-completion tail with no sink.
            self.next = self.next.saturating_add(1);
            self.generation.store(self.next, Ordering::Release);
        }
        self.current.store(0, Ordering::Release);
        if let Some((id, observer)) = self.active.take() {
            let _ = observer.tx.try_send(PlaybackLifecycleEvent {
                token: observer.token,
                playback_id: id,
                phase,
                audio_sha256: None,
                played_audio_sha256: None,
            });
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    #[test]
    fn unobserved_start_after_completion_invalidates_old_visual_tail() {
        let current = Arc::new(AtomicU64::new(0));
        let generation = Arc::new(AtomicU64::new(0));
        let mut life = Lifecycle::new(current.clone(), generation.clone());
        let (tx, rx) = mpsc::sync_channel(4);
        life.start(
            Some(PlaybackLifecycleObserver::new(9, tx)),
            Some([7; 32]),
            Some([8; 32]),
        );
        let start = rx.try_recv().unwrap();
        assert_eq!(generation.load(Ordering::Acquire), start.playback_id);
        assert_eq!(start.played_audio_sha256, Some([8; 32]));
        life.finish(PlaybackLifecyclePhase::Completed);
        assert_eq!(generation.load(Ordering::Acquire), start.playback_id);
        life.start(None, None, None);
        assert_eq!(current.load(Ordering::Acquire), 0);
        assert!(generation.load(Ordering::Acquire) > start.playback_id);
    }

    #[test]
    fn cancel_after_completed_invalidates_silent_visual_tail() {
        let (mut life, _, tx, rx) = setup(4);
        life.start(Some(PlaybackLifecycleObserver::new(9, tx)), None, None);
        let id = rx.try_recv().unwrap().playback_id;
        life.finish(PlaybackLifecyclePhase::Completed);
        life.finish(PlaybackLifecyclePhase::Cancelled);
        assert!(life.generation.load(Ordering::Acquire) > id);
    }
    fn setup(
        capacity: usize,
    ) -> (
        Lifecycle,
        Arc<AtomicU64>,
        mpsc::SyncSender<PlaybackLifecycleEvent>,
        mpsc::Receiver<PlaybackLifecycleEvent>,
    ) {
        let current = Arc::new(AtomicU64::new(0));
        let (tx, rx) = mpsc::sync_channel(capacity);
        (
            Lifecycle::new(current.clone(), Arc::new(AtomicU64::new(0))),
            current,
            tx,
            rx,
        )
    }
    #[test]
    fn rejected_or_unobserved_play_never_sends_a_start() {
        let (mut life, current, tx, rx) = setup(4);
        drop(PlaybackLifecycleObserver::new(1, tx));
        life.finish(PlaybackLifecyclePhase::Cancelled);
        life.start(None, None, None);
        assert_eq!(current.load(Ordering::Acquire), 0);
        assert!(rx.try_recv().is_err());
    }
    #[test]
    fn start_and_completion_are_ordered_and_resync_to_zero() {
        let (mut life, current, tx, rx) = setup(4);
        life.start(
            Some(PlaybackLifecycleObserver::new(9, tx)),
            Some([7; 32]),
            None,
        );
        let start = rx.try_recv().unwrap();
        assert_eq!(start.phase, PlaybackLifecyclePhase::Started);
        assert_eq!(start.token, 9);
        assert_eq!(start.audio_sha256, Some([7; 32]));
        assert!(start.playback_id > 0);
        assert_eq!(current.load(Ordering::Acquire), start.playback_id);
        life.finish(PlaybackLifecyclePhase::Completed);
        let end = rx.try_recv().unwrap();
        assert_eq!(end.playback_id, start.playback_id);
        assert_eq!(end.phase, PlaybackLifecyclePhase::Completed);
        assert_eq!(end.audio_sha256, None);
        assert_eq!(current.load(Ordering::Acquire), 0);
    }
    #[test]
    fn preempt_orders_old_stop_before_new_start_with_unique_ids() {
        let (mut life, current, tx, rx) = setup(4);
        life.start(
            Some(PlaybackLifecycleObserver::new(1, tx.clone())),
            None,
            None,
        );
        let a = rx.try_recv().unwrap();
        life.finish(PlaybackLifecyclePhase::Preempted);
        life.start(Some(PlaybackLifecycleObserver::new(2, tx)), None, None);
        let stop = rx.try_recv().unwrap();
        let b = rx.try_recv().unwrap();
        assert_eq!(stop.playback_id, a.playback_id);
        assert_eq!(stop.phase, PlaybackLifecyclePhase::Preempted);
        assert!(b.playback_id > a.playback_id);
        assert_eq!(current.load(Ordering::Acquire), b.playback_id);
    }
    #[test]
    fn full_queue_never_blocks_and_current_clears_even_if_stop_dropped() {
        let (mut life, current, tx, rx) = setup(1);
        life.start(Some(PlaybackLifecycleObserver::new(1, tx)), None, None);
        let id = current.load(Ordering::Acquire);
        assert_ne!(id, 0);
        life.finish(PlaybackLifecyclePhase::Cancelled);
        assert_eq!(current.load(Ordering::Acquire), 0);
        assert_eq!(rx.try_recv().unwrap().playback_id, id);
        assert!(rx.try_recv().is_err());
    }
    #[test]
    fn full_start_is_fail_closed_and_unobserved_replacement_clears_current() {
        let (mut life, current, tx, rx) = setup(1);
        life.start(
            Some(PlaybackLifecycleObserver::new(1, tx.clone())),
            None,
            None,
        );
        let _ = rx.try_recv().unwrap();
        life.finish(PlaybackLifecyclePhase::Preempted);
        life.start(Some(PlaybackLifecycleObserver::new(2, tx)), None, None);
        assert_eq!(current.load(Ordering::Acquire), 0);
        assert_eq!(
            rx.try_recv().unwrap().phase,
            PlaybackLifecyclePhase::Preempted
        );
        life.start(None, None, None);
        assert_eq!(current.load(Ordering::Acquire), 0);
    }
}
