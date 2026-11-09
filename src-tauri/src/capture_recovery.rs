//! Bounded capture recovery and resource replacement on a single worker.
use std::time::{Duration, Instant};

pub enum SessionExit {
    RetryRequested,
    Stopped,
}

pub enum Wake {
    RetryRequested,
    Timeout,
    Stopped,
}

pub struct AcquisitionWatchdog {
    last_progress: Instant,
    timeout: Duration,
}

impl AcquisitionWatchdog {
    pub fn new(now: Instant, timeout: Duration) -> Self {
        Self {
            last_progress: now,
            timeout,
        }
    }

    pub fn progress(&mut self, now: Instant) {
        self.last_progress = now;
    }

    pub fn stalled_for(&self, now: Instant) -> Option<Duration> {
        let age = now.saturating_duration_since(self.last_progress);
        (age >= self.timeout).then_some(age)
    }
}

#[derive(Default)]
pub struct RetryBudget {
    attempts: usize,
    healthy_since: Option<Instant>,
}

impl RetryBudget {
    fn next_delay(&mut self) -> Option<Duration> {
        self.healthy_since = None;
        let seconds = [1, 2, 4].get(self.attempts).copied()?;
        self.attempts += 1;
        Some(Duration::from_secs(seconds))
    }

    /// A successful init or a single frame must not create an endless restart loop.
    /// Re-arm only after sustained healthy sensing; called outside critical evaluation.
    pub fn observe_health(&mut self, healthy: bool, now: Instant) {
        if !healthy {
            self.healthy_since = None;
        } else if now.saturating_duration_since(*self.healthy_since.get_or_insert(now))
            >= Duration::from_secs(30)
        {
            self.attempts = 0;
        }
    }
}

/// Run capture sessions serially on the caller's worker. Only the wait/OS capture
/// boundaries are injected, so tests exercise the production recovery loop.
pub fn supervise(
    mut run: impl FnMut(&mut RetryBudget) -> Result<SessionExit, String>,
    mut wait: impl FnMut(Option<Duration>) -> Wake,
    mut report: impl FnMut(&'static str, &str),
) {
    let mut budget = RetryBudget::default();
    loop {
        match run(&mut budget) {
            Ok(SessionExit::Stopped) => return,
            Ok(SessionExit::RetryRequested) => {
                budget = RetryBudget::default();
                report("retrying", "manual retry");
            }
            Err(reason) => {
                let delay = budget.next_delay();
                report(if delay.is_some() { "retrying" } else { "lite" }, &reason);
                match wait(delay) {
                    Wake::Stopped => return,
                    Wake::Timeout => {}
                    Wake::RetryRequested => {
                        budget = RetryBudget::default();
                        report("retrying", "manual retry");
                    }
                }
            }
        }
    }
}

/// Eligibility is session-scoped. Resetting a watchdog clock is never evidence.
#[derive(Default)]
pub struct FreshFrameGate {
    session: Option<u64>,
    accepted: bool,
}

impl FreshFrameGate {
    pub fn observe_scope(&mut self, foreground: bool, session: Option<u64>) {
        if !foreground || session != self.session || session.is_none() {
            self.accepted = false;
        }
        self.session = session;
    }

    pub fn accept(&mut self, session: u64) {
        if self.session == Some(session) {
            self.accepted = true;
        }
    }

    pub fn healthy(&self, classifier: bool, throttled: bool, fresh: bool) -> bool {
        self.accepted && classifier && !throttled && fresh
    }
}

pub fn replace_released<T, E>(
    slot: &mut Option<T>,
    create: impl FnOnce() -> Result<T, E>,
) -> Result<(), E> {
    drop(slot.take());
    *slot = Some(create()?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, rc::Rc};

    #[test]
    fn live_stall_retries_on_the_same_worker_after_releasing_capture() {
        let held = Rc::new(Cell::new(false));
        let worker = std::thread::current().id();
        let started = Instant::now();
        let attempts = Cell::new(0);
        let mut notices = Vec::new();
        supervise(
            |_| {
                assert_eq!(std::thread::current().id(), worker);
                assert!(!held.replace(true), "duplicate capture owner");
                let _capture = Exclusive(held.clone());
                attempts.set(attempts.get() + 1);
                if attempts.get() == 1 {
                    let watchdog = AcquisitionWatchdog::new(started, Duration::from_secs(6));
                    let age = watchdog
                        .stalled_for(started + Duration::from_millis(6026))
                        .expect("a live no-frame window must fail this session");
                    Err(format!("no minimap frame for {} ms", age.as_millis()))
                } else {
                    Ok(SessionExit::Stopped)
                }
            },
            |delay| {
                assert!(!held.get(), "resources must be released before backoff");
                assert_eq!(delay, Some(Duration::from_secs(1)));
                Wake::Timeout
            },
            |mode, _| notices.push(mode),
        );
        assert_eq!(attempts.get(), 2);
        assert_eq!(notices, ["retrying"]);
    }

    #[test]
    fn unavailable_capture_enters_lite_only_after_three_bounded_retries() {
        let attempts = Cell::new(0);
        let mut waits = Vec::new();
        let mut notices = Vec::new();
        supervise(
            |_| {
                attempts.set(attempts.get() + 1);
                Err("capture unavailable".into())
            },
            |delay| {
                waits.push(delay.map(|d| d.as_secs()));
                if delay.is_some() {
                    Wake::Timeout
                } else {
                    Wake::Stopped
                }
            },
            |mode, _| notices.push(mode),
        );
        assert_eq!(attempts.get(), 4);
        assert_eq!(waits, [Some(1), Some(2), Some(4), None]);
        assert_eq!(notices, ["retrying", "retrying", "retrying", "lite"]);
    }

    #[test]
    fn manual_retry_rearms_exhausted_budget_and_shutdown_interrupts_backoff() {
        let attempts = Cell::new(0);
        let mut waits = Vec::new();
        supervise(
            |_| {
                attempts.set(attempts.get() + 1);
                Err("unavailable".into())
            },
            |delay| {
                waits.push(delay.map(|d| d.as_secs()));
                match waits.len() {
                    4 => Wake::RetryRequested,
                    5 => Wake::Stopped,
                    _ => Wake::Timeout,
                }
            },
            |_, _| {},
        );
        assert_eq!(waits, [Some(1), Some(2), Some(4), None, Some(1)]);
        assert_eq!(attempts.get(), 5);
    }

    #[test]
    fn init_and_brief_health_do_not_reset_the_retry_limit() {
        let mut budget = RetryBudget::default();
        let now = Instant::now();
        assert_eq!(budget.next_delay(), Some(Duration::from_secs(1)));
        budget.observe_health(true, now);
        budget.observe_health(true, now + Duration::from_secs(29));
        budget.observe_health(false, now + Duration::from_secs(30));
        assert_eq!(budget.next_delay(), Some(Duration::from_secs(2)));
        budget.observe_health(true, now + Duration::from_secs(31));
        budget.observe_health(true, now + Duration::from_secs(61));
        assert_eq!(budget.next_delay(), Some(Duration::from_secs(1)));
    }

    #[test]
    fn recovery_focus_and_session_changes_require_current_accepted_evidence() {
        let mut gate = FreshFrameGate::default();
        gate.observe_scope(true, Some(7));
        assert!(!gate.healthy(true, false, true));
        gate.accept(7);
        assert!(gate.healthy(true, false, true));
        assert!(!gate.healthy(true, false, false));
        assert!(!gate.healthy(false, false, true));
        assert!(!gate.healthy(true, true, true));
        gate.observe_scope(false, Some(7));
        gate.observe_scope(true, Some(7));
        assert!(!gate.healthy(true, false, true));
        gate.accept(7);
        assert!(gate.healthy(true, false, true));
        gate.observe_scope(true, Some(8));
        gate.accept(7);
        assert!(!gate.healthy(true, false, true));
        gate.accept(8);
        assert!(gate.healthy(true, false, true));
        gate.observe_scope(true, None);
        assert!(!gate.healthy(true, false, true));
    }

    #[test]
    fn acquisition_progress_is_independent_of_semantic_health() {
        let now = Instant::now();
        let mut watchdog = AcquisitionWatchdog::new(now, Duration::from_secs(6));
        let mut health = FreshFrameGate::default();
        health.observe_scope(true, Some(7));
        // Actual frames still arrive while CV rejects late/duplicate observations.
        for second in 1..=20 {
            let acquired = now + Duration::from_secs(second);
            watchdog.progress(acquired);
            assert!(watchdog.stalled_for(acquired).is_none());
            assert!(!health.healthy(true, false, true));
        }
        assert!(watchdog
            .stalled_for(now + Duration::from_millis(25_999))
            .is_none());
        assert_eq!(
            watchdog.stalled_for(now + Duration::from_secs(26)),
            Some(Duration::from_secs(6))
        );
        watchdog.progress(now + Duration::from_secs(27));
        assert!(watchdog
            .stalled_for(now + Duration::from_secs(27))
            .is_none());
        assert!(!health.healthy(true, false, true));
    }
    struct Exclusive(Rc<Cell<bool>>);
    impl Drop for Exclusive {
        fn drop(&mut self) {
            self.0.set(false);
        }
    }

    #[test]
    fn releases_old_interface_before_requesting_exclusive_replacement() {
        let held = Rc::new(Cell::new(true));
        let mut slot = Some(Exclusive(held.clone()));
        let result = replace_released(&mut slot, || {
            if held.get() {
                return Err("already duplicating output");
            }
            held.set(true);
            Ok(Exclusive(held.clone()))
        });
        assert!(result.is_ok());
        assert!(slot.is_some() && held.get());
    }

    #[test]
    fn failed_recreation_leaves_no_invalid_interface_and_allows_retry() {
        let held = Rc::new(Cell::new(true));
        let mut slot = Some(Exclusive(held.clone()));
        assert!(replace_released(&mut slot, || Err::<Exclusive, _>("display switched")).is_err());
        assert!(slot.is_none());
        assert!(!held.get());
        replace_released(&mut slot, || {
            assert!(!held.get());
            held.set(true);
            Ok::<_, ()>(Exclusive(held.clone()))
        })
        .unwrap();
        assert!(held.get());
        drop(slot);
        assert!(!held.get());
    }
}
