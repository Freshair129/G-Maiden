//! Bounded local visual dispatch tied to audio-owner playback identity.
use crate::audio::{PlaybackLifecycleEvent, PlaybackLifecycleObserver, PlaybackLifecyclePhase};
use crate::voice_api::AnnouncerClip;
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    mpsc, Arc,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

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
    manifest_visual: Option<ManifestVisual>,
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestVisual {
    pack_id: String,
    banner_id: String,
    revision: String,
}
#[allow(clippy::too_many_arguments)]
fn emit(
    app: &AppHandle,
    id: u64,
    phase: &'static str,
    clip_id: &str,
    event: &str,
    epoch: u64,
    preview: bool,
    manifest_visual: &Option<ManifestVisual>,
) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64;
    if let Some(visual) = manifest_visual {
        eprintln!(
            "[G-AnnouncerMedia] {}",
            serde_json::json!({"phase":phase,"playback_id":id,"pack_id":visual.pack_id,"banner_id":visual.banner_id,"revision":visual.revision,"event":event,"session_epoch":epoch,"preview":preview})
        );
    }
    let _ = app.emit(
        "announcer-media-playback",
        VisualEvent {
            id: id.to_string(),
            phase,
            clip_id: clip_id.to_string(),
            event: event.to_string(),
            session_epoch: epoch,
            preview,
            expires_at_ms: now.saturating_add(19_200),
            manifest_visual: manifest_visual.clone(),
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
    let installation_lease = selected.installation_lease().ok()?;
    let pair = selected.pair.as_ref()?;
    let visual_timeline = crate::vrzo_fence::VisualLifetime::from_timeline(
        (pair.samples as u64).saturating_mul(1000).div_ceil(48000),
        u64::from(pair.visual_tail_ms),
    );
    let mixed = Some(crate::event_media::MixedSelection {
        path: pair.mixed.clone(),
        original_sha256: pair.original_hash.clone(),
        mixed_sha256: pair.mixed_hash.clone(),
        samples: pair.samples,
    });
    let manifest_visual = Some(ManifestVisual {
        pack_id: selected.pack_id.clone(),
        banner_id: pair.banner_id.clone(),
        revision: selected.revision.to_string(),
    });
    WORKERS
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
            (n < MAX_WORKERS).then_some(n + 1)
        })
        .ok()?;
    let slot = Slot;
    let (tx, rx) = mpsc::sync_channel::<PlaybackLifecycleEvent>(4);
    let token = NEXT.fetch_add(1, Ordering::Relaxed);
    let visual_scope = (
        selected.revision,
        epoch,
        preview,
        if matches!(event.as_str(), "gank" | "revision") {
            1
        } else {
            0
        },
    );
    let spawn = std::thread::Builder::new()
        .name("g-vrzo-banner".into())
        .spawn(move || {
            let _installation_lease = installation_lease;
            let _slot = slot;
            let first = match rx.recv_timeout(Duration::from_secs(3)) {
                Ok(e) if e.token == token && e.phase == PlaybackLifecyclePhase::Started => e,
                _ => return,
            };
            let start = Instant::now();
            let id = first.playback_id;
            let mut lifetime = visual_timeline;
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
            let end_phase = || {
                let same_pack =
                    crate::voice_api::with_current_announcer_clip(&event, &selected, || true)
                        .is_some();
                let current = crate::audio::current_lifecycle_playback_id();
                if same_pack
                    && (preview || crate::runtime::is_current_active_session_epoch(epoch))
                    && ((current != 0 && current != id) || (preview && current == id && !scope()))
                {
                    "retire"
                } else {
                    "stop"
                }
            };
            let Some(clip_id) = first
                .audio_sha256
                .as_ref()
                .zip(first.played_audio_sha256.as_ref())
                .and_then(|(digest, played)| {
                    let pair = selected.pair.as_ref()?;
                    (selected.path == pair.original && pair.matches(digest, played))
                        .then(|| pair.banner_id.clone())
                })
            else {
                return;
            };
            if !valid(false) {
                return;
            }
            emit(
                &app,
                id,
                "start",
                &clip_id,
                &event,
                epoch,
                preview,
                &manifest_visual,
            );
            loop {
                if start.elapsed() > Duration::from_millis(lifetime.end_ms()) {
                    emit(
                        &app,
                        id,
                        "stop",
                        &clip_id,
                        &event,
                        epoch,
                        preview,
                        &manifest_visual,
                    );
                    return;
                }
                match rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(e)
                        if e.token == token
                            && e.playback_id == id
                            && e.phase == PlaybackLifecyclePhase::Completed =>
                    {
                        if !valid(true) {
                            emit(
                                &app,
                                id,
                                end_phase(),
                                &clip_id,
                                &event,
                                epoch,
                                preview,
                                &manifest_visual,
                            );
                            return;
                        }
                        emit(
                            &app,
                            id,
                            "completed",
                            &clip_id,
                            &event,
                            epoch,
                            preview,
                            &manifest_visual,
                        );
                        lifetime.complete(start.elapsed().as_millis() as u64);
                        while lifetime.valid(
                            id,
                            crate::audio::current_audio_generation(),
                            crate::audio::current_lifecycle_playback_id(),
                            scope(),
                            start.elapsed().as_millis() as u64,
                        ) {
                            std::thread::sleep(Duration::from_millis(50));
                        }
                        emit(
                            &app,
                            id,
                            end_phase(),
                            &clip_id,
                            &event,
                            epoch,
                            preview,
                            &manifest_visual,
                        );
                        return;
                    }
                    Ok(e)
                        if e.token == token
                            && e.playback_id == id
                            && matches!(
                                e.phase,
                                PlaybackLifecyclePhase::Cancelled
                                    | PlaybackLifecyclePhase::Preempted
                                    | PlaybackLifecyclePhase::Retiring
                            ) =>
                    {
                        let phase = if e.phase == PlaybackLifecyclePhase::Retiring
                            && crate::voice_api::with_current_announcer_clip(
                                &event,
                                &selected,
                                || true,
                            )
                            .is_some()
                            && (preview || crate::runtime::is_current_active_session_epoch(epoch))
                        {
                            "retire"
                        } else {
                            "stop"
                        };
                        emit(
                            &app,
                            id,
                            phase,
                            &clip_id,
                            &event,
                            epoch,
                            preview,
                            &manifest_visual,
                        );
                        return;
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        emit(
                            &app,
                            id,
                            "stop",
                            &clip_id,
                            &event,
                            epoch,
                            preview,
                            &manifest_visual,
                        );
                        return;
                    }
                    _ => {
                        if !lifetime.valid(
                            id,
                            crate::audio::current_audio_generation(),
                            crate::audio::current_lifecycle_playback_id(),
                            scope(),
                            start.elapsed().as_millis() as u64,
                        ) {
                            emit(
                                &app,
                                id,
                                end_phase(),
                                &clip_id,
                                &event,
                                epoch,
                                preview,
                                &manifest_visual,
                            );
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
    observer.visual_scope = Some(visual_scope);
    Some(observer)
}
