//! G-Maiden computer-vision core (Phase 2).
//!
//! Pipeline: capture → [`prefilter`] → detector → coordinate map. This module
//! holds the resolution-independent image primitives shared by every CV stage.
//! Ported from the Spike S-1 harness (`spikes/s1-minimap-cv/`) which proved the
//! latency/CPU budget; the production code generalises the fixed 256×256 / 20px
//! spike constants to a runtime-sized minimap region.

pub mod prefilter;

/// Dire-red enemy team-ring colour (normalised RGB), from Spike S-1.
/// The prefilter rewards pixels close to this hue — it is the cheapest signal
/// that a hero blip (not creep/ward) is present.
pub const TEAM_RING: (f32, f32, f32) = (0.86, 0.16, 0.16);

/// A captured minimap region in BGRA8 (the byte order `windows-capture` yields).
/// Stored as borrowed-or-owned bytes so a capture callback can hand us a slice
/// without an extra copy when it only needs to live for one detect pass.
#[derive(Clone)]
pub struct Frame {
    pub width: usize,
    pub height: usize,
    /// BGRA8, length == width * height * 4.
    pub bgra: Vec<u8>,
}

impl Frame {
    /// Construct from a raw BGRA buffer, validating the length.
    pub fn from_bgra(width: usize, height: usize, bgra: Vec<u8>) -> Option<Self> {
        if bgra.len() == width * height * 4 {
            Some(Frame { width, height, bgra })
        } else {
            None
        }
    }

    /// Normalised RGB at (x, y) — BGRA byte order, alpha ignored. Returns black
    /// for out-of-bounds reads so callers near the edge stay branch-free.
    #[inline]
    pub fn at(&self, x: usize, y: usize) -> [f32; 3] {
        if x >= self.width || y >= self.height {
            return [0.0, 0.0, 0.0];
        }
        let i = (y * self.width + x) * 4;
        let b = self.bgra[i] as f32 / 255.0;
        let g = self.bgra[i + 1] as f32 / 255.0;
        let r = self.bgra[i + 2] as f32 / 255.0;
        [r, g, b]
    }

    /// Rec.601 luma at (x, y), matching the spike's grayscale convention.
    /// Used by the NCC fallback detector (P2.2); kept here as a Frame primitive.
    #[allow(dead_code)]
    #[inline]
    pub fn gray(&self, x: usize, y: usize) -> f32 {
        let c = self.at(x, y);
        0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    }
}
