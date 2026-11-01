//! Bounded native demuxing of the verified, silent GANN WebM snapshot.

use std::ops::Range;

#[derive(Clone, Copy, Debug)]
pub(crate) enum Codec {
    Vp8,
    Vp9,
}
#[derive(Debug)]
pub(crate) struct Frame {
    pub pts_us: u64,
    pub color: Range<usize>,
    pub alpha: Option<Range<usize>>,
}
#[derive(Debug)]
pub(crate) struct Video {
    pub codec: Codec,
    pub width: usize,
    pub height: usize,
    pub duration_us: u64,
    pub frames: Vec<Frame>,
}
fn require(ok: bool, why: &str) -> Result<(), String> {
    if ok {
        Ok(())
    } else {
        Err(format!("GANN WebM: {why}"))
    }
}
fn vint(data: &[u8], id: bool) -> Result<(u64, usize, bool), String> {
    let first = *data.first().ok_or("GANN WebM: truncated integer")?;
    let n = first.leading_zeros() as usize + 1;
    require(
        n <= if id { 4 } else { 8 } && data.len() >= n,
        "integer width",
    )?;
    let mut value = u64::from(if id {
        first
    } else if n == 8 {
        0
    } else {
        first & (0xff >> n)
    });
    for b in &data[1..n] {
        value = (value << 8) | u64::from(*b);
    }
    Ok((value, n, !id && value == (1u64 << (7 * n)) - 1))
}
fn elements(mut data: &[u8]) -> Result<Vec<(u64, &[u8])>, String> {
    let mut result = Vec::new();
    while !data.is_empty() {
        require(result.len() < 65536, "element count")?;
        let (id, n, _) = vint(data, true)?;
        data = &data[n..];
        let (size, n, unknown) = vint(data, false)?;
        data = &data[n..];
        require(!unknown || id == 0x18538067, "unbounded nested element")?;
        let size = if unknown {
            data.len()
        } else {
            usize::try_from(size).map_err(|_| "GANN WebM: size")?
        };
        require(size <= data.len(), "truncated element")?;
        result.push((id, &data[..size]));
        data = &data[size..];
    }
    Ok(result)
}
fn one<'a>(
    entries: &[(u64, &'a [u8])],
    id: u64,
    optional: bool,
) -> Result<Option<&'a [u8]>, String> {
    let mut matches = entries.iter().filter(|(key, _)| *key == id);
    let value = matches.next().map(|(_, v)| *v);
    require(
        matches.next().is_none() && (optional || value.is_some()),
        "missing/duplicate field",
    )?;
    Ok(value)
}
fn field<'a>(entries: &[(u64, &'a [u8])], id: u64) -> Result<&'a [u8], String> {
    one(entries, id, false)?.ok_or("GANN WebM: field".into())
}
fn uint(data: &[u8]) -> Result<u64, String> {
    require(!data.is_empty() && data.len() <= 8, "unsigned integer")?;
    Ok(data.iter().fold(0, |n, b| (n << 8) | u64::from(*b)))
}
pub(crate) fn parse(bytes: &[u8]) -> Result<Video, String> {
    require(bytes.len() <= 64 * 1024 * 1024, "container budget")?;
    let top = elements(bytes)?;
    let header = elements(field(&top, 0x1a45dfa3)?)?;
    require(field(&header, 0x4282)? == b"webm", "document type")?;
    let segment = elements(field(&top, 0x18538067)?)?;
    let info = elements(field(&segment, 0x1549a966)?)?;
    let scale = one(&info, 0x2ad7b1, true)?
        .map(uint)
        .transpose()?
        .unwrap_or(1_000_000);
    require(scale > 0 && scale <= 1_000_000_000, "timecode scale")?;
    let duration = field(&info, 0x4489)?;
    let ticks = match duration.len() {
        4 => f32::from_be_bytes(duration.try_into().unwrap()) as f64,
        8 => f64::from_be_bytes(duration.try_into().unwrap()),
        _ => return Err("GANN WebM: duration encoding".into()),
    };
    let duration_us = ticks * scale as f64 / 1000.;
    require(
        duration_us.is_finite() && duration_us > 0. && duration_us <= 30_000_000.,
        "duration budget",
    )?;
    let tracks = elements(field(&segment, 0x1654ae6b)?)?;
    let track = elements(field(&tracks, 0xae)?)?;
    require(
        uint(field(&track, 0x83)?)? == 1,
        "silent video track required",
    )?;
    let number = uint(field(&track, 0xd7)?)?;
    require(number > 0, "track number")?;
    let codec = match field(&track, 0x86)? {
        b"V_VP8" => Codec::Vp8,
        b"V_VP9" => Codec::Vp9,
        _ => return Err("GANN WebM: unsupported codec".into()),
    };
    let video = elements(field(&track, 0xe0)?)?;
    let width = usize::try_from(uint(field(&video, 0xb0)?)?).map_err(|_| "width")?;
    let height = usize::try_from(uint(field(&video, 0xba)?)?).map_err(|_| "height")?;
    require(
        width > 0
            && height > 0
            && width <= 8192
            && height <= 8192
            && width.checked_mul(height).is_some_and(|n| n <= 4_194_304),
        "decoded frame budget",
    )?;
    let has_alpha = one(&video, 0x53c0, true)?
        .map(uint)
        .transpose()?
        .unwrap_or(0)
        == 1;
    let range = |part: &[u8]| {
        let start = part.as_ptr() as usize - bytes.as_ptr() as usize;
        start..start + part.len()
    };
    let mut frames: Vec<Frame> = Vec::new();
    let mut first_key = false;
    for (_, cluster) in segment.iter().filter(|(id, _)| *id == 0x1f43b675) {
        let children = elements(cluster)?;
        let base = uint(field(&children, 0xe7)?)?;
        for (id, data) in children.iter().filter(|(id, _)| *id == 0xa3 || *id == 0xa0) {
            let group = if *id == 0xa0 {
                elements(data)?
            } else {
                Vec::new()
            };
            let block = if *id == 0xa3 {
                *data
            } else {
                field(&group, 0xa1)?
            };
            let (track, n, _) = vint(block, false)?;
            require(
                track == number && block.len() > n + 3 && block[n + 2] & 6 == 0,
                "track or lacing",
            )?;
            let relative = i16::from_be_bytes([block[n], block[n + 1]]);
            let ticks = i128::from(base) + i128::from(relative);
            require(ticks >= 0, "negative timestamp")?;
            let time = ticks as f64 * scale as f64 / 1000.;
            require(
                time < duration_us && time <= u64::MAX as f64,
                "timestamp range",
            )?;
            let pts_us = time.round() as u64;
            require(
                frames.last().is_none_or(|f| pts_us > f.pts_us),
                "timestamp order",
            )?;
            if frames.is_empty() {
                first_key = if *id == 0xa3 {
                    block[n + 2] & 128 != 0
                } else {
                    one(&group, 0xfb, true)?.is_none()
                };
            }
            let mut alpha = None;
            if let Some(additions) = one(&group, 0x75a1, true)? {
                for (_, extra) in elements(additions)?.iter().filter(|(id, _)| *id == 0xa6) {
                    let more = elements(extra)?;
                    if one(&more, 0xee, true)?.map(uint).transpose()?.unwrap_or(1) == 1 {
                        require(alpha.is_none(), "duplicate alpha")?;
                        let payload = field(&more, 0xa5)?;
                        require(!payload.is_empty(), "empty alpha")?;
                        alpha = Some(range(payload));
                    }
                }
            }
            require(!has_alpha || alpha.is_some(), "missing alpha")?;
            require(frames.len() < 10_000, "frame count")?;
            frames.push(Frame {
                pts_us,
                color: range(&block[n + 3..]),
                alpha,
            });
        }
    }
    require(
        first_key && frames.first().is_some_and(|f| f.pts_us == 0),
        "first frame",
    )?;
    Ok(Video {
        codec,
        width,
        height,
        duration_us: duration_us.round() as u64,
        frames,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn element(id: &[u8], data: &[u8]) -> Vec<u8> {
        assert!(data.len() < 16384);
        let mut out = id.to_vec();
        out.extend_from_slice(&(0x4000u16 | data.len() as u16).to_be_bytes());
        out.extend_from_slice(data);
        out
    }
    fn fixture(times: &[i16], alpha: bool) -> Vec<u8> {
        let mut track = element(&[0xd7], &[1]);
        track.extend(element(&[0x83], &[1]));
        track.extend(element(&[0x86], b"V_VP8"));
        let mut video = element(&[0xb0], &[2]);
        video.extend(element(&[0xba], &[2]));
        if alpha {
            video.extend(element(&[0x53, 0xc0], &[1]));
        }
        track.extend(element(&[0xe0], &video));
        let mut info = element(&[0x44, 0x89], &50f64.to_be_bytes());
        info.extend(element(&[0x2a, 0xd7, 0xb1], &[0x0f, 0x42, 0x40]));
        let mut segment = element(&[0x15, 0x49, 0xa9, 0x66], &info);
        segment.extend(element(
            &[0x16, 0x54, 0xae, 0x6b],
            &element(&[0xae], &track),
        ));
        let mut cluster = element(&[0xe7], &[0]);
        for time in times {
            let mut block = vec![0x81];
            block.extend(time.to_be_bytes());
            block.extend([0x80, 0x11, 0x22]);
            cluster.extend(element(&[0xa3], &block));
        }
        segment.extend(element(&[0x1f, 0x43, 0xb6, 0x75], &cluster));
        let mut out = element(&[0x1a, 0x45, 0xdf, 0xa3], &element(&[0x42, 0x82], b"webm"));
        out.extend(element(&[0x18, 0x53, 0x80, 0x67], &segment));
        out
    }
    #[test]
    fn retains_original_frame_order_pts_and_authored_duration() {
        let bytes = fixture(&[0, 17, 33], false);
        let video = parse(&bytes).unwrap();
        assert_eq!((video.width, video.height), (2, 2));
        assert_eq!(video.duration_us, 50_000);
        assert_eq!(
            video.frames.iter().map(|f| f.pts_us).collect::<Vec<_>>(),
            [0, 17_000, 33_000]
        );
        assert_eq!(&bytes[video.frames[1].color.clone()], &[0x11, 0x22]);
    }
    #[test]
    fn rejects_duplicate_reversed_out_of_duration_pts_and_missing_alpha() {
        for times in [&[0, 0][..], &[0, 33, 17], &[0, 50], &[-1, 17], &[17, 33]] {
            assert!(parse(&fixture(times, false)).is_err());
        }
        assert!(parse(&fixture(&[0, 17], true)).is_err());
    }
    #[test]
    fn truncated_or_unbounded_nested_data_is_rejected_without_panic() {
        let bytes = fixture(&[0, 17], false);
        for n in 0..bytes.len() {
            assert!(parse(&bytes[..n]).is_err());
        }
        assert!(parse(&[0x1a, 0x45, 0xdf, 0xa3, 0xff]).is_err());
    }
}
