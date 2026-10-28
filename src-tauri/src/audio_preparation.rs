//! Bounded PCM preparation, isolated from the output callback and Critical queue.
use super::{send, Cmd, PlaybackObservation, Priority};
use rodio::{buffer::SamplesBuffer, Decoder, Source};
use std::io::{BufReader, Read, Seek};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    mpsc, Arc, OnceLock,
};
use std::time::{Duration, Instant};

const MAX_SAMPLES: usize = 2 * 1024 * 1024;
const MAX_CLIPS: usize = 2;
const MAX_WAIT: Duration = Duration::from_secs(2);

#[derive(Default)]
struct Epochs {
    cosmetic: AtomicU64,
    normal: AtomicU64,
}
impl Epochs {
    fn counter(&self, priority: Priority) -> &AtomicU64 {
        if priority == Priority::Cosmetic {
            &self.cosmetic
        } else {
            &self.normal
        }
    }
    fn invalidate(&self, ceiling: Priority) {
        self.cosmetic.fetch_add(1, Ordering::AcqRel);
        if ceiling >= Priority::Normal {
            self.normal.fetch_add(1, Ordering::AcqRel);
        }
    }
}
fn epochs() -> &'static Arc<Epochs> {
    static EPOCHS: OnceLock<Arc<Epochs>> = OnceLock::new();
    EPOCHS.get_or_init(|| Arc::new(Epochs::default()))
}
pub(super) fn cancel_up_to(ceiling: Priority) {
    epochs().invalidate(ceiling);
}

#[derive(Clone)]
pub(super) struct Fence {
    epochs: Arc<Epochs>,
    priority: Priority,
    generation: u64,
    deadline: Instant,
}
impl Fence {
    fn capture(epochs: &Arc<Epochs>, priority: Priority) -> Self {
        Self {
            epochs: epochs.clone(),
            priority,
            generation: epochs.counter(priority).load(Ordering::Acquire),
            deadline: Instant::now() + MAX_WAIT,
        }
    }
    pub(super) fn is_current(&self) -> bool {
        Instant::now() < self.deadline
            && self.epochs.counter(self.priority).load(Ordering::Acquire) == self.generation
    }
}

struct Slot(Arc<AtomicUsize>);
impl Slot {
    fn acquire(count: &Arc<AtomicUsize>) -> Option<Self> {
        count
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                (n < MAX_CLIPS).then_some(n + 1)
            })
            .ok()
            .map(|_| Self(count.clone()))
    }
}
impl Drop for Slot {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

pub(super) struct PreparedClip {
    pcm: SamplesBuffer<i16>,
    pub(super) fence: Fence,
    // Keep the slot through playback, including SourcesQueue/mixer ownership.
    _slot: Slot,
}
impl Iterator for PreparedClip {
    type Item = i16;
    fn next(&mut self) -> Option<i16> {
        self.pcm.next()
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.pcm.size_hint()
    }
}
impl Source for PreparedClip {
    fn current_frame_len(&self) -> Option<usize> {
        self.pcm.current_frame_len()
    }
    fn channels(&self) -> u16 {
        self.pcm.channels()
    }
    fn sample_rate(&self) -> u32 {
        self.pcm.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.pcm.total_duration()
    }
}

pub(super) fn prepare_source<R: Read + Seek + Send + Sync + 'static>(
    reader: R,
) -> Result<SamplesBuffer<i16>, String> {
    let decoder = Decoder::new(reader).map_err(|e| e.to_string())?;
    buffer_source(decoder, MAX_SAMPLES)
}

fn buffer_source(
    mut source: impl Source<Item = i16>,
    limit: usize,
) -> Result<SamplesBuffer<i16>, String> {
    let channels = source.channels();
    let rate = source.sample_rate();
    if channels == 0 || rate == 0 {
        return Err("invalid PCM format".into());
    }
    let data: Vec<i16> = source.by_ref().take(limit).collect();
    if source.next().is_some() {
        return Err("clip exceeds bounded PCM preparation budget".into());
    }
    if data.is_empty() {
        return Err("clip contains no PCM frames".into());
    }
    Ok(SamplesBuffer::new(channels, rate, data))
}

struct Request {
    path: PathBuf,
    priority: Priority,
    observation: PlaybackObservation,
    slot: Slot,
    requested: Instant,
    fence: Fence,
}

pub(super) fn enqueue(path: PathBuf, priority: Priority, observation: PlaybackObservation) {
    let fence = Fence::capture(epochs(), priority);
    static COUNT: OnceLock<Arc<AtomicUsize>> = OnceLock::new();
    static WORKER: OnceLock<mpsc::SyncSender<Request>> = OnceLock::new();
    let Some(slot) = Slot::acquire(COUNT.get_or_init(|| Arc::new(AtomicUsize::new(0)))) else {
        eprintln!("[G-Maiden audio] phase=rejected reason=preparation_full");
        return;
    };
    let sender = WORKER.get_or_init(|| {
        let (tx, rx) = mpsc::sync_channel::<Request>(1);
        std::thread::Builder::new().name("g-clip-prepare".into()).spawn(move || {
            for request in rx {
                if request.requested.elapsed() >= MAX_WAIT || !request.fence.is_current() { continue; }
                let prepared = open_verified_file(&request.path)
                    .and_then(|file| prepare_source(BufReader::new(file)));
                match prepared {
                    Ok(pcm) if request.requested.elapsed() < MAX_WAIT && request.fence.is_current() => {
                        eprintln!("[G-Maiden audio] phase=prepared clip={} preparation_ms={} duration_ms={}",
                            request.path.file_name().unwrap_or_default().to_string_lossy(),
                            request.requested.elapsed().as_millis(), pcm.total_duration().unwrap_or_default().as_millis());
                        send(Cmd::Prepared(request.path, request.priority,
                            PreparedClip { pcm, _slot: request.slot, fence: request.fence }, request.observation));
                    }
                    Ok(_) => eprintln!("[G-Maiden audio] phase=rejected reason=preparation_expired"),
                    Err(error) => eprintln!("[G-Maiden audio] phase=rejected reason=preparation error={error}"),
                }
            }
        }).expect("clip preparation worker spawn");
        tx
    });
    // Full/disconnected drops the request, releasing its slot and rejecting its receipt.
    let _ = sender.try_send(Request {
        path,
        priority,
        observation,
        slot,
        requested: Instant::now(),
        fence,
    });
}

pub(super) fn open_verified_file(path: &std::path::Path) -> Result<std::fs::File, String> {
    match crate::voice_api::open_verified_store_clip(path)? {
        Some(file) => Ok(file),
        None => std::fs::File::open(path).map_err(|e| e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcm_limits_reject_oversize_and_empty_but_preserve_silent_frames() {
        assert!(buffer_source(SamplesBuffer::new(1, 44_100, vec![0_i16; 129]), 128).is_err());
        assert!(buffer_source(SamplesBuffer::new(1, 44_100, Vec::<i16>::new()), 128).is_err());
        let pcm = buffer_source(SamplesBuffer::new(2, 48_000, vec![0_i16; 128]), 128).unwrap();
        assert_eq!(pcm.channels(), 2);
        assert_eq!(pcm.sample_rate(), 48_000);
        assert_eq!(pcm.collect::<Vec<_>>(), vec![0; 128]);
    }

    #[test]
    fn slots_cover_preparing_queued_and_playing_sources_until_drop() {
        let count = Arc::new(AtomicUsize::new(0));
        let playing = PreparedClip {
            pcm: SamplesBuffer::new(1, 44_100, vec![1_i16]),
            _slot: Slot::acquire(&count).unwrap(),
            fence: Fence::capture(&Arc::new(Epochs::default()), Priority::Cosmetic),
        };
        let queued = Slot::acquire(&count).unwrap();
        assert!(Slot::acquire(&count).is_none());
        assert_eq!(playing.collect::<Vec<_>>(), vec![1]);
        let replacement = Slot::acquire(&count).unwrap();
        assert!(Slot::acquire(&count).is_none());
        drop((queued, replacement));
        assert_eq!(count.load(Ordering::Acquire), 0);
    }

    #[test]
    fn cancel_during_preparation_cannot_start_old_audio_after_stop() {
        let epochs = Arc::new(Epochs::default());
        let cosmetic = Fence::capture(&epochs, Priority::Cosmetic);
        let normal = Fence::capture(&epochs, Priority::Normal);
        assert!(cosmetic.is_current() && normal.is_current());
        epochs.invalidate(Priority::Cosmetic);
        assert!(!cosmetic.is_current());
        assert!(normal.is_current());
        epochs.invalidate(Priority::Normal);
        assert!(!normal.is_current());
        assert!(Fence::capture(&epochs, Priority::Normal).is_current());
    }

    #[test]
    fn prepared_audio_expires_even_if_it_waits_in_the_output_queue() {
        let mut fence = Fence::capture(&Arc::new(Epochs::default()), Priority::Normal);
        fence.deadline = Instant::now() - Duration::from_millis(1);
        assert!(!fence.is_current());
    }
}
