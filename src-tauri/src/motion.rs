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

/// Tunable knobs behind the gank-risk heuristic ([`Motion::assess`]).
///
/// [`Default`] reproduces today's hardcoded literals exactly — constructing a
/// `Motion` via [`Motion::new`] is behaviorally identical to before this
/// struct existed. G-Log's offline replay/fit harness is the intended way to
/// discover better values from real match outcomes; nothing in the live path
/// changes just by this struct existing.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MotionParams {
    /// Seconds a hero must be missing before any risk accrues (below this,
    /// `missing_risk` is exactly 0.0). Today's literal: `5.0` — matches
    /// G-Sentry's `MISSING_THRESHOLD_MS` (SRS §3.2 fog-of-war confirmation
    /// window), i.e. risk only starts once G-Sentry itself would flag the
    /// hero missing.
    pub ramp_start_s: f32,
    /// Seconds off-map at which per-hero risk peaks (the classic gank
    /// rotation window) before decaying. Today's literal: `12.0`.
    pub peak_s: f32,
    /// The per-hero risk value reached at `peak_s`. Today's literal: `0.7`
    /// (never certainty — a single missing hero is elevated, not proof of
    /// an incoming gank).
    pub peak_risk: f32,
    /// Linear decay rate (risk lost per second) applied after `peak_s` — a
    /// hero missing far longer than the gank window has likely TP'd or is
    /// farming elsewhere. Today's literal: `0.03`.
    pub decay_per_s: f32,
    /// Lower bound the decay never crosses — a long-missing hero always
    /// retains some residual risk. Today's literal: `0.1`.
    pub floor: f32,
    /// Multiplier applied to the combined probability when 2+ heroes are
    /// missing at once (coordinated gank is more dangerous than the
    /// independent-risk product implies). Today's literal: `1.15`.
    pub multi_boost: f32,
    /// Amplitude of the pre-vanish heading adjustment — the per-hero risk is
    /// scaled by `1.0 + cos(heading, toward-centre) * heading_amp`, bounding
    /// the multiplier to `[1.0 - heading_amp, 1.0 + heading_amp]`. Today's
    /// literal: `0.22` (bounds `[0.78, 1.22]`).
    pub heading_amp: f32,
}

impl Default for MotionParams {
    fn default() -> Self {
        MotionParams {
            ramp_start_s: 5.0,
            peak_s: 12.0,
            peak_risk: 0.7,
            decay_per_s: 0.03,
            floor: 0.1,
            multi_boost: 1.15,
            heading_amp: 0.22,
        }
    }
}

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
    params: MotionParams,
    /// How many enemies are believed dead right now (audit H3). Applied as a
    /// count-based discount in [`Motion::assess`]. A per-tick field rather than
    /// an `assess` argument for the same reason `Signal::set_sensitivity` is:
    /// the capture loop refreshes it every frame, and the offline harnesses
    /// (`tests/perf`) have no GSI death signal to pass.
    ///
    /// Defaulting to 0 is the SAFE default here — "assume nobody is dead" means
    /// every missing hero still counts as a threat, i.e. today's behaviour and
    /// the louder side of the error. (Contrast the sensor-health flag, whose
    /// safe default is `false`, because there the permissive value would have
    /// meant "pretend the sensor works".)
    dead_enemies: usize,
}

impl Motion {
    pub fn new() -> Self {
        Motion::default()
    }

    /// Construct with explicit tunables (see [`MotionParams`]) instead of the
    /// legacy-reproducing [`Default`]. Used by the offline fit/replay harness
    /// (G-Log) to evaluate alternative parameter sets against real outcomes;
    /// the live app still calls [`Motion::new`].
    pub fn with_params(params: MotionParams) -> Self {
        Motion {
            history: VecDeque::new(),
            params,
            dead_enemies: 0,
        }
    }

    /// Refresh the believed dead-enemy count for the next [`Motion::assess`].
    /// Cheap (one word); the capture loop calls it every frame from
    /// `runtime::dead_enemy_count()`, the same shape as `Signal::set_sensitivity`.
    pub fn set_dead_enemies(&mut self, n: usize) {
        self.dead_enemies = n;
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
        // Per-hero risk first, so the dead-enemy discount below can rank them.
        let mut scored: Vec<(&String, f32, u64)> = Vec::new();
        for (hero, ms, _pos) in missing {
            let base = self.missing_risk(*ms);
            if base <= 0.0 {
                continue;
            }
            // Heading-aware adjustment: a hero last seen rotating toward the map
            // centre (into the action) is likelier ganking than one that walked
            // out toward its own jungle/base. Uses the pre-vanish trail already
            // in `history`; neutral (1.0) when there's no usable trail.
            let r = (base * self.heading_multiplier(hero)).clamp(0.0, 1.0);
            scored.push((hero, r, self.eta_estimate(*ms)));
        }

        // Dead-enemy discount (audit H3). We know HOW MANY enemies are dead
        // (exact, from the team score) but not WHICH — see
        // `runtime::note_enemy_score`. So drop that many contributors by COUNT,
        // choosing the LOWEST-risk ones.
        //
        // The choice is deliberate and asymmetric. Attribution would be a
        // guess, and guessing wrong on the highest-risk hero silently removes
        // the very warning the player needed. Dropping the lowest-risk entries
        // removes exactly as many threats as we know are gone while assuming
        // the corpses were the least threatening — it under-discounts rather
        // than over-discounts, keeping the alarm on the safe side of the error.
        //
        // Known cost, accepted deliberately: a hero killed while still VISIBLE
        // on the minimap never entered `missing`, so their death still burns a
        // discount slot and drops a live hero instead. That is a real false
        // negative. It is bounded precisely BY the lowest-risk rule — the hero
        // dropped is the smallest contributor to `p_safe`, so the probability
        // barely moves — and it is traded against a large systematic false
        // POSITIVE it removes (a won teamfight reading as a five-hero gank).
        if self.dead_enemies > 0 && !scored.is_empty() {
            scored.sort_by(|a, b| b.1.total_cmp(&a.1));
            let keep = scored.len().saturating_sub(self.dead_enemies);
            scored.truncate(keep);
        }

        let mut names = Vec::new();
        let mut p_safe = 1.0f32; // P(no one is ganking)
        let mut min_eta = u64::MAX;
        for (hero, r, eta) in scored {
            names.push(hero.clone());
            p_safe *= 1.0 - r;
            min_eta = min_eta.min(eta);
        }
        let mut probability = 1.0 - p_safe;
        // coordinated-gank boost: 2+ heroes off-map together is more dangerous
        // than the independent-risk product implies.
        if names.len() >= 2 {
            probability = (probability * self.params.multi_boost).min(1.0);
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
        1.0 + cos.clamp(-1.0, 1.0) * self.params.heading_amp
    }

    /// Per-hero gank risk as a function of time off-map (ms), per `self.params`.
    /// 0 below `ramp_start_s`; ramps to `peak_risk` at `peak_s`; decays
    /// afterwards (floored at `floor`) since a long absence usually means
    /// farm/TP, not gank.
    fn missing_risk(&self, ms: u64) -> f32 {
        let p = &self.params;
        let s = ms as f32 / 1000.0;
        if s < p.ramp_start_s {
            0.0
        } else if s <= p.peak_s {
            (s - p.ramp_start_s) / (p.peak_s - p.ramp_start_s) * p.peak_risk
        } else {
            (p.peak_risk - (s - p.peak_s) * p.decay_per_s).max(p.floor)
        }
    }

    /// Crude ETA: the longer a hero has been gone (up to `peak_s`), the sooner
    /// they likely arrive. Floored at 1 s.
    fn eta_estimate(&self, ms: u64) -> u64 {
        let s = ms as f32 / 1000.0;
        ((self.params.peak_s - s).max(1.0) * 1000.0) as u64
    }
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
        let base = m.missing_risk(11_000);
        assert!(
            (risk.probability - base).abs() < 1e-6,
            "prob {} should equal base {}",
            risk.probability,
            base
        );
    }

    /// The case the whole fix exists for: our team wipes theirs, all five
    /// enemies vanish from the minimap at once, and the OLD model read that as
    /// a maximal coordinated gank — screaming loudest at the exact moment the
    /// map was safest.
    #[test]
    fn full_wipe_is_silent_not_maximal() {
        let missing: Vec<(String, u64, (f32, f32))> = ["a", "b", "c", "d", "e"]
            .iter()
            .map(|h| ((*h).to_string(), 11_000u64, (0.5f32, 0.5f32)))
            .collect();

        let mut m = Motion::new();
        let undiscounted = m.assess(&missing, 12_000);
        assert!(
            undiscounted.probability > 0.9,
            "pre-fix behaviour must still be reproducible: got {}",
            undiscounted.probability
        );

        m.set_dead_enemies(5);
        let discounted = m.assess(&missing, 12_000);
        assert_eq!(
            discounted.probability, 0.0,
            "five dead enemies are zero threats"
        );
        assert!(discounted.missing_heroes.is_empty());
        assert_eq!(discounted.eta_ms, 0, "no threat ⇒ no ETA");
    }

    #[test]
    fn discount_drops_the_lowest_risk_hero_not_the_highest() {
        // Two missing: one deep in the 12s gank window (high risk), one long
        // gone and decayed to the floor (low risk). One of them is dead.
        // We cannot know which, so the model must keep the DANGEROUS one —
        // under-discounting is the safe side of an unknowable attribution.
        let missing = vec![
            ("fresh".to_string(), 12_000u64, (0.5f32, 0.5f32)),
            ("stale".to_string(), 200_000u64, (0.5f32, 0.5f32)),
        ];
        let mut m = Motion::new();
        m.set_dead_enemies(1);
        let risk = m.assess(&missing, 200_000);
        assert_eq!(
            risk.missing_heroes,
            vec!["fresh".to_string()],
            "the high-risk hero must survive the discount"
        );
    }

    #[test]
    fn discount_never_underflows_past_the_missing_set() {
        // More deaths than missing heroes (e.g. an enemy died while already
        // visible, or the pool outlived a reappearance) must clamp to zero
        // threats, not panic and not wrap.
        let missing = vec![("solo".to_string(), 11_000u64, (0.5f32, 0.5f32))];
        let mut m = Motion::new();
        m.set_dead_enemies(9);
        let risk = m.assess(&missing, 12_000);
        assert_eq!(risk.probability, 0.0);
        assert!(risk.missing_heroes.is_empty());
    }

    #[test]
    fn partial_discount_still_warns_and_drops_the_multi_boost() {
        // Three missing, two dead ⇒ one real threat. The survivor's risk stands
        // alone, and the 2+-hero coordinated-gank boost must NOT apply.
        let missing: Vec<(String, u64, (f32, f32))> = ["a", "b", "c"]
            .iter()
            .map(|h| ((*h).to_string(), 11_000u64, (0.5f32, 0.5f32)))
            .collect();
        let mut m = Motion::new();
        m.set_dead_enemies(2);
        let risk = m.assess(&missing, 12_000);
        assert_eq!(risk.missing_heroes.len(), 1);
        let base = m.missing_risk(11_000);
        assert!(
            (risk.probability - base).abs() < 1e-6,
            "single survivor should carry exactly its own risk (no multi-boost): {} vs {base}",
            risk.probability
        );
    }

    #[test]
    fn zero_dead_is_exactly_the_pre_fix_behaviour() {
        let missing: Vec<(String, u64, (f32, f32))> = ["a", "b"]
            .iter()
            .map(|h| ((*h).to_string(), 11_000u64, (0.5f32, 0.5f32)))
            .collect();
        let m_default = Motion::new();
        let mut m_explicit = Motion::new();
        m_explicit.set_dead_enemies(0);
        assert_eq!(
            m_default.assess(&missing, 12_000).probability,
            m_explicit.assess(&missing, 12_000).probability,
            "the default must be a no-op, so untouched callers keep today's model"
        );
    }

    #[test]
    fn default_params_reproduce_legacy_constants() {
        let p = MotionParams::default();
        assert_eq!(p.ramp_start_s, 5.0);
        assert_eq!(p.peak_s, 12.0);
        assert_eq!(p.peak_risk, 0.7);
        assert_eq!(p.decay_per_s, 0.03);
        assert_eq!(p.floor, 0.1);
        assert_eq!(p.multi_boost, 1.15);
        assert_eq!(p.heading_amp, 0.22);
    }

    #[test]
    fn with_params_actually_changes_output() {
        // Two heroes missing together normally gets the coordinated-gank
        // `multi_boost` (1.15). Setting it to 1.0 must remove that boost,
        // proving `with_params` threads through to `assess` rather than the
        // params being stored but unused.
        let missing = [
            ("CM".into(), 11_000, (0.4, 0.4)),
            ("SF".into(), 11_000, (0.6, 0.6)),
        ];

        let default_m = Motion::new();
        let boosted = default_m.assess(&missing, 11_000);

        let no_boost_params = MotionParams {
            multi_boost: 1.0,
            ..MotionParams::default()
        };
        let no_boost_m = Motion::with_params(no_boost_params);
        let unboosted = no_boost_m.assess(&missing, 11_000);

        assert!(
            boosted.probability > unboosted.probability,
            "boosted {} should exceed unboosted {}",
            boosted.probability,
            unboosted.probability
        );
        // sanity: unboosted should equal the raw combined-probability product
        // (no *1.15 applied), i.e. exactly 1 - 0.4*0.4 = 0.84.
        assert!(
            (unboosted.probability - 0.84).abs() < 1e-4,
            "unboosted {} should equal the unscaled product 0.84",
            unboosted.probability
        );
    }
}
