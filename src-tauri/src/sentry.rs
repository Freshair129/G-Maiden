//! G-Sentry — fog-of-war monitor (Phase 2 P2.3).
//!
//! Consumes per-frame hero detections from the minimap CV pipeline and tracks,
//! per enemy hero, when it was last seen. When a hero stays unseen longer than
//! [`MISSING_THRESHOLD_MS`] it is flagged missing (edge-triggered: emitted once,
//! re-armed when the hero reappears). This is the raw signal G-Motion turns into
//! gank probability (SRS §3.1: "ฮีโร่ตำแหน่งแก๊งหายเกิน 5 วินาที").
//!
//! Time is passed in as a monotonic millisecond stamp so the state machine is
//! deterministically testable without a clock.
//!
//! Identity admission is mandatory: only Valve IDs admitted from the current
//! match's portrait roster can create a track. Repeated minimap classifications
//! alone never establish match membership.

use crate::cv::identity::HeroId;
use std::collections::{HashMap, HashSet};

use crate::cv::detector::Detection;
use crate::cv::region::MinimapRegion;

/// A hero unseen for at least this long counts as "missing" (SRS: 5 s).
pub const MISSING_THRESHOLD_MS: u64 = 5_000;

/// A detected name must recur in at least this many frames (within
/// [`CONFIRM_WINDOW_MS`]) before Sentry trusts it as a hero actually in the
/// match. The minimap classifier is a tiny synthetic-trained model that
/// over-fires on non-hero blips (creeps/wards/couriers/noise), producing
/// one-off misclassifications across its whole 127-hero label set. Those never
/// recur consistently, so a "seen N times recently" gate drops them — without
/// it a single stray frame spawns a phantom hero that later reports "missing".
///
/// Raised 3 -> 4 (2026-07-16 field test): a demo showed the classifier
/// hallucinating hero names on creep/ward/building blips; 3 hits let a
/// flickering non-hero blip (re-detected a couple of times by chance, e.g.
/// on a busy teamfight frame) slip through. A persistent real hero — seen
/// on effectively every frame — still confirms one tick later than before,
/// which is well inside the 5s missing budget, so this doesn't meaningfully
/// delay real detections.
const CONFIRM_HITS: u32 = 4;

/// Sliding window for accumulating confirmation hits. If a name isn't re-seen
/// within this long, its streak resets — a stray hit an age ago must not help
/// confirm a later one.
const CONFIRM_WINDOW_MS: u64 = 1_500;

/// Drop an UNconfirmed track not re-seen within this long, so scattered phantom
/// misclassifications don't accumulate in the map.
///
/// Shortened 8s -> 6s (2026-07-16 field test, paired with the CONFIRM_HITS
/// bump above): with a stricter hit requirement, unconfirmed phantom tracks
/// take longer to reach confirmation, so they should also be swept out sooner
/// rather than lingering in the map accumulating stray hits toward the new,
/// higher bar.
const STALE_UNCONFIRMED_MS: u64 = 6_000;

/// One enemy that just crossed the missing threshold.
#[derive(Clone, Debug, serde::Serialize)]
pub struct EnemyMissing {
    pub hero: String,
    pub hero_id: HeroId,
    pub missing_for_ms: u64,
    /// Last-seen position, normalised within the minimap (0..1, see
    /// [`MinimapRegion::pixel_to_normalised`]).
    pub last_pos: (f32, f32),
}

struct Track {
    last_seen_ms: u64,
    last_pos: (f32, f32),
    /// edge flag — true once we've emitted EnemyMissing for the current absence.
    missing_emitted: bool,
    /// consecutive-window sightings accumulated toward [`CONFIRM_HITS`].
    hits: u32,
    /// true once `hits` reached the threshold — only confirmed heroes are ever
    /// reported missing. Sticky: a confirmed hero stays confirmed for the match.
    confirmed: bool,
    seen_since_ms: u64,
    sample_ms: u64,
    sample_pos: (f32, f32),
}

/// Per-hero last-seen state machine.
#[derive(Default)]
pub struct Sentry {
    tracks: HashMap<HeroId, Track>,
    allowed: HashSet<HeroId>,
}

impl Sentry {
    pub fn new() -> Self {
        Sentry::default()
    }

    /// Fold this frame's detections into the tracks. Returns the heroes that
    /// *newly* became missing on this tick (edge-triggered).
    pub fn update(
        &mut self,
        detections: &[Detection],
        region: &MinimapRegion,
        now_ms: u64,
    ) -> Vec<EnemyMissing> {
        let mut unique: HashMap<HeroId, &Detection> = HashMap::new();
        for d in detections {
            let Some(id) = HeroId::from_label(&d.name).filter(|id| self.allowed.contains(id))
            else {
                continue;
            };
            if !d.score.is_finite() {
                continue;
            }
            unique
                .entry(id)
                .and_modify(|old| {
                    if d.score > old.score {
                        *old = d;
                    }
                })
                .or_insert(d);
        }
        for (id, d) in unique {
            let pos = region.pixel_to_normalised(d.x, d.y);
            match self.tracks.get_mut(&id) {
                Some(t) => {
                    if now_ms <= t.sample_ms {
                        continue;
                    }
                    let continuous = now_ms.saturating_sub(t.sample_ms) <= CONFIRM_WINDOW_MS
                        && (pos.0 - t.sample_pos.0).hypot(pos.1 - t.sample_pos.1) <= 0.12;
                    if continuous {
                        t.hits = t.hits.saturating_add(1);
                    } else {
                        t.hits = 1;
                        t.seen_since_ms = now_ms;
                    }
                    t.sample_ms = now_ms;
                    t.sample_pos = pos;
                    let was_missing = t.missing_emitted
                        || (t.confirmed
                            && now_ms.saturating_sub(t.last_seen_ms) >= MISSING_THRESHOLD_MS);
                    let stable = t.hits >= CONFIRM_HITS
                        && now_ms.saturating_sub(t.seen_since_ms)
                            >= if was_missing { 1000 } else { 300 };
                    if stable || (t.confirmed && !was_missing && continuous) {
                        t.confirmed = true;
                        t.last_seen_ms = now_ms;
                        t.last_pos = pos;
                        t.missing_emitted = false;
                    }
                }
                None => {
                    self.tracks.insert(
                        id,
                        Track {
                            last_seen_ms: now_ms,
                            last_pos: pos,
                            missing_emitted: false,
                            hits: 1,
                            confirmed: false,
                            seen_since_ms: now_ms,
                            sample_ms: now_ms,
                            sample_pos: pos,
                        },
                    );
                }
            }
        }

        // 2) drop unconfirmed phantom noise that hasn't recurred — keeps stray
        //    misclassifications from piling up (confirmed heroes are kept).
        self.tracks.retain(|_, t| {
            t.confirmed || now_ms.saturating_sub(t.sample_ms) <= STALE_UNCONFIRMED_MS
        });

        // 3) flag any CONFIRMED hero now unseen past the threshold (once)
        let mut out = Vec::new();
        for (hero, t) in self.tracks.iter_mut() {
            if !t.confirmed {
                continue;
            }
            let elapsed = now_ms.saturating_sub(t.last_seen_ms);
            if elapsed >= MISSING_THRESHOLD_MS && !t.missing_emitted {
                t.missing_emitted = true;
                out.push(EnemyMissing {
                    hero: hero.label().to_string(),
                    hero_id: *hero,
                    missing_for_ms: elapsed,
                    last_pos: t.last_pos,
                });
            }
        }
        out
    }

    pub fn visible(&self, now: u64) -> Vec<String> {
        self.tracks
            .iter()
            .filter(|(_, track)| track.confirmed && track.last_seen_ms == now)
            .map(|(id, _)| id.label().to_string())
            .collect()
    }

    pub fn retain_allowed(&mut self, allowed: &[String]) {
        self.allowed = allowed
            .iter()
            .filter_map(|name| HeroId::from_label(name))
            .collect();
        self.tracks.retain(|id, _| self.allowed.contains(id));
    }

    /// All heroes currently considered missing, with how long and where last
    /// seen. Feeds G-Motion's risk assessment every tick.
    pub fn missing(&self, now_ms: u64) -> Vec<(String, u64, (f32, f32))> {
        self.tracks
            .iter()
            .filter_map(|(h, t)| {
                if !t.confirmed {
                    return None;
                }
                let e = now_ms.saturating_sub(t.last_seen_ms);
                (e >= MISSING_THRESHOLD_MS).then(|| (h.label().to_string(), e, t.last_pos))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_minimap_detections_without_a_portrait_roster_never_warn() {
        let mut sentry = Sentry::new();
        for now in [0, 150, 300, 450] {
            sentry.update(&[det("axe", 10, 10)], &region(), now);
        }
        assert!(sentry.update(&[], &region(), 6000).is_empty());
    }

    #[test]
    fn duplicate_detections_in_one_frame_do_not_confirm_a_hero() {
        let mut s = admitted_sentry();
        s.update(
            &[
                det("axe", 10, 10),
                det("axe", 80, 80),
                det("axe", 150, 150),
                det("axe", 220, 220),
            ],
            &region(),
            0,
        );
        assert!(s.update(&[], &region(), 6000).is_empty());
    }

    #[test]
    fn one_frame_reappearance_does_not_rearm_missing() {
        let mut s = admitted_sentry();
        for t in [0, 400, 800, 1200] {
            s.update(&[det("axe", 10, 10)], &region(), t);
        }
        assert_eq!(s.update(&[], &region(), 6500).len(), 1);
        s.update(&[det("axe", 10, 10)], &region(), 7000);
        assert!(s.update(&[], &region(), 13000).is_empty());
    }

    #[test]
    fn presence_requires_confirmed_admitted_current_frame_observation() {
        let mut s = admitted_sentry();
        s.update(&[det("axe", 10, 10), det("lina", 20, 20)], &region(), 0);
        assert!(s.visible(0).is_empty());
        for t in [150, 300, 450] {
            s.update(&[det("axe", 10, 10), det("lina", 20, 20)], &region(), t);
        }
        assert_eq!(s.visible(450), vec!["axe"]);
        s.update(&[], &region(), 500);
        assert!(s.visible(500).is_empty());
        assert!(s.missing(500).is_empty());
    }

    fn admitted_sentry() -> Sentry {
        let mut sentry = Sentry::new();
        sentry.retain_allowed(&["axe", "crystal_maiden", "nevermore"].map(str::to_string));
        sentry
    }

    #[test]
    fn removing_roster_identity_removes_its_missing_episode() {
        let mut sentry = admitted_sentry();
        for now in [0, 150, 300, 450] {
            sentry.update(&[det("axe", 10, 10), det("lina", 20, 20)], &region(), now);
        }
        let events = sentry.update(&[], &region(), 6000);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].hero_id, HeroId::from_label("axe").unwrap());
        sentry.retain_allowed(&[]);
        assert!(sentry.missing(7000).is_empty());
    }

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
    fn missing_fires_once_after_threshold_then_rearms() {
        let mut s = admitted_sentry();
        let r = region();
        // confirm CM: CONFIRM_HITS sightings inside the window (last seen 450ms)
        for t in [0, 150, 300, 450] {
            assert!(s.update(&[det("crystal_maiden", 10, 10)], &r, t).is_empty());
        }
        // still within 5s of the last sighting — nothing
        assert!(s.update(&[], &r, 4_000).is_empty());
        // crosses 5s since last seen (450 + 5301) — fires once
        let e = s.update(&[], &r, 5_751);
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].hero, "crystal_maiden");
        assert!(e[0].missing_for_ms >= 5_000);
        // still missing — does NOT re-fire
        assert!(s.update(&[], &r, 7_000).is_empty());
        // reappears (already confirmed → one sighting refreshes), gone again → re-arms
        for t in [8_000, 8_400, 8_800, 9_200] {
            assert!(s.update(&[det("crystal_maiden", 12, 12)], &r, t).is_empty());
        }
        let e2 = s.update(&[], &r, 14_500);
        assert_eq!(e2.len(), 1);
    }

    #[test]
    fn missing_list_reflects_current_state() {
        let mut s = admitted_sentry();
        let r = region();
        // confirm both, then SF stays seen while CM disappears
        for t in [0, 150, 300, 450] {
            s.update(
                &[det("crystal_maiden", 10, 10), det("nevermore", 200, 200)],
                &r,
                t,
            );
        }
        for t in [1500, 2500, 3500, 4500, 5500, 6000] {
            s.update(&[det("nevermore", 205, 205)], &r, t);
        } // SF still seen, CM gone
        let m = s.missing(6_000);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].0, "crystal_maiden");
    }

    #[test]
    fn last_pos_is_normalised() {
        let mut s = admitted_sentry();
        let r = region(); // side 256
        for t in [0, 150, 300, 450] {
            s.update(&[det("crystal_maiden", 128, 64)], &r, t);
        }
        let e = s.update(&[], &r, 6_000);
        let (nx, ny) = e[0].last_pos;
        assert!((nx - 0.5).abs() < 1e-3 && (ny - 0.25).abs() < 1e-3);
    }

    #[test]
    fn single_frame_phantom_is_never_reported() {
        let mut s = admitted_sentry();
        let r = region();
        // one stray misclassification that never recurs
        assert!(s.update(&[det("Phantom", 30, 30)], &r, 0).is_empty());
        // well past the missing threshold — must stay silent (never confirmed)
        assert!(s.update(&[], &r, 20_000).is_empty());
        assert!(s.missing(20_000).is_empty());
    }

    #[test]
    fn scattered_phantoms_do_not_accumulate() {
        let mut s = admitted_sentry();
        let r = region();
        // six different one-off misclassifications spread over time — the shape
        // of the "10 phantom heroes reported missing" bug this gate closes.
        for (i, name) in ["A", "B", "C", "D", "E", "F"].iter().enumerate() {
            assert!(s
                .update(&[det(name, 10, 10)], &r, i as u64 * 1_000)
                .is_empty());
        }
        // none reached CONFIRM_HITS → nothing is ever reported missing
        assert!(s.missing(30_000).is_empty());
    }
}
