//! Clock-independent critical admission. The caller starts the clock before acquisition.
pub const ACQUIRE_WAIT_MS: u32 = 32;
pub const DECISION_BUDGET_MS: u64 = 200;
pub const FRESHNESS_WATCHDOG_MS: u64 = 500;

pub fn admits_critical(elapsed_ms: u64, pressure: bool, fresh: bool) -> bool {
    fresh && !pressure && elapsed_ms < DECISION_BUDGET_MS
}

#[derive(Default)]
pub struct FrameGate {
    last_frame: Option<u64>,
}

impl FrameGate {
    pub fn admit(&mut self, elapsed_ms: u64, pressure: bool, frame: Option<u64>) -> bool {
        if !admits_critical(elapsed_ms, pressure, frame.is_some()) || self.last_frame == frame {
            return false;
        }
        self.last_frame = frame;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wait_and_compute_share_one_deadline() {
        assert!(admits_critical(32 + 100, false, true));
        assert!(!admits_critical(100 + 110, false, true));
        assert!(!admits_critical(200, false, true));
        assert!(admits_critical(u64::from(ACQUIRE_WAIT_MS), false, true));
    }
    #[test]
    fn overload_and_unchanged_frames_withdraw_instead_of_late_alert() {
        assert!(!admits_critical(1, true, true));
        assert!(!admits_critical(1, false, false));
        assert_eq!(FRESHNESS_WATCHDOG_MS, 500);
    }

    #[test]
    fn fake_frame_source_does_not_turn_timeout_or_repeat_into_new_evidence() {
        let mut frames = FrameGate::default();
        assert!(frames.admit(32 + 40, false, Some(1)));
        assert!(!frames.admit(32, false, Some(1)));
        assert!(!frames.admit(32, false, None));
        assert!(!frames.admit(32 + 180, false, Some(2)));
        assert!(!frames.admit(32, true, Some(2)));
        // Rejected observations never consume the next usable frame.
        assert!(frames.admit(32, false, Some(2)));
    }
}
