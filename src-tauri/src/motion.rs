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
//! gank). That per-hero risk is then scaled by the hero's **pre-vanish heading**
//! read from the 5-minute history — a hero last seen rotating toward the map
//! centre is weighted up, one walking out toward its own jungle/base is weighted
//! down (see [`Motion::heading_multiplier`]). The history is also retained for
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
    hero: String,
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
            let base = missing_risk(*ms);
            if base <= 0.0 {
                continue;
            }
            // Heading-aware adjustment: a hero last seen rotating toward the map
            // centre (into the action) is likelier ganking than one that walked
            // out toward its own jungle/base. Uses the pre-vanish trail already
            // in `history`; neutral (1.0) when there's no usable trail.
            let r = (base * self.heading_multiplier(hero)).clamp(0.0, 1.0);
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

    /// Directional risk multiplier from a missing hero's pre-vanish heading.
    ///
    /// Reads the hero's last two `history` samples (the trail just before they
    /// went into fog) and compares the movement direction against the vector
    /// toward the map centre: a hero last seen rotating **inward** (into the
    /// action) is weighted above `1.0` (likelier a gank); one walking **outward**
    /// toward its own jungle/base is weighted below `1.0` (likelier farm/retreat).
    /// Bounded to `[0.78, 1.22]`. Returns exactly `1.0` (neutral) when there's no
    /// usable trail — no matching samples, a single sample, zero elapsed time, a
    /// stationary hero, or a last-seen point already at the centre — so callers
    /// with no history behave as before.
    ///
    /// Honest limit: the trail ends at the vanish point, so this reads intent at
    /// the moment of disappearing, not tracking through fog (SRS §3.2).
    fn heading_multiplier(&self, hero: &str) -> f32 {
        // two most recent samples for this hero (history is oldest→newest).
        let mut last: Option<&Sample> = None;
        let mut prev: Option<&Sample> = None;
        for s in self.history.iter().rev() {
            if s.hero == hero {
                if last.is_none() {
                    last = Some(s);
                } else {
                    prev = Some(s);
                    break;
                }
            }
        }
        let (last, prev) = match (last, prev) {
            (Some(l), Some(p)) => (l, p),
            _ => return 1.0,
        };
        if last.ms <= prev.ms {
            return 1.0;
        }
        let (vx, vy) = (last.pos.0 - prev.pos.0, last.pos.1 - prev.pos.1);
        let speed = (vx * vx + vy * vy).sqrt();
        if speed < 1e-4 {
            return 1.0;
        }
        // vector from the last-seen point toward the map centre (0.5, 0.5).
        let (cx, cy) = (0.5 - last.pos.0, 0.5 - last.pos.1);
        let cmag = (cx * cx + cy * cy).sqrt();
        if cmag < 1e-4 {
            return 1.0;
        }
        // cos angle between heading and centre-ward direction: +1 straight in,
        // -1 straight out. Map to a bounded multiplier around 1.0.
        let cos = (vx * cx + vy * cy) / (speed * cmag);
        1.0 + cos.clamp(-1.0, 1.0) * 0.22
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
        Detection {
            label: 0,
            name: name.into(),
            x,
            y,
            score: 0.9,
        }
    }
    fn region() -> MinimapRegion {
        MinimapRegion {
            x: 0,
            y: 0,
            side: 256,
        }
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
            &[
                ("CM".into(), 11_000, (0.4, 0.4)),
                ("SF".into(), 11_000, (0.6, 0.6)),
            ],
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

    #[test]
    fn heading_toward_centre_raises_risk_vs_away() {
        let r = region();
        // inward: last seen moving from a corner toward the centre (rotating in).
        let mut m_in = Motion::new();
        m_in.record(&[det("CM", 40, 40)], &r, 0);
        m_in.record(&[det("CM", 100, 100)], &r, 1_000);
        let risk_in = m_in.assess(&[("CM".into(), 11_000, (0.39, 0.39))], 12_000);

        // outward: last seen walking from mid toward its own corner (farm/retreat).
        let mut m_out = Motion::new();
        m_out.record(&[det("CM", 100, 100)], &r, 0);
        m_out.record(&[det("CM", 40, 40)], &r, 1_000);
        let risk_out = m_out.assess(&[("CM".into(), 11_000, (0.156, 0.156))], 12_000);

        assert!(
            risk_in.probability > risk_out.probability,
            "inward {} should exceed outward {}",
            risk_in.probability,
            risk_out.probability
        );
    }

    #[test]
    fn missing_hero_with_no_trail_is_neutral() {
        // a hero missing but never recorded → heading_multiplier() is 1.0, so the
        // probability equals the pure time-off-map heuristic (backward compatible).
        let m = Motion::new();
        let risk = m.assess(&[("CM".into(), 11_000, (0.5, 0.5))], 12_000);
        let base = missing_risk(11_000);
        assert!(
            (risk.probability - base).abs() < 1e-6,
            "prob {} should equal base {}",
            risk.probability,
            base
        );
    }
}
