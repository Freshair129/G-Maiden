//! G-Sensory cosmetic waveform metadata; never opens an audio output device.
//! At most 30 decoded seconds, 600 frames and 38,400 bins. The cooperative two
//! second processing deadline can leave cosmetics blank under resource pressure;
//! it does not preempt filesystem/codec calls or participate in audio readiness.

use rodio::Source;
use serde::Serialize;
use std::f32::consts::TAU;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const INTERVAL_MS: u32 = 50;
const FFT_SIZE: usize = 128;
const BINS: usize = FFT_SIZE / 2;
const MAX_FRAMES: usize = 600;
const MAX_FILE_BYTES: u64 = 96 * 1024 * 1024;
static ANALYSIS_SLOT: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize)]
pub struct Waveform {
    pub interval_ms: u32,
    pub duration_ms: u32,
    pub frames: Vec<Vec<u8>>,
}

/// Call on a blocking worker, separate from g-audio and the CV path. Concurrent
/// callers fail promptly rather than queueing decoders or retaining file buffers.
pub fn read_audio_waveform(path: &str) -> Result<Waveform, String> {
    with_analysis_slot(&ANALYSIS_SLOT, || {
        decode_reader(crate::audio::open_clip_for_analysis(path)?)
    })
}

fn analyze_samples(
    mut samples: impl Iterator<Item = f32>,
    channels: u16,
    rate: u32,
) -> Result<Waveform, String> {
    if !(1..=8).contains(&channels) || !(8_000..=192_000).contains(&rate) {
        return Err("waveform: unsupported channel count or sample rate".into());
    }
    let started = Instant::now();
    let mut ring = [0.0; FFT_SIZE];
    let mut cursor = 0;
    let mut mono_count = 0_u32;
    let mut frames = Vec::new();
    let mut spectrum = Spectrum::new();
    let mut ended = false;
    while frames.len() < MAX_FRAMES && !ended {
        // Integer boundaries prevent duration drift for rates such as 11025Hz.
        let boundary = (frames.len() as u32 + 1) * rate / (1_000 / INTERVAL_MS);
        let before = mono_count;
        while mono_count < boundary {
            let mut mono = 0.0;
            for channel in 0..channels {
                let Some(sample) = samples.next() else {
                    if channel != 0 {
                        return Err("waveform: incomplete channel frame".into());
                    }
                    ended = true;
                    break;
                };
                if !sample.is_finite() {
                    return Err("waveform: nonfinite sample".into());
                }
                mono += sample.clamp(-1.0, 1.0) / f32::from(channels);
            }
            if ended {
                break;
            }
            ring[cursor] = mono;
            cursor = (cursor + 1) % FFT_SIZE;
            mono_count += 1;
        }
        if started.elapsed() > Duration::from_secs(2) {
            return Err("waveform: analysis time budget exceeded".into());
        }
        if mono_count > before {
            frames.push(spectrum.frame(&ring, cursor));
        }
    }
    if mono_count == 0 {
        return Err("waveform: no decoded audio frames".into());
    }
    Ok(Waveform {
        interval_ms: INTERVAL_MS,
        duration_ms: (u64::from(mono_count) * 1_000).div_ceil(u64::from(rate)) as u32,
        frames,
    })
}

fn decode_reader(mut reader: impl Read + Seek + Send + Sync + 'static) -> Result<Waveform, String> {
    validate_container(&mut reader)?;
    let source = rodio::Decoder::new(BufReader::new(reader))
        .map_err(|error| format!("waveform: decode failed: {error}"))?;
    let channels = source.channels();
    let rate = source.sample_rate();
    // rodio's MP3 iterator can turn individual codec errors into EOF. This is
    // bounded cosmetic metadata, not an assertion of full MP3 stream integrity.
    analyze_samples(source.convert_samples::<f32>(), channels, rate)
}

fn with_analysis_slot<T>(
    slot: &Mutex<()>,
    work: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let _guard = slot
        .try_lock()
        .map_err(|_| "waveform: analyzer busy".to_string())?;
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(work))
        .map_err(|_| "waveform: decoder failed".to_string())?
}

fn validate_container(reader: &mut (impl Read + Seek)) -> Result<(), String> {
    let checked = (|| -> std::io::Result<()> {
        let length = reader.seek(SeekFrom::End(0))?;
        if length == 0 || length > MAX_FILE_BYTES {
            return Err(std::io::Error::other("invalid clip size"));
        }
        reader.seek(SeekFrom::Start(0))?;
        let mut header = [0; 12];
        reader.read_exact(&mut header)?;
        if &header[..4] == b"RIFF" && &header[8..] == b"WAVE" {
            let end = u64::from(u32::from_le_bytes(header[4..8].try_into().unwrap())) + 8;
            if end > length {
                return Err(std::io::Error::other("truncated WAV"));
            }
            let mut position = 12_u64;
            let mut found_data = false;
            // Bound malformed containers with very many tiny chunks too.
            for _ in 0..1_024 {
                if position + 8 > end {
                    break;
                }
                reader.seek(SeekFrom::Start(position))?;
                let mut chunk = [0; 8];
                reader.read_exact(&mut chunk)?;
                let size = u64::from(u32::from_le_bytes(chunk[4..].try_into().unwrap()));
                let chunk_end = position + 8 + size;
                if chunk_end > end {
                    return Err(std::io::Error::other("truncated WAV chunk"));
                }
                if &chunk[..4] == b"data" {
                    if size == 0 {
                        return Err(std::io::Error::other("empty WAV"));
                    }
                    found_data = true;
                }
                position = chunk_end + size % 2;
            }
            if !found_data || position < end {
                return Err(std::io::Error::other("invalid WAV chunks"));
            }
        }
        reader.seek(SeekFrom::Start(0))?;
        Ok(())
    })();
    checked.map_err(|error| format!("waveform: invalid container: {error}"))
}

struct Spectrum {
    window: [f32; FFT_SIZE],
    twiddle: [(f32, f32); BINS],
    smoothed: [f32; BINS],
}

impl Spectrum {
    fn new() -> Self {
        Self {
            window: std::array::from_fn(|i| {
                let phase = TAU * i as f32 / FFT_SIZE as f32;
                0.42 - 0.5 * phase.cos() + 0.08 * (2.0 * phase).cos()
            }),
            twiddle: std::array::from_fn(|i| {
                let phase = -TAU * i as f32 / FFT_SIZE as f32;
                (phase.cos(), phase.sin())
            }),
            smoothed: [0.0; BINS],
        }
    }

    fn frame(&mut self, ring: &[f32; FFT_SIZE], cursor: usize) -> Vec<u8> {
        let mut re = [0.0; FFT_SIZE];
        let mut im = [0.0; FFT_SIZE];
        for i in 0..FFT_SIZE {
            let reversed = i.reverse_bits() >> (usize::BITS - FFT_SIZE.ilog2());
            re[reversed] = ring[(cursor + i) % FFT_SIZE] * self.window[i];
        }
        let mut width = 2;
        while width <= FFT_SIZE {
            for base in (0..FFT_SIZE).step_by(width) {
                for j in 0..width / 2 {
                    let a = base + j;
                    let b = a + width / 2;
                    let (wr, wi) = self.twiddle[j * FFT_SIZE / width];
                    let tr = re[b] * wr - im[b] * wi;
                    let ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
            width *= 2;
        }
        (0..BINS)
            .map(|i| {
                let magnitude = re[i].hypot(im[i]) / FFT_SIZE as f32;
                self.smoothed[i] = 0.8 * self.smoothed[i] + 0.2 * magnitude;
                let db = 20.0 * self.smoothed[i].max(1e-20).log10();
                ((db + 100.0) / 70.0 * 255.0).clamp(0.0, 255.0) as u8
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::TAU;
    use std::io::Cursor;

    fn sine(count: usize, rate: u32, frequency: f32) -> impl Iterator<Item = f32> {
        (0..count).map(move |i| (TAU * frequency * i as f32 / rate as f32).sin())
    }

    fn wav(samples: &[i16], channels: u16, rate: u32) -> Vec<u8> {
        let size = samples.len() as u32 * 2;
        let mut bytes = b"RIFF".to_vec();
        bytes.extend_from_slice(&(38 + size).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&18_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&rate.to_le_bytes());
        bytes.extend_from_slice(&(rate * u32::from(channels) * 2).to_le_bytes());
        bytes.extend_from_slice(&(channels * 2).to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(&0_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&size.to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn known_sine_has_correct_frequency_bin() {
        // Stay below the byte-spectrum ceiling so adjacent Blackman bins do not tie.
        let wave = analyze_samples(sine(8_000, 8_000, 1_000.0).map(|x| x * 0.1), 1, 8_000).unwrap();
        assert_eq!(wave.duration_ms, 1_000);
        assert_eq!(wave.frames.len(), 20);
        let last = wave.frames.last().unwrap();
        let peak = last
            .iter()
            .enumerate()
            .max_by_key(|(_, value)| **value)
            .unwrap()
            .0;
        assert_eq!(peak, 16);
        assert!(last[peak] > 200);
    }

    #[test]
    fn genuine_silence_is_valid_zero_bins() {
        let wave = analyze_samples(std::iter::repeat_n(0.0, 400), 1, 8_000).unwrap();
        assert_eq!(wave.duration_ms, 50);
        assert_eq!(wave.frames, vec![vec![0; 64]]);
    }

    #[test]
    fn stereo_downmix_and_final_partial_frame_have_true_timing() {
        let samples = (0..401).flat_map(|_| [0.5, -0.5]);
        let wave = analyze_samples(samples, 2, 8_000).unwrap();
        assert_eq!(wave.duration_ms, 51);
        assert_eq!(wave.frames, vec![vec![0; 64], vec![0; 64]]);
    }

    #[test]
    fn unknown_length_iterator_stops_at_thirty_seconds_without_lookahead() {
        let mut consumed = 0;
        let wave = analyze_samples(
            std::iter::from_fn(|| {
                consumed += 1;
                Some(0.0)
            }),
            2,
            8_000,
        )
        .unwrap();
        assert_eq!(consumed, 30 * 8_000 * 2);
        assert_eq!(wave.duration_ms, 30_000);
        assert_eq!(wave.frames.len(), 600);
        assert_eq!(wave.frames.iter().map(Vec::len).sum::<usize>(), 38_400);
    }

    #[test]
    fn maximum_rate_duration_does_not_overflow_and_odd_rate_keeps_frame_alignment() {
        let wave = analyze_samples(std::iter::repeat(0.0), 1, 192_000).unwrap();
        assert_eq!((wave.duration_ms, wave.frames.len()), (30_000, 600));
        let odd = analyze_samples(std::iter::repeat_n(0.0, 11_026), 1, 11_025).unwrap();
        assert_eq!((odd.duration_ms, odd.frames.len()), (1_001, 21));
    }

    #[test]
    fn bad_metadata_empty_partial_channels_and_nonfinite_samples_are_errors() {
        for (channels, rate) in [(0, 8_000), (9, 8_000), (1, 0), (1, 7_999), (1, 192_001)] {
            assert!(analyze_samples([0.0].into_iter(), channels, rate).is_err());
        }
        assert!(analyze_samples(std::iter::empty(), 1, 8_000).is_err());
        assert!(analyze_samples([0.0].into_iter(), 2, 8_000).is_err());
        assert!(analyze_samples([f32::NAN].into_iter(), 1, 8_000).is_err());
    }

    #[test]
    fn decoder_handles_real_pcm_without_hardware() {
        let wave = decode_reader(Cursor::new(wav(&[1_000; 401], 1, 8_000))).unwrap();
        assert_eq!((wave.duration_ms, wave.frames.len()), (51, 2));
    }

    #[test]
    fn float_pcm_decoder_and_stereo_downmix_need_no_output_stream() {
        let mut bytes = wav(&[], 2, 8_000);
        let size = 400 * 2 * 4_u32;
        bytes[4..8].copy_from_slice(&(38 + size).to_le_bytes());
        bytes[20..22].copy_from_slice(&3_u16.to_le_bytes());
        bytes[28..32].copy_from_slice(&64_000_u32.to_le_bytes());
        bytes[32..34].copy_from_slice(&8_u16.to_le_bytes());
        bytes[34..36].copy_from_slice(&32_u16.to_le_bytes());
        bytes[42..46].copy_from_slice(&size.to_le_bytes());
        for _ in 0..400 {
            bytes.extend_from_slice(&0.5_f32.to_le_bytes());
            bytes.extend_from_slice(&(-0.5_f32).to_le_bytes());
        }
        let wave = decode_reader(Cursor::new(bytes)).unwrap();
        assert_eq!(wave.duration_ms, 50);
        assert_eq!(wave.frames, vec![vec![0; 64]]);
    }

    #[test]
    fn actual_empty_46_byte_wave_and_malformed_input_are_rejected() {
        let empty = wav(&[], 1, 8_000);
        assert_eq!(empty.len(), 46);
        assert!(decode_reader(Cursor::new(empty)).is_err());
        assert!(decode_reader(Cursor::new(b"not audio".to_vec())).is_err());
        let mut truncated = wav(&[1, 2, 3], 1, 8_000);
        truncated.pop();
        assert!(decode_reader(Cursor::new(truncated)).is_err());
        let mut partial_sample = wav(&[1], 1, 8_000);
        partial_sample[42..46].copy_from_slice(&1_u32.to_le_bytes());
        assert!(decode_reader(Cursor::new(partial_sample)).is_err());
        let slot = Mutex::new(());
        assert!(with_analysis_slot(&slot, || decode_reader(Cursor::new(wav(&[1], 0, 0)))).is_err());
    }

    #[test]
    fn busy_worker_rejects_without_running_decoder_then_recovers() {
        let slot = std::sync::Mutex::new(());
        let hold = slot.lock().unwrap();
        let mut invoked = false;
        assert!(with_analysis_slot(&slot, || {
            invoked = true;
            Ok(())
        })
        .is_err());
        assert!(!invoked);
        drop(hold);
        assert!(with_analysis_slot(&slot, || Ok(())).is_ok());
    }

    #[test]
    fn decoder_panics_become_errors_without_poisoning_slot() {
        let slot = std::sync::Mutex::new(());
        assert!(with_analysis_slot::<()>(&slot, || panic!("malformed decoder")).is_err());
        assert!(with_analysis_slot(&slot, || Ok(7)).is_ok());
    }
}
