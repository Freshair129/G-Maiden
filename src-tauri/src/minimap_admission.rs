//! Preview yields with headroom; these are not the critical runtime hard limits.
#[derive(Default)]
pub(crate) struct Admission {
    allowed: bool,
    good_samples: u8,
}
impl Admission {
    pub fn update(&mut self, ram_mb: f64, cpu_pct: f64, core_throttled: bool) -> bool {
        let available = !core_throttled
            && ram_mb.is_finite()
            && cpu_pct.is_finite()
            && ram_mb >= 0.
            && cpu_pct >= 0.;
        if !available || ram_mb >= 800. || cpu_pct >= 6. {
            self.allowed = false;
            self.good_samples = 0;
        } else if !self.allowed {
            if ram_mb <= 750. && cpu_pct <= 5. {
                self.good_samples = self.good_samples.saturating_add(1);
                if self.good_samples >= 3 {
                    self.allowed = true;
                    self.good_samples = 0;
                }
            } else {
                self.good_samples = 0;
            }
        }
        self.allowed
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn ready() -> Admission {
        let mut a = Admission::default();
        for _ in 0..3 {
            a.update(400., 2., false);
        }
        a
    }
    #[test]
    fn waits_for_stable_headroom_then_holds_through_small_jitter() {
        let mut a = Admission::default();
        assert!(!a.update(750., 5., false));
        assert!(!a.update(750., 5., false));
        assert!(a.update(750., 5., false));
        assert!(a.update(790., 5.9, false));
    }
    #[test]
    fn preview_stops_while_critical_capture_still_has_budget_headroom() {
        let mut a = ready();
        assert!(a.update(400., 2., false));
        assert!(!a.update(800., 2., false));
        let mut a = ready();
        assert!(!a.update(400., 6., false));
        for _ in 0..5 {
            assert!(!a.update(780., 5.5, false));
        }
        assert!(!a.update(700., 4., false));
        assert!(!a.update(700., 4., false));
        assert!(a.update(700., 4., false));
    }
    #[test]
    fn invalid_accounting_and_core_throttle_never_admit_preview() {
        for (ram, cpu, core) in [
            (f64::NAN, 2., false),
            (400., f64::NAN, false),
            (-1., 0., false),
            (400., -1., false),
            (400., 2., true),
        ] {
            let mut a = ready();
            assert!(!a.update(ram, cpu, core));
            assert!(!a.update(400., 2., false));
            assert!(!a.update(400., 2., false));
            assert!(a.update(400., 2., false));
        }
    }
}
