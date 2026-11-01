//! G-Signal — the hard real-time gank warning (Phase 2 P2.5).
//!
//! Turns G-Motion's continuous [`GankRisk`] into discrete, edge-triggered voice
//! events:
//! - risk crosses [`DANGER_THRESHOLD`] (SRS §3.3: >85%) → **Alert** (interrupt
//!   current speech, warn now)
//! - after an alert, risk falls back below [`CLEAR_THRESHOLD`] → **Revision**,
//!   Maiden's required mid-stream "เอ๊ะ! เดี๋ยวก่อน!" belief-revision behavior
//!   (the enemies reappeared / the read was wrong).
//!
//! Hysteresis (alert high, clear lower) stops the warning chattering when the
//! probability hovers around the line. Pure state machine — no I/O — so the
//! capture loop owns voicing and this stays unit-testable.

use crate::motion::GankRisk;
use std::collections::{HashMap, HashSet};

/// SRS §3.3 baseline (Low). Users testing the v0.7.3 release reported it never
/// fired in real matches — the spec threshold is conservative and rarely crossed
/// without a clean three-hero gank read. The runtime-tunable `Sensitivity` knob
/// below lets the player trade false positives for hit rate.
pub const DANGER_THRESHOLD: f32 = 0.85;
pub const CLEAR_THRESHOLD: f32 = 0.50;

/// User-tunable trade-off between false positives and missed ganks. Stored in
/// `runtime` so the capture loop can apply the latest pick on every tick.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sensitivity {
    /// SRS baseline — almost never false-positives, may miss soft ganks.
    Low,
    /// Calibrated default — what the player feels as "actually warns me".
    #[default]
    Med,
    /// Trigger-happy — warns on 2-hero pressure; expect some retractions.
    High,
}

impl Sensitivity {
    /// `(danger, clear)` thresholds (the same hysteresis shape; just lower bars).
    pub fn thresholds(self) -> (f32, f32) {
        match self {
            Sensitivity::Low => (DANGER_THRESHOLD, CLEAR_THRESHOLD),
            Sensitivity::Med => (0.65, 0.40),
            Sensitivity::High => (0.50, 0.30),
        }
    }
}

/// What G-Signal decided this tick.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(tag = "kind", content = "alert")]
pub enum SignalEvent {
    /// Fire the gank warning (with the triggering risk snapshot).
    Alert(SignalAlert),
    /// Retract the previous warning mid-stream (Belief Revision).
    Revision,
    /// No change this tick.
    None,
}

/// Snapshot attached to an [`SignalEvent::Alert`].
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct SignalAlert {
    pub probability: f32,
    pub missing_heroes: Vec<String>,
    pub eta_ms: u64,
}

/// Edge-triggered danger state with hysteresis. Thresholds live on the instance
/// (not const) so the capture loop can apply the player's chosen Sensitivity
/// without rebuilding the state machine on every tick.
pub struct Signal {
    alerted: Vec<String>,
    notified: HashSet<String>,
    last_alert: Option<u64>,
    last_hero_alert: HashMap<String, u64>,
    danger: f32,
    clear: f32,
}

impl Default for Signal {
    fn default() -> Self {
        Signal::new()
    }
}

impl Signal {
    pub fn new() -> Self {
        let (d, c) = Sensitivity::default().thresholds();
        Signal {
            alerted: Vec::new(),
            notified: HashSet::new(),
            last_alert: None,
            last_hero_alert: HashMap::new(),
            danger: d,
            clear: c,
        }
    }

    /// Swap in the player's current sensitivity. Cheap (two float writes); the
    /// `alerted` latch is preserved so a tick mid-warning doesn't lose state.
    pub fn set_sensitivity(&mut self, s: Sensitivity) {
        let (d, c) = s.thresholds();
        self.danger = d;
        self.clear = c;
    }

    /// Losing evidence cancels UI state silently; it is not proof of safety.
    /// Cooldowns survive capture gaps and enable/disable changes.
    pub fn suspend(&mut self) {
        self.alerted.clear();
    }

    pub fn observe_visible(&mut self, visible: &[String]) {
        self.notified.retain(|name| !visible.contains(name));
    }

    pub fn suppression_reason(&self, risk: &GankRisk, now: u64) -> &'static str {
        if !risk.probability.is_finite() || risk.probability < self.danger {
            return "below_threshold";
        }
        if self
            .last_alert
            .is_some_and(|last| now.saturating_sub(last) < 30_000)
        {
            return "global_cooldown";
        }
        if risk
            .missing_heroes
            .iter()
            .any(|name| self.notified.contains(name))
        {
            return "same_absence";
        }
        if risk
            .missing_heroes
            .iter()
            .filter(|name| !self.notified.contains(*name))
            .any(|name| {
                self.last_hero_alert
                    .get(name)
                    .is_some_and(|last| now.saturating_sub(*last) < 60_000)
            })
        {
            return "hero_cooldown";
        }
        "evidence_ready"
    }

    pub fn evaluate(
        &mut self,
        risk: &GankRisk,
        missing: &[String],
        now: u64,
        eligible: bool,
    ) -> SignalEvent {
        if !eligible {
            self.suspend();
            return SignalEvent::None;
        }
        if !self.alerted.is_empty() && self.alerted.iter().all(|name| !missing.contains(name)) {
            self.alerted.clear();
            if risk.probability < self.clear {
                return SignalEvent::Revision;
            }
        }
        let new_threat = !risk.missing_heroes.is_empty()
            && risk.missing_heroes.iter().all(|name| {
                !self.notified.contains(name)
                    && self
                        .last_hero_alert
                        .get(name)
                        .is_none_or(|last| now.saturating_sub(*last) >= 60_000)
            });
        if risk.probability.is_finite()
            && risk.probability >= self.danger
            && new_threat
            && self
                .last_alert
                .is_none_or(|last| now.saturating_sub(last) >= 30_000)
        {
            self.last_alert = Some(now);
            self.alerted = risk.missing_heroes.clone();
            for name in &risk.missing_heroes {
                self.notified.insert(name.clone());
                self.last_hero_alert.insert(name.clone(), now);
            }
            return SignalEvent::Alert(SignalAlert {
                probability: risk.probability,
                missing_heroes: risk.missing_heroes.clone(),
                eta_ms: risk.eta_ms,
            });
        }
        SignalEvent::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_decay_without_visibility_does_not_claim_safe() {
        let mut s = Signal::new();
        assert!(matches!(
            s.evaluate(&risk(0.9), &["CM".into()], 0, true),
            SignalEvent::Alert(_)
        ));
        assert_eq!(
            s.evaluate(&risk(0.1), &["CM".into()], 0, true),
            SignalEvent::None
        );
    }

    #[test]
    fn global_cooldown_applies_to_a_different_new_hero() {
        let mut s = Signal::new();
        let first = risk(0.9);
        assert!(matches!(
            s.evaluate(&first, &first.missing_heroes, 0, true),
            SignalEvent::Alert(_)
        ));
        let next = GankRisk {
            missing_heroes: vec!["axe".into()],
            ..risk(0.9)
        };
        assert_eq!(
            s.evaluate(&next, &next.missing_heroes, 29_999, true),
            SignalEvent::None
        );
        assert_eq!(s.suppression_reason(&next, 29_999), "global_cooldown");
        assert!(matches!(
            s.evaluate(&next, &next.missing_heroes, 30_000, true),
            SignalEvent::Alert(_)
        ));
    }

    fn risk(p: f32) -> GankRisk {
        GankRisk {
            probability: p,
            missing_heroes: vec!["CM".into()],
            eta_ms: 2000,
        }
    }

    #[test]
    fn alert_fires_once_on_crossing() {
        let mut s = Signal::new();
        assert_eq!(
            s.evaluate(&risk(0.4), &["CM".into()], 0, true),
            SignalEvent::None
        );
        assert!(matches!(
            s.evaluate(&risk(0.9), &["CM".into()], 0, true),
            SignalEvent::Alert(_)
        ));
        // stays high — no repeat alert
        assert_eq!(
            s.evaluate(&risk(0.88), &["CM".into()], 0, true),
            SignalEvent::None
        );
    }

    #[test]
    fn revision_fires_when_risk_clears_after_alert() {
        let mut s = Signal::new();
        assert!(matches!(
            s.evaluate(&risk(0.9), &["CM".into()], 0, true),
            SignalEvent::Alert(_)
        ));
        // drops into the hysteresis band — not yet cleared
        assert_eq!(
            s.evaluate(&risk(0.6), &["CM".into()], 0, true),
            SignalEvent::None
        );
        // drops below clear threshold — belief revision
        assert_eq!(
            s.evaluate(&risk(0.3), &[], 10_000, true),
            SignalEvent::Revision
        );
        s.observe_visible(&["CM".into()]);
        // can alert again on a fresh crossing
        assert!(matches!(
            s.evaluate(&risk(0.95), &["CM".into()], 61_000, true),
            SignalEvent::Alert(_)
        ));
    }

    #[test]
    fn no_revision_without_prior_alert() {
        let mut s = Signal::new();
        assert_eq!(
            s.evaluate(&risk(0.2), &["CM".into()], 0, true),
            SignalEvent::None
        );
    }

    #[test]
    fn sensitivity_levels_have_ordered_thresholds() {
        let (low_d, low_c) = Sensitivity::Low.thresholds();
        let (med_d, med_c) = Sensitivity::Med.thresholds();
        let (high_d, high_c) = Sensitivity::High.thresholds();
        // Higher sensitivity = lower thresholds = fires more eagerly.
        assert!(high_d < med_d && med_d < low_d, "danger ordering off");
        assert!(high_c < med_c && med_c < low_c, "clear ordering off");
        // Hysteresis preserved at each level.
        for (d, c) in [(low_d, low_c), (med_d, med_c), (high_d, high_c)] {
            assert!(c < d, "clear {c} must be below danger {d}");
        }
    }

    #[test]
    fn high_sensitivity_fires_on_what_low_ignores() {
        // p=0.55 is below SRS Low (0.85) but above High (0.50).
        let p = 0.55;
        let mut low = Signal::new();
        low.set_sensitivity(Sensitivity::Low);
        assert_eq!(
            low.evaluate(&risk(p), &["CM".into()], 0, true),
            SignalEvent::None
        );
        let mut high = Signal::new();
        high.set_sensitivity(Sensitivity::High);
        assert!(matches!(
            high.evaluate(&risk(p), &["CM".into()], 0, true),
            SignalEvent::Alert(_)
        ));
    }

    #[test]
    fn changing_sensitivity_mid_alert_preserves_latch() {
        let mut s = Signal::new();
        s.set_sensitivity(Sensitivity::High);
        // Cross High's 0.50 → alerts.
        assert!(matches!(
            s.evaluate(&risk(0.55), &["CM".into()], 0, true),
            SignalEvent::Alert(_)
        ));
        // User pulls sensitivity to Low — we don't re-fire, and the still-elevated
        // risk shouldn't trigger a spurious revision.
        s.set_sensitivity(Sensitivity::Low);
        assert_eq!(
            s.evaluate(&risk(0.55), &["CM".into()], 0, true),
            SignalEvent::None
        );
    }
    #[test]
    fn cooldown_expiry_does_not_repeat_the_same_absence() {
        let mut s = Signal::new();
        let names = vec!["CM".into()];
        assert!(matches!(
            s.evaluate(&risk(0.9), &names, 0, true),
            SignalEvent::Alert(_)
        ));
        assert_eq!(
            s.evaluate(&risk(0.1), &names, 20_000, true),
            SignalEvent::None
        );
        assert_eq!(
            s.evaluate(&risk(0.9), &names, 90_000, true),
            SignalEvent::None
        );
        assert_eq!(
            s.evaluate(&GankRisk::default(), &[], 91_000, true),
            SignalEvent::Revision
        );
        s.observe_visible(&names);
        assert!(matches!(
            s.evaluate(&risk(0.9), &names, 100_000, true),
            SignalEvent::Alert(_)
        ));
    }
    #[test]
    fn inactive_context_is_silent_and_preserves_cooldown() {
        let mut s = Signal::new();
        let names = vec!["CM".into()];
        assert_eq!(s.evaluate(&risk(0.99), &names, 0, false), SignalEvent::None);
        assert!(matches!(
            s.evaluate(&risk(0.9), &names, 1000, true),
            SignalEvent::Alert(_)
        ));
        assert_eq!(
            s.evaluate(&GankRisk::default(), &[], 2000, false),
            SignalEvent::None
        );
        assert_eq!(
            s.evaluate(&risk(0.9), &names, 40000, true),
            SignalEvent::None
        );
        assert_eq!(
            s.evaluate(&risk(0.9), &names, 62000, true),
            SignalEvent::None
        );
        s.observe_visible(&names);
        assert!(matches!(
            s.evaluate(&risk(0.9), &names, 70000, true),
            SignalEvent::Alert(_)
        ));
    }
}
