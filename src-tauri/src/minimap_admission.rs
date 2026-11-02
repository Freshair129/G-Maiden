//! Preview reduces cadence under soft CPU load; memory/core pressure still withdraws it.
pub(crate) struct Cadence {
    fps: u8,
    good_samples: u8,
    playback_held: bool,
    playback_epoch: u64,
}
impl Default for Cadence {
    fn default() -> Self {
        Self {
            fps: 15,
            good_samples: 0,
            playback_held: false,
            playback_epoch: 0,
        }
    }
}
impl Cadence {
    pub fn update(&mut self, cpu: f64, playing: bool, epoch: u64) -> u8 {
        // A sample containing clip work must not replace the pre-clip cadence.
        let was_held = std::mem::replace(&mut self.playback_held, playing);
        let previous_epoch = std::mem::replace(&mut self.playback_epoch, epoch);
        if playing || was_held || previous_epoch != epoch {
            return self.fps;
        }
        let target = if !(0.0..3.0).contains(&cpu) {
            15
        } else if cpu >= 2.0 {
            30
        } else {
            60
        };
        if target < self.fps {
            self.fps = target;
            self.good_samples = 0;
        } else if target > self.fps {
            self.good_samples += 1;
            if self.good_samples >= 10 {
                self.fps = if self.fps == 15 { 30 } else { 60 };
                self.good_samples = 0;
            }
        } else {
            self.good_samples = 0;
        }
        self.fps
    }
}
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
        // Cadence already reduces capture and IPC work before CPU pressure. Killing
        // visibility at 6% caused an endless live/reference cycle below the actual
        // 10% whole-app budget. Keep the core throttle and memory reserve fail-closed.
        if !available || ram_mb >= 800. || cpu_pct >= 10. {
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
    #[test]
    fn cadence_backs_off_before_admission_limit_and_recovers_without_churn() {
        let mut c = Cadence::default();
        for _ in 0..9 {
            assert_eq!(c.update(1., false, 0), 15);
        }
        assert_eq!(c.update(1., false, 0), 30);
        for _ in 0..9 {
            assert_eq!(c.update(1., false, 0), 30);
        }
        assert_eq!(c.update(1., false, 0), 60);
        assert_eq!(c.update(2.5, false, 0), 30);
        assert_eq!(c.update(4., false, 0), 15);
        for _ in 0..20 {
            assert_eq!(c.update(4.9, false, 0), 15);
        }
        assert_eq!(c.update(f64::NAN, false, 0), 15);
    }
    #[test]
    fn playback_preserves_base_cadence_through_the_first_post_clip_sample() {
        let mut c = Cadence::default();
        for _ in 0..20 {
            c.update(1., false, 0);
        }
        assert_eq!(c.update(1., false, 0), 60);
        for _ in 0..10 {
            assert_eq!(c.update(9., true, 1), 60);
        }
        assert_eq!(c.update(9., false, 1), 60);
        assert_eq!(c.update(4., false, 1), 15);
    }
    #[test]
    fn short_clip_between_samples_preserves_original_cadence() {
        let mut c = Cadence::default();
        for _ in 0..20 {
            c.update(1., false, 0);
        }
        assert_eq!(c.update(9., false, 1), 60);
        assert_eq!(c.update(4., false, 1), 15);
    }
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
    fn memory_and_core_limits_stop_preview_but_soft_cpu_load_uses_cadence() {
        let mut a = ready();
        assert!(a.update(400., 2., false));
        assert!(!a.update(800., 2., false));
        let mut a = ready();
        assert!(a.update(400., 6., false));
        assert!(a.update(400., 9.9, false));
        assert!(!a.update(400., 10., false));
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
