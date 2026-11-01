//! Sample-accurate announcer retirement; never changes the incoming source.
use rodio::Source;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

pub(super) const FADE_MS: u64 = 150;
pub(super) struct Fade<S> {
    source: S,
    requested: Arc<AtomicBool>,
    elapsed: usize,
    total: usize,
}
impl<S: Source<Item = i16>> Fade<S> {
    pub fn new(source: S, requested: Arc<AtomicBool>) -> Self {
        let total = (source.sample_rate() as usize * FADE_MS as usize / 1000).max(1)
            * source.channels() as usize;
        Self {
            source,
            requested,
            elapsed: 0,
            total,
        }
    }
}
impl<S: Source<Item = i16>> Iterator for Fade<S> {
    type Item = i16;
    fn next(&mut self) -> Option<i16> {
        if !self.requested.load(Ordering::Relaxed) {
            return self.source.next();
        }
        if self.elapsed >= self.total {
            return None;
        }
        let sample = self.source.next()?;
        let channels = self.source.channels() as usize;
        let gain = 1.0 - (self.elapsed / channels) as f64 / (self.total / channels) as f64;
        self.elapsed += 1;
        Some((sample as f64 * gain).round() as i16)
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        (0, self.source.size_hint().1)
    }
}
impl<S: Source<Item = i16>> Source for Fade<S> {
    fn current_frame_len(&self) -> Option<usize> {
        self.source.current_frame_len()
    }
    fn channels(&self) -> u16 {
        self.source.channels()
    }
    fn sample_rate(&self) -> u32 {
        self.source.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.source.total_duration()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn no_retirement_preserves_samples_rate_channels_and_duration() {
        let samples = vec![i16::MIN, 0, i16::MAX, 42];
        let source = rodio::buffer::SamplesBuffer::new(2, 48000, samples.clone());
        let duration = source.total_duration();
        let f = Fade::new(source, Arc::new(AtomicBool::new(false)));
        assert_eq!(
            (f.channels(), f.sample_rate(), f.total_duration()),
            (2, 48000, duration)
        );
        assert_eq!(f.collect::<Vec<_>>(), samples);
    }
    #[test]
    fn old_voice_fades_for_150ms_while_incoming_voice_stays_unchanged() {
        let request = Arc::new(AtomicBool::new(false));
        let mut old = Fade::new(
            rodio::buffer::SamplesBuffer::new(2, 1000, vec![10000; 2000]),
            request.clone(),
        );
        assert_eq!(old.next(), Some(10000));
        assert_eq!(old.next(), Some(10000));
        request.store(true, Ordering::Relaxed);
        let faded = old.collect::<Vec<_>>();
        assert_eq!(faded.len(), 300);
        assert_eq!(faded[0], 10000);
        assert!(faded.windows(2).all(|s| s[1] <= s[0]));
        assert!(faded.chunks_exact(2).all(|s| s[0] == s[1]));
        assert!(faded[299] < 100);
        let next = Fade::new(
            rodio::buffer::SamplesBuffer::new(1, 1000, vec![12000; 500]),
            Arc::new(AtomicBool::new(false)),
        );
        assert_eq!(next.collect::<Vec<_>>(), vec![12000; 500]);
    }
}
