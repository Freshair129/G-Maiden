//! Draft-CV geometry for the 10 player slots at the top of the Dota 2 All Pick
//! screen. Coordinates are screen-relative fractions calibrated from the
//! supplied 1919x1079 screenshot; 0–4 are Radiant and 5–9 are Dire.

const SLOT_WIDTH_FRAC: f32 = 0.0619;
const SLOT_HEIGHT_FRAC: f32 = 0.0602;
const STRIP_TOP_FRAC: f32 = 0.0;
const RADIANT_FIRST_LEFT_FRAC: f32 = 0.1084;
const DIRE_FIRST_LEFT_FRAC: f32 = 0.5664;
const SLOT_STEP_FRAC: f32 = 0.0646;

/// Rectangular crop for one player slot in physical screen pixels.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct PortraitBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// The 10 top-row player-slot crops; indices 0–4 Radiant, 5–9 Dire.
#[derive(Clone, Debug, serde::Serialize)]
pub struct DraftRegion {
    pub boxes: Vec<PortraitBox>,
}

impl DraftRegion {
    /// Scale the calibrated 16:9 All Pick layout to the current screen size.
    pub fn for_resolution(screen_w: u32, screen_h: u32) -> Self {
        let width = ((screen_w as f32 * SLOT_WIDTH_FRAC).round() as u32).max(2);
        let height = ((screen_h as f32 * SLOT_HEIGHT_FRAC).round() as u32).max(2);
        let y = (screen_h as f32 * STRIP_TOP_FRAC).round() as u32;
        let step = (screen_w as f32 * SLOT_STEP_FRAC).round() as u32;

        let slot = |first_left_frac: f32, index: u32| PortraitBox {
            x: (screen_w as f32 * first_left_frac).round() as u32 + step * index,
            y,
            width,
            height,
        };

        let mut boxes = Vec::with_capacity(10);
        for index in 0..5u32 {
            boxes.push(slot(RADIANT_FIRST_LEFT_FRAC, index));
        }
        for index in 0..5u32 {
            boxes.push(slot(DIRE_FIRST_LEFT_FRAC, index));
        }
        DraftRegion { boxes }
    }

    pub fn radiant(&self) -> &[PortraitBox] {
        &self.boxes[..5]
    }

    pub fn dire(&self) -> &[PortraitBox] {
        &self.boxes[5..]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calibrates_player_slot_rectangles_from_the_1920x1080_reference() {
        let region = DraftRegion::for_resolution(1920, 1080);
        assert_eq!(region.boxes.len(), 10);
        assert_eq!((region.boxes[0].x, region.boxes[0].y), (208, 0));
        assert_eq!((region.boxes[4].x, region.boxes[4].y), (704, 0));
        assert_eq!((region.boxes[5].x, region.boxes[5].y), (1087, 0));
        assert_eq!((region.boxes[9].x, region.boxes[9].y), (1583, 0));
        assert_eq!((region.boxes[0].width, region.boxes[0].height), (119, 65));
        assert_eq!(region.radiant().len(), 5);
        assert_eq!(region.dire().len(), 5);
    }

    #[test]
    fn crops_fit_and_preserve_team_order_at_common_16_by_9_sizes() {
        for (width, height) in [(1280, 720), (1920, 1080), (2560, 1440)] {
            let region = DraftRegion::for_resolution(width, height);
            for slot in &region.boxes {
                assert!(slot.width >= 2 && slot.height >= 2);
                assert!(slot.x + slot.width <= width, "slot {slot:?} exceeds width");
                assert!(
                    slot.y + slot.height <= height,
                    "slot {slot:?} exceeds height"
                );
            }
            for team in [region.radiant(), region.dire()] {
                assert!(team.windows(2).all(|pair| pair[1].x > pair[0].x));
            }
            assert!(region.radiant().last().unwrap().x < region.dire()[0].x);
        }
    }
}
