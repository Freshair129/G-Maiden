//! Minimap region geometry — where the minimap sits on screen, and the mapping
//! from a detected pixel inside it to a normalised game-map coordinate.
//!
//! Dota 2's minimap is a fixed square anchored to the bottom-left of the HUD;
//! its size scales with HUD scale and screen height. We derive a sane default
//! bounding box from the resolution (so capture can start without setup) and
//! expose the same struct for the user to override after on-screen calibration
//! (Phase 2 roadmap P2.0/P2.3). All fields are in physical screen pixels.

use serde::{Deserialize, Serialize};

/// Default minimap side as a fraction of screen height. Dota's default-scale
/// minimap is ≈15.6% of a 1080p screen's height; close enough to seed capture,
/// refined by calibration. Tunable via [`MinimapRegion::for_resolution`].
const MINIMAP_SIDE_FRAC_OF_HEIGHT: f32 = 0.156;

/// Hero blip side as a fraction of the minimap side (spike used 20px on a 256px
/// map ≈ 7.8%). Drives the prefilter grid cell size at any resolution.
const ICON_FRAC_OF_MINIMAP: f32 = 0.078;

/// A square minimap region on screen, in physical pixels (origin top-left).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct MinimapRegion {
    pub x: u32,
    pub y: u32,
    pub side: u32,
}

impl MinimapRegion {
    /// Default bounding box for a screen of `screen_w × screen_h`, assuming the
    /// minimap is anchored at the bottom-left corner of the HUD at default scale.
    pub fn for_resolution(screen_w: u32, screen_h: u32) -> Self {
        let side = ((screen_h as f32) * MINIMAP_SIDE_FRAC_OF_HEIGHT).round() as u32;
        let side = side.clamp(1, screen_h.min(screen_w));
        MinimapRegion {
            x: 0,
            y: screen_h.saturating_sub(side),
            side,
        }
    }

    /// Hero-blip side length in pixels for this region (feeds the prefilter).
    pub fn icon_size(&self) -> usize {
        ((self.side as f32) * ICON_FRAC_OF_MINIMAP).round().max(2.0) as usize
    }

    /// Map a pixel `(px, py)` *relative to the captured region* (0..side) to a
    /// normalised game-map coordinate in `[0, 1]²`, where (0,0) is the minimap's
    /// top-left and (1,1) its bottom-right. Out-of-region inputs are clamped.
    ///
    /// Kept normalised (not raw Dota world units) so G-Sentry/G-Motion can reason
    /// about lanes/positions without hard-coding world extents; the world-unit
    /// transform is a later, calibratable affine on top of this.
    /// Consumed by G-Sentry/G-Motion (P2.3+); kept here as region geometry.
    #[allow(dead_code)]
    pub fn pixel_to_normalised(&self, px: i32, py: i32) -> (f32, f32) {
        let s = self.side.max(1) as f32;
        let nx = (px as f32 / s).clamp(0.0, 1.0);
        let ny = (py as f32 / s).clamp(0.0, 1.0);
        (nx, ny)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn region_anchored_bottom_left() {
        let r = MinimapRegion::for_resolution(1920, 1080);
        assert_eq!(r.x, 0);
        // side ≈ 0.156 * 1080 ≈ 168
        assert!((160..=176).contains(&r.side), "side was {}", r.side);
        // bottom-anchored: y + side == screen height
        assert_eq!(r.y + r.side, 1080);
    }

    #[test]
    fn icon_size_scales_with_resolution() {
        let r1080 = MinimapRegion::for_resolution(1920, 1080);
        let r1440 = MinimapRegion::for_resolution(2560, 1440);
        assert!(r1440.icon_size() > r1080.icon_size());
        // ~13px on 1080p (0.078 * 168)
        assert!((10..=16).contains(&r1080.icon_size()), "icon {}", r1080.icon_size());
    }

    #[test]
    fn normalised_mapping_corners_and_clamp() {
        let r = MinimapRegion { x: 0, y: 912, side: 168 };
        assert_eq!(r.pixel_to_normalised(0, 0), (0.0, 0.0));
        let (nx, ny) = r.pixel_to_normalised(168, 168);
        assert!((nx - 1.0).abs() < 1e-6 && (ny - 1.0).abs() < 1e-6);
        // out of range clamps into the unit square
        assert_eq!(r.pixel_to_normalised(-50, 9999), (0.0, 1.0));
    }

    #[test]
    fn tiny_screen_stays_valid() {
        let r = MinimapRegion::for_resolution(640, 480);
        assert!(r.side >= 1 && r.y + r.side == 480);
        assert!(r.icon_size() >= 2);
    }
}
