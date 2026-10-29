//! Diagnostic source-consumption gaps, not a measurement of audible output.
#[derive(Default, Debug)]
pub struct Timing {
    pub max_gap_us: u64,
    pub gaps_over_50ms: u64,
    previous_us: Option<u64>,
}
impl Timing {
    pub fn observe(&mut self, now_us: u64) {
        if let Some(previous) = self.previous_us {
            let gap = now_us.saturating_sub(previous);
            self.max_gap_us = self.max_gap_us.max(gap);
            self.gaps_over_50ms += u64::from(gap > 50_000);
        }
        self.previous_us = Some(now_us);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_starvation_but_not_initial_idle_or_normal_callback_bursts() {
        let mut timing = Timing::default();
        for us in [1_000_000, 1_000_000, 1_010_000, 1_090_000, 1_100_000] {
            timing.observe(us);
        }
        assert_eq!(timing.max_gap_us, 80_000);
        assert_eq!(timing.gaps_over_50ms, 1);
    }
}
