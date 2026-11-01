use super::Asset;
use gann_vpx::{Codec, Decoder};

pub(super) struct Frames<'a> {
    asset: &'a Asset,
    color: Decoder,
    alpha: Decoder,
}
impl<'a> Frames<'a> {
    pub fn new(asset: &'a Asset) -> Result<Self, String> {
        let make = || {
            Decoder::new(
                match asset.video.codec {
                    crate::gann_webm::Codec::Vp8 => Codec::Vp8,
                    crate::gann_webm::Codec::Vp9 => Codec::Vp9,
                },
                asset.video.width,
                asset.video.height,
            )
        };
        Ok(Self {
            asset,
            color: make()?,
            alpha: make()?,
        })
    }
    pub fn frame(&mut self, index: usize) -> Result<Vec<u8>, String> {
        let frame = self
            .asset
            .video
            .frames
            .get(index)
            .ok_or("native frame index")?;
        let color = self.color.decode(&self.asset.bytes[frame.color.clone()])?;
        let alpha = frame
            .alpha
            .as_ref()
            .map(|range| self.alpha.decode(&self.asset.bytes[range.clone()]))
            .transpose()?;
        let (w, h) = (self.asset.video.width, self.asset.video.height);
        let mut pixels = vec![0; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let yy = i32::from(color.plane(0)[y * color.stride(0) + x]) - 16;
                let u = i32::from(color.plane(1)[y / 2 * color.stride(1) + x / 2]) - 128;
                let v = i32::from(color.plane(2)[y / 2 * color.stride(2) + x / 2]) - 128;
                let a = alpha
                    .as_ref()
                    .map(|f| f.plane(0)[y * f.stride(0) + x])
                    .unwrap_or(255);
                let premultiply = |c: i32| (((c.clamp(0, 255) * i32::from(a)) + 127) / 255) as u8;
                let p = &mut pixels[(y * w + x) * 4..][..4];
                p[0] = premultiply((298 * yy + 516 * u + 128) >> 8);
                p[1] = premultiply((298 * yy - 100 * u - 208 * v + 128) >> 8);
                p[2] = premultiply((298 * yy + 409 * v + 128) >> 8);
                p[3] = a;
            }
        }
        if self.asset.diagnostic_marker && w >= 384 && h >= 420 {
            for y in 400..420 {
                for x in 0..384 {
                    let column = x / 32;
                    let value = if column == 0 {
                        [255, 0, 255, 255]
                    } else if column == 11 || ((index + 1) >> (column - 1)) & 1 != 0 {
                        [255; 4]
                    } else {
                        [0, 0, 0, 255]
                    };
                    pixels[(y * w + x) * 4..][..4].copy_from_slice(&value);
                }
            }
        }
        Ok(pixels)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_every_alpha_frame_without_external_process_or_opaque_background() {
        for bytes in [
            include_bytes!("../tests/fixtures/native-alpha.webm").as_slice(),
            include_bytes!("../tests/fixtures/native-vp9-alpha.webm").as_slice(),
        ] {
            let asset = Asset::new(std::sync::Arc::new(bytes.to_vec())).unwrap();
            let mut decoder = Frames::new(&asset).unwrap();
            assert_eq!(asset.video.frames.len(), 3);
            for index in 0..3 {
                let pixels = decoder.frame(index).unwrap();
                assert_eq!(pixels.len(), 16 * 16 * 4);
                for pixel in pixels.chunks_exact(4) {
                    assert!((120..=135).contains(&pixel[3]), "alpha={}", pixel[3]);
                    assert!(pixel[2] > 110 && pixel[0] < 5 && pixel[1] < 5, "{pixel:?}");
                    assert!(pixel[..3].iter().all(|c| *c <= pixel[3]));
                }
            }
        }
    }
}
