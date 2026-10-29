//! Bounded local visual dispatch tied to audio-owner playback identity.
use crate::audio::{PlaybackLifecycleEvent, PlaybackLifecycleObserver, PlaybackLifecyclePhase};
use crate::voice_api::AnnouncerClip;
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    mpsc, Arc,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const MAX_WORKERS: usize = 4;
static WORKERS: AtomicUsize = AtomicUsize::new(0);
static NEXT: AtomicU64 = AtomicU64::new(1);
struct Slot;
impl Drop for Slot {
    fn drop(&mut self) {
        WORKERS.fetch_sub(1, Ordering::AcqRel);
    }
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualEvent {
    id: String,
    phase: &'static str,
    clip_id: String,
    event: String,
    #[serde(rename = "session_epoch")]
    session_epoch: u64,
    preview: bool,
    #[serde(rename = "expires_at_ms")]
    expires_at_ms: u64,
}
fn emit(
    app: &AppHandle,
    id: u64,
    phase: &'static str,
    clip_id: &str,
    event: &str,
    epoch: u64,
    preview: bool,
) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64;
    let _ = app.emit(
        "vrzo-banner-playback",
        VisualEvent {
            id: id.to_string(),
            phase,
            clip_id: clip_id.to_string(),
            event: event.to_string(),
            session_epoch: epoch,
            preview,
            expires_at_ms: now.saturating_add(15_000),
        },
    );
}

/// A receiver thread owns filesystem hashing and UI emission, never the audio thread.
pub(crate) fn observer(
    app: AppHandle,
    selected: AnnouncerClip,
    event: String,
    epoch: u64,
    preview: bool,
    scope: Arc<dyn Fn() -> bool + Send + Sync>,
) -> Option<PlaybackLifecycleObserver> {
    if selected.pack_id != "pack_vrzo_20261028" {
        return None;
    }
    let mixed = app.path().resource_dir().ok().and_then(|root| {
        crate::vrzo_banner::mixed_selection(&selected.pack_id, &event, &selected.path, &root)
    });
    WORKERS
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
            (n < MAX_WORKERS).then_some(n + 1)
        })
        .ok()?;
    let slot = Slot;
    let (tx, rx) = mpsc::sync_channel::<PlaybackLifecycleEvent>(4);
    let token = NEXT.fetch_add(1, Ordering::Relaxed);
    let spawn = std::thread::Builder::new()
        .name("g-vrzo-banner".into())
        .spawn(move || {
            let _slot = slot;
            let start = Instant::now();
            let first = match rx.recv_timeout(Duration::from_secs(3)) {
                Ok(e) if e.token == token && e.phase == PlaybackLifecyclePhase::Started => e,
                _ => return,
            };
            let id = first.playback_id;
            let valid = |tail| {
                crate::vrzo_fence::valid_visual(
                    id,
                    crate::audio::current_audio_generation(),
                    crate::audio::current_lifecycle_playback_id(),
                    tail,
                    scope(),
                )
            };
            if !valid(false) {
                return;
            }
            let Some(clip_id) = first
                .audio_sha256
                .as_ref()
                .zip(first.played_audio_sha256.as_ref())
                .and_then(|(digest, played)| {
                    crate::vrzo_banner::resolve_played_clip(
                        &selected.pack_id,
                        &event,
                        &selected.path,
                        digest,
                        played,
                    )
                })
            else {
                return;
            };
            if !valid(false) {
                return;
            }
            emit(&app, id, "start", &clip_id, &event, epoch, preview);
            loop {
                if start.elapsed() > Duration::from_secs(15) {
                    emit(&app, id, "stop", &clip_id, &event, epoch, preview);
                    return;
                }
                match rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(e)
                        if e.token == token
                            && e.playback_id == id
                            && e.phase == PlaybackLifecyclePhase::Completed =>
                    {
                        if !valid(true) {
                            emit(&app, id, "stop", &clip_id, &event, epoch, preview);
                            return;
                        }
                        emit(&app, id, "completed", &clip_id, &event, epoch, preview);
                        let deadline = Instant::now() + Duration::from_millis(1400);
                        while Instant::now() < deadline && valid(true) {
                            std::thread::sleep(Duration::from_millis(50));
                        }
                        emit(&app, id, "stop", &clip_id, &event, epoch, preview);
                        return;
                    }
                    Ok(e)
                        if e.token == token
                            && e.playback_id == id
                            && matches!(
                                e.phase,
                                PlaybackLifecyclePhase::Cancelled
                                    | PlaybackLifecyclePhase::Preempted
                            ) =>
                    {
                        emit(&app, id, "stop", &clip_id, &event, epoch, preview);
                        return;
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        emit(&app, id, "stop", &clip_id, &event, epoch, preview);
                        return;
                    }
                    _ => {
                        if !valid(false) {
                            emit(&app, id, "stop", &clip_id, &event, epoch, preview);
                            return;
                        }
                    }
                }
            }
        });
    if spawn.is_err() {
        return None;
    }
    let mut observer = PlaybackLifecycleObserver::new(token, tx);
    observer.mixed = mixed;
    Some(observer)
}
