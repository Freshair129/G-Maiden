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
    alerted: bool,
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
        Signal { alerted: false, danger: d, clear: c }
    }

    /// Swap in the player's current sensitivity. Cheap (two float writes); the
    /// `alerted` latch is preserved so a tick mid-warning doesn't lose state.
    pub fn set_sensitivity(&mut self, s: Sensitivity) {
        let (d, c) = s.thresholds();
        self.danger = d;
        self.clear = c;
    }

    pub fn evaluate(&mut self, risk: &GankRisk) -> SignalEvent {
        if !self.alerted && risk.probability >= self.danger {
            self.alerted = true;
            return SignalEvent::Alert(SignalAlert {
                probability: risk.probability,
                missing_heroes: risk.missing_heroes.clone(),
                eta_ms: risk.eta_ms,
            });
        }
        if self.alerted && risk.probability < self.clear {
            self.alerted = false;
            return SignalEvent::Revision;
        }
        SignalEvent::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn risk(p: f32) -> GankRisk {
        GankRisk { probability: p, missing_heroes: vec!["CM".into()], eta_ms: 2000 }
    }

    #[test]
    fn alert_fires_once_on_crossing() {
        let mut s = Signal::new();
        assert_eq!(s.evaluate(&risk(0.4)), SignalEvent::None);
        assert!(matches!(s.evaluate(&risk(0.9)), SignalEvent::Alert(_)));
        // stays high — no repeat alert
        assert_eq!(s.evaluate(&risk(0.88)), SignalEvent::None);
    }

    #[test]
    fn revision_fires_when_risk_clears_after_alert() {
        let mut s = Signal::new();
        assert!(matches!(s.evaluate(&risk(0.9)), SignalEvent::Alert(_)));
        // drops into the hysteresis band — not yet cleared
        assert_eq!(s.evaluate(&risk(0.6)), SignalEvent::None);
        // drops below clear threshold — belief revision
        assert_eq!(s.evaluate(&risk(0.3)), SignalEvent::Revision);
        // can alert again on a fresh crossing
        assert!(matches!(s.evaluate(&risk(0.95)), SignalEvent::Alert(_)));
    }

    #[test]
    fn no_revision_without_prior_alert() {
        let mut s = Signal::new();
        assert_eq!(s.evaluate(&risk(0.2)), SignalEvent::None);
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
        assert_eq!(low.evaluate(&risk(p)), SignalEvent::None);
        let mut high = Signal::new();
        high.set_sensitivity(Sensitivity::High);
        assert!(matches!(high.evaluate(&risk(p)), SignalEvent::Alert(_)));
    }

    #[test]
    fn changing_sensitivity_mid_alert_preserves_latch() {
        let mut s = Signal::new();
        s.set_sensitivity(Sensitivity::High);
        // Cross High's 0.50 → alerts.
        assert!(matches!(s.evaluate(&risk(0.55)), SignalEvent::Alert(_)));
        // User pulls sensitivity to Low — we don't re-fire, and the still-elevated
        // risk shouldn't trigger a spurious revision.
        s.set_sensitivity(Sensitivity::Low);
        assert_eq!(s.evaluate(&risk(0.55)), SignalEvent::None);
    }
}
