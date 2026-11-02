pub(super) fn row(y: &[u8], u: &[u8], v: &[u8], alpha: Option<&[u8]>, output: &mut [u8]) {
    let width = output.len() / 4;
    #[cfg(target_arch = "x86_64")]
    let tail = {
        let end = width / 4 * 4;
        for x in (0..end).step_by(4) {
            let a = alpha.map_or([255; 4], |a| a[x..x + 4].try_into().unwrap());
            // SSE2 is part of the x64 ABI; all inputs and the output have fixed bounds.
            let pixels = unsafe {
                four(
                    y[x..x + 4].try_into().unwrap(),
                    u[x / 2..x / 2 + 2].try_into().unwrap(),
                    v[x / 2..x / 2 + 2].try_into().unwrap(),
                    a,
                )
            };
            output[x * 4..x * 4 + 16].copy_from_slice(&pixels);
        }
        end
    };
    #[cfg(not(target_arch = "x86_64"))]
    let tail = 0;
    for x in tail..width {
        let yy = i32::from(y[x]) - 16;
        let uu = i32::from(u[x / 2]) - 128;
        let vv = i32::from(v[x / 2]) - 128;
        let a = alpha.map_or(255, |a| a[x]);
        let premultiply = |c: i32| (((c.clamp(0, 255) * i32::from(a)) + 127) / 255) as u8;
        output[x * 4..x * 4 + 4].copy_from_slice(&[
            premultiply((298 * yy + 516 * uu + 128) >> 8),
            premultiply((298 * yy - 100 * uu - 208 * vv + 128) >> 8),
            premultiply((298 * yy + 409 * vv + 128) >> 8),
            a,
        ]);
    }
}

#[cfg(target_arch = "x86_64")]
#[inline]
unsafe fn four(y: [u8; 4], u: [u8; 2], v: [u8; 2], alpha: [u8; 4]) -> [u8; 16] {
    use std::arch::x86_64::*;
    let zero = _mm_setzero_si128();
    let yy = _mm_sub_epi16(
        _mm_unpacklo_epi8(_mm_cvtsi32_si128(i32::from_ne_bytes(y)), zero),
        _mm_set1_epi16(16),
    );
    let chroma = |c: [u8; 2]| {
        let a = i16::from(c[0]) - 128;
        let b = i16::from(c[1]) - 128;
        _mm_setr_epi16(a, a, b, b, 0, 0, 0, 0)
    };
    let (uu, vv) = (chroma(u), chroma(v));
    let multiply =
        |c, coefficient| _mm_madd_epi16(_mm_unpacklo_epi16(c, zero), _mm_set1_epi32(coefficient));
    let base = _mm_add_epi32(multiply(yy, 298), _mm_set1_epi32(128));
    let b = _mm_srai_epi32::<8>(_mm_add_epi32(base, multiply(uu, 516)));
    let g = _mm_srai_epi32::<8>(_mm_sub_epi32(
        _mm_sub_epi32(base, multiply(uu, 100)),
        multiply(vv, 208),
    ));
    let r = _mm_srai_epi32::<8>(_mm_add_epi32(base, multiply(vv, 409)));
    let a = _mm_unpacklo_epi8(_mm_cvtsi32_si128(i32::from_ne_bytes(alpha)), zero);
    let premultiply = |c| {
        let c = _mm_min_epi16(
            _mm_max_epi16(_mm_packs_epi32(c, c), zero),
            _mm_set1_epi16(255),
        );
        let x = _mm_add_epi16(_mm_mullo_epi16(c, a), _mm_set1_epi16(127));
        // floor(x / 255), exactly, for x <= 255 * 255 + 127.
        let divided = _mm_srli_epi16::<8>(_mm_add_epi16(
            _mm_add_epi16(x, _mm_set1_epi16(1)),
            _mm_srli_epi16::<8>(x),
        ));
        _mm_packus_epi16(divided, divided)
    };
    let bg = _mm_unpacklo_epi8(premultiply(b), premultiply(g));
    let ra = _mm_unpacklo_epi8(premultiply(r), _mm_packus_epi16(a, a));
    let mut output = [0; 16];
    _mm_storeu_si128(output.as_mut_ptr().cast(), _mm_unpacklo_epi16(bg, ra));
    output
}

#[cfg(test)]
mod tests {
    use super::row;

    fn reference(y: &[u8], u: &[u8], v: &[u8], a: Option<&[u8]>) -> Vec<u8> {
        y.iter()
            .enumerate()
            .flat_map(|(x, &y)| {
                let y = i32::from(y) - 16;
                let u = i32::from(u[x / 2]) - 128;
                let v = i32::from(v[x / 2]) - 128;
                let a = a.map_or(255, |a| a[x]);
                [
                    298 * y + 516 * u,
                    298 * y - 100 * u - 208 * v,
                    298 * y + 409 * v,
                ]
                .map(|c| ((((c + 128) >> 8).clamp(0, 255) * i32::from(a) + 127) / 255) as u8)
                .into_iter()
                .chain([a])
            })
            .collect()
    }

    #[test]
    fn packed_rows_match_original_for_odd_widths_and_absent_alpha() {
        let mut state = 0x7f4a7c15_u32;
        for width in 0_usize..=67 {
            for _ in 0..128 {
                let mut bytes = |n| {
                    (0..n)
                        .map(|_| {
                            state = state.wrapping_mul(1664525).wrapping_add(1013904223);
                            (state >> 24) as u8
                        })
                        .collect::<Vec<_>>()
                };
                let y = bytes(width);
                let u = bytes(width.div_ceil(2));
                let v = bytes(width.div_ceil(2));
                let alpha = bytes(width);
                for a in [Some(alpha.as_slice()), None] {
                    let mut output = vec![0; width * 4];
                    row(&y, &u, &v, a, &mut output);
                    assert_eq!(output, reference(&y, &u, &v, a), "width={width}");
                }
            }
        }
    }

    #[test]
    fn packed_rows_preserve_every_gray_alpha_product_and_clamp_extremes() {
        for alpha in 0..=255 {
            let y: Vec<_> = (0..=255).collect();
            let a = vec![alpha; y.len()];
            for (u, v) in [(0, 0), (0, 255), (255, 0), (255, 255), (128, 128)] {
                let u = vec![u; 128];
                let v = vec![v; 128];
                let mut output = vec![0; y.len() * 4];
                row(&y, &u, &v, Some(&a), &mut output);
                assert_eq!(output, reference(&y, &u, &v, Some(&a)));
                assert!(output
                    .chunks_exact(4)
                    .all(|p| p[..3].iter().all(|c| *c <= p[3])));
            }
        }
    }
}
