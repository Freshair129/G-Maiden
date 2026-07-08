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

use std::collections::HashMap;

use crate::cv::detector::Detection;
use crate::cv::region::MinimapRegion;

/// A hero unseen for at least this long counts as "missing" (SRS: 5 s).
pub const MISSING_THRESHOLD_MS: u64 = 5_000;

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
        // 1) refresh every hero seen this frame (and re-arm its missing edge)
        for d in detections {
            let pos = region.pixel_to_normalised(d.x, d.y);
            let t = self.tracks.entry(d.name.clone()).or_insert(Track {
                last_seen_ms: now_ms,
                last_pos: pos,
                missing_emitted: false,
            });
            t.last_seen_ms = now_ms;
            t.last_pos = pos;
            t.missing_emitted = false;
        }

        // 2) flag any hero that has now been unseen past the threshold (once)
        let mut out = Vec::new();
        for (hero, t) in self.tracks.iter_mut() {
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
        // seen at t=0
        assert!(s.update(&[det("CM", 10, 10)], &r, 0).is_empty());
        // still within 5s — nothing
        assert!(s.update(&[], &r, 4_000).is_empty());
        // crosses 5s — fires once
        let e = s.update(&[], &r, 5_001);
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].hero, "CM");
        assert!(e[0].missing_for_ms >= 5_000);
        // still missing — does NOT re-fire
        assert!(s.update(&[], &r, 7_000).is_empty());
        // reappears, then disappears again — edge re-arms and fires anew
        assert!(s.update(&[det("CM", 12, 12)], &r, 8_000).is_empty());
        let e2 = s.update(&[], &r, 13_500);
        assert_eq!(e2.len(), 1);
    }

    #[test]
    fn missing_list_reflects_current_state() {
        let mut s = Sentry::new();
        let r = region();
        s.update(&[det("CM", 10, 10), det("SF", 200, 200)], &r, 0);
        s.update(&[det("SF", 205, 205)], &r, 6_000); // SF still seen, CM gone
        let m = s.missing(6_000);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].0, "CM");
    }

    #[test]
    fn last_pos_is_normalised() {
        let mut s = Sentry::new();
        let r = region(); // side 256
        s.update(&[det("CM", 128, 64)], &r, 0);
        let e = s.update(&[], &r, 6_000);
        let (nx, ny) = e[0].last_pos;
        assert!((nx - 0.5).abs() < 1e-3 && (ny - 0.25).abs() < 1e-3);
    }
}
