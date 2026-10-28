//! Lightweight state cues from the in-game top hero bar. This does not infer a
//! hero identity; it only reports the low-color death cue seen in captured HUD
//! frames so the frontend can pair it with the stable player order from draft.

use super::Frame;

const SLOT_HEIGHT_FRAC: f32 = 0.0389;
const COLOR_SAMPLE_LEFT_FRAC: f32 = 0.12;
const COLOR_SAMPLE_RIGHT_FRAC: f32 = 0.88;
const COLOR_SAMPLE_TOP_FRAC: f32 = 0.12;
const COLOR_SAMPLE_BOTTOM_FRAC: f32 = 0.78;
const DEATH_HINT_MAX_CHROMA: f32 = 20.0;
const COLORED_MIN_CHROMA: f32 = 30.0;
const MIN_VALID_MEAN_LUMA: f32 = 8.0;
const MIN_VALID_LUMA_STD_DEV: f32 = 4.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HeroHudBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HeroHudCue {
    DeathHint,
    Colored,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct HeroHudSlot {
    pub cue: HeroHudCue,
    pub mean_chroma: f32,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct HeroHudRead {
    pub radiant: Vec<HeroHudSlot>,
    pub dire: Vec<HeroHudSlot>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct HeroHudRegion {
    pub boxes: Vec<HeroHudBox>,
}

impl HeroHudRegion {
    /// The fixed top portrait bar in the 1920x1080 in-game reference screenshots.
    pub fn for_resolution(screen_w: u32, screen_h: u32) -> Self {
        let height = ((screen_h as f32 * SLOT_HEIGHT_FRAC).round() as u32).max(2);
        let boxes = Self::identity_boxes(screen_w, screen_h)
            .into_iter()
            .map(|slot| HeroHudBox {
                y: 0,
                height,
                ..slot
            })
            .collect();
        Self { boxes }
    }

    /// Inner scoreboard portraits measured in the 1920x1080 Steam references.
    /// Keep borders / player-color stripes out of identity NCC, independently
    /// of the larger rectangles used for death-state cues.
    pub fn identity_boxes(screen_w: u32, screen_h: u32) -> Vec<HeroHudBox> {
        let sx = screen_w as f32 / 1920.0;
        let sy = screen_h as f32 / 1080.0;
        (0..10)
            .map(|slot| HeroHudBox {
                x: (((if slot < 5 { 546 } else { 1064 }) + (slot % 5) * 62) as f32 * sx).round()
                    as u32,
                y: (4.0 * sy).round() as u32,
                width: (62.0 * sx).round() as u32,
                height: (35.0 * sy).round() as u32,
            })
            .collect()
    }

    pub fn bounding_rect(&self) -> (u32, u32, u32, u32) {
        let min_x = self.boxes.iter().map(|slot| slot.x).min().unwrap_or(0);
        let min_y = self.boxes.iter().map(|slot| slot.y).min().unwrap_or(0);
        let max_x = self
            .boxes
            .iter()
            .map(|slot| slot.x.saturating_add(slot.width))
            .max()
            .unwrap_or(0);
        let max_y = self
            .boxes
            .iter()
            .map(|slot| slot.y.saturating_add(slot.height))
            .max()
            .unwrap_or(0);
        (
            min_x,
            min_y,
            max_x.saturating_sub(min_x),
            max_y.saturating_sub(min_y),
        )
    }

    /// Mean per-pixel RGB chroma distinguishes the strongly desaturated topbar
    /// death cue from a colored portrait. A luminance/texture guard rejects a
    /// black desktop or blank capture instead of reporting ten dead heroes.
    pub fn read(&self, strip: &Frame, strip_x: u32, strip_y: u32) -> HeroHudRead {
        let mut radiant = Vec::with_capacity(5);
        let mut dire = Vec::with_capacity(5);
        for (index, slot) in self.boxes.iter().enumerate() {
            let local_x = slot.x.saturating_sub(strip_x) as usize;
            let local_y = slot.y.saturating_sub(strip_y) as usize;
            let left = local_x + (slot.width as f32 * COLOR_SAMPLE_LEFT_FRAC) as usize;
            let right =
                (local_x + (slot.width as f32 * COLOR_SAMPLE_RIGHT_FRAC) as usize).min(strip.width);
            let top = local_y + (slot.height as f32 * COLOR_SAMPLE_TOP_FRAC) as usize;
            let bottom = (local_y + (slot.height as f32 * COLOR_SAMPLE_BOTTOM_FRAC) as usize)
                .min(strip.height);

            let mut chroma_sum = 0.0f32;
            let mut luma_sum = 0.0f32;
            let mut luma_square_sum = 0.0f32;
            let mut count = 0usize;
            for y in top..bottom {
                for x in left..right {
                    let [red, green, blue] = strip.at(x, y);
                    let max = red.max(green).max(blue);
                    let min = red.min(green).min(blue);
                    chroma_sum += max - min;
                    let luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
                    luma_sum += luma;
                    luma_square_sum += luma * luma;
                    count += 1;
                }
            }
            let mean_chroma = if count == 0 {
                0.0
            } else {
                chroma_sum * 255.0 / count as f32
            };
            let mean_luma = if count == 0 {
                0.0
            } else {
                luma_sum * 255.0 / count as f32
            };
            let luma_variance = if count == 0 {
                0.0
            } else {
                (luma_square_sum / count as f32 - (luma_sum / count as f32).powi(2)).max(0.0)
            };
            let luma_std_dev = luma_variance.sqrt() * 255.0;
            let cue = if count == 0
                || mean_luma < MIN_VALID_MEAN_LUMA
                || luma_std_dev < MIN_VALID_LUMA_STD_DEV
            {
                HeroHudCue::Unknown
            } else if mean_chroma <= DEATH_HINT_MAX_CHROMA {
                HeroHudCue::DeathHint
            } else if mean_chroma >= COLORED_MIN_CHROMA {
                HeroHudCue::Colored
            } else {
                HeroHudCue::Unknown
            };
            let value = HeroHudSlot { cue, mean_chroma };
            if index < 5 {
                radiant.push(value);
            } else {
                dire.push(value);
            }
        }
        HeroHudRead { radiant, dire }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_strip_contains_every_identity_crop_at_supported_scales() {
        for (w, h) in [
            (1280, 720),
            (1366, 768),
            (1920, 1080),
            (2560, 1440),
            (3840, 2160),
        ] {
            let (x, y, width, height) = HeroHudRegion::for_resolution(w, h).bounding_rect();
            for b in HeroHudRegion::identity_boxes(w, h) {
                assert!(
                    b.x >= x
                        && b.y >= y
                        && b.x + b.width <= x + width
                        && b.y + b.height <= y + height
                );
            }
        }
    }
}
