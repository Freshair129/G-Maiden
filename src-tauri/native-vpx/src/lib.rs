//! One-thread VP8/VP9 decoding with dimension checks inside the C boundary.
use std::{
    ffi::{c_int, c_uint, c_void},
    ptr::NonNull,
};
mod header;

#[repr(C)]
struct Image {
    planes: [*const u8; 3],
    strides: [usize; 3],
}
unsafe extern "C" {
    fn gann_vpx_new(vp9: c_int) -> *mut c_void;
    fn gann_vpx_decode(
        decoder: *mut c_void,
        bytes: *const u8,
        len: usize,
        width: c_uint,
        height: c_uint,
        out: *mut Image,
    ) -> c_int;
    fn gann_vpx_free(decoder: *mut c_void);
}
#[derive(Clone, Copy)]
pub enum Codec {
    Vp8,
    Vp9,
}
pub struct Decoder {
    codec: Codec,
    inner: NonNull<c_void>,
    width: usize,
    height: usize,
}
pub struct Frame<'a> {
    image: Image,
    height: usize,
    _owner: std::marker::PhantomData<&'a mut Decoder>,
}
impl Decoder {
    pub fn new(codec: Codec, width: usize, height: usize) -> Result<Self, String> {
        if width == 0 || height == 0 || width > 8192 || height > 8192 || width * height > 4_194_304
        {
            return Err("native VPX dimensions".into());
        }
        let inner = NonNull::new(unsafe { gann_vpx_new(matches!(codec, Codec::Vp9).into()) })
            .ok_or("native VPX initialization")?;
        Ok(Self {
            codec,
            inner,
            width,
            height,
        })
    }
    pub fn decode(&mut self, data: &[u8]) -> Result<Frame<'_>, String> {
        if data.is_empty() || data.len() > 64 * 1024 * 1024 {
            return Err("native VPX packet budget".into());
        }
        let normalized;
        let data = match self.codec {
            Codec::Vp8 => {
                header::vp8(data, self.width, self.height)?;
                data
            }
            Codec::Vp9 => {
                normalized = header::vp9(data, self.width, self.height)?;
                &normalized
            }
        };
        let mut image = Image {
            planes: [std::ptr::null(); 3],
            strides: [0; 3],
        };
        let code = unsafe {
            gann_vpx_decode(
                self.inner.as_ptr(),
                data.as_ptr(),
                data.len(),
                self.width as u32,
                self.height as u32,
                &mut image,
            )
        };
        if code != 0 {
            return Err(format!("native VPX decode rejected: {code}"));
        }
        Ok(Frame {
            image,
            height: self.height,
            _owner: std::marker::PhantomData,
        })
    }
}
impl Drop for Decoder {
    fn drop(&mut self) {
        unsafe {
            gann_vpx_free(self.inner.as_ptr());
        }
    }
}
impl Frame<'_> {
    pub fn stride(&self, n: usize) -> usize {
        self.image.strides[n]
    }
    pub fn plane(&self, n: usize) -> &[u8] {
        let rows = if n == 0 {
            self.height
        } else {
            self.height.div_ceil(2)
        };
        // libvpx owns the verified I420 planes until the next decode. Frame's
        // exclusive borrow prevents decoding or destroying its owner meanwhile.
        unsafe { std::slice::from_raw_parts(self.image.planes[n], rows * self.image.strides[n]) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_dimensions_and_malformed_packets_fail_closed() {
        for (w, h) in [(0, 16), (16, 0), (8193, 16), (4096, 4096)] {
            assert!(Decoder::new(Codec::Vp8, w, h).is_err());
        }
        let mut decoder = Decoder::new(Codec::Vp8, 16, 16).unwrap();
        assert!(decoder.decode(&[]).is_err());
        assert!(decoder.decode(b"invalid compressed frame").is_err());
    }
    #[test]
    fn unindexed_vp9_cannot_decode_a_trailing_resize_frame() {
        let first = include_bytes!("../tests/fixtures/vp9-16.bin");
        let second = include_bytes!("../tests/fixtures/vp9-32.bin");
        let mut packet = first.to_vec();
        packet.extend(second);
        let mut decoder = Decoder::new(Codec::Vp9, 16, 16).unwrap();
        assert!(decoder.decode(&packet).is_ok());
        assert!(decoder.decode(second).is_err());
    }
}
