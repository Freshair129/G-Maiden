//! Draft-CV pick-screen geometry — the 10 hero-portrait boxes on the hero-
//! selection screen, derived from screen resolution. The pick-screen analog of
//! [`crate::cv::region::MinimapRegion`]. Index 0–4 = Radiant picks, 5–9 = Dire.
//!
//! Layout (measured off a real 16:9 All Pick screen): the 10 picked-hero
//! portraits sit in the TOP player-slot strip — 5 Radiant slots left of the
//! centre clock, 5 Dire right of it — evenly spaced within each group.
//!
//! ⚠️ **PARTIALLY CALIBRATED.** The per-slot X centres + the 5/5 split are
//! measured. The portrait Y and SIZE are still approximate: the reference
//! capture cropped the very top edge where the small pick thumbnails sit, so
//! `PORTRAIT_FRAC_OF_HEIGHT` / `STRIP_TOP_FRAC` need refining against a capture
//! whose top isn't clipped. Tune the `*_FRAC` consts; never hardcode pixels.

/// Portrait box side as a fraction of screen height. APPROX — the pick thumbnail
/// is small; refine against a full-top capture.
const PORTRAIT_FRAC_OF_HEIGHT: f32 = 0.05;
/// Top edge of the portrait strip, fraction of screen height. APPROX (near top).
const STRIP_TOP_FRAC: f32 = 0.005;
/// X centre of the FIRST Radiant slot, fraction of screen width (measured).
const RADIANT_FIRST_CENTER_FRAC: f32 = 0.107;
/// X centre of the FIRST Dire slot, fraction of screen width (measured).
const DIRE_FIRST_CENTER_FRAC: f32 = 0.646;
/// Centre-to-centre spacing between adjacent slots, fraction of width (measured).
const SLOT_STEP_FRAC: f32 = 0.076;

/// One hero-portrait box in physical screen pixels (origin top-left). Same
/// `(x, y, side)` shape as `MinimapRegion`, so [`crate::capture`]'s generic crop
/// helper reuses directly.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct PortraitBox {
    pub x: u32,
    pub y: u32,
    pub side: u32,
}

/// The 10 portrait boxes for a resolution; `boxes[0..5]` Radiant, `boxes[5..10]`
/// Dire.
#[derive(Clone, Debug, serde::Serialize)]
pub struct DraftRegion {
    pub boxes: Vec<PortraitBox>,
}

impl DraftRegion {
    /// Derive the 10 portrait boxes from screen resolution. Each of the two
    /// 5-slot groups starts at its measured first-slot X centre and steps right
    /// by `SLOT_STEP_FRAC`; each box is centred on its slot.
    pub fn for_resolution(screen_w: u32, screen_h: u32) -> Self {
        let side = ((screen_h as f32 * PORTRAIT_FRAC_OF_HEIGHT).round() as u32).max(2);
        let y = (screen_h as f32 * STRIP_TOP_FRAC).round() as u32;
        let step = (screen_w as f32 * SLOT_STEP_FRAC).round() as u32;
        let half = side / 2;

        let slot = |first_center_frac: f32, i: u32| -> PortraitBox {
            let cx = (screen_w as f32 * first_center_frac).round() as u32 + step * i;
            PortraitBox { x: cx.saturating_sub(half), y, side }
        };

        let mut boxes = Vec::with_capacity(10);
        for i in 0..5u32 {
            boxes.push(slot(RADIANT_FIRST_CENTER_FRAC, i));
        }
        for i in 0..5u32 {
            boxes.push(slot(DIRE_FIRST_CENTER_FRAC, i));
        }
        DraftRegion { boxes }
    }

    /// Radiant portrait boxes (indices 0–4).
    pub fn radiant(&self) -> &[PortraitBox] {
        &self.boxes[..5]
    }

    /// Dire portrait boxes (indices 5–9).
    pub fn dire(&self) -> &[PortraitBox] {
        &self.boxes[5..]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_ten_boxes_split_by_team() {
        let r = DraftRegion::for_resolution(1920, 1080);
        assert_eq!(r.boxes.len(), 10);
        assert_eq!(r.radiant().len(), 5);
        assert_eq!(r.dire().len(), 5);
    }

    #[test]
    fn boxes_are_on_screen_and_square_sized() {
        let (w, h) = (1920u32, 1080u32);
        let r = DraftRegion::for_resolution(w, h);
        for b in &r.boxes {
            assert!(b.side >= 2);
            assert!(b.x + b.side <= w, "box {b:?} runs off the right edge");
            assert!(b.y + b.side <= h, "box {b:?} runs off the bottom edge");
        }
    }

    #[test]
    fn portraits_are_left_to_right_within_each_team() {
        let r = DraftRegion::for_resolution(1920, 1080);
        for team in [r.radiant(), r.dire()] {
            for pair in team.windows(2) {
                assert!(pair[1].x > pair[0].x, "portraits should march rightward");
            }
        }
    }

    #[test]
    fn radiant_group_is_left_of_dire_group() {
        let r = DraftRegion::for_resolution(1920, 1080);
        let radiant_rightmost = r.radiant().iter().map(|b| b.x).max().unwrap();
        let dire_leftmost = r.dire().iter().map(|b| b.x).min().unwrap();
        assert!(radiant_rightmost < dire_leftmost, "teams should not overlap");
    }

    #[test]
    fn scales_with_resolution() {
        let hd = DraftRegion::for_resolution(1280, 720);
        let uhd = DraftRegion::for_resolution(3840, 2160);
        assert!(uhd.boxes[0].side > hd.boxes[0].side);
    }
}
