//! Startup admission for the operating CPU quota. This never changes acceptance.
#[derive(Default)]
pub(super) struct StartupBudget {
    stable: u8,
}
impl StartupBudget {
    pub(super) fn observe(&mut self, ui: bool, capture: bool, cpu: f64, ram: f64) -> bool {
        if ui && capture && (0.0..=5.0).contains(&cpu) && (0.0..=750.0).contains(&ram) {
            self.stable = self.stable.saturating_add(1);
        } else {
            self.stable = 0;
        }
        self.stable >= 3
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_needs_both_components_and_three_consecutive_quiet_samples() {
        let mut b = StartupBudget::default();
        for _ in 0..10 {
            assert!(!b.observe(true, false, 1.0, 500.0));
        }
        for _ in 0..10 {
            assert!(!b.observe(false, true, 1.0, 500.0));
        }
        assert!(!b.observe(true, true, 4.0, 700.0));
        assert!(!b.observe(true, true, 4.0, 700.0));
        assert!(b.observe(true, true, 4.0, 700.0));
    }
    #[test]
    fn pressure_and_unknown_accounting_restart_the_stability_window() {
        for (cpu, ram) in [
            (5.01, 500.0),
            (-1.0, 500.0),
            (f64::NAN, 500.0),
            (1.0, 750.01),
            (1.0, -1.0),
            (1.0, f64::NAN),
        ] {
            let mut b = StartupBudget::default();
            assert!(!b.observe(true, true, 2.0, 500.0));
            assert!(!b.observe(true, true, 2.0, 500.0));
            assert!(!b.observe(true, true, cpu, ram));
            assert!(!b.observe(true, true, 2.0, 500.0));
            assert!(!b.observe(true, true, 2.0, 500.0));
            assert!(b.observe(true, true, 2.0, 500.0));
        }
    }
}
