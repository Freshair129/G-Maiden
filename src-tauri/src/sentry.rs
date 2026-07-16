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
//! Residual limit: [`CONFIRM_HITS`]/[`STALE_UNCONFIRMED_MS`] are a general
//! recurrence gate and cut phantom names in real matches, but they cannot
//! fully eliminate them — without a draft roster to ground against (e.g. a
//! demo/practice match, or own-game with no pick screen observed), a blip
//! that genuinely recurs (a courier or ward sitting in one spot, a creep wave
//! bunched up) can still confirm as a phantom hero. The real fix there is the
//! roster filter (only classify to heroes actually in the draft), which is
//! only available once a drafted match's picks are known.

use std::collections::HashMap;

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
const CONFIRM_WINDOW_MS: u64 = 4_000;

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
}

/// Per-hero last-seen state machine.
#[derive(Default)]
pub struct Sentry {
    tracks: HashMap<String, Track>,
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
        // 1) refresh every hero seen this frame (accumulate confirmation hits,
        //    re-arm its missing edge)
        for d in detections {
            let pos = region.pixel_to_normalised(d.x, d.y);
            match self.tracks.get_mut(&d.name) {
                Some(t) => {
                    // streak resets if the gap since the last hit blew the window
                    // (only matters while still unconfirmed — confirmed is sticky)
                    if !t.confirmed && now_ms.saturating_sub(t.last_seen_ms) > CONFIRM_WINDOW_MS {
                        t.hits = 0;
                    }
                    t.hits = t.hits.saturating_add(1);
                    if t.hits >= CONFIRM_HITS {
                        t.confirmed = true;
                    }
                    t.last_seen_ms = now_ms;
                    t.last_pos = pos;
                    t.missing_emitted = false;
                }
                None => {
                    self.tracks.insert(
                        d.name.clone(),
                        Track {
                            last_seen_ms: now_ms,
                            last_pos: pos,
                            missing_emitted: false,
                            hits: 1,
                            // first sight is never enough (CONFIRM_HITS > 1);
                            // subsequent recurrences flip this in the arm above.
                            confirmed: false,
                        },
                    );
                }
            }
        }

        // 2) drop unconfirmed phantom noise that hasn't recurred — keeps stray
        //    misclassifications from piling up (confirmed heroes are kept).
        self.tracks
            .retain(|_, t| t.confirmed || now_ms.saturating_sub(t.last_seen_ms) <= STALE_UNCONFIRMED_MS);

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
                    hero: hero.clone(),
                    missing_for_ms: elapsed,
                    last_pos: t.last_pos,
                });
            }
        }
        out
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
                (e >= MISSING_THRESHOLD_MS).then(|| (h.clone(), e, t.last_pos))
            })
            .collect()
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
    fn missing_fires_once_after_threshold_then_rearms() {
        let mut s = Sentry::new();
        let r = region();
        // confirm CM: CONFIRM_HITS sightings inside the window (last seen 450ms)
        for t in [0, 150, 300, 450] {
            assert!(s.update(&[det("CM", 10, 10)], &r, t).is_empty());
        }
        // still within 5s of the last sighting — nothing
        assert!(s.update(&[], &r, 4_000).is_empty());
        // crosses 5s since last seen (450 + 5301) — fires once
        let e = s.update(&[], &r, 5_751);
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].hero, "CM");
        assert!(e[0].missing_for_ms >= 5_000);
        // still missing — does NOT re-fire
        assert!(s.update(&[], &r, 7_000).is_empty());
        // reappears (already confirmed → one sighting refreshes), gone again → re-arms
        assert!(s.update(&[det("CM", 12, 12)], &r, 8_000).is_empty());
        let e2 = s.update(&[], &r, 13_500);
        assert_eq!(e2.len(), 1);
    }

    #[test]
    fn missing_list_reflects_current_state() {
        let mut s = Sentry::new();
        let r = region();
        // confirm both, then SF stays seen while CM disappears
        for t in [0, 150, 300, 450] {
            s.update(&[det("CM", 10, 10), det("SF", 200, 200)], &r, t);
        }
        s.update(&[det("SF", 205, 205)], &r, 6_000); // SF still seen, CM gone
        let m = s.missing(6_000);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].0, "CM");
    }

    #[test]
    fn last_pos_is_normalised() {
        let mut s = Sentry::new();
        let r = region(); // side 256
        for t in [0, 150, 300, 450] {
            s.update(&[det("CM", 128, 64)], &r, t);
        }
        let e = s.update(&[], &r, 6_000);
        let (nx, ny) = e[0].last_pos;
        assert!((nx - 0.5).abs() < 1e-3 && (ny - 0.25).abs() < 1e-3);
    }

    #[test]
    fn single_frame_phantom_is_never_reported() {
        let mut s = Sentry::new();
        let r = region();
        // one stray misclassification that never recurs
        assert!(s.update(&[det("Phantom", 30, 30)], &r, 0).is_empty());
        // well past the missing threshold — must stay silent (never confirmed)
        assert!(s.update(&[], &r, 20_000).is_empty());
        assert!(s.missing(20_000).is_empty());
    }

    #[test]
    fn scattered_phantoms_do_not_accumulate() {
        let mut s = Sentry::new();
        let r = region();
        // six different one-off misclassifications spread over time — the shape
        // of the "10 phantom heroes reported missing" bug this gate closes.
        for (i, name) in ["A", "B", "C", "D", "E", "F"].iter().enumerate() {
            assert!(s.update(&[det(name, 10, 10)], &r, i as u64 * 1_000).is_empty());
        }
        // none reached CONFIRM_HITS → nothing is ever reported missing
        assert!(s.missing(30_000).is_empty());
    }
}
