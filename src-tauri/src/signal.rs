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

/// Fire a warning at/above this probability (SRS §3.3: Danger Threshold > 85%).
pub const DANGER_THRESHOLD: f32 = 0.85;
/// After alerting, retract once risk drops below this (belief revision).
pub const CLEAR_THRESHOLD: f32 = 0.50;

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

/// Edge-triggered danger state with hysteresis.
#[derive(Default)]
pub struct Signal {
    alerted: bool,
}

impl Signal {
    pub fn new() -> Self {
        Signal::default()
    }

    pub fn evaluate(&mut self, risk: &GankRisk) -> SignalEvent {
        if !self.alerted && risk.probability >= DANGER_THRESHOLD {
            self.alerted = true;
            return SignalEvent::Alert(SignalAlert {
                probability: risk.probability,
                missing_heroes: risk.missing_heroes.clone(),
                eta_ms: risk.eta_ms,
            });
        }
        if self.alerted && risk.probability < CLEAR_THRESHOLD {
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
}
