//! GANN lifecycle receipts. Native owns presentation; no WebView start/stop path.
use crate::audio::{PlaybackLifecycleEvent, PlaybackLifecycleObserver, PlaybackLifecyclePhase};
use crate::voice_api::AnnouncerClip;
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    mpsc, Arc,
};
use std::time::Duration;
use tauri::AppHandle;

static WORKERS: AtomicUsize = AtomicUsize::new(0);
static NEXT: AtomicU64 = AtomicU64::new(1);
struct Slot;
impl Drop for Slot {
    fn drop(&mut self) {
        WORKERS.fetch_sub(1, Ordering::AcqRel);
    }
}

pub(crate) fn observer(
    _app: AppHandle,
    selected: AnnouncerClip,
    event: String,
    epoch: u64,
    preview: bool,
    scope: Arc<dyn Fn() -> bool + Send + Sync>,
) -> Option<PlaybackLifecycleObserver> {
    let pair = selected.pair.as_ref()?;
    let mut asset = crate::voice_api::native_asset(&selected).ok()?;
    Arc::get_mut(&mut asset)?.diagnostic_marker =
        preview && crate::gann_native::presentation_probe();
    let mixed = crate::event_media::MixedSelection {
        path: pair.mixed.clone(),
        original_sha256: pair.original_hash.clone(),
        mixed_sha256: pair.mixed_hash.clone(),
        samples: pair.samples,
    };
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
    WORKERS
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
            (n < 4).then_some(n + 1)
        })
        .ok()?;
    let slot = Slot;
    let token = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::sync_channel::<PlaybackLifecycleEvent>(4);
    std::thread::Builder::new().name("g-gann-lifecycle".into()).spawn(move || {
        let _slot=slot;
        let first=match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(e) if e.token==token && e.phase==PlaybackLifecyclePhase::Started=>e,
            _=>return,
        };
        let pair=selected.pair.as_ref().expect("admitted pair");
        let matched=first.audio_sha256.as_ref().zip(first.played_audio_sha256.as_ref()).is_some_and(|(a,b)|pair.matches(a,b));
        eprintln!("[G-AnnouncerMedia] {}",serde_json::json!({"phase":"audio_owner_started","renderer":"native","playback_id":first.playback_id,"pack_id":selected.pack_id,"revision":selected.revision,"banner_id":pair.banner_id,"event":event,"session_epoch":epoch,"preview":preview,"pair_hashes_match":matched}));
        if let Ok(end)=rx.recv_timeout(Duration::from_secs(24)) {
            eprintln!("[G-AnnouncerMedia] {}",serde_json::json!({"phase":"audio_owner_finished","playback_id":end.playback_id,"reason":format!("{:?}",end.phase),"event":event,"revision":selected.revision}));
        }
    }).ok()?;
    let mut observer = PlaybackLifecycleObserver::new(token, tx);
    observer.mixed = Some(mixed);
    observer.visual_scope = Some(visual_scope);
    observer.native_asset = Some(asset);
    observer.native_scope = Some(scope);
    Some(observer)
}
