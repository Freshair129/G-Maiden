//! G-Sensory feeder liveness accounting, separate from GPU reconnect timing.
#[derive(Debug, PartialEq, Eq)]
pub enum SampleState {
    Ready(String),
    RetryWaiting,
    ActualUnavailable,
}

pub struct FailureBudget {
    failures: u32,
}
impl FailureBudget {
    pub fn new() -> Self {
        Self { failures: 0 }
    }
    pub fn tick(
        &mut self,
        endpoint_ready: bool,
        sample: impl FnOnce() -> SampleState,
        post: impl FnOnce(&str) -> bool,
    ) -> bool {
        let state = if endpoint_ready {
            match sample() {
                SampleState::Ready(body) => {
                    if post(&body) {
                        SampleState::Ready(body)
                    } else {
                        SampleState::ActualUnavailable
                    }
                }
                state => state,
            }
        } else {
            SampleState::ActualUnavailable
        };
        match state {
            SampleState::Ready(_) => self.failures = 0,
            SampleState::RetryWaiting => {}
            SampleState::ActualUnavailable => self.failures += 1,
        }
        self.failures < 20
    }
    #[cfg(test)]
    pub fn failures(&self) -> u32 {
        self.failures
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn waiting_preserves_failures_and_never_posts() {
        let mut budget = FailureBudget::new();
        assert!(budget.tick(
            true,
            || SampleState::ActualUnavailable,
            |_| panic!("no sample")
        ));
        for _ in 0..100 {
            assert!(budget.tick(true, || SampleState::RetryWaiting, |_| panic!("no sample")));
        }
        assert_eq!(budget.failures(), 1);
    }
    #[test]
    fn lost_endpoint_still_exits_after_twenty_ticks_without_gpu_queries() {
        let mut budget = FailureBudget::new();
        for tick in 1..=20 {
            assert_eq!(
                budget.tick(
                    false,
                    || panic!("unhealthy endpoint must not query GPU"),
                    |_| panic!("must not post")
                ),
                tick < 20
            );
        }
    }
    #[test]
    fn only_ready_and_acknowledged_samples_reset_failures() {
        let mut budget = FailureBudget::new();
        assert!(budget.tick(true, || SampleState::ActualUnavailable, |_| false));
        assert!(budget.tick(
            true,
            || SampleState::Ready("body".into()),
            |body| {
                assert_eq!(body, "body");
                false
            }
        ));
        assert_eq!(budget.failures(), 2);
        assert!(budget.tick(true, || SampleState::Ready("body".into()), |_| true));
        assert_eq!(budget.failures(), 0);
    }
    #[test]
    fn rejected_posts_still_exit_after_twenty_actual_attempts() {
        let mut budget = FailureBudget::new();
        for tick in 1..=20 {
            assert_eq!(
                budget.tick(true, || SampleState::Ready("body".into()), |_| false),
                tick < 20
            );
        }
    }
}
