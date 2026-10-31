//! Native HP alert eligibility, separate from the package media resolver.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Settings {
    pub enabled: bool,
    pub voice_enabled: bool,
    pub threshold: i64,
}
pub(crate) struct Observation<'a> {
    pub epoch: u64,
    pub owner: &'a str,
    pub live: bool,
    pub verified: bool,
    pub alive: bool,
    pub hp: i64,
    pub kills: i64,
}
#[derive(Default)]
pub(crate) struct Detector {
    epoch: u64,
    owner: String,
    active: bool,
    last_spoke: Option<u64>,
    danger: Option<(u64, i64)>,
    kills: i64,
}
impl Detector {
    pub fn observe(
        &mut self,
        tick: Observation<'_>,
        settings: Settings,
        now: u64,
    ) -> Option<&'static str> {
        if tick.epoch == 0 || tick.epoch < self.epoch {
            return None;
        }
        if tick.epoch != self.epoch || tick.owner != self.owner {
            *self = Self {
                epoch: tick.epoch,
                owner: tick.owner.into(),
                kills: tick.kills,
                ..Self::default()
            };
        }
        let got_kill = tick.kills > self.kills;
        self.kills = tick.kills;
        if !tick.live
            || !tick.verified
            || tick.owner.is_empty()
            || !settings.enabled
            || !settings.voice_enabled
        {
            self.active = false;
            self.danger = None;
            return None;
        }
        if !tick.alive || tick.hp > settings.threshold.saturating_add(5) {
            self.active = false;
        }
        if !tick.alive || tick.hp <= 0 {
            self.danger = None;
            return None;
        }
        if let Some((at, hp)) = self.danger {
            let elapsed = now.saturating_sub(at);
            let recovered =
                tick.hp >= hp.saturating_add(25) && tick.hp > settings.threshold.saturating_add(15);
            if (100..=2500).contains(&elapsed) && (recovered || got_kill) {
                self.active = false;
                self.danger = None;
                self.last_spoke = Some(now);
                return Some("revision");
            }
        }
        if tick.hp <= settings.threshold
            && !self.active
            && self
                .last_spoke
                .is_none_or(|at| now.saturating_sub(at) > 8000)
        {
            self.active = true;
            self.last_spoke = Some(now);
            self.danger = Some((now, tick.hp));
            return Some("danger");
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn settings() -> Settings {
        Settings {
            enabled: true,
            voice_enabled: true,
            threshold: 25,
        }
    }
    fn observation(hp: i64) -> Observation<'static> {
        Observation {
            epoch: 1,
            owner: "local-owner",
            live: true,
            verified: true,
            alive: true,
            hp,
            kills: 0,
        }
    }

    #[test]
    fn configured_hp_threshold_fires_danger_once_then_rearms_with_hysteresis_and_throttle() {
        let mut detector = Detector::default();
        assert_eq!(detector.observe(observation(26), settings(), 0), None);
        assert_eq!(
            detector.observe(observation(24), settings(), 1),
            Some("danger")
        );
        assert_eq!(detector.observe(observation(23), settings(), 500), None);
        assert_eq!(detector.observe(observation(30), settings(), 3000), None);
        assert_eq!(detector.observe(observation(24), settings(), 8100), None);
        assert_eq!(detector.observe(observation(31), settings(), 8200), None);
        assert_eq!(
            detector.observe(observation(24), settings(), 8300),
            Some("danger")
        );
    }
    #[test]
    fn disabled_voice_unverified_player_and_old_session_cannot_trigger_hp_media() {
        let mut detector = Detector::default();
        assert_eq!(
            detector.observe(
                observation(24),
                Settings {
                    enabled: false,
                    ..settings()
                },
                1
            ),
            None
        );
        assert_eq!(
            detector.observe(
                observation(24),
                Settings {
                    voice_enabled: false,
                    ..settings()
                },
                2
            ),
            None
        );
        assert_eq!(
            detector.observe(
                Observation {
                    verified: false,
                    ..observation(24)
                },
                settings(),
                3
            ),
            None
        );
        assert_eq!(
            detector.observe(
                Observation {
                    epoch: 2,
                    ..observation(24)
                },
                settings(),
                4
            ),
            Some("danger")
        );
        assert_eq!(detector.observe(observation(24), settings(), 9000), None);
    }
    #[test]
    fn danger_retraction_uses_only_revision_event_and_cannot_repeat() {
        let mut detector = Detector::default();
        assert_eq!(
            detector.observe(observation(20), settings(), 0),
            Some("danger")
        );
        assert_eq!(
            detector.observe(observation(50), settings(), 500),
            Some("revision")
        );
        assert_eq!(detector.observe(observation(60), settings(), 700), None);
        assert_eq!(detector.observe(observation(20), settings(), 8100), None);
        assert_eq!(
            detector.observe(observation(20), settings(), 8600),
            Some("danger")
        );
    }
    #[test]
    fn kill_revision_uses_the_current_owner_and_never_crosses_sessions() {
        let mut detector = Detector::default();
        assert_eq!(
            detector.observe(observation(20), settings(), 0),
            Some("danger")
        );
        assert_eq!(
            detector.observe(
                Observation {
                    kills: 1,
                    ..observation(20)
                },
                settings(),
                300
            ),
            Some("revision")
        );
        assert_eq!(
            detector.observe(
                Observation {
                    epoch: 2,
                    hp: 100,
                    kills: 5,
                    ..observation(100)
                },
                settings(),
                500
            ),
            None
        );
        assert_eq!(
            detector.observe(
                Observation {
                    epoch: 2,
                    hp: 100,
                    kills: 6,
                    ..observation(100)
                },
                settings(),
                600
            ),
            None
        );
    }
}
