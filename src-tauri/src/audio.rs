//! Voice-clip playback via rodio (in-process, no PowerShell).
//!
//! Lookup order per event:
//!   1. user's `voice-cache/{event}/*.{wav,mp3}` (their installed pack, exe-rel
//!      first, then `assets/voice-cache` for dev mode)
//!   2. `voice-pack-default/{event}/*.{wav,mp3}` - the gTTS Thai pack bundled
//!      with the installer so an intelligible Maiden ships out of the box.
//!
//! Both .wav and .mp3 work - rodio's Symphonia decodes both.
//!
//! OutputStream is !Sync, so we own it on a dedicated thread and communicate via
//! a channel. Single-slot: Maiden never plays two clips at once; `cancel()`
//! stops the current clip for Belief Revision.

use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rodio::{Decoder, OutputStream, Sink};
#[path = "playback_admission.rs"]
mod playback_admission;
pub use playback_admission::PlaybackResult;
use playback_admission::{attempt_commit, OutputAdmission, PlaybackReceipt};
static OUTPUT_ADMISSION: OutputAdmission = OutputAdmission::new();
static PLAYING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub(crate) fn output_admission() -> Option<std::sync::MutexGuard<'static, ()>> {
    OUTPUT_ADMISSION.try_enter()
}
pub(crate) fn is_playing() -> bool {
    PLAYING.load(Ordering::Acquire)
}

type PlaybackAdmission = dyn Fn(&mut dyn FnMut()) + Send;
struct PlaybackObservation {
    admit: Box<PlaybackAdmission>,
    receipt: PlaybackReceipt,
}

/// Master volume 0-100. Shared with the audio thread via atomic so `set_volume`
/// doesn't need the channel (and the Sink is adjusted immediately on the next
/// `Play`).
static VOLUME: AtomicU8 = AtomicU8::new(80);
static ACTIVE_PRIORITY: AtomicU8 = AtomicU8::new(0);
static AUDIO_READY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static AUDIO_SENDER: OnceLock<Mutex<mpsc::Sender<Cmd>>> = OnceLock::new();
struct CriticalClips {
    at: Instant,
    gank: Option<PathBuf>,
    revision: Option<PathBuf>,
}
static CRITICAL_CLIPS: Mutex<Option<CriticalClips>> = Mutex::new(None);

/// Called from startup/prewarm workers; file resolution never runs on capture.
pub fn prepare_critical_playback() {
    let _ = sender();
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        let _ = std::thread::Builder::new()
            .name("g-critical-clips".into())
            .spawn(|| loop {
                let gank = pick_clip("gank");
                let revision = pick_clip("revision");
                if let Ok(mut slot) = CRITICAL_CLIPS.lock() {
                    *slot = Some(CriticalClips {
                        at: Instant::now(),
                        gank,
                        revision,
                    });
                }
                std::thread::sleep(Duration::from_secs(1));
            });
    });
}

pub fn try_interrupt_cached_before(
    event: &str,
    prepared: Option<PathBuf>,
    deadline: Instant,
) -> bool {
    if !AUDIO_READY.load(Ordering::Acquire) || Instant::now() >= deadline {
        return false;
    }
    let cached = CRITICAL_CLIPS.try_lock().ok().and_then(|slot| {
        let cache = slot
            .as_ref()
            .filter(|cache| cache.at.elapsed() < Duration::from_secs(2))?;
        match event {
            "gank" => cache.gank.clone(),
            "revision" => cache.revision.clone(),
            _ => None,
        }
    });
    let path = cached_critical_path(cached, prepared);
    let Some(path) = path else {
        return false;
    };
    let Some(sender) = AUDIO_SENDER.get() else {
        return false;
    };
    let Ok(sender) = sender.try_lock() else {
        return false;
    };
    let (accepted, admission) = mpsc::sync_channel(1);
    if sender
        .send(Cmd::Critical(path, deadline, accepted))
        .is_err()
    {
        return false;
    }
    drop(sender);
    let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
        return false;
    };
    admission.recv_timeout(remaining).unwrap_or(false)
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    Cosmetic = 0,
    Normal = 1,
    Critical = 2,
}

impl Priority {
    fn as_u8(self) -> u8 {
        self as u8
    }
}

pub(crate) fn should_accept_incoming(current: Priority, incoming: Priority) -> bool {
    incoming >= current
}

pub(crate) fn should_cancel_current(current: Priority, ceiling: Priority) -> bool {
    current <= ceiling
}

fn cached_critical_path(cached: Option<PathBuf>, prepared: Option<PathBuf>) -> Option<PathBuf> {
    cached.or(prepared)
}

enum Cmd {
    Play(PathBuf, Priority),
    Observed(PathBuf, Priority, PlaybackObservation),
    Critical(PathBuf, Instant, mpsc::SyncSender<bool>),
    Stop,
    StopAtMost(Priority),
    Volume(f32),
}

fn sender() -> &'static Mutex<mpsc::Sender<Cmd>> {
    AUDIO_SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Cmd>();
        std::thread::Builder::new()
            .name("g-audio".into())
            .spawn(move || audio_thread(rx))
            .expect("audio thread spawn");
        Mutex::new(tx)
    })
}

fn audio_thread(rx: mpsc::Receiver<Cmd>) {
    let Ok((_stream, handle)) = OutputStream::try_default() else {
        eprintln!("[G-Maiden audio] no audio output device - clips disabled");
        for _ in rx {}
        return;
    };

    AUDIO_READY.store(true, Ordering::Release);
    let mut sink: Option<Sink> = None;
    let mut current_priority = Priority::Cosmetic;

    loop {
        if sink.as_ref().is_some_and(|s| s.empty()) {
            sink = None;
            current_priority = Priority::Cosmetic;
            ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
            PLAYING.store(false, Ordering::Release);
        }

        let cmd = match rx.recv_timeout(std::time::Duration::from_millis(50)) {
            Ok(cmd) => cmd,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };

        let (cmd, critical, observation) = match cmd {
            Cmd::Critical(path, deadline, accepted) => (
                Cmd::Play(path, Priority::Critical),
                Some((deadline, accepted)),
                None,
            ),
            Cmd::Observed(path, priority, observation) => {
                (Cmd::Play(path, priority), None, Some(observation))
            }
            other => (other, None, None),
        };
        match cmd {
            Cmd::Critical(..) | Cmd::Observed(..) => {
                unreachable!("playback command is normalized above")
            }
            Cmd::StopAtMost(ceiling) => {
                if should_cancel_current(current_priority, ceiling) {
                    if let Some(s) = sink.take() {
                        s.stop();
                    }
                    current_priority = Priority::Cosmetic;
                    ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
                    PLAYING.store(false, Ordering::Release);
                }
            }
            Cmd::Stop => {
                if let Some(s) = sink.take() {
                    s.stop();
                }
                current_priority = Priority::Cosmetic;
                ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
                PLAYING.store(false, Ordering::Release);
            }
            Cmd::Volume(vol) => {
                if let Some(s) = &sink {
                    s.set_volume(vol);
                }
            }
            Cmd::Play(path, priority) => {
                if critical
                    .as_ref()
                    .is_some_and(|(deadline, _)| Instant::now() >= *deadline)
                {
                    continue;
                }
                if sink.is_some() && !should_accept_incoming(current_priority, priority) {
                    continue;
                }
                let file = match crate::voice_api::open_verified_store_clip(&path) {
                    Ok(Some(file)) => file,
                    Ok(None) => match fs::File::open(&path) {
                        Ok(f) => f,
                        Err(e) => {
                            eprintln!("[G-Maiden audio] open {}: {e}", path.display());
                            continue;
                        }
                    },
                    Err(error) => {
                        eprintln!(
                            "[G-Maiden audio] Store clip integrity check failed for {}: {error}",
                            path.display()
                        );
                        continue;
                    }
                };
                let source = match Decoder::new(BufReader::new(file)) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[G-Maiden audio] decode {}: {e}", path.display());
                        continue;
                    }
                };
                if !source_has_frames(&source) {
                    continue;
                }
                let Some(_output_guard) = output_admission() else {
                    continue;
                };
                let deadline = critical
                    .as_ref()
                    .map(|(deadline, _)| *deadline)
                    .unwrap_or_else(|| Instant::now() + Duration::from_millis(50));
                if !crate::tts::stop_for_clip(priority, deadline) {
                    continue;
                }
                match Sink::try_new(&handle) {
                    Ok(s) => {
                        s.set_volume(VOLUME.load(Ordering::Relaxed) as f32 / 100.0);
                        if critical
                            .as_ref()
                            .is_some_and(|(deadline, _)| Instant::now() >= *deadline)
                        {
                            continue;
                        }
                        let committed = attempt_commit(
                            |commit| {
                                if let Some(observation) = observation.as_ref() {
                                    (observation.admit)(commit);
                                } else {
                                    commit();
                                }
                            },
                            || {
                                admit_nonempty_source(source, |source| {
                                    if let Some(previous) = sink.take() {
                                        previous.stop();
                                    }
                                    s.append(source);
                                    sink = Some(s);
                                    current_priority = priority;
                                    ACTIVE_PRIORITY.store(priority.as_u8(), Ordering::Relaxed);
                                    PLAYING.store(true, Ordering::Release);
                                });
                            },
                        );
                        if committed {
                            if let Some(observation) = observation {
                                observation.receipt.admit();
                            }
                            if let Some((_, accepted)) = critical {
                                let _ = accepted.try_send(true);
                            }
                        }
                    }
                    Err(e) => eprintln!("[G-Maiden audio] sink: {e}"),
                }
            }
        }
    }
}

fn send(cmd: Cmd) {
    if let Ok(tx) = sender().lock() {
        let _ = tx.send(cmd);
    }
}

/// Play a specific WAV file by path (used by Piper TTS to play its output).
/// Cancels any currently-playing clip first so Maiden never overlaps herself.
pub fn play_file(path: PathBuf) {
    play_file_with_priority(path, Priority::Normal);
}

pub fn play_file_with_priority(path: PathBuf, priority: Priority) {
    send(Cmd::Play(path, priority));
}

pub fn play_observed(
    path: PathBuf,
    priority: Priority,
    admit: impl Fn(&mut dyn FnMut()) + Send + 'static,
    notify: impl FnOnce(PlaybackResult) + Send + 'static,
) {
    send(Cmd::Observed(
        path,
        priority,
        PlaybackObservation {
            admit: Box::new(admit),
            receipt: PlaybackReceipt::new(notify),
        },
    ));
}

/// Where Maiden's user-installed clips live. Exe-relative first, then dev-tree.
/// Always returns an absolute path so Explorer opens the right folder.
pub fn voice_cache_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let near = parent.join("voice-cache");
            if near.is_dir() {
                return near;
            }
        }
    }
    let dev = PathBuf::from("assets/voice-cache");
    std::fs::canonicalize(&dev).unwrap_or_else(|_| {
        std::env::current_dir()
            .unwrap_or_default()
            .join("assets/voice-cache")
    })
}

/// Where the bundled default Thai voice pack lives. `pub(crate)` so
/// `voice_api` can surface it as a first-class, read-only pack in the
/// inventory (CS2-music-kit style: the default kit is always an equippable
/// item, not an invisible fallback).
pub(crate) fn default_pack_dir() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let near = parent.join("voice-pack-default");
            if near.is_dir() {
                return Some(near);
            }
        }
    }
    let dev = PathBuf::from("voice-pack-default");
    if dev.is_dir() {
        return Some(dev);
    }
    None
}

fn is_clip(p: &std::path::Path) -> bool {
    p.is_file()
        && p.extension()
            .and_then(|x| x.to_str())
            .map(|x| {
                let l = x.to_ascii_lowercase();
                l == "wav" || l == "mp3"
            })
            .unwrap_or(false)
}

fn list_clips_in(dir: &std::path::Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .ok()
        .map(|it| {
            it.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| is_clip(p))
                .collect()
        })
        .unwrap_or_default()
}

/// Resolution order (first non-empty wins):
///   1. the active Store pack's mapped clips (or a local pack in dev builds)
///   2. a flat local cache in dev builds only
///   3. the bundled default pack
fn resolve_clips(active: Vec<PathBuf>, event: &str) -> (&'static str, Vec<PathBuf>) {
    if !active.is_empty() {
        return ("pack", active);
    }
    if cfg!(debug_assertions) {
        let local = list_clips_in(&voice_cache_dir().join(event));
        if !local.is_empty() {
            return ("cache", local);
        }
    }
    if let Some(default) = default_pack_dir() {
        let clips = list_clips_in(&default.join(event));
        if !clips.is_empty() {
            return ("default", clips);
        }
    }
    ("silent", Vec::new())
}

fn list_clips(event: &str) -> Vec<PathBuf> {
    resolve_clips(crate::voice_api::active_event_clips(event), event).1
}

/// Clips the bundled default pack ships for `event` (empty when the default
/// pack is absent or has no folder for it). Used by `voice_api` to report the
/// per-event fallback truthfully: pack clip → default clip → TTS.
pub(crate) fn default_event_clips(event: &str) -> Vec<PathBuf> {
    default_pack_dir()
        .map(|dir| list_clips_in(&dir.join(event)))
        .unwrap_or_default()
}

pub fn priority_for_event(event: &str) -> Priority {
    match event {
        "gank" | "danger" | "revision" => Priority::Critical,
        "death" | "respawn" | "advice" => Priority::Normal,
        _ => Priority::Cosmetic,
    }
}

pub fn clip_count(event: &str) -> usize {
    list_clips(event).len()
}

/// Count clips in every event sub-dir of voice-cache.
///
/// Not called from production code right now (its former caller, GSI's
/// `POST /announcer/install` handler, was replaced by
/// `voice_api::install_report` — this walks flat `voice-cache/{event}/` dirs
/// and has no notion of a manifest-based pack, so it under/over-counts once a
/// pack is active). Left in place and `pub` per instruction not to remove it —
/// other callers may still want the legacy flat-layout counts.
#[allow(dead_code)]
pub fn all_counts() -> std::collections::BTreeMap<String, usize> {
    let mut out = std::collections::BTreeMap::new();
    if let Ok(it) = fs::read_dir(voice_cache_dir()) {
        for entry in it.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    out.insert(name.to_string(), clip_count(name));
                }
            }
        }
    }
    out
}

/// List individual clip file names for a given event.
pub fn list_event_clips(event: &str) -> Vec<(String, String, String)> {
    let (source, clips) = resolve_clips(crate::voice_api::active_event_clips(event), event);
    clips
        .into_iter()
        .map(|path| {
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let full = path.to_string_lossy().to_string();
            (name, full, source.to_string())
        })
        .collect()
}

pub(crate) fn validate_clip(path: &std::path::Path) -> Result<(), String> {
    if !is_clip(path) {
        return Err("รองรับไฟล์เสียง WAV และ MP3".into());
    }
    crate::voice_api::validate_store_clip_integrity(path)?;
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    Decoder::new(BufReader::new(file))
        .map(|_| ())
        .map_err(|e| format!("ไฟล์เสียงเสียหรืออ่านไม่ได้: {e}"))
}

pub fn is_resolved_clip_path(path: &std::path::Path) -> bool {
    let Ok(target) = path.canonicalize() else {
        return false;
    };
    crate::voice_api::event_ids().any(|event| {
        list_clips(event).iter().any(|candidate| {
            candidate
                .canonicalize()
                .is_ok_and(|resolved| resolved == target)
        })
    })
}

/// Stop the current clip immediately.
pub fn cancel() {
    send(Cmd::Stop);
}

pub fn cancel_at_most(priority: Priority) {
    send(Cmd::StopAtMost(priority));
}

pub fn active_priority() -> Priority {
    match ACTIVE_PRIORITY.load(Ordering::Relaxed) {
        2 => Priority::Critical,
        1 => Priority::Normal,
        _ => Priority::Cosmetic,
    }
}

/// Set the master volume (0-100). Applied to the current clip immediately and
/// to every future clip.
pub fn set_volume(vol: u8) {
    let clamped = vol.min(100);
    VOLUME.store(clamped, Ordering::Relaxed);
    send(Cmd::Volume(clamped as f32 / 100.0));
}

/// Current master volume (0-100).
pub fn get_volume() -> u8 {
    VOLUME.load(Ordering::Relaxed)
}

/// Play a random clip for `event`. Returns true if a clip was found and sent for
/// playback, false if no clips exist (caller falls back to TTS).
pub fn play_random(event: &str) -> bool {
    play_random_with_priority(event, priority_for_event(event))
}

pub fn play_random_with_priority(event: &str, priority: Priority) -> bool {
    match pick_clip(event) {
        Some(path) => {
            send(Cmd::Play(path, priority));
            true
        }
        None => false,
    }
}

/// Resolve the clip that WOULD play for an event (active pack → legacy → default),
/// picking one at random. Split out so the caller can play it AND hand the same
/// path to the overlay for bounded native waveform metadata analysis.
pub fn pick_clip(event: &str) -> Option<PathBuf> {
    let clips = list_clips(event);
    choose_clip(clips)
}

pub(crate) fn choose_clip(clips: Vec<PathBuf>) -> Option<PathBuf> {
    if clips.is_empty() {
        return None;
    }
    // NOTE: Windows FILETIME nanos are multiples of 100, so `nanos % N` is biased
    // — mix before the modulo (splitmix64) so multi-take events actually vary.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut z = nanos.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    Some(clips[(z as usize) % clips.len()].clone())
}

pub fn recorded_advice_label(path: &std::path::Path) -> String {
    format!(
        "คลิปเสียง advice: {}",
        path.file_name().unwrap_or_default().to_string_lossy()
    )
}

/// Play a specific already-resolved clip file (the twin of pick_clip).
pub fn play_path(path: PathBuf, event: &str) {
    send(Cmd::Play(path, priority_for_event(event)));
}

/// Legacy clip-byte reader retained while callers migrate to native metadata. Confined to the
/// voice-cache / bundled-default roots and to audio files: the caller only ever
/// passes a path our own resolver produced, but we contain-check anyway so a
/// stray path can't turn this into an arbitrary file read.
pub fn read_clip_bytes(path: &str) -> Result<Vec<u8>, String> {
    fs::read(canonical_clip_path(path)?).map_err(|e| e.to_string())
}

/// Same active resolver and canonical-root boundary as read_audio_bytes, with
/// Store verification retained. Analysis streams this handle instead of PCM IPC.
pub fn open_clip_for_analysis(path: &str) -> Result<fs::File, String> {
    if !is_resolved_clip_path(std::path::Path::new(path)) {
        return Err("อ่านได้เฉพาะเสียงจากแพ็กที่ติดตั้งและเลือกใช้อยู่".into());
    }
    let canon = canonical_clip_path(path)?;
    match crate::voice_api::open_verified_store_clip(&canon)? {
        Some(file) => Ok(file),
        None => fs::File::open(canon).map_err(|e| e.to_string()),
    }
}

fn canonical_clip_path(path: &str) -> Result<PathBuf, String> {
    let p = std::path::Path::new(path);
    if !is_clip(p) {
        return Err("not an audio clip".into());
    }
    let canon = p.canonicalize().map_err(|e| e.to_string())?;
    let roots = [
        voice_cache_dir().canonicalize().ok(),
        default_pack_dir().and_then(|d| d.canonicalize().ok()),
    ];
    let allowed = roots
        .into_iter()
        .flatten()
        .any(|root| canon.starts_with(&root));
    if !allowed {
        return Err("clip outside voice-cache".into());
    }
    Ok(canon)
}

// A decoder may be structurally valid while containing no audio frames.
fn source_has_frames(source: &impl rodio::Source<Item = i16>) -> bool {
    source.total_duration() != Some(Duration::ZERO) && source.current_frame_len() != Some(0)
}

fn admit_nonempty_source<S: rodio::Source<Item = i16>>(source: S, admit: impl FnOnce(S)) -> bool {
    if !source_has_frames(&source) {
        return false;
    }
    admit(source);
    true
}

/// Prewarm outputs are WAVs. Check physical data bounds too: rodio's WAV
/// adapter substitutes zero for some truncated-data errors during iteration.
pub(crate) fn prepared_wav_has_frames(path: &std::path::Path) -> bool {
    fn complete_data(file: &mut fs::File) -> std::io::Result<bool> {
        use std::io::{Read, Seek, SeekFrom};
        let mut header = [0; 12];
        file.read_exact(&mut header)?;
        if &header[..4] != b"RIFF" || &header[8..] != b"WAVE" {
            return Ok(false);
        }
        let riff_end = u64::from(u32::from_le_bytes(header[4..8].try_into().unwrap())) + 8;
        if riff_end > file.metadata()?.len() {
            return Ok(false);
        }
        let mut position = 12_u64;
        while position + 8 <= riff_end {
            let mut chunk = [0; 8];
            file.read_exact(&mut chunk)?;
            let size = u64::from(u32::from_le_bytes(chunk[4..].try_into().unwrap()));
            let end = position + 8 + size;
            if end > riff_end {
                return Ok(false);
            }
            if &chunk[..4] == b"data" {
                return Ok(size > 0);
            }
            position = end + size % 2;
            file.seek(SeekFrom::Start(position))?;
        }
        Ok(false)
    }
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    if !complete_data(&mut file).unwrap_or(false) {
        return false;
    }
    use std::io::{Seek, SeekFrom};
    if file.seek(SeekFrom::Start(0)).is_err() {
        return false;
    }
    // Some malformed WAV metadata panics in rodio 0.19's WAV constructor.
    std::panic::catch_unwind(|| {
        Decoder::new_wav(BufReader::new(file))
            .map(|source| source_has_frames(&source))
            .unwrap_or(false)
    })
    .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepared_fallback_survives_a_pack_cache_miss() {
        let prepared = PathBuf::from("prepared_gank.wav");
        assert_eq!(
            cached_critical_path(None, Some(prepared.clone())),
            Some(prepared)
        );
        assert_eq!(cached_critical_path(None, None), None);
    }

    #[test]
    fn advice_cancel_after_critical_admission_preserves_current_warning() {
        use std::sync::{Arc, Barrier};
        let state = Arc::new(Mutex::new(Priority::Normal));
        let barrier = Arc::new(Barrier::new(2));
        let worker_state = Arc::clone(&state);
        let worker_barrier = Arc::clone(&barrier);
        let advice = std::thread::spawn(move || {
            assert_eq!(*worker_state.lock().unwrap(), Priority::Normal);
            worker_barrier.wait();
            worker_barrier.wait();
            let mut current = worker_state.lock().unwrap();
            if should_cancel_current(*current, Priority::Normal) {
                *current = Priority::Cosmetic;
            }
        });
        barrier.wait();
        *state.lock().unwrap() = Priority::Critical;
        barrier.wait();
        advice.join().unwrap();
        assert_eq!(*state.lock().unwrap(), Priority::Critical);
    }

    #[test]
    fn missing_event_folder_returns_zero_clips() {
        assert_eq!(clip_count("__nonexistent_event_xyz__"), 0);
    }

    #[test]
    fn critical_events_outrank_cosmetic() {
        assert_eq!(priority_for_event("gank"), Priority::Critical);
        assert_eq!(priority_for_event("revision"), Priority::Critical);
        assert_eq!(priority_for_event("levelUp"), Priority::Cosmetic);
    }

    #[test]
    fn enqueue_rejects_lower_priority_when_a_higher_one_is_active() {
        assert!(!should_accept_incoming(
            Priority::Critical,
            Priority::Cosmetic
        ));
        assert!(should_accept_incoming(
            Priority::Cosmetic,
            Priority::Critical
        ));
        assert!(should_accept_incoming(Priority::Normal, Priority::Normal));
    }
}

#[cfg(test)]
mod empty_clip_tests {
    use super::*;
    use std::io::{Cursor, Write};
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn waveform_opener_does_not_admit_unresolved_external_fixture() {
        let fixture = Fixture::new(&wav(&[1, -1]));
        assert!(!is_resolved_clip_path(&fixture.0));
        assert!(open_clip_for_analysis(&fixture.0.to_string_lossy()).is_err());
        assert!(canonical_clip_path(&fixture.0.to_string_lossy()).is_err());
    }

    // Exact bytes of all four observed 46-byte Temp prewarm outputs.
    // SHA256 4A0A34B299C5F781A8D9699474F2010B3D69F2DB123E48D823137A633D53E2FF.
    fn wav(samples: &[i16]) -> Vec<u8> {
        let size = (samples.len() * 2) as u32;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(38 + size).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&18_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&22_050_u32.to_le_bytes());
        bytes.extend_from_slice(&44_100_u32.to_le_bytes());
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(&0_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&size.to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }

    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new(bytes: &[u8]) -> Self {
            static SEQUENCE: AtomicUsize = AtomicUsize::new(0);
            let path = std::env::temp_dir().join(format!(
                "gm-empty-audio-test-{}-{}.wav",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .unwrap();
            file.write_all(bytes).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.0);
        }
    }

    #[test]
    fn real_header_only_prewarm_is_not_valid_prepared_audio() {
        let bytes = wav(&[]);
        assert_eq!(bytes.len(), 46);
        let fixture = Fixture::new(&bytes);
        // This valid container passes the old len>0 predicate and Decoder construction.
        assert!(fs::metadata(&fixture.0).unwrap().len() > 0);
        assert!(Decoder::new(Cursor::new(bytes)).is_ok());
        assert!(!prepared_wav_has_frames(&fixture.0));
    }

    #[test]
    fn positive_frames_are_accepted_without_an_audibility_or_duration_threshold() {
        // Even one silent frame is structurally nonempty; silence detection is out of scope.
        for samples in [vec![0], vec![1, -1, 3_000, -3_000], vec![0; 32]] {
            let fixture = Fixture::new(&wav(&samples));
            assert!(prepared_wav_has_frames(&fixture.0));
        }
    }

    #[test]
    fn malformed_and_physically_truncated_wavs_are_rejected() {
        let mut truncated = wav(&[1, 2, 3, 4]);
        truncated.truncate(48);
        let mut no_payload = wav(&[1, 2]);
        no_payload.truncate(46);
        let mut odd_sample = wav(&[1]);
        odd_sample[42..46].copy_from_slice(&1_u32.to_le_bytes());
        for bytes in [b"not a wave".to_vec(), truncated, no_payload, odd_sample] {
            let fixture = Fixture::new(&bytes);
            assert!(!prepared_wav_has_frames(&fixture.0));
        }
    }

    #[test]
    fn header_only_decoder_never_reaches_append_or_success_ack() {
        let decoder = Decoder::new(Cursor::new(wav(&[]))).unwrap();
        let (accepted, admission) = mpsc::sync_channel(1);
        let mut appended = false;
        assert!(!admit_nonempty_source(decoder, |_| {
            appended = true;
            accepted.try_send(true).unwrap();
        }));
        assert!(!appended);
        assert!(!admission.try_recv().unwrap_or(false));
    }

    #[test]
    fn positive_decoder_is_admitted_without_consuming_its_first_sample() {
        use rodio::Source;
        let decoder = Decoder::new(Cursor::new(wav(&[1_234, -432]))).unwrap();
        let mut observed = None;
        assert!(admit_nonempty_source(decoder, |mut source| {
            observed = source.next();
            assert_eq!(source.channels(), 1);
        }));
        assert_eq!(observed, Some(1_234));
    }

    struct MetadataOnly {
        duration: Option<Duration>,
        frame_len: Option<usize>,
    }
    impl Iterator for MetadataOnly {
        type Item = i16;
        fn next(&mut self) -> Option<i16> {
            panic!("admission must not decode a sample")
        }
    }
    impl rodio::Source for MetadataOnly {
        fn current_frame_len(&self) -> Option<usize> {
            self.frame_len
        }
        fn channels(&self) -> u16 {
            1
        }
        fn sample_rate(&self) -> u32 {
            22_050
        }
        fn total_duration(&self) -> Option<Duration> {
            self.duration
        }
    }

    #[test]
    fn unknown_duration_remains_admissible_and_known_zero_metadata_is_rejected() {
        for (duration, frame_len, expected) in [
            (None, None, true),
            (None, Some(128), true),
            (Some(Duration::from_nanos(1)), None, true),
            (Some(Duration::ZERO), None, false),
            (None, Some(0), false),
        ] {
            let mut admitted = false;
            assert_eq!(
                admit_nonempty_source(
                    MetadataOnly {
                        duration,
                        frame_len
                    },
                    |_| {
                        admitted = true;
                    }
                ),
                expected
            );
            assert_eq!(admitted, expected);
        }
    }
}
