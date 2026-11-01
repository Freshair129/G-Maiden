//! Native GANN pair ownership. Preparation is silent; only the audio owner's
//! admission starts the device clock. Dropping the handle revokes both outputs.
use std::sync::{
    atomic::{AtomicBool, AtomicU32, Ordering},
    mpsc, Arc,
};
use std::time::Duration;

#[path = "gann_native_budget.rs"]
mod budget;
#[path = "gann_native_decode.rs"]
mod decode;
#[path = "gann_native_windows.rs"]
mod platform;
#[path = "gann_native_volume.rs"]
mod volume;

pub(crate) struct Asset {
    pub bytes: Arc<Vec<u8>>,
    pub video: crate::gann_webm::Video,
    pub lease: Option<crate::package_install::InstalledSnapshot>,
    pub diagnostic_marker: bool,
}
impl Asset {
    pub fn new(bytes: Arc<Vec<u8>>) -> Result<Arc<Self>, String> {
        let video = crate::gann_webm::parse(&bytes)?;
        Ok(Arc::new(Self {
            bytes,
            video,
            lease: None,
            diagnostic_marker: false,
        }))
    }
}
pub(crate) struct Control {
    start: AtomicBool,
    stop: AtomicBool,
    done: AtomicBool,
    audio_done: AtomicBool,
    volume: AtomicU32,
    pub fade: Arc<AtomicBool>,
    scope: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
    pending: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
}
impl Control {
    fn new(fade: Arc<AtomicBool>) -> Self {
        Self {
            start: AtomicBool::new(false),
            stop: AtomicBool::new(false),
            done: AtomicBool::new(false),
            audio_done: AtomicBool::new(false),
            volume: AtomicU32::new(0f32.to_bits()),
            fade,
            scope: None,
            pending: None,
        }
    }
    fn cancelled(&self) -> bool {
        self.stop.load(Ordering::Acquire)
            || (!self.start.load(Ordering::Acquire)
                && self.pending.as_ref().is_some_and(|valid| !valid()))
    }
    fn gain(&self) -> f32 {
        f32::from_bits(self.volume.load(Ordering::Acquire))
    }
}
pub(crate) struct Playback(Arc<Control>);
impl Playback {
    pub fn start(&self) {
        self.0.start.store(true, Ordering::Release);
    }
    pub fn stop(&self) {
        self.0.stop.store(true, Ordering::Release);
    }
    pub fn empty(&self) -> bool {
        self.0.done.load(Ordering::Acquire)
    }
    pub fn audio_done(&self) -> bool {
        self.0.audio_done.load(Ordering::Acquire)
    }
    pub fn set_volume(&self, volume: f32) {
        self.0
            .volume
            .store(volume.clamp(0., 1.).to_bits(), Ordering::Release);
    }
}
impl Drop for Playback {
    fn drop(&mut self) {
        self.stop();
    }
}
struct Worker {
    control: Arc<Control>,
    _resources: budget::Lease,
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.control.done.store(true, Ordering::Release);
    }
}
pub(crate) fn prepare(
    asset: Arc<Asset>,
    pcm: Vec<i16>,
    fade: Arc<AtomicBool>,
    scope: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
    pending: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
    critical: bool,
) -> Result<Playback, String> {
    let pixels = asset.video.width * asset.video.height;
    let resources = budget::acquire(critical, pixels, pending.as_deref(), || {
        crate::audio::active_priority() == crate::audio::Priority::Critical
    })?;
    let mut state = Control::new(fade);
    state.scope = scope;
    state.pending = pending;
    let control = Arc::new(state);
    let worker = Worker {
        control: control.clone(),
        _resources: resources,
    };
    let (tx, rx) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("g-gann-native".into())
        .spawn(move || {
            let guard = worker;
            if let Err(error) = platform::run(asset, pcm, guard.control.clone(), tx, critical) {
                eprintln!("[G-NativeMedia] phase=rejected error={error}");
            }
        })
        .map_err(|e| e.to_string())?;
    let playback = Playback(control);
    rx.recv_timeout(if critical {
        Duration::from_millis(180)
    } else {
        Duration::from_secs(1)
    })
    .map_err(|_| "native preparation failed or timed out")??;
    Ok(playback)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Layout {
    pub x: f32,
    pub y: f32,
    pub scale: f32,
    pub enabled: bool,
}
impl Default for Layout {
    fn default() -> Self {
        Self {
            x: 89.,
            y: 44.,
            scale: 0.7,
            enabled: true,
        }
    }
}
static LAYOUT: std::sync::Mutex<Layout> = std::sync::Mutex::new(Layout {
    x: 89.,
    y: 44.,
    scale: 0.7,
    enabled: true,
});
static VISIBLE: AtomicBool = AtomicBool::new(true);
static PRESENTATION_PROBE: AtomicBool = AtomicBool::new(false);
pub(crate) fn set_presentation_probe(enabled: bool) {
    PRESENTATION_PROBE.store(enabled, Ordering::Release);
}
pub(crate) fn presentation_probe() -> bool {
    PRESENTATION_PROBE.load(Ordering::Acquire)
}
pub(crate) fn set_visible(visible: bool) {
    VISIBLE.store(visible, Ordering::Release);
}
fn layout() -> Layout {
    let mut value = LAYOUT.lock().map(|g| *g).unwrap_or_default();
    value.enabled &= VISIBLE.load(Ordering::Acquire);
    value
}
pub(crate) fn settings(json: &str) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return;
    };
    let mut next = Layout::default();
    if let Some(banner) = value.pointer("/layout/banner") {
        let number = |key: &str, default: f32, min: f32, max: f32| {
            banner[key]
                .as_f64()
                .filter(|n| n.is_finite())
                .map(|n| (n as f32).clamp(min, max))
                .unwrap_or(default)
        };
        next.x = number("x", next.x, 0., 100.);
        next.y = number("y", next.y, 0., 100.);
        next.scale = number("scale", next.scale, 0.2, 3.);
        next.enabled = banner["enabled"].as_bool().unwrap_or(true);
    }
    next.enabled &= value["killVisuals"].as_bool().unwrap_or(true);
    if let Ok(mut current) = LAYOUT.lock() {
        *current = next;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn silent_preparation_requires_admission_and_drop_revokes_outputs() {
        let control = Arc::new(Control::new(Arc::new(AtomicBool::new(false))));
        let playback = Playback(control.clone());
        assert!(!control.start.load(Ordering::Acquire));
        playback.set_volume(0.5);
        assert_eq!(control.gain(), 0.5);
        playback.start();
        assert!(control.start.load(Ordering::Acquire));
        drop(playback);
        assert!(control.cancelled());
    }
    #[test]
    fn preparation_expiry_revokes_a_waiting_owner_but_does_not_cut_an_admitted_clip() {
        let valid = Arc::new(AtomicBool::new(true));
        let check = valid.clone();
        let mut state = Control::new(Arc::new(AtomicBool::new(false)));
        state.pending = Some(Arc::new(move || check.load(Ordering::Acquire)));
        let control = Arc::new(state);
        let playback = Playback(control.clone());
        valid.store(false, Ordering::Release);
        assert!(control.cancelled());
        valid.store(true, Ordering::Release);
        playback.start();
        valid.store(false, Ordering::Release);
        assert!(!control.cancelled());
        playback.stop();
        assert!(control.cancelled());
    }
}
