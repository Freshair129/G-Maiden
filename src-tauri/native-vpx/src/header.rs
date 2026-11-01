struct Bits<'a> {
    data: &'a [u8],
    at: usize,
}
impl Bits<'_> {
    fn read(&mut self, n: usize) -> Result<u32, String> {
        let mut value = 0;
        for _ in 0..n {
            let byte = *self.data.get(self.at / 8).ok_or("truncated VP9 header")?;
            value = (value << 1) | u32::from((byte >> (7 - self.at % 8)) & 1);
            self.at += 1;
        }
        Ok(value)
    }
    fn sync(&mut self) -> Result<(), String> {
        if self.read(24)? == 0x498342 {
            Ok(())
        } else {
            Err("VP9 sync code".into())
        }
    }
    fn size(&mut self, w: usize, h: usize) -> Result<(), String> {
        if self.read(16)? as usize + 1 != w || self.read(16)? as usize + 1 != h {
            return Err("VP9 encoded dimensions differ from GANN track".into());
        }
        Ok(())
    }
    fn render_size(&mut self) -> Result<(), String> {
        if self.read(1)? != 0 {
            self.read(16)?;
            self.read(16)?;
        }
        Ok(())
    }
}
pub(crate) fn vp8(data: &[u8], w: usize, h: usize) -> Result<(), String> {
    if data.len() < 3 {
        return Err("truncated VP8 header".into());
    }
    if data[0] & 1 == 0 {
        if data.len() < 10 || data[3..6] != [0x9d, 0x01, 0x2a] {
            return Err("VP8 keyframe header".into());
        }
        let width = usize::from(u16::from_le_bytes([data[6], data[7]]) & 0x3fff);
        let height = usize::from(u16::from_le_bytes([data[8], data[9]]) & 0x3fff);
        if width != w || height != h {
            return Err("VP8 encoded dimensions differ from GANN track".into());
        }
    }
    Ok(())
}
fn vp9_header(data: &[u8], w: usize, h: usize) -> Result<(), String> {
    let mut bits = Bits { data, at: 0 };
    if bits.read(2)? != 2 {
        return Err("VP9 frame marker".into());
    }
    let profile = bits.read(1)? + 2 * bits.read(1)?;
    if profile != 0 {
        return Err("GANN native VP9 requires 8-bit I420 profile0".into());
    }
    if bits.read(1)? != 0 {
        bits.read(3)?;
        return Ok(());
    }
    let key = bits.read(1)? == 0;
    let shown = bits.read(1)? != 0;
    let resilient = bits.read(1)? != 0;
    if key {
        bits.sync()?;
        if bits.read(3)? == 7 {
            return Err("VP9 profile0 RGB color space".into());
        }
        bits.read(1)?;
        bits.size(w, h)?;
    } else {
        let intra_only = !shown && bits.read(1)? != 0;
        if !resilient {
            bits.read(2)?;
        }
        if intra_only {
            bits.sync()?;
            bits.read(8)?;
            bits.size(w, h)?;
        } else {
            bits.read(8)?;
            for _ in 0..3 {
                bits.read(3)?;
                bits.read(1)?;
            }
            let mut inherited = false;
            for _ in 0..3 {
                if bits.read(1)? != 0 {
                    inherited = true;
                    break;
                }
            }
            // Every reference was decoded through this fixed-size guard. Invalid
            // or absent references are rejected by libvpx, before using a size.
            if !inherited {
                bits.size(w, h)?;
            }
        }
    }
    bits.render_size()
}
pub(crate) fn vp9(data: &[u8], w: usize, h: usize) -> Result<Vec<u8>, String> {
    let marker = *data.last().ok_or("empty VP9 packet")?;
    if marker & 0xe0 == 0xc0 {
        let count = (marker as usize & 7) + 1;
        let magnitude = ((marker as usize >> 3) & 3) + 1;
        let index = 2 + count * magnitude;
        if data.len() >= index && data[data.len() - index] == marker {
            let mut at = 0usize;
            for size in data[data.len() - index + 1..data.len() - 1].chunks_exact(magnitude) {
                let len = size
                    .iter()
                    .rev()
                    .fold(0usize, |n, b| (n << 8) | usize::from(*b));
                let end = at.checked_add(len).ok_or("VP9 frame size overflow")?;
                if len == 0 || end > data.len() - index {
                    return Err("VP9 superframe bounds".into());
                }
                vp9_header(&data[at..end], w, h)?;
                at = end;
            }
            if at != data.len() - index {
                return Err("VP9 superframe payload coverage".into());
            }
            return Ok(data.to_vec());
        }
        return Err("malformed VP9 superframe index".into());
    }
    vp9_header(data, w, h)?;
    // Without an index libvpx otherwise loops through concatenated frames whose
    // boundaries are discovered only during decoding. A one-entry index forces
    // exactly one decode_one call; trailing bytes can never request another size.
    let len = u32::try_from(data.len()).map_err(|_| "VP9 packet length")?;
    let mut out = data.to_vec();
    out.push(0xd8);
    out.extend(len.to_le_bytes());
    out.push(0xd8);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn bits(fields: &[(u32, usize)]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut count = 0;
        for &(v, n) in fields {
            for bit in (0..n).rev() {
                if count % 8 == 0 {
                    out.push(0);
                }
                let last = out.last_mut().unwrap();
                *last |= (((v >> bit) & 1) as u8) << (7 - count % 8);
                count += 1;
            }
        }
        out
    }
    fn key(w: u32, h: u32) -> Vec<u8> {
        bits(&[
            (2, 2),
            (0, 2),
            (0, 1),
            (0, 1),
            (1, 1),
            (0, 1),
            (0x498342, 24),
            (1, 3),
            (0, 1),
            (w - 1, 16),
            (h - 1, 16),
            (0, 1),
        ])
    }
    #[test]
    fn rejects_encoded_sizes_before_decode_including_later_superframe_members() {
        assert!(vp9(&key(16, 16), 16, 16).is_ok());
        assert!(vp9(&key(65536, 65536), 16, 16).is_err());
        let a = key(16, 16);
        let b = key(32, 32);
        let mut packet = a.clone();
        packet.extend(&b);
        packet.extend([0xc1, a.len() as u8, b.len() as u8, 0xc1]);
        assert!(vp9(&packet, 16, 16).is_err());
    }
    #[test]
    fn unindexed_packets_are_forced_to_exactly_one_decode() {
        let original = key(16, 16);
        let mut packet = original.clone();
        packet.extend(key(65536, 65536));
        let wrapped = vp9(&packet, 16, 16).unwrap();
        assert_eq!(&wrapped[..packet.len()], packet);
        assert_eq!(wrapped[packet.len()], 0xd8);
        assert_eq!(wrapped.last(), Some(&0xd8));
        assert_eq!(
            u32::from_le_bytes(
                wrapped[packet.len() + 1..packet.len() + 5]
                    .try_into()
                    .unwrap()
            ) as usize,
            packet.len()
        );
    }
    #[test]
    fn truncated_and_hidden_resize_headers_are_rejected() {
        let k = key(16, 16);
        for n in 0..k.len() - 1 {
            assert!(vp9(&k[..n], 16, 16).is_err());
        }
        let hidden = bits(&[
            (2, 2),
            (0, 2),
            (0, 1),
            (1, 1),
            (0, 1),
            (0, 1),
            (1, 1),
            (0, 2),
            (0x498342, 24),
            (255, 8),
            (31, 16),
            (31, 16),
            (0, 1),
        ]);
        assert!(vp9(&hidden, 16, 16).is_err());
    }
    #[test]
    fn vp8_keyframe_size_is_checked_before_decode() {
        let mut frame = vec![0, 0, 0, 0x9d, 0x01, 0x2a, 16, 0, 16, 0];
        assert!(vp8(&frame, 16, 16).is_ok());
        frame[6] = 32;
        assert!(vp8(&frame, 16, 16).is_err());
    }
    #[test]
    fn malformed_superframe_index_and_interframe_resizing_are_rejected() {
        let mut malformed = key(16, 16);
        malformed.push(0xc0);
        assert!(vp9(&malformed, 16, 16).is_err());
        let mut prefix = vec![
            (2, 2),
            (0, 2),
            (0, 1),
            (1, 1),
            (1, 1),
            (0, 1),
            (0, 2),
            (255, 8),
        ];
        for _ in 0..3 {
            prefix.extend([(0, 3), (0, 1)]);
        }
        let mut inherited = prefix.clone();
        inherited.extend([(1, 1), (0, 1)]);
        assert!(vp9(&bits(&inherited), 16, 16).is_ok());
        let mut resized = prefix;
        resized.extend([(0, 1), (0, 1), (0, 1), (31, 16), (31, 16), (0, 1)]);
        assert!(vp9(&bits(&resized), 16, 16).is_err());
    }
}
