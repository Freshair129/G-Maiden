//! G-Motion — position history + gank-risk assessment (Phase 2 P2.4).
//!
//! Keeps a rolling [`WINDOW_MS`] (5-minute) ring buffer of every enemy sighting
//! (SRS §3.2) and turns the set of currently-missing heroes into a single gank
//! probability for G-Signal.
//!
//! The probability model here is a transparent **v1 heuristic**, not a learned
//! model: per-hero risk ramps with how long the hero has been off-map (a hero
//! gone ~10–12 s is the classic gank window; very long absences decay — they've
//! likely TP'd or are farming elsewhere), combined across heroes as "at least
//! one is ganking", with a boost when several vanish together (coordinated
//! gank). The 5-minute history is retained for future path-prediction and for
//! G-Log to tune these constants from real outcomes.

use std::collections::VecDeque;

use crate::cv::detector::Detection;
use crate::cv::region::MinimapRegion;

/// Position history window (SRS §3.2: 5 minutes).
pub const WINDOW_MS: u64 = 300_000;

/// Gank-risk verdict for the current tick.
#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct GankRisk {
    /// 0..1 probability that a gank is incoming.
    pub probability: f32,
    /// Heroes contributing to the risk (currently missing).
    pub missing_heroes: Vec<String>,
    /// Rough estimated time-to-arrival in ms (0 when no risk).
    pub eta_ms: u64,
}

struct Sample {
    ms: u64,
    #[allow(dead_code)]
    hero: String,
    #[allow(dead_code)]
    pos: (f32, f32),
}

/// Position history + risk model.
#[derive(Default)]
pub struct Motion {
    history: VecDeque<Sample>,
}

impl Motion {
    pub fn new() -> Self {
        Motion::default()
    }

    /// Append this frame's sightings and evict anything older than the window.
    pub fn record(&mut self, detections: &[Detection], region: &MinimapRegion, now_ms: u64) {
        for d in detections {
            self.history.push_back(Sample {
                ms: now_ms,
                hero: d.name.clone(),
                pos: region.pixel_to_normalised(d.x, d.y),
            });
        }
        let cutoff = now_ms.saturating_sub(WINDOW_MS);
        while let Some(front) = self.history.front() {
            if front.ms < cutoff {
                self.history.pop_front();
            } else {
                break;
            }
        }
    }

    /// Number of samples currently retained (history-window size; for tests/diag).
    #[cfg(test)]
    pub fn history_len(&self) -> usize {
        self.history.len()
    }

    /// Assess gank risk from the set of currently-missing heroes
    /// (`(hero, missing_ms, last_pos)`, as produced by [`crate::sentry::Sentry::missing`]).
    pub fn assess(&self, missing: &[(String, u64, (f32, f32))], _now_ms: u64) -> GankRisk {
        let mut names = Vec::new();
        let mut p_safe = 1.0f32; // P(no one is ganking)
        let mut min_eta = u64::MAX;
        for (hero, ms, _pos) in missing {
            let r = missing_risk(*ms);
            if r <= 0.0 {
                continue;
            }
            names.push(hero.clone());
            p_safe *= 1.0 - r;
            min_eta = min_eta.min(eta_estimate(*ms));
        }
        let mut probability = 1.0 - p_safe;
        // coordinated-gank boost: 2+ heroes off-map together is more dangerous
        // than the independent-risk product implies.
        if names.len() >= 2 {
            probability = (probability * 1.15).min(1.0);
        }
        GankRisk {
            probability,
            missing_heroes: names,
            eta_ms: if min_eta == u64::MAX { 0 } else { min_eta },
        }
    }
}

/// Per-hero gank risk as a function of time off-map (ms).
/// 0 below the 5 s missing threshold; ramps to a ~0.7 peak around 12 s; decays
/// afterwards (floor 0.1) since a long absence usually means farm/TP, not gank.
fn missing_risk(ms: u64) -> f32 {
    let s = ms as f32 / 1000.0;
    if s < 5.0 {
        0.0
    } else if s <= 12.0 {
        (s - 5.0) / 7.0 * 0.7
    } else {
        (0.7 - (s - 12.0) * 0.03).max(0.1)
    }
}

/// Crude ETA: the longer a hero has been gone (up to the gank window), the
/// sooner they likely arrive. Floored at 1 s.
fn eta_estimate(ms: u64) -> u64 {
    let s = ms as f32 / 1000.0;
    ((12.0 - s).max(1.0) * 1000.0) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn det(name: &str, x: i32, y: i32) -> Detection {
        Detection { label: 0, name: name.into(), x, y, score: 0.9 }
    }
    fn region() -> MinimapRegion {
        MinimapRegion { x: 0, y: 0, side: 256 }
    }

    #[test]
    fn no_missing_means_no_risk() {
        let m = Motion::new();
        let risk = m.assess(&[], 0);
        assert_eq!(risk.probability, 0.0);
        assert!(risk.missing_heroes.is_empty());
    }

    #[test]
    fn single_hero_in_gank_window_is_elevated_not_certain() {
        let m = Motion::new();
        let risk = m.assess(&[("CM".into(), 11_000, (0.5, 0.5))], 11_000);
        assert!(risk.probability > 0.4 && risk.probability < 0.85);
        assert_eq!(risk.missing_heroes, vec!["CM".to_string()]);
        assert!(risk.eta_ms > 0);
    }

    #[test]
    fn two_heroes_missing_crosses_danger_threshold() {
        let m = Motion::new();
        let risk = m.assess(
            &[("CM".into(), 11_000, (0.4, 0.4)), ("SF".into(), 11_000, (0.6, 0.6))],
            11_000,
        );
        // independent ~0.6 each => 1-0.4*0.4=0.84, *1.15 boost => >0.85
        assert!(risk.probability >= 0.85, "prob was {}", risk.probability);
        assert_eq!(risk.missing_heroes.len(), 2);
    }

    #[test]
    fn ring_buffer_evicts_beyond_window() {
        let mut m = Motion::new();
        let r = region();
        m.record(&[det("CM", 10, 10)], &r, 0);
        m.record(&[det("CM", 12, 12)], &r, 100_000);
        assert_eq!(m.history_len(), 2);
        // a sighting past the 5-min window evicts the t=0 sample
        m.record(&[det("CM", 14, 14)], &r, 300_001);
        assert_eq!(m.history_len(), 2);
    }
}
