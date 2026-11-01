//! Voice-clip playback via rodio (in-process, no PowerShell).
//!
//! Events resolve only from the equipped, verified GANN snapshot.
//!
//! OutputStream is !Sync, so we own it on a dedicated thread and communicate via
//! a channel. Announcer replacements permit one150ms outgoing fade;
//! critical/non-announcer interrupts and `cancel()` stop stale sources.

use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rodio::{Decoder, OutputStream, Sink};
#[path = "audio_lifecycle.rs"]
mod audio_lifecycle;
#[path = "playback_admission.rs"]
mod playback_admission;
pub use audio_lifecycle::{
    PlaybackLifecycleEvent, PlaybackLifecycleObserver, PlaybackLifecyclePhase,
};
pub use playback_admission::PlaybackResult;
use playback_admission::{attempt_commit_if, OutputAdmission, PlaybackReceipt};
static OUTPUT_ADMISSION: OutputAdmission = OutputAdmission::new();
static PLAYING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[path = "audio_fade.rs"]
mod fade;
#[path = "audio_preparation.rs"]
mod preparation;
#[path = "audio_render.rs"]
mod render;

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
    lifecycle: Option<PlaybackLifecycleObserver>,
}

fn lifecycle_current() -> &'static Arc<std::sync::atomic::AtomicU64> {
    static CURRENT: OnceLock<Arc<std::sync::atomic::AtomicU64>> = OnceLock::new();
    CURRENT.get_or_init(|| Arc::new(std::sync::atomic::AtomicU64::new(0)))
}

fn audio_generation() -> &'static Arc<std::sync::atomic::AtomicU64> {
    static GENERATION: OnceLock<Arc<std::sync::atomic::AtomicU64>> = OnceLock::new();
    GENERATION.get_or_init(|| Arc::new(std::sync::atomic::AtomicU64::new(0)))
}

/// Changes on every admitted source append, including unobserved playback.
pub fn current_audio_generation() -> u64 {
    audio_generation().load(Ordering::Acquire)
}

/// Reconcile a bounded lifecycle subscriber after dropped notifications.
pub fn current_lifecycle_playback_id() -> u64 {
    lifecycle_current().load(Ordering::Acquire)
}

/// Master volume 0-100. Shared with the audio thread via atomic so `set_volume`
/// doesn't need the channel (and the Sink is adjusted immediately on the next
/// `Play`).
static VOLUME: AtomicU8 = AtomicU8::new(80);
static ACTIVE_PRIORITY: AtomicU8 = AtomicU8::new(0);
static AUDIO_READY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static AUDIO_SENDER: OnceLock<Mutex<mpsc::Sender<Cmd>>> = OnceLock::new();
struct CriticalClip {
    selected: crate::voice_api::AnnouncerClip,
    samples: Vec<i16>,
    original: [u8; 32],
    played: [u8; 32],
}
impl CriticalClip {
    fn source(&self) -> rodio::buffer::SamplesBuffer<i16> {
        rodio::buffer::SamplesBuffer::new(1, 48000, self.samples.clone())
    }
}
struct CriticalClips {
    generation: Option<u64>,
    gank: Option<Arc<CriticalClip>>,
    revision: Option<Arc<CriticalClip>>,
    danger: Option<Arc<CriticalClip>>,
}
#[cfg(not(test))]
static CRITICAL_CLIPS: Mutex<Option<CriticalClips>> = Mutex::new(None);
#[cfg(test)]
thread_local! {static CRITICAL_CLIPS:std::cell::RefCell<Option<CriticalClips>>=const{std::cell::RefCell::new(None)};}
#[cfg(not(test))]
fn with_critical_cache<T>(f: impl FnOnce(Option<&CriticalClips>) -> T) -> Option<T> {
    Some(f(CRITICAL_CLIPS.try_lock().ok()?.as_ref()))
}
#[cfg(test)]
fn with_critical_cache<T>(f: impl FnOnce(Option<&CriticalClips>) -> T) -> Option<T> {
    Some(CRITICAL_CLIPS.with(|cache| f(cache.borrow().as_ref())))
}
#[cfg(not(test))]
fn store_critical_cache(next: CriticalClips) -> bool {
    if let Ok(mut cache) = CRITICAL_CLIPS.lock() {
        if next.generation != crate::voice_api::current_announcer_revision() {
            return false;
        }
        *cache = Some(next);
        return true;
    }
    false
}
#[cfg(test)]
fn store_critical_cache(next: CriticalClips) -> bool {
    CRITICAL_CLIPS.with(|cache| {
        if next.generation == crate::voice_api::current_announcer_revision() {
            *cache.borrow_mut() = Some(next);
            true
        } else {
            false
        }
    })
}
fn cached_critical(event: &str) -> Option<Arc<CriticalClip>> {
    with_critical_cache(|cache| {
        let cache = cache?;
        match event {
            "gank" => cache.gank.clone(),
            "revision" => cache.revision.clone(),
            "danger" => cache.danger.clone(),
            _ => None,
        }
    })?
}
pub(crate) fn critical_media_ready() -> bool {
    let revision = crate::voice_api::current_announcer_revision();
    with_critical_cache(|cache| match cache {
        Some(cache) => cache.generation == revision,
        None => revision.is_none(),
    })
    .unwrap_or(false)
}
pub(crate) fn critical_event_selection(event: &str) -> Option<crate::voice_api::AnnouncerClip> {
    let clip = cached_critical(event)?;
    crate::voice_api::announcer_revision_current(clip.selected.revision)
        .then(|| clip.selected.clone())
}

pub fn prepare_critical_playback() {
    let _ = sender();
    refresh_critical_cache();
}
fn critical_snapshot(event: &str) -> Option<Arc<CriticalClip>> {
    use std::io::Read;
    let selected = crate::voice_api::select_announcer_clip(event)?;
    crate::voice_api::verify_visual(&selected).ok()?;
    let pair = selected.pair.as_ref()?;
    let read = |path: &std::path::Path| -> Option<Vec<u8>> {
        let file = fs::File::open(path).ok()?;
        let mut bytes = Vec::new();
        file.take(16 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .ok()?;
        (bytes.len() <= 16 * 1024 * 1024).then_some(bytes)
    };
    let original_bytes = read(&pair.original)?;
    let hash = ring::digest::digest(&ring::digest::SHA256, &original_bytes);
    let mut original = [0; 32];
    original.copy_from_slice(hash.as_ref());
    if crate::vrzo_mix::hex_digest(&original) != pair.original_hash {
        return None;
    }
    let bytes = read(&pair.mixed)?;
    let (samples, played) =
        crate::vrzo_mix::decode_mix(&bytes, &pair.mixed_hash, pair.samples).ok()?;
    Some(Arc::new(CriticalClip {
        selected,
        samples,
        original,
        played,
    }))
}
/// Only mutation/startup work performs media I/O; capture reads immutable PCM.
pub(crate) fn refresh_critical_cache() {
    let next = CriticalClips {
        generation: crate::voice_api::current_announcer_revision(),
        gank: critical_snapshot("gank"),
        revision: critical_snapshot("revision"),
        danger: critical_snapshot("danger"),
    };
    let ready:Vec<_>=[("gank",&next.gank),("revision",&next.revision),("danger",&next.danger)].into_iter().filter_map(|(event,clip)|{
        let clip=clip.as_ref()?;Some(format!("[G-AnnouncerMedia] phase=critical_ready event={event} revision={} original_sha256={} played_sha256={}",clip.selected.revision,crate::vrzo_mix::hex_digest(&clip.original),crate::vrzo_mix::hex_digest(&clip.played)))
    }).collect();
    if store_critical_cache(next) {
        for message in ready {
            eprintln!("{message}");
        }
    } else {
        eprintln!("[G-AnnouncerMedia] phase=rejected reason=stale_critical_generation");
    }
}
pub fn try_interrupt_cached_before(
    event: &str,
    _prepared: Option<PathBuf>,
    deadline: Instant,
) -> bool {
    if !AUDIO_READY.load(Ordering::Acquire) || Instant::now() >= deadline {
        return false;
    }
    let Some(clip) = cached_critical(event) else {
        eprintln!("[G-AnnouncerMedia] phase=unmapped event={event} source=gann-critical");
        return false;
    };
    if !crate::voice_api::announcer_revision_current(clip.selected.revision) {
        return false;
    }
    let Some(app) = crate::voice_api::playback_app() else {
        return false;
    };
    let epoch = crate::runtime::match_session_snapshot().session_epoch;
    let selected = clip.selected.clone();
    let visual_selected = selected.clone();
    let visual_event = event.to_owned();
    let scope = Arc::new(move || {
        crate::runtime::signal_enabled()
            && crate::runtime::is_current_capture_session(epoch)
            && crate::voice_api::with_current_announcer_clip(&visual_event, &visual_selected, || ())
                .is_some()
    });
    let Some(observer) = crate::vrzo_playback::observer(
        app,
        selected.clone(),
        event.to_owned(),
        epoch,
        false,
        scope,
    ) else {
        return false;
    };
    let event = event.to_owned();
    let observation = PlaybackObservation {
        admit: Box::new(move |commit| {
            if crate::runtime::signal_enabled() && crate::runtime::is_current_capture_session(epoch)
            {
                let _ = crate::voice_api::with_current_announcer_clip(&event, &selected, commit);
            }
        }),
        receipt: PlaybackReceipt::new(|_| {}),
        lifecycle: Some(observer),
    };
    let Some(sender) = AUDIO_SENDER.get() else {
        return false;
    };
    let Ok(sender) = sender.try_lock() else {
        return false;
    };
    let (accepted, admission) = mpsc::sync_channel(1);
    if sender
        .send(Cmd::Critical(clip, deadline, accepted, observation))
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
    Announcer = 2,
    Critical = 3,
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

fn should_fade_announcer(previous: bool, incoming: bool, priority: Priority) -> bool {
    previous && incoming && priority != Priority::Critical
}

type AnnouncerScope = (u64, u64, bool, u8);
type RetiringVoice = (Sink, Instant, Priority, AnnouncerScope);

fn announcer_scope_current((revision, epoch, preview, owner): AnnouncerScope) -> bool {
    crate::voice_api::announcer_revision_current(revision)
        && (preview
            || ((match owner {
                1 => crate::runtime::signal_enabled(),
                2 => crate::runtime::hp_alert_media_enabled(),
                _ => crate::runtime::announcer_enabled(),
            }) && crate::runtime::is_current_active_session_epoch(epoch)))
}

enum Cmd {
    Play(PathBuf, Priority),
    Prepared(
        PathBuf,
        Priority,
        preparation::PreparedClip,
        PlaybackObservation,
    ),
    Critical(
        Arc<CriticalClip>,
        Instant,
        mpsc::SyncSender<bool>,
        PlaybackObservation,
    ),
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

struct PlaybackTrace {
    path: PathBuf,
    started: Instant,
    duration: Option<Duration>,
    priority: Priority,
    render: Arc<render::Stats>,
}
fn finish_trace(trace: &mut Option<PlaybackTrace>, reason: &str) {
    if let Some(trace) = trace.take() {
        eprintln!(
            "[G-Maiden audio] phase={reason} clip={} played_ms={} expected_ms={} priority={:?}",
            trace.path.file_name().unwrap_or_default().to_string_lossy(),
            trace.started.elapsed().as_millis(),
            trace.duration.unwrap_or_default().as_millis(),
            trace.priority
        );
        eprintln!("[G-Maiden audio] phase=render_diagnostics mmcss={} max_consumption_gap_ms={:.1} gaps_over_50ms={} (not audible-output proof)",
            trace.render.mmcss.load(Ordering::Relaxed),
            trace.render.max_gap_us.load(Ordering::Relaxed) as f64 / 1000.0,
            trace.render.gaps_over_50ms.load(Ordering::Relaxed));
    }
}

fn audio_thread(rx: mpsc::Receiver<Cmd>) {
    let Ok((_stream, handle)) = OutputStream::try_default() else {
        eprintln!("[G-Maiden audio] no audio output device - clips disabled");
        for _ in rx {}
        return;
    };

    AUDIO_READY.store(true, Ordering::Release);
    let mut sink: Option<Sink> = None;
    let mut current_fade: Option<Arc<std::sync::atomic::AtomicBool>> = None;
    let mut current_scope = None;
    let mut retiring: Option<RetiringVoice> = None;
    let mut current_priority = Priority::Cosmetic;
    let mut trace = None;
    let mut lifecycle =
        audio_lifecycle::Lifecycle::new(lifecycle_current().clone(), audio_generation().clone());

    loop {
        if retiring.as_ref().is_some_and(|(s, started, _, scope)| {
            s.empty()
                || started.elapsed() >= Duration::from_millis(fade::FADE_MS + 50)
                || !announcer_scope_current(*scope)
        }) {
            if let Some((s, _, _, _)) = retiring.take() {
                s.stop();
            }
        }
        if current_scope.is_some_and(|scope| !announcer_scope_current(scope)) {
            if let Some(s) = sink.take() {
                s.stop();
            }
            lifecycle.finish(PlaybackLifecyclePhase::Cancelled);
            finish_trace(&mut trace, "scope_cancelled");
            current_fade = None;
            current_scope = None;
            current_priority = Priority::Cosmetic;
            ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
            PLAYING.store(false, Ordering::Release);
        }
        if sink.as_ref().is_some_and(|s| s.empty()) {
            lifecycle.finish(PlaybackLifecyclePhase::Completed);
            finish_trace(&mut trace, "completed");
            sink = None;
            current_fade = None;
            current_scope = None;
            current_priority = Priority::Cosmetic;
            ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
            PLAYING.store(false, Ordering::Release);
        }

        let cmd = match rx.recv_timeout(std::time::Duration::from_millis(50)) {
            Ok(cmd) => cmd,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };

        let (cmd, critical, mut observation, prepared) = match cmd {
            Cmd::Critical(clip, deadline, accepted, observation) => (
                Cmd::Play(clip.selected.path.clone(), Priority::Critical),
                Some((deadline, accepted, clip)),
                Some(observation),
                None,
            ),
            Cmd::Prepared(path, priority, pcm, observation) => (
                Cmd::Play(path, priority),
                None,
                Some(observation),
                Some(pcm),
            ),
            other => (other, None, None, None),
        };
        match cmd {
            Cmd::Critical(..) | Cmd::Prepared(..) => {
                unreachable!("playback command is normalized above")
            }
            Cmd::StopAtMost(ceiling) => {
                if retiring
                    .as_ref()
                    .is_some_and(|(_, _, priority, _)| should_cancel_current(*priority, ceiling))
                {
                    if let Some((s, _, _, _)) = retiring.take() {
                        s.stop();
                    }
                }
                if should_cancel_current(current_priority, ceiling) {
                    if let Some(s) = sink.take() {
                        s.stop();
                        finish_trace(&mut trace, "cancelled");
                    }
                    lifecycle.finish(PlaybackLifecyclePhase::Cancelled);
                    current_fade = None;
                    current_scope = None;
                    current_priority = Priority::Cosmetic;
                    ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
                    PLAYING.store(false, Ordering::Release);
                }
            }
            Cmd::Stop => {
                if let Some((s, _, _, _)) = retiring.take() {
                    s.stop();
                }
                if let Some(s) = sink.take() {
                    s.stop();
                    finish_trace(&mut trace, "cancelled");
                }
                lifecycle.finish(PlaybackLifecyclePhase::Cancelled);
                current_fade = None;
                current_scope = None;
                current_priority = Priority::Cosmetic;
                ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
                PLAYING.store(false, Ordering::Release);
            }
            Cmd::Volume(vol) => {
                if let Some(s) = &sink {
                    s.set_volume(vol);
                }
                if let Some((s, _, _, _)) = &retiring {
                    s.set_volume(vol);
                }
            }
            Cmd::Play(path, priority) => {
                let incoming_announcer =
                    observation.as_ref().is_some_and(|o| o.lifecycle.is_some());
                let incoming_scope = observation
                    .as_ref()
                    .and_then(|o| o.lifecycle.as_ref())
                    .and_then(|o| o.visual_scope);
                let next_fade =
                    incoming_announcer.then(|| Arc::new(std::sync::atomic::AtomicBool::new(false)));
                if critical
                    .as_ref()
                    .is_some_and(|(deadline, _, _)| Instant::now() >= *deadline)
                {
                    continue;
                }
                if sink.is_some() && !should_accept_incoming(current_priority, priority) {
                    continue;
                }
                let fence = prepared.as_ref().map(|pcm| pcm.fence.clone());
                let audio_sha256 = prepared
                    .as_ref()
                    .and_then(|pcm| pcm.audio_sha256)
                    .or_else(|| critical.as_ref().map(|(_, _, clip)| clip.original));
                let played_audio_sha256 = prepared
                    .as_ref()
                    .and_then(|pcm| pcm.played_audio_sha256)
                    .or_else(|| critical.as_ref().map(|(_, _, clip)| clip.played));
                if fence.as_ref().is_some_and(|fence| !fence.is_current()) {
                    continue;
                }
                let source: Box<dyn rodio::Source<Item = i16> + Send> = match prepared {
                    Some(pcm) => Box::new(pcm),
                    None if critical.is_some() => {
                        Box::new(critical.as_ref().expect("critical source").2.source())
                    }
                    None => {
                        let file = match preparation::open_verified_file(&path) {
                            Ok(file) => file,
                            Err(error) => {
                                eprintln!("[G-Maiden audio] open clip: {error}");
                                continue;
                            }
                        };
                        match Decoder::new(BufReader::new(file)) {
                            Ok(source) => Box::new(source),
                            Err(error) => {
                                eprintln!("[G-Maiden audio] decode clip: {error}");
                                continue;
                            }
                        }
                    }
                };
                if !source_has_frames(&source) {
                    continue;
                }
                let source: Box<dyn rodio::Source<Item = i16> + Send> =
                    if let Some(control) = &next_fade {
                        Box::new(fade::Fade::new(source, control.clone()))
                    } else {
                        source
                    };
                let Some(_output_guard) = output_admission() else {
                    continue;
                };
                let deadline = critical
                    .as_ref()
                    .map(|(deadline, _, _)| *deadline)
                    .unwrap_or_else(|| Instant::now() + Duration::from_millis(50));
                if !crate::tts::stop_for_clip(priority, deadline) {
                    continue;
                }
                match Sink::try_new(&handle) {
                    Ok(s) => {
                        s.set_volume(VOLUME.load(Ordering::Relaxed) as f32 / 100.0);
                        if critical
                            .as_ref()
                            .is_some_and(|(deadline, _, _)| Instant::now() >= *deadline)
                        {
                            continue;
                        }
                        let mut previous_trace = None;
                        let mut retired_previous = false;
                        let committed = attempt_commit_if(
                            || fence.as_ref().is_none_or(|fence| fence.is_current()),
                            |commit| {
                                if let Some(observation) = observation.as_ref() {
                                    (observation.admit)(commit);
                                } else {
                                    commit();
                                }
                            },
                            || {
                                admit_nonempty_source(source, |source| {
                                    if priority == Priority::Critical {
                                        preparation::cancel_up_to(Priority::Normal);
                                    }
                                    if let Some((s, _, _, _)) = retiring.take() {
                                        s.stop();
                                    }
                                    if let Some(previous) = sink.take() {
                                        previous_trace = trace.take();
                                        if should_fade_announcer(
                                            current_fade.is_some(),
                                            incoming_announcer,
                                            priority,
                                        ) && incoming_scope.is_some()
                                            && current_scope == incoming_scope
                                        {
                                            if let Some(control) = current_fade.take() {
                                                control.store(true, Ordering::Release);
                                                retiring = Some((
                                                    previous,
                                                    Instant::now(),
                                                    current_priority,
                                                    current_scope
                                                        .expect("matching announcer scope"),
                                                ));
                                                retired_previous = true;
                                                eprintln!("[G-Maiden audio] phase=announcer_retiring fade_ms={} incoming_delay_ms=0 incoming_rate=1", fade::FADE_MS);
                                            }
                                        } else {
                                            previous.stop();
                                        }
                                    }
                                    current_fade = next_fade;
                                    current_scope = incoming_scope;
                                    let render_stats = Arc::new(render::Stats::default());
                                    trace = Some(PlaybackTrace {
                                        path: path.clone(),
                                        started: Instant::now(),
                                        duration: source.total_duration(),
                                        priority,
                                        render: render_stats.clone(),
                                    });
                                    s.append(render::RenderSource::new(source, render_stats));
                                    sink = Some(s);
                                    current_priority = priority;
                                    ACTIVE_PRIORITY.store(priority.as_u8(), Ordering::Relaxed);
                                    PLAYING.store(true, Ordering::Release);
                                });
                            },
                        );
                        drop(_output_guard);
                        if committed {
                            if previous_trace.is_some() {
                                lifecycle.finish(if retired_previous {
                                    PlaybackLifecyclePhase::Retiring
                                } else {
                                    PlaybackLifecyclePhase::Preempted
                                });
                            }
                            let observer = observation
                                .as_mut()
                                .and_then(|value| value.lifecycle.take());
                            lifecycle.start(observer, audio_sha256, played_audio_sha256);
                            if let Some((_, accepted, _)) = critical {
                                let _ = accepted.try_send(true);
                            }
                            if let Some(observation) = observation {
                                observation.receipt.admit();
                            }
                            finish_trace(&mut previous_trace, "preempted");
                            eprintln!("[G-Maiden audio] phase=started clip={} duration_ms={} priority={priority:?}",
                                path.file_name().unwrap_or_default().to_string_lossy(),
                                trace.as_ref().and_then(|trace| trace.duration).unwrap_or_default().as_millis());
                        }
                    }
                    Err(e) => {
                        drop(_output_guard);
                        eprintln!("[G-Maiden audio] sink: {e}");
                    }
                }
            }
        }
    }
    lifecycle.finish(PlaybackLifecyclePhase::Cancelled);
}

fn send(cmd: Cmd) {
    match &cmd {
        Cmd::Stop => preparation::cancel_up_to(Priority::Normal),
        Cmd::StopAtMost(ceiling) => preparation::cancel_up_to(*ceiling),
        _ => {}
    }
    if let Ok(tx) = sender().lock() {
        let _ = tx.send(cmd);
    }
}

pub fn play_observed(
    path: PathBuf,
    priority: Priority,
    admit: impl Fn(&mut dyn FnMut()) + Send + 'static,
    notify: impl FnOnce(PlaybackResult) + Send + 'static,
) {
    let observation = PlaybackObservation {
        admit: Box::new(admit),
        receipt: PlaybackReceipt::new(notify),
        lifecycle: None,
    };
    preparation::enqueue(path, priority, observation);
}

/// Send bounded lifecycle notifications only after this exact clip is admitted.
pub fn play_observed_with_lifecycle(
    path: PathBuf,
    priority: Priority,
    admit: impl Fn(&mut dyn FnMut()) + Send + 'static,
    notify: impl FnOnce(PlaybackResult) + Send + 'static,
    lifecycle: PlaybackLifecycleObserver,
) {
    let observation = PlaybackObservation {
        admit: Box::new(admit),
        receipt: PlaybackReceipt::new(notify),
        lifecycle: Some(lifecycle),
    };
    if priority == Priority::Critical {
        let revision = observation
            .lifecycle
            .as_ref()
            .and_then(|o| o.visual_scope)
            .map(|s| s.0);
        let expected = observation
            .lifecycle
            .as_ref()
            .and_then(|o| o.mixed.as_ref())
            .map(|m| m.mixed_sha256.clone());
        let clip = with_critical_cache(|cache| {
            cache.and_then(|cache| {
                [&cache.gank, &cache.revision, &cache.danger]
                    .into_iter()
                    .flatten()
                    .find(|clip| {
                        clip.selected.path == path
                            && Some(clip.selected.revision) == revision
                            && Some(crate::vrzo_mix::hex_digest(&clip.played)) == expected
                    })
                    .cloned()
            })
        })
        .flatten();
        if let Some(clip) = clip {
            let (accepted, _) = mpsc::sync_channel(1);
            send(Cmd::Critical(
                clip,
                Instant::now() + Duration::from_millis(250),
                accepted,
                observation,
            ));
        } else {
            eprintln!("[G-AnnouncerMedia] phase=rejected reason=critical_snapshot_unready");
        }
    } else {
        preparation::enqueue(path, priority, observation);
    }
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

fn is_clip(p: &std::path::Path) -> bool {
    p.is_file()
        && p.extension()
            .and_then(|x| x.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("wav") || ext.eq_ignore_ascii_case("mp3"))
}
fn list_clips(event: &str) -> Vec<PathBuf> {
    crate::voice_api::active_event_clips(event)
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

/// List individual clip file names for a given event.
pub fn list_event_clips(event: &str) -> Vec<(String, String, String)> {
    let (source, clips) = ("gann", crate::voice_api::active_event_clips(event));
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
        3 => Priority::Critical,
        2 => Priority::Announcer,
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

/// Choose one mixed sound from the current verified GANN event mapping.
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

/// Read only audio from the admitted GANN snapshot.
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
    if !is_resolved_clip_path(&canon) {
        return Err("clip is outside the admitted GANN snapshot".into());
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
#[cfg(test)]
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
    #[test]
    fn critical_gann_snapshot_feeds_mixed_pcm_and_both_exact_lifecycle_hashes() {
        use super::*;
        let root = std::env::temp_dir().join(format!(
            "gm-critical-pair-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        crate::voice_api::set_test_voice_root(Some(root.clone()));
        let (id, original, _) = crate::voice_api::test_package::install(&root, 991, "danger");
        crate::voice_api::activate_if_exists(&id).unwrap();
        assert!(critical_media_ready());
        let selected = critical_event_selection("danger").unwrap();
        assert_eq!(selected.path, original);
        let clip = cached_critical("danger").unwrap();
        assert_ne!(clip.original, clip.played);
        let pair = selected.pair.as_ref().unwrap();
        assert_eq!(
            crate::vrzo_mix::hex_digest(&clip.original),
            pair.original_hash
        );
        assert_eq!(crate::vrzo_mix::hex_digest(&clip.played), pair.mixed_hash);
        let mut source = clip.source();
        assert_eq!(rodio::Source::channels(&source), 1);
        assert_eq!(rodio::Source::sample_rate(&source), 48000);
        assert_eq!(source.next(), Some(200));
        assert_eq!(source.next(), Some(-200));
        let (other, _, _) = crate::voice_api::test_package::install(&root, 993, "kill");
        crate::voice_api::activate_if_exists(&other).unwrap();
        store_critical_cache(CriticalClips {
            generation: Some(selected.revision),
            gank: None,
            revision: None,
            danger: Some(clip),
        });
        assert!(critical_media_ready());
        assert!(critical_event_selection("danger").is_none());
        crate::voice_api::set_test_voice_root(None);
        let _ = std::fs::remove_dir_all(root);
    }
    #[test]
    fn crossfade_is_only_for_two_announcers_and_never_critical_warnings() {
        assert!(super::should_fade_announcer(
            true,
            true,
            super::Priority::Cosmetic
        ));
        assert!(!super::should_fade_announcer(
            true,
            true,
            super::Priority::Critical
        ));
        assert!(!super::should_fade_announcer(
            false,
            true,
            super::Priority::Cosmetic
        ));
        assert!(!super::should_fade_announcer(
            true,
            false,
            super::Priority::Normal
        ));
    }
    use super::*;

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
    fn prepared_playback_never_reads_the_file_from_the_output_callback() {
        use std::sync::{atomic::AtomicBool, Arc};
        struct GuardedReader {
            inner: Cursor<Vec<u8>>,
            callback_started: Arc<AtomicBool>,
        }
        impl std::io::Read for GuardedReader {
            fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                assert!(
                    !self.callback_started.load(Ordering::Acquire),
                    "audio callback attempted blocking file I/O"
                );
                std::io::Read::read(&mut self.inner, buf)
            }
        }
        impl std::io::Seek for GuardedReader {
            fn seek(&mut self, from: std::io::SeekFrom) -> std::io::Result<u64> {
                std::io::Seek::seek(&mut self.inner, from)
            }
        }
        let samples: Vec<i16> = (0..16_384).map(|i| (i % 8_000) as i16).collect();
        let callback_started = Arc::new(AtomicBool::new(false));
        let prepared = preparation::prepare_source(BufReader::new(GuardedReader {
            inner: Cursor::new(wav(&samples)),
            callback_started: callback_started.clone(),
        }))
        .unwrap();
        callback_started.store(true, Ordering::Release);
        assert_eq!(prepared.collect::<Vec<_>>(), samples);
    }

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
