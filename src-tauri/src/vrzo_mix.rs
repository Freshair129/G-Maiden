//! Verified immutable PCM mix used by the bounded non-critical preparation worker.

pub(crate) fn hex_digest(digest: &[u8; 32]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

pub(crate) fn decode_mix(
    bytes: &[u8],
    expected_hash: &str,
    expected_samples: usize,
) -> Result<(Vec<i16>, [u8; 32]), &'static str> {
    if bytes.len() > 16 * 1024 * 1024 || bytes.len() < 44 {
        return Err("mixed_size");
    }
    let digest: [u8; 32] = ring::digest::digest(&ring::digest::SHA256, bytes)
        .as_ref()
        .try_into()
        .unwrap();
    if hex_digest(&digest) != expected_hash {
        return Err("mixed_hash");
    }
    let u32_at = |at| u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
    if &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" || u32_at(4) != bytes.len() - 8 {
        return Err("mixed_riff");
    }
    let mut at = 12usize;
    let mut format = false;
    let mut data = None;
    while at < bytes.len() {
        if at + 8 > bytes.len() {
            return Err("mixed_chunk");
        }
        let len = u32_at(at + 4);
        let start = at + 8;
        let end = start
            .checked_add(len)
            .filter(|end| *end <= bytes.len())
            .ok_or("mixed_chunk")?;
        match &bytes[at..at + 4] {
            b"fmt " => {
                if format
                    || len != 16
                    || bytes[start..end] != [1, 0, 1, 0, 128, 187, 0, 0, 0, 119, 1, 0, 2, 0, 16, 0]
                {
                    return Err("mixed_format");
                }
                format = true;
            }
            b"data" => {
                if data.is_some()
                    || len == 0
                    || len % 2 != 0
                    || len / 2 > 2 * 1024 * 1024
                    || len / 2 != expected_samples
                {
                    return Err("mixed_samples");
                }
                data = Some(&bytes[start..end]);
            }
            _ => {}
        }
        at = end
            .checked_add(len % 2)
            .filter(|at| *at <= bytes.len())
            .ok_or("mixed_padding")?;
    }
    if !format {
        return Err("mixed_format");
    }
    let samples = data
        .ok_or("mixed_data")?
        .chunks_exact(2)
        .map(|b| i16::from_le_bytes([b[0], b[1]]))
        .collect();
    Ok((samples, digest))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(samples: &[i16]) -> Vec<u8> {
        let mut b = b"RIFF".to_vec();
        b.extend_from_slice(&(36 + samples.len() as u32 * 2).to_le_bytes());
        b.extend_from_slice(b"WAVEfmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&48000u32.to_le_bytes());
        b.extend_from_slice(&96000u32.to_le_bytes());
        b.extend_from_slice(&2u16.to_le_bytes());
        b.extend_from_slice(&16u16.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&(samples.len() as u32 * 2).to_le_bytes());
        for s in samples {
            b.extend_from_slice(&s.to_le_bytes());
        }
        b
    }
    fn hash(b: &[u8]) -> String {
        ring::digest::digest(&ring::digest::SHA256, b)
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }
    #[test]
    fn mix_decodes_exact_verified_snapshot_and_preserves_silence() {
        let b = wav(&[12, 0, -13]);
        let expected = hash(&b);
        let (pcm, digest) = decode_mix(&b, &expected, 3).unwrap();
        assert_eq!(pcm, vec![12, 0, -13]);
        assert_eq!(hex_digest(&digest), expected);
    }
    #[test]
    fn mix_rejects_tamper_truncation_format_duration_and_oversize() {
        let b = wav(&[1, 2, 3]);
        assert!(decode_mix(&b, &"0".repeat(64), 3).is_err());
        for offset in [20, 22, 24, 28, 32, 34, 40] {
            let mut bad = b.clone();
            bad[offset] ^= 8;
            assert!(decode_mix(&bad, &hash(&bad), 3).is_err(), "offset {offset}");
        }
        let short = &b[..b.len() - 1];
        assert!(decode_mix(short, &hash(short), 3).is_err());
        assert!(decode_mix(&b, &hash(&b), 6).is_err());
        assert!(decode_mix(&wav(&[]), &hash(&wav(&[])), 0).is_err());
        assert!(decode_mix(&vec![0; 16 * 1024 * 1024 + 1], &"0".repeat(64), 3).is_err());
    }
}
