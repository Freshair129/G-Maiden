//! Register the actual consumer thread, not the command/preparation thread.
use rodio::Source;
use std::sync::{
    atomic::{AtomicI8, AtomicU64, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
#[path = "audio_consumption.rs"]
mod consumption;

#[derive(Default)]
pub(super) struct Stats {
    pub max_gap_us: AtomicU64,
    pub gaps_over_50ms: AtomicU64,
    // 0 = no samples consumed; 1 = registered; -1 = registration unavailable.
    pub mmcss: AtomicI8,
}

#[cfg(windows)]
struct AudioTask(Option<windows::Win32::Foundation::HANDLE>);
#[cfg(windows)]
impl AudioTask {
    fn register() -> Self {
        let mut index = 0;
        Self(unsafe {
            windows::Win32::System::Threading::AvSetMmThreadCharacteristicsW(
                windows::core::w!("Audio"),
                &mut index,
            )
            .ok()
        })
    }
}
#[cfg(windows)]
impl Drop for AudioTask {
    fn drop(&mut self) {
        if let Some(handle) = self.0 {
            let _ = unsafe {
                windows::Win32::System::Threading::AvRevertMmThreadCharacteristics(handle)
            };
        }
    }
}
fn register_consumer() -> bool {
    #[cfg(windows)]
    {
        thread_local! { static TASK: AudioTask = AudioTask::register(); }
        TASK.with(|task| task.0.is_some())
    }
    #[cfg(not(windows))]
    {
        false
    }
}

pub(super) struct RenderSource<S> {
    source: S,
    stats: Arc<Stats>,
    timing: consumption::Timing,
    start: Option<Instant>,
    stride: usize,
    remaining: usize,
}
impl<S: Source<Item = i16>> RenderSource<S> {
    pub fn new(source: S, stats: Arc<Stats>) -> Self {
        let stride = (source.sample_rate() as usize * source.channels() as usize / 200).max(1);
        Self {
            source,
            stats,
            timing: consumption::Timing::default(),
            start: None,
            stride,
            remaining: 0,
        }
    }
}
impl<S: Source<Item = i16>> Iterator for RenderSource<S> {
    type Item = i16;
    fn next(&mut self) -> Option<i16> {
        let sample = self.source.next()?;
        if self.remaining == 0 {
            let start = *self.start.get_or_insert_with(|| {
                self.stats
                    .mmcss
                    .store(if register_consumer() { 1 } else { -1 }, Ordering::Relaxed);
                Instant::now()
            });
            self.timing.observe(start.elapsed().as_micros() as u64);
            self.stats
                .max_gap_us
                .store(self.timing.max_gap_us, Ordering::Relaxed);
            self.stats
                .gaps_over_50ms
                .store(self.timing.gaps_over_50ms, Ordering::Relaxed);
            self.remaining = self.stride;
        }
        self.remaining -= 1;
        Some(sample)
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.source.size_hint()
    }
}
impl<S: Source<Item = i16>> Source for RenderSource<S> {
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
    fn rendering_preserves_every_sample_and_metadata() {
        let pcm = vec![0, 1, -1, i16::MAX, i16::MIN, 123];
        let source = rodio::buffer::SamplesBuffer::new(2, 48_000, pcm.clone());
        let duration = source.total_duration();
        let stats = Arc::new(Stats::default());
        let wrapped = RenderSource::new(source, stats.clone());
        assert_eq!((wrapped.channels(), wrapped.sample_rate()), (2, 48_000));
        assert_eq!(wrapped.total_duration(), duration);
        assert_eq!(stats.mmcss.load(Ordering::Relaxed), 0);
        assert_eq!(wrapped.collect::<Vec<_>>(), pcm);
        assert_ne!(stats.mmcss.load(Ordering::Relaxed), 0);
    }
}
