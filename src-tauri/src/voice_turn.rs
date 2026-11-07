use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

const MINIMUM_HOLD_MS: u64 = 250;
const HOLD_CAP_MS: u64 = 15_000;

static CANCEL_GENERATION: AtomicU64 = AtomicU64::new(0);
static TURN_ACTIVE: AtomicBool = AtomicBool::new(false);
static PROCESS_START: OnceLock<Instant> = OnceLock::new();

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VoiceState {
    Idle,
    Preparing,
    Listening,
    Decoding,
    #[allow(dead_code)] // used by Slice 2 STT backend (CR-041 §5)
    Answering,
    #[allow(dead_code)] // used by Slice 2 STT backend (CR-041 §5)
    Speaking,
    Unavailable,
    Cancelled,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnReason {
    TooShort,
    Superseded,
    SignalPreempt,
    AppExit,
    InternalError,
    SttNotInstalled,
    #[allow(dead_code)] // used by Slice 2 STT backend (CR-041 §5)
    PttUnregistered,
    #[allow(dead_code)] // used by Slice 2 STT backend (CR-041 §5)
    ModelUnavailable,
    HoldCap,
    MicDisabled,
    NoInputDevice,
    InputOpenFailed,
    MicPermissionDenied,
    InputDeviceLost,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTurnEvent {
    pub request_id: u64,
    pub state: VoiceState,
    pub reason: Option<TurnReason>,
    pub monotonic_ms: u64,
}

pub enum BackendStart {
    #[allow(dead_code)] // used by Slice 2 STT backend (CR-041 §5)
    Ready,
    Pending,
    Unavailable(TurnReason),
}

pub enum BackendProgress {
    Pending,
    Ready,
    HoldCap,
    Unavailable(TurnReason),
    Failed(TurnReason),
}

pub enum BackendFinish {
    Unavailable(TurnReason),
}

pub trait VoiceBackend: Send {
    fn on_press(&mut self, request_id: u64) -> BackendStart;

    fn start_preparing(&mut self, _request_id: u64, _now_ms: u64) -> BackendProgress {
        BackendProgress::Pending
    }

    fn poll(&mut self, _request_id: u64, _now_ms: u64) -> BackendProgress {
        BackendProgress::Pending
    }

    fn on_release(
        &mut self,
        _request_id: u64,
        _reason: Option<TurnReason>,
    ) -> Option<BackendFinish> {
        None
    }

    fn cancel(&mut self, _request_id: u64, _reason: TurnReason) {}
}

#[cfg(test)]
pub struct NoSttBackend;

#[cfg(test)]
impl VoiceBackend for NoSttBackend {
    fn on_press(&mut self, _request_id: u64) -> BackendStart {
        BackendStart::Unavailable(TurnReason::SttNotInstalled)
    }
}

pub struct VoiceTurn {
    backend: Box<dyn VoiceBackend>,
    state: VoiceState,
    request_id: u64,
    key_down: bool,
    pressed_at_ms: Option<u64>,
    observed_cancel_generation: u64,
}

impl VoiceTurn {
    pub fn new(backend: impl VoiceBackend + 'static) -> Self {
        TURN_ACTIVE.store(false, Ordering::Release);
        Self {
            backend: Box::new(backend),
            state: VoiceState::Idle,
            request_id: 0,
            key_down: false,
            pressed_at_ms: None,
            observed_cancel_generation: CANCEL_GENERATION.load(Ordering::Acquire),
        }
    }

    pub fn press(&mut self) -> Vec<VoiceTurnEvent> {
        self.press_at(monotonic_ms())
    }

    pub fn press_at(&mut self, now_ms: u64) -> Vec<VoiceTurnEvent> {
        let mut events = self.observe_preemption(now_ms);
        if self.key_down {
            return events;
        }
        self.key_down = true;
        self.pressed_at_ms = Some(now_ms);

        match self.state {
            VoiceState::Decoding | VoiceState::Answering | VoiceState::Speaking => {
                self.finish_terminal(
                    VoiceState::Cancelled,
                    Some(TurnReason::Superseded),
                    now_ms,
                    &mut events,
                );
            }
            VoiceState::Idle => {}
            VoiceState::Preparing | VoiceState::Listening => return events,
            VoiceState::Unavailable | VoiceState::Cancelled | VoiceState::Failed => return events,
        }

        self.request_id = self.request_id.wrapping_add(1).max(1);
        match self.backend.on_press(self.request_id) {
            BackendStart::Unavailable(reason) => {
                self.finish_terminal(VoiceState::Unavailable, Some(reason), now_ms, &mut events);
            }
            BackendStart::Ready => {
                self.transition(VoiceState::Preparing, None, now_ms, &mut events);
                self.transition(VoiceState::Listening, None, now_ms, &mut events);
            }
            BackendStart::Pending => {
                self.transition(VoiceState::Preparing, None, now_ms, &mut events);
                let progress = self.backend.start_preparing(self.request_id, now_ms);
                self.apply_backend_progress(progress, now_ms, &mut events);
            }
        }
        events
    }

    pub fn release(&mut self) -> Vec<VoiceTurnEvent> {
        self.release_at(monotonic_ms())
    }

    pub fn release_at(&mut self, now_ms: u64) -> Vec<VoiceTurnEvent> {
        let mut events = self.observe_preemption(now_ms);
        if !self.key_down {
            return events;
        }
        self.key_down = false;
        let held_ms = now_ms.saturating_sub(self.pressed_at_ms.take().unwrap_or(now_ms));
        if self.state == VoiceState::Preparing {
            self.finish_terminal(
                VoiceState::Cancelled,
                Some(TurnReason::TooShort),
                now_ms,
                &mut events,
            );
            return events;
        }
        if self.state != VoiceState::Listening {
            return events;
        }

        if held_ms >= HOLD_CAP_MS {
            self.finish_listening(TurnReason::HoldCap, now_ms, &mut events);
        } else if held_ms < MINIMUM_HOLD_MS {
            self.finish_terminal(
                VoiceState::Cancelled,
                Some(TurnReason::TooShort),
                now_ms,
                &mut events,
            );
        } else {
            self.finish_listening_without_reason(now_ms, &mut events);
        }
        events
    }

    pub fn tick(&mut self) -> Vec<VoiceTurnEvent> {
        self.tick_at(monotonic_ms())
    }

    pub fn tick_at(&mut self, now_ms: u64) -> Vec<VoiceTurnEvent> {
        let mut events = self.observe_preemption(now_ms);
        if matches!(self.state, VoiceState::Preparing | VoiceState::Listening) {
            let progress = self.backend.poll(self.request_id, now_ms);
            self.apply_backend_progress(progress, now_ms, &mut events);
        }
        if self.state == VoiceState::Listening
            && now_ms.saturating_sub(self.pressed_at_ms.unwrap_or(now_ms)) >= HOLD_CAP_MS
        {
            self.finish_listening(TurnReason::HoldCap, now_ms, &mut events);
        }
        events
    }

    fn apply_backend_progress(
        &mut self,
        progress: BackendProgress,
        now_ms: u64,
        events: &mut Vec<VoiceTurnEvent>,
    ) {
        match progress {
            BackendProgress::Pending => {}
            BackendProgress::Ready if self.state == VoiceState::Preparing => {
                self.transition(VoiceState::Listening, None, now_ms, events);
            }
            BackendProgress::Ready => {}
            BackendProgress::HoldCap if self.state == VoiceState::Listening => {
                self.finish_listening(TurnReason::HoldCap, now_ms, events);
            }
            BackendProgress::HoldCap => {}
            BackendProgress::Unavailable(reason)
                if matches!(self.state, VoiceState::Preparing | VoiceState::Listening) =>
            {
                self.finish_terminal(VoiceState::Unavailable, Some(reason), now_ms, events);
            }
            BackendProgress::Failed(reason)
                if matches!(self.state, VoiceState::Preparing | VoiceState::Listening) =>
            {
                self.finish_terminal(VoiceState::Failed, Some(reason), now_ms, events);
            }
            BackendProgress::Unavailable(_) | BackendProgress::Failed(_) => {}
        }
    }

    fn finish_listening_without_reason(&mut self, now_ms: u64, events: &mut Vec<VoiceTurnEvent>) {
        let completion = self.backend.on_release(self.request_id, None);
        self.transition(VoiceState::Decoding, None, now_ms, events);
        self.finish_backend_completion(completion, now_ms, events);
    }

    fn finish_listening(
        &mut self,
        reason: TurnReason,
        now_ms: u64,
        events: &mut Vec<VoiceTurnEvent>,
    ) {
        let completion = self.backend.on_release(self.request_id, Some(reason));
        self.transition(VoiceState::Decoding, Some(reason), now_ms, events);
        self.finish_backend_completion(completion, now_ms, events);
    }

    fn finish_backend_completion(
        &mut self,
        completion: Option<BackendFinish>,
        now_ms: u64,
        events: &mut Vec<VoiceTurnEvent>,
    ) {
        if let Some(BackendFinish::Unavailable(reason)) = completion {
            self.finish_backend_terminal(VoiceState::Unavailable, reason, now_ms, events);
        }
    }

    #[allow(dead_code)] // used by Slice 2 STT backend (CR-041 §5)
    pub fn backend_transition(
        &mut self,
        request_id: u64,
        next: VoiceState,
        reason: Option<TurnReason>,
        now_ms: u64,
    ) -> Vec<VoiceTurnEvent> {
        let mut events = self.observe_preemption(now_ms);
        if request_id != self.request_id || self.state == VoiceState::Idle {
            return events;
        }

        if matches!(
            next,
            VoiceState::Unavailable | VoiceState::Cancelled | VoiceState::Failed
        ) {
            if next == VoiceState::Cancelled && reason.is_none() {
                return events;
            }
            let default_reason = match next {
                VoiceState::Unavailable => TurnReason::ModelUnavailable,
                VoiceState::Cancelled => reason.unwrap_or(TurnReason::InternalError),
                VoiceState::Failed => TurnReason::InternalError,
                _ => unreachable!(),
            };
            let terminal_reason = reason.unwrap_or(default_reason);
            if next == VoiceState::Cancelled {
                self.finish_backend_terminal(next, terminal_reason, now_ms, &mut events);
            } else {
                self.finish_terminal(next, Some(terminal_reason), now_ms, &mut events);
            }
            return events;
        }

        let valid = matches!(
            (self.state, next),
            (VoiceState::Preparing, VoiceState::Listening)
                | (VoiceState::Decoding, VoiceState::Answering)
                | (VoiceState::Answering, VoiceState::Speaking)
                | (VoiceState::Speaking, VoiceState::Idle)
        );
        if valid {
            self.transition(next, reason, now_ms, &mut events);
            if next == VoiceState::Idle {
                self.pressed_at_ms = None;
            }
        }
        events
    }

    pub fn cancel(&mut self, reason: TurnReason, now_ms: u64) -> Vec<VoiceTurnEvent> {
        let mut events = self.observe_preemption(now_ms);
        if self.state != VoiceState::Idle {
            self.finish_terminal(VoiceState::Cancelled, Some(reason), now_ms, &mut events);
        }
        events
    }

    fn observe_preemption(&mut self, now_ms: u64) -> Vec<VoiceTurnEvent> {
        let generation = CANCEL_GENERATION.load(Ordering::Acquire);
        if generation == self.observed_cancel_generation {
            return Vec::new();
        }
        self.observed_cancel_generation = generation;
        let mut events = Vec::new();
        if self.state != VoiceState::Idle {
            self.finish_terminal(
                VoiceState::Cancelled,
                Some(TurnReason::SignalPreempt),
                now_ms,
                &mut events,
            );
        }
        events
    }

    fn transition(
        &mut self,
        state: VoiceState,
        reason: Option<TurnReason>,
        now_ms: u64,
        events: &mut Vec<VoiceTurnEvent>,
    ) {
        self.state = state;
        TURN_ACTIVE.store(state != VoiceState::Idle, Ordering::Release);
        events.push(VoiceTurnEvent {
            request_id: self.request_id,
            state,
            reason,
            monotonic_ms: now_ms,
        });
    }

    fn finish_terminal(
        &mut self,
        terminal: VoiceState,
        reason: Option<TurnReason>,
        now_ms: u64,
        events: &mut Vec<VoiceTurnEvent>,
    ) {
        if terminal == VoiceState::Cancelled {
            self.backend
                .cancel(self.request_id, reason.unwrap_or(TurnReason::InternalError));
        }
        self.transition(terminal, reason, now_ms, events);
        if !self.key_down {
            self.pressed_at_ms = None;
        }
        self.transition(VoiceState::Idle, None, now_ms, events);
    }

    fn finish_backend_terminal(
        &mut self,
        terminal: VoiceState,
        reason: TurnReason,
        now_ms: u64,
        events: &mut Vec<VoiceTurnEvent>,
    ) {
        self.transition(terminal, Some(reason), now_ms, events);
        if !self.key_down {
            self.pressed_at_ms = None;
        }
        self.transition(VoiceState::Idle, None, now_ms, events);
    }
}

pub fn critical_preempt() {
    CANCEL_GENERATION.fetch_add(1, Ordering::AcqRel);
}

pub fn turn_active() -> bool {
    TURN_ACTIVE.load(Ordering::Acquire)
}

pub fn monotonic_ms() -> u64 {
    PROCESS_START
        .get_or_init(Instant::now)
        .elapsed()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

#[cfg(test)]
pub(crate) use tests::serial_turn_test;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc, Mutex, MutexGuard};
    use std::time::Duration;

    static TURN_TEST_LOCK: Mutex<()> = Mutex::new(());

    pub(crate) fn serial_turn_test() -> MutexGuard<'static, ()> {
        TURN_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    #[test]
    fn turn_without_stt_emits_unavailable_then_idle() {
        let _serial = serial_turn_test();
        let mut turn = VoiceTurn::new(NoSttBackend);

        let events = turn.press_at(12_345);

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].state, VoiceState::Unavailable);
        assert_eq!(events[0].reason, Some(TurnReason::SttNotInstalled));
        assert_eq!(events[1].state, VoiceState::Idle);
        assert_eq!(events[1].reason, None);
        assert_eq!(events[0].request_id, events[1].request_id);
        assert_eq!(events[0].monotonic_ms, 12_345);
        assert_eq!(events[1].monotonic_ms, 12_345);
    }

    #[test]
    fn active_flag_tracks_turn_state() {
        let _serial = serial_turn_test();
        let mut unavailable = VoiceTurn::new(NoSttBackend);

        let unavailable_events = unavailable.press_at(10);

        assert_eq!(unavailable_events[0].state, VoiceState::Unavailable);
        assert_eq!(
            unavailable_events[0].reason,
            Some(TurnReason::SttNotInstalled)
        );
        assert_eq!(unavailable_events[1].state, VoiceState::Idle);
        assert!(!turn_active());

        let mut listening = VoiceTurn::new(FakeBackend::listening());
        let listening_events = listening.press_at(20);

        assert_eq!(listening_events[1].state, VoiceState::Listening);
        assert!(turn_active());

        listening.cancel(TurnReason::AppExit, 30);

        assert!(!turn_active());
    }

    #[test]
    fn turn_ignores_autorepeat_and_lone_release() {
        let _serial = serial_turn_test();
        let mut turn = VoiceTurn::new(FakeBackend::listening());

        assert!(turn.release_at(0).is_empty());
        let first_press = turn.press_at(100);
        let repeated_press = turn.press_at(101);

        assert_eq!(first_press.len(), 2);
        assert!(repeated_press.is_empty());
        assert_eq!(first_press[0].state, VoiceState::Preparing);
        assert_eq!(first_press[1].state, VoiceState::Listening);
        assert_eq!(first_press[0].request_id, first_press[1].request_id);
    }

    #[test]
    fn turn_short_release_is_too_short() {
        let _serial = serial_turn_test();
        let mut turn = VoiceTurn::new(FakeBackend::listening());
        turn.press_at(1_000);

        let events = turn.release_at(1_249);

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].state, VoiceState::Cancelled);
        assert_eq!(events[0].reason, Some(TurnReason::TooShort));
        assert_eq!(events[1].state, VoiceState::Idle);
    }

    #[test]
    fn turn_hold_cap_ends_listening() {
        let _serial = serial_turn_test();
        let backend = FakeBackend::listening();
        let listening_end_reasons = Arc::clone(&backend.listening_end_reasons);
        let mut turn = VoiceTurn::new(backend);
        turn.press_at(0);

        assert!(turn.tick_at(14_999).is_empty());
        let events = turn.tick_at(15_000);

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].state, VoiceState::Decoding);
        assert_eq!(events[0].reason, Some(TurnReason::HoldCap));
        assert_eq!(
            *listening_end_reasons.lock().unwrap(),
            vec![Some(TurnReason::HoldCap)]
        );
    }

    #[test]
    fn turn_press_while_speaking_supersedes() {
        let _serial = serial_turn_test();
        let mut turn = VoiceTurn::new(FakeBackend::listening());
        let first = turn.press_at(10);
        let first_id = first[0].request_id;
        turn.release_at(260);
        turn.backend_transition(first_id, VoiceState::Answering, None, 270);
        turn.backend_transition(first_id, VoiceState::Speaking, None, 280);

        let second = turn.press_at(300);

        assert_eq!(second[0].state, VoiceState::Cancelled);
        assert_eq!(second[0].reason, Some(TurnReason::Superseded));
        assert_eq!(second[1].state, VoiceState::Idle);
        assert!(second[2].request_id > first_id);
        assert_eq!(second[3].state, VoiceState::Listening);
    }

    #[test]
    fn critical_preempt_cancels_active_turn() {
        let _serial = serial_turn_test();
        let mut turn = VoiceTurn::new(FakeBackend::listening());
        turn.press_at(100);

        critical_preempt();
        let events = turn.tick_at(101);

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].state, VoiceState::Cancelled);
        assert_eq!(events[0].reason, Some(TurnReason::SignalPreempt));
        assert_eq!(events[1].state, VoiceState::Idle);
    }

    #[test]
    fn critical_preempt_does_not_take_voice_lock() {
        let _serial = serial_turn_test();
        let turn = Arc::new(Mutex::new(VoiceTurn::new(FakeBackend::listening())));
        let (locked_tx, locked_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let held_turn = Arc::clone(&turn);
        let holder = std::thread::spawn(move || {
            let _guard = held_turn.lock().unwrap();
            locked_tx.send(()).unwrap();
            release_rx.recv().unwrap();
        });
        locked_rx.recv().unwrap();

        let (done_tx, done_rx) = mpsc::channel();
        let preemptor = std::thread::spawn(move || {
            critical_preempt();
            done_tx.send(()).unwrap();
        });
        assert_eq!(done_rx.recv_timeout(Duration::from_millis(200)), Ok(()));
        preemptor.join().unwrap();

        release_tx.send(()).unwrap();
        holder.join().unwrap();
    }

    #[test]
    fn voice_turn_payload_has_only_allowed_fields() {
        let _serial = serial_turn_test();
        let event = VoiceTurn::new(NoSttBackend).press_at(123_456).remove(0);
        let value = serde_json::to_value(event).unwrap();
        let object = value.as_object().unwrap();
        let mut keys = object.keys().map(String::as_str).collect::<Vec<_>>();
        keys.sort_unstable();

        assert_eq!(keys, vec!["monotonicMs", "reason", "requestId", "state"]);
        assert_eq!(object["state"], "unavailable");
        assert_eq!(object["reason"], "stt_not_installed");
        assert_eq!(object["monotonicMs"], 123_456);
    }

    struct FakeBackend {
        listening_end_reasons: Arc<Mutex<Vec<Option<TurnReason>>>>,
    }

    impl FakeBackend {
        fn listening() -> Self {
            Self {
                listening_end_reasons: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    impl VoiceBackend for FakeBackend {
        fn on_press(&mut self, _request_id: u64) -> BackendStart {
            BackendStart::Ready
        }

        fn on_release(
            &mut self,
            _request_id: u64,
            reason: Option<TurnReason>,
        ) -> Option<BackendFinish> {
            self.listening_end_reasons.lock().unwrap().push(reason);
            None
        }
    }
}
