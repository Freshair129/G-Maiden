//! Local preview transport. This worker never publishes CV observations or warnings.
use crate::minimap_preview::{Geometry, Status, Stream};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    mpsc, Arc, Mutex, OnceLock,
};

use tauri::{ipc::Response, AppHandle, Manager, WebviewWindow};

static GEOMETRY: Mutex<Option<(u64, Geometry)>> = Mutex::new(None);
static GEOMETRY_GENERATION: AtomicU64 = AtomicU64::new(0);

#[cfg_attr(feature = "wgc", allow(dead_code))]
pub struct SourceScope;
#[cfg_attr(feature = "wgc", allow(dead_code))]
impl SourceScope {
    pub fn new() -> Self {
        invalidate_geometry();
        Self
    }
}
impl Drop for SourceScope {
    fn drop(&mut self) {
        invalidate_geometry();
    }
}
pub fn invalidate_geometry() -> u64 {
    GEOMETRY_GENERATION
        .fetch_add(1, Ordering::AcqRel)
        .wrapping_add(1)
}
#[cfg_attr(feature = "wgc", allow(dead_code))]
pub fn publish_geometry(geometry: Geometry) {
    // The critical capture owner never waits on preview locks or transport.
    if let Ok(mut slot) = GEOMETRY.try_lock() {
        *slot = Some((GEOMETRY_GENERATION.load(Ordering::Acquire), geometry));
    }
}
fn geometry() -> (u64, Option<Geometry>) {
    let generation = GEOMETRY_GENERATION.load(Ordering::Acquire);
    let value = GEOMETRY
        .lock()
        .ok()
        .and_then(|slot| *slot)
        .filter(|(version, g)| *version == generation && g.valid())
        .map(|(_, g)| g);
    (generation, value)
}
fn now_us() -> u64 {
    crate::minimap_preview_process::clock_us()
}

struct Runtime {
    state: Arc<Mutex<Stream>>,
    wake: mpsc::SyncSender<()>,
}
fn runtime() -> &'static Runtime {
    static RUNTIME: OnceLock<Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        let state = Arc::new(Mutex::new(Stream::default()));
        let (wake, receiver) = mpsc::sync_channel(1);
        let worker_state = state.clone();
        let worker_wake = wake.clone();
        std::thread::Builder::new()
            .name("g-minimap-preview".into())
            .spawn(move || worker(worker_state, receiver, worker_wake))
            .expect("preview worker spawn");
        Runtime { state, wake }
    })
}
pub(crate) fn context() -> (u64, u64, Option<Geometry>) {
    let session = crate::runtime::match_session_snapshot();
    let epoch = if crate::runtime::is_current_capture_session(session.session_epoch) {
        session.session_epoch
    } else {
        0
    };
    let (generation, geometry) = geometry();
    (epoch, generation, geometry)
}
fn trusted(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "control" {
        return Err("preview is restricted to Control".into());
    }
    let bootstrap = app
        .try_state::<crate::OverlayBootstrap>()
        .ok_or("Control bootstrap unavailable")?;
    let root = bootstrap
        .state
        .lock()
        .map_err(|_| "Control bootstrap unavailable")?
        .root();
    let url = window.url().map_err(|_| "Control URL unavailable")?;
    if !root.trusts(url.as_str()) {
        return Err("untrusted preview origin".into());
    }
    Ok(())
}
fn visible(window: &WebviewWindow) -> bool {
    window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true)
}
fn token(value: &str) -> Result<u64, String> {
    if value.len() > 20 || value.is_empty() || !value.bytes().all(|c| c.is_ascii_digit()) {
        return Err("invalid preview sequence".into());
    }
    value.parse().map_err(|_| "invalid preview sequence".into())
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lease {
    lease_id: String,
}

#[tauri::command]
pub async fn start_minimap_preview(app: AppHandle, window: WebviewWindow) -> Result<Lease, String> {
    trusted(&app, &window)?;
    if now_us() == 0 {
        return Err("shared preview clock unavailable".into());
    }
    if !visible(&window) {
        return Err("Control is hidden".into());
    }
    let (epoch, generation, geometry) = context();
    let rt = runtime();
    let id = {
        let mut state = rt.state.lock().map_err(|_| "preview unavailable")?;
        state.source(epoch, geometry, generation);
        state.start(now_us())
    };
    let _ = rt.wake.try_send(());
    Ok(Lease {
        lease_id: id.to_string(),
    })
}
#[tauri::command]
pub async fn read_minimap_preview(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    after_frame_id: String,
) -> Result<Response, String> {
    trusted(&app, &window)?;
    let id = token(&lease_id)?;
    let after = token(&after_frame_id)?;
    let (epoch, generation, geometry) = context();
    let control_visible = visible(&window);
    let rt = runtime();
    let mut state = rt.state.lock().map_err(|_| "preview unavailable")?;
    state.source(epoch, geometry, generation);
    if !control_visible {
        state.stop(id);
    }
    if !crate::governor::preview_allowed() {
        state.set_status(Status::Pressure);
    }
    Ok(Response::new(state.response(id, after, now_us())))
}
#[tauri::command]
pub async fn stop_minimap_preview(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
) -> Result<(), String> {
    trusted(&app, &window)?;
    runtime()
        .state
        .lock()
        .map_err(|_| "preview unavailable")?
        .stop(token(&lease_id)?);
    let _ = runtime().wake.try_send(());
    Ok(())
}

#[cfg(not(feature = "wgc"))]
fn worker(state: Arc<Mutex<Stream>>, receiver: mpsc::Receiver<()>, wake: mpsc::SyncSender<()>) {
    crate::minimap_preview_process::parent_worker(state, receiver, wake);
}

#[cfg(feature = "wgc")]
fn worker(state: Arc<Mutex<Stream>>, receiver: mpsc::Receiver<()>, _wake: mpsc::SyncSender<()>) {
    for _ in receiver {
        if let Ok(mut s) = state.lock() {
            s.set_status(Status::Unavailable);
        }
    }
}
