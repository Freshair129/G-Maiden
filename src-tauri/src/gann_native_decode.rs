use super::Asset;
use gann_vpx::{Codec, Decoder};
#[cfg(test)]
#[path = "gann_native_pixels.rs"]
mod pixels;

pub(super) struct Planar {
    pub width: usize,
    pub height: usize,
    pub planes: [Vec<u8>; 4],
    pub diagnostic_index: Option<u32>,
}
impl Planar {
    #[cfg(test)]
    pub fn reference_bgra(&self) -> Vec<u8> {
        let (w, h) = (self.width, self.height);
        let mut output = vec![0; w * h * 4];
        for y in 0..h {
            pixels::row(
                &self.planes[0][y * w..][..w],
                &self.planes[1][y / 2 * w.div_ceil(2)..][..w.div_ceil(2)],
                &self.planes[2][y / 2 * w.div_ceil(2)..][..w.div_ceil(2)],
                Some(&self.planes[3][y * w..][..w]),
                &mut output[y * w * 4..][..w * 4],
            );
        }
        if let Some(index) = self.diagnostic_index.filter(|_| w >= 384 && h >= 420) {
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
                    output[(y * w + x) * 4..][..4].copy_from_slice(&value);
                }
            }
        }
        output
    }
}

fn copy_plane(bytes: &[u8], stride: usize, width: usize, height: usize) -> Result<Vec<u8>, String> {
    if stride < width || height.checked_mul(stride).is_none_or(|n| bytes.len() < n) {
        return Err("native plane bounds".into());
    }
    let mut output = Vec::with_capacity(width * height);
    for y in 0..height {
        output.extend_from_slice(&bytes[y * stride..][..width]);
    }
    Ok(output)
}

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
    pub fn planar(&mut self, index: usize) -> Result<Planar, String> {
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
        Ok(Planar {
            width: w,
            height: h,
            planes: [
                copy_plane(color.plane(0), color.stride(0), w, h)?,
                copy_plane(
                    color.plane(1),
                    color.stride(1),
                    w.div_ceil(2),
                    h.div_ceil(2),
                )?,
                copy_plane(
                    color.plane(2),
                    color.stride(2),
                    w.div_ceil(2),
                    h.div_ceil(2),
                )?,
                match alpha {
                    Some(a) => copy_plane(a.plane(0), a.stride(0), w, h)?,
                    None => vec![255; w * h],
                },
            ],
            diagnostic_index: self.asset.diagnostic_marker.then_some(index as u32),
        })
    }
    #[cfg(test)]
    pub fn frame(&mut self, index: usize) -> Result<Vec<u8>, String> {
        Ok(self.planar(index)?.reference_bgra())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn plane_copy_preserves_odd_rows_and_rejects_truncated_or_short_strides() {
        assert_eq!(
            copy_plane(&[1, 2, 3, 99, 4, 5, 6, 99], 4, 3, 2).unwrap(),
            [1, 2, 3, 4, 5, 6]
        );
        assert!(copy_plane(&[1; 7], 4, 3, 2).is_err());
        assert!(copy_plane(&[1; 8], 2, 3, 2).is_err());
        assert!(copy_plane(&[], usize::MAX, 1, 2).is_err());
    }
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
