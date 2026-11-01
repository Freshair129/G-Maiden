//! Bounded PCM preparation, isolated from the output callback and Critical queue.
use super::{send, Cmd, PlaybackObservation, Priority};
use rodio::{buffer::SamplesBuffer, Decoder, Source};
use std::io::{BufReader, Cursor, Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    mpsc, Arc, OnceLock,
};
use std::time::{Duration, Instant};

const MAX_SAMPLES: usize = 2 * 1024 * 1024;
// Active +150ms retiree +one replacement preparing; PCM stays <=12MiB.
const MAX_CLIPS: usize = 3;
const MAX_WAIT: Duration = Duration::from_secs(2);
const MAX_VISUAL_AUDIO_BYTES: usize = 16 * 1024 * 1024;

#[derive(Default)]
struct Epochs {
    cosmetic: AtomicU64,
    normal: AtomicU64,
    critical: AtomicU64,
}
impl Epochs {
    fn counter(&self, priority: Priority) -> &AtomicU64 {
        if priority == Priority::Critical {
            &self.critical
        } else if priority == Priority::Cosmetic {
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
        if ceiling >= Priority::Critical {
            self.critical.fetch_add(1, Ordering::AcqRel);
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
pub(super) fn critical_fence() -> Fence {
    reserve_critical_fence(epochs())
}
fn reserve_critical_fence(epochs: &Arc<Epochs>) -> Fence {
    Fence {
        epochs: epochs.clone(),
        priority: Priority::Critical,
        generation: epochs
            .critical
            .fetch_add(1, Ordering::AcqRel)
            .wrapping_add(1),
        deadline: Instant::now() + MAX_WAIT,
    }
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
    pub(super) audio_sha256: Option<[u8; 32]>,
    pub(super) played_audio_sha256: Option<[u8; 32]>,
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

fn visual_snapshot(reader: &mut impl Read, limit: usize) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    reader
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() <= limit).then_some(bytes)
}

fn decode_visual_snapshot(bytes: Vec<u8>) -> Result<(SamplesBuffer<i16>, [u8; 32]), String> {
    let hash = ring::digest::digest(&ring::digest::SHA256, &bytes);
    let mut digest = [0; 32];
    digest.copy_from_slice(hash.as_ref());
    let pcm = prepare_source(Cursor::new(bytes))?;
    Ok((pcm, digest))
}

fn prepare_file(
    file: std::fs::File,
    visual: bool,
) -> Result<(SamplesBuffer<i16>, Option<[u8; 32]>), String> {
    prepare_reader(file, visual, MAX_VISUAL_AUDIO_BYTES)
}

fn prepare_mix(
    pcm: SamplesBuffer<i16>,
    original: Option<[u8; 32]>,
    selection: Option<&crate::event_media::MixedSelection>,
) -> Result<(SamplesBuffer<i16>, Option<[u8; 32]>), String> {
    let selection = selection.ok_or("GANN_pair_required")?;
    let digest = original.ok_or("original_snapshot_unavailable")?;
    if crate::vrzo_mix::hex_digest(&digest) != selection.original_sha256 {
        return Err("original_hash".into());
    }
    let duration = pcm
        .total_duration()
        .ok_or("original_duration")?
        .as_secs_f64();
    if (selection.samples as f64 - duration * 48000.0).abs() > 1.0001 {
        return Err("mixed_duration".into());
    }
    let mut file = std::fs::File::open(&selection.path).map_err(|_| "mixed_missing")?;
    let bytes = visual_snapshot(&mut file, MAX_VISUAL_AUDIO_BYTES).ok_or("mixed_size")?;
    let (samples, digest) =
        crate::vrzo_mix::decode_mix(&bytes, &selection.mixed_sha256, selection.samples)?;
    Ok((SamplesBuffer::new(1, 48000, samples), Some(digest)))
}

fn prepare_reader<R: Read + Seek + Send + Sync + 'static>(
    mut file: R,
    visual: bool,
    limit: usize,
) -> Result<(SamplesBuffer<i16>, Option<[u8; 32]>), String> {
    if visual {
        if let Some(bytes) = visual_snapshot(&mut file, limit) {
            let (pcm, digest) = decode_visual_snapshot(bytes)?;
            return Ok((pcm, Some(digest)));
        }
        file.seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
    }
    prepare_source(BufReader::new(file)).map(|pcm| (pcm, None))
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
    if priority < Priority::Critical && super::active_priority() == Priority::Critical {
        return;
    }
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
            for mut request in rx {
                if request.requested.elapsed() >= MAX_WAIT || !request.fence.is_current() { continue; }
                let prepared = open_verified_file(&request.path)
                    .and_then(|file| prepare_file(file, request.observation.lifecycle.is_some()));
                match prepared {
                    Ok((pcm, audio_sha256)) if request.requested.elapsed() < MAX_WAIT && request.fence.is_current() => {
                        let (mut pcm, played_audio_sha256) = if let Some(observer)=request.observation.lifecycle.as_ref(){
                            match prepare_mix(pcm,audio_sha256,observer.mixed.as_ref()){
                                Ok(source)=>source,
                                Err(reason)=>{eprintln!("[G-AnnouncerMedia] phase=rejected reason={reason}");continue;}
                            }
                        }else{(pcm,None)};
                        if request.requested.elapsed() >= MAX_WAIT || !request.fence.is_current() { continue; }
                        if let Some(observer) = request.observation.lifecycle.as_mut() {
                            if let Some(asset) = observer.native_asset.as_ref() {
                                let fence=request.fence.clone();
                                observer.native_pending=Some(Arc::new(move||fence.is_current() && super::active_priority()!=Priority::Critical));
                                let samples: Vec<i16> = pcm.collect();
                                pcm = SamplesBuffer::new(1,48000,samples.clone());
                                match crate::gann_native::prepare(asset.clone(), samples, observer.native_fade.clone(), observer.native_scope.clone(), observer.native_pending.clone(), false) {
                                    Ok(playback) => observer.native_playback = Some(playback),
                                    Err(error) => { eprintln!("[G-NativeMedia] phase=rejected error={error}"); continue; }
                                }
                            }
                        }
                        eprintln!("[G-Maiden audio] source={} original_sha256={} played_sha256={}",
                            if played_audio_sha256.is_some() {"gann-mixed"} else {"original"},
                            audio_sha256.as_ref().map(crate::vrzo_mix::hex_digest).unwrap_or_default(),
                            played_audio_sha256.or(audio_sha256).as_ref().map(crate::vrzo_mix::hex_digest).unwrap_or_default());
                        eprintln!("[G-Maiden audio] phase=prepared clip={} preparation_ms={} duration_ms={}",
                            request.path.file_name().unwrap_or_default().to_string_lossy(),
                            request.requested.elapsed().as_millis(), pcm.total_duration().unwrap_or_default().as_millis());
                        send(Cmd::Prepared(request.path, request.priority,
                            PreparedClip { pcm, audio_sha256, played_audio_sha256, _slot: request.slot, fence: request.fence }, request.observation));
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
    fn admitted_original_cannot_play_when_its_gann_mixed_file_is_changed_or_removed() {
        let root = std::env::temp_dir().join(format!(
            "gm-pair-preparation-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        crate::voice_api::set_test_voice_root(Some(root.clone()));
        let (id, original, mixed) = crate::voice_api::test_package::install(&root, 992, "kill");
        crate::voice_api::activate_if_exists(&id).unwrap();
        let selected = crate::voice_api::select_announcer_clip("kill").unwrap();
        let pair = selected.pair.as_ref().unwrap();
        let selection = crate::event_media::MixedSelection {
            path: mixed.clone(),
            original_sha256: pair.original_hash.clone(),
            mixed_sha256: pair.mixed_hash.clone(),
            samples: pair.samples,
        };
        for removed in [false, true] {
            if removed {
                std::fs::remove_file(&mixed).unwrap();
            } else {
                std::fs::write(&mixed, b"tampered mixed WAV").unwrap();
            }
            let (pcm, original_hash) =
                prepare_file(open_verified_file(&original).unwrap(), true).unwrap();
            assert!(prepare_mix(pcm, original_hash, Some(&selection)).is_err());
        }
        crate::voice_api::set_test_voice_root(None);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_or_missing_gann_mix_rejects_instead_of_playing_original() {
        let mut selection = crate::event_media::MixedSelection {
            path: std::env::temp_dir().join("missing-gann.wav"),
            original_sha256: "0".repeat(64),
            mixed_sha256: "1".repeat(64),
            samples: 3,
        };
        for digest in [None, Some([1; 32]), Some([0; 32])] {
            assert!(prepare_mix(
                SamplesBuffer::new(1, 48000, vec![11i16, 0, -12]),
                digest,
                Some(&selection)
            )
            .is_err());
        }
        selection.samples = 100;
        assert!(prepare_mix(
            SamplesBuffer::new(1, 48000, vec![11i16, 0, -12]),
            Some([0; 32]),
            Some(&selection)
        )
        .is_err());
        assert!(prepare_mix(SamplesBuffer::new(1, 48000, vec![1i16]), None, None).is_err());
    }

    #[test]
    fn visual_snapshot_digest_and_samples_survive_later_file_mutation() {
        use std::io::{Seek, SeekFrom, Write};
        let path = std::env::temp_dir().join(format!(
            "gm-audio-snapshot-{}-{:?}.wav",
            std::process::id(),
            std::thread::current().id()
        ));
        let mut original = Vec::new();
        original.extend_from_slice(b"RIFF");
        original.extend_from_slice(&38_u32.to_le_bytes());
        original.extend_from_slice(b"WAVEfmt ");
        original.extend_from_slice(&16_u32.to_le_bytes());
        original.extend_from_slice(&1_u16.to_le_bytes());
        original.extend_from_slice(&1_u16.to_le_bytes());
        original.extend_from_slice(&8000_u32.to_le_bytes());
        original.extend_from_slice(&16000_u32.to_le_bytes());
        original.extend_from_slice(&2_u16.to_le_bytes());
        original.extend_from_slice(&16_u16.to_le_bytes());
        original.extend_from_slice(b"data");
        original.extend_from_slice(&2_u32.to_le_bytes());
        original.extend_from_slice(&1234_i16.to_le_bytes());
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(&original).unwrap();
        drop(file);
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .unwrap();
        let bytes = visual_snapshot(&mut file, MAX_VISUAL_AUDIO_BYTES).expect("small snapshot");
        file.seek(SeekFrom::Start(44)).unwrap();
        file.write_all(&(-1234_i16).to_le_bytes()).unwrap();
        drop(file);
        let (pcm, digest) = decode_visual_snapshot(bytes).unwrap();
        let expected = ring::digest::digest(&ring::digest::SHA256, &original);
        assert_eq!(&digest[..], expected.as_ref());
        assert_eq!(pcm.collect::<Vec<_>>(), vec![1234]);
        let (fallback_pcm, fallback_digest) =
            prepare_reader(Cursor::new(original), true, 8).unwrap();
        assert_eq!(fallback_digest, None);
        assert_eq!(fallback_pcm.collect::<Vec<_>>(), vec![1234]);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn oversized_visual_snapshot_declines_without_preventing_audio_fallback() {
        let mut data = std::io::Cursor::new(vec![0; MAX_VISUAL_AUDIO_BYTES + 1]);
        assert!(visual_snapshot(&mut data, MAX_VISUAL_AUDIO_BYTES).is_none());
        assert_eq!(data.seek(std::io::SeekFrom::Start(0)).unwrap(), 0);
    }

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
            audio_sha256: None,
            played_audio_sha256: None,
            _slot: Slot::acquire(&count).unwrap(),
            fence: Fence::capture(&Arc::new(Epochs::default()), Priority::Cosmetic),
        };
        let queued = Slot::acquire(&count).unwrap();
        let retiring = Slot::acquire(&count).unwrap();
        assert!(Slot::acquire(&count).is_none());
        assert_eq!(playing.collect::<Vec<_>>(), vec![1]);
        let replacement = Slot::acquire(&count).unwrap();
        assert!(Slot::acquire(&count).is_none());
        drop((queued, replacement, retiring));
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
    fn a_user_stop_revokes_prepared_critical_pairs_but_normal_preemption_does_not() {
        let epochs = Arc::new(Epochs::default());
        let critical = Fence::capture(&epochs, Priority::Critical);
        epochs.invalidate(Priority::Normal);
        assert!(critical.is_current());
        epochs.invalidate(Priority::Critical);
        assert!(!critical.is_current());
    }
    #[test]
    fn concurrent_critical_requests_get_distinct_generations_and_stop_revokes_them_all() {
        let epochs = Arc::new(Epochs::default());
        let barrier = Arc::new(std::sync::Barrier::new(16));
        let workers: Vec<_> = (0..16)
            .map(|_| {
                let epochs = epochs.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    (0..200)
                        .map(|_| reserve_critical_fence(&epochs))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        let fences: Vec<_> = workers
            .into_iter()
            .flat_map(|w| w.join().unwrap())
            .collect();
        let generations: std::collections::HashSet<_> =
            fences.iter().map(|f| f.generation).collect();
        assert_eq!(generations.len(), 3200);
        assert_eq!(fences.iter().filter(|f| f.is_current()).count(), 1);
        epochs.invalidate(Priority::Critical);
        assert!(fences.iter().all(|f| !f.is_current()));
    }

    #[test]
    fn prepared_audio_expires_even_if_it_waits_in_the_output_queue() {
        let mut fence = Fence::capture(&Arc::new(Epochs::default()), Priority::Normal);
        fence.deadline = Instant::now() - Duration::from_millis(1);
        assert!(!fence.is_current());
    }
}
