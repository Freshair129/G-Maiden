//! Color-ring + brightness prefilter — Step 2 of the minimap CV pipeline.
//!
//! Ported from `spikes/s1-minimap-cv/src/main.rs::candidates()` (proven in
//! Spike S-1: brute-force NCC was 305 ms for 10 templates vs 0.85 ms with this
//! prefilter — a ~360× cut that is what keeps us inside the CPU budget). The
//! production version is generalised from the spike's fixed 256×256 / 20px
//! constants to a runtime-sized region so it works at any screen resolution.
//!
//! It scores each pixel by closeness to the enemy team-ring colour times
//! brightness, accumulates into a coarse grid (cell ≈ icon size), then emits a
//! 3×3 of candidate top-left offsets around every grid cell whose score clears
//! a fraction of the peak. Output feeds the detector (ONNX / NCC fallback).

use super::{Frame, TEAM_RING};

/// Cells scoring above this fraction of the peak become candidates (spike: 0.18).
pub const DEFAULT_THRESHOLD_FRAC: f32 = 0.18;

/// Contrast gate: a candidate cell must also exceed this multiple of the grid
/// mean, so a flat / uniformly-tinted frame produces no candidates.
const CONTRAST_K: f32 = 1.5;

/// Return deduplicated candidate top-left coords likely to hold a hero icon.
///
/// `icon` is the hero-blip side length in pixels (scales with minimap size).
/// `threshold_frac` selects grid cells above that fraction of the peak score;
/// use [`DEFAULT_THRESHOLD_FRAC`]. Coords are clamped so a full `icon×icon`
/// patch always fits inside the frame.
pub fn prefilter_candidates(img: &Frame, icon: usize, threshold_frac: f32) -> Vec<(i32, i32)> {
    let (w, h) = (img.width, img.height);
    // Degenerate frames (too small for even one icon) have no candidates.
    if icon == 0 || w < icon || h < icon {
        return Vec::new();
    }
    let cell = icon; // grid cell ≈ icon size
    let gw = (w / cell).max(1);
    let gh = (h / cell).max(1);
    let mut grid = vec![0.0f32; gw * gh];
    let mut counts = vec![0u32; gw * gh];

    for y in 0..h {
        for x in 0..w {
            let c = img.at(x, y);
            // closeness to the team-red ring (1.0 == exact match, 0.0 == far)
            let dr = c[0] - TEAM_RING.0;
            let dg = c[1] - TEAM_RING.1;
            let db = c[2] - TEAM_RING.2;
            let ring = (1.0 - (dr * dr + dg * dg + db * db).sqrt()).max(0.0);
            let bright = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
            // width/height aren't always divisible by cell — clamp to the last
            // grid cell instead of growing the grid (spike off-by-one fix).
            let gx = (x / cell).min(gw - 1);
            let gy = (y / cell).min(gh - 1);
            grid[gy * gw + gx] += ring * ring * bright;
            counts[gy * gw + gx] += 1;
        }
    }
    // Average per pixel so edge cells (which absorb the non-divisible remainder
    // and thus contain more pixels) aren't biased high — score is now mean
    // "heroness" per pixel, comparable across cells of unequal area.
    for (g, &n) in grid.iter_mut().zip(counts.iter()) {
        if n > 0 {
            *g /= n as f32;
        }
    }

    let maxv = grid.iter().cloned().fold(0.0f32, f32::max).max(1e-6);
    let mean = grid.iter().sum::<f32>() / grid.len() as f32;
    // A blip must *stand out* from the background, not merely clear a fraction
    // of the peak — otherwise a uniformly red-tinted (or fully fogged) frame
    // flags every cell. Require the cell to exceed both the peak-fraction gate
    // and a contrast gate above the grid mean. On a flat frame peak ≈ mean, so
    // nothing qualifies; a real hero blip sits well above the mean.
    let floor = (threshold_frac * maxv).max(CONTRAST_K * mean);
    let max_x = (w - icon) as i32;
    let max_y = (h - icon) as i32;
    let half = (icon as i32) / 2;
    let mut out = Vec::new();
    for gy in 0..gh {
        for gx in 0..gw {
            if grid[gy * gw + gx] > floor {
                let bx = (gx * cell) as i32;
                let by = (gy * cell) as i32;
                // 3×3 of offsets so a hero straddling a cell boundary is covered.
                for oy in [-half, 0, half] {
                    for ox in [-half, 0, half] {
                        let x = (bx + ox).clamp(0, max_x);
                        let y = (by + oy).clamp(0, max_y);
                        out.push((x, y));
                    }
                }
            }
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a frame filled with `bg`, then paint a filled `icon×icon` square of
    /// `color` at (px, py). Colors are 0..255 BGRA-component triples (R, G, B).
    fn frame_with_blip(
        w: usize,
        h: usize,
        bg: [u8; 3],
        color: [u8; 3],
        px: usize,
        py: usize,
        icon: usize,
    ) -> Frame {
        let mut bgra = Vec::with_capacity(w * h * 4);
        for _ in 0..(w * h) {
            bgra.extend_from_slice(&[bg[2], bg[1], bg[0], 255]); // B,G,R,A
        }
        for yy in py..(py + icon).min(h) {
            for xx in px..(px + icon).min(w) {
                let i = (yy * w + xx) * 4;
                bgra[i] = color[2];
                bgra[i + 1] = color[1];
                bgra[i + 2] = color[0];
            }
        }
        Frame::from_bgra(w, h, bgra).unwrap()
    }

    #[test]
    fn flat_frame_yields_no_candidates() {
        // A uniform frame (no blip standing out) must produce zero candidates:
        // the contrast gate rejects it because peak ≈ mean. This guards against
        // a fully-fogged or red-tinted minimap flagging every cell.
        let f = frame_with_blip(128, 128, [60, 30, 30], [60, 30, 30], 0, 0, 1);
        let c = prefilter_candidates(&f, 20, DEFAULT_THRESHOLD_FRAC);
        assert!(c.is_empty(), "flat frame must yield no candidates, got {}", c.len());
    }

    #[test]
    fn red_blip_is_found_near_its_location() {
        // Dire-red blip (~219,41,41) on dark background must produce a candidate
        // whose patch overlaps the blip.
        let icon = 20;
        let (px, py) = (60usize, 40usize);
        let f = frame_with_blip(160, 160, [12, 28, 12], [219, 41, 41], px, py, icon);
        let cands = prefilter_candidates(&f, icon, DEFAULT_THRESHOLD_FRAC);
        assert!(!cands.is_empty(), "red blip must yield candidates");
        let hit = cands.iter().any(|&(x, y)| {
            (x - px as i32).abs() <= icon as i32 && (y - py as i32).abs() <= icon as i32
        });
        assert!(hit, "a candidate should land within one icon of the blip");
    }

    #[test]
    fn candidates_fit_inside_frame() {
        let icon = 20;
        let f = frame_with_blip(100, 100, [12, 28, 12], [219, 41, 41], 80, 80, icon);
        for (x, y) in prefilter_candidates(&f, icon, DEFAULT_THRESHOLD_FRAC) {
            assert!(x >= 0 && x <= (100 - icon) as i32);
            assert!(y >= 0 && y <= (100 - icon) as i32);
        }
    }

    #[test]
    fn region_smaller_than_icon_is_safe() {
        let f = frame_with_blip(10, 10, [12, 28, 12], [219, 41, 41], 0, 0, 5);
        assert!(prefilter_candidates(&f, 20, DEFAULT_THRESHOLD_FRAC).is_empty());
    }
}
