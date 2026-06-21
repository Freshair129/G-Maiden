//! Minimap screen capture (Phase 2 P2.0) — Windows Graphics Capture (WGC) via
//! `windows-capture` v2. Captures the primary monitor, crops the minimap region
//! every frame, runs the [`crate::cv::prefilter`] over it, and emits a debug
//! event so the overlay can draw candidate boxes during calibration.
//!
//! Design notes:
//! - **Read-only**: WGC composites via DWM; we never touch the game process
//!   (Risk R-06 — no inject / no memory read).
//! - **Rate**: WGC would fire at monitor refresh (60+ Hz). We cap the source to
//!   ~8 Hz via `MinimumUpdateIntervalSettings` so CPU stays in budget without us
//!   busy-dropping frames. Adaptive 15 Hz (when Sentry is suspicious) is P2.3+.
//! - **Color**: we request `Bgra8`, matching [`crate::cv::Frame`]'s byte order.
//!
//! Live verification (compile alone is NOT sufficient) needs Dota 2 open — see
//! the Phase 2 roadmap P2.0 exit criteria.

use std::time::Duration;

use tauri::{AppHandle, Emitter};
use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    frame::Frame as WcFrame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    },
};

use crate::cv::prefilter::{prefilter_candidates, DEFAULT_THRESHOLD_FRAC};
use crate::cv::region::MinimapRegion;
use crate::cv::Frame;

/// Target source frame rate (Hz) for the capture. ~8 Hz sits in the spike's
/// proven "normal" band (5–8 Hz) and keeps CPU far under the 2.5% budget.
const CAPTURE_HZ: u64 = 8;

/// Debug payload emitted per processed frame so the overlay can draw candidate
/// boxes over the minimap while the user calibrates the region.
#[derive(Clone, serde::Serialize)]
struct MinimapDebug {
    region: MinimapRegion,
    icon: usize,
    /// candidate top-left coords *within* the cropped region.
    candidates: Vec<(i32, i32)>,
    count: usize,
}

/// Capture handler state. Flags carry the Tauri handle (to emit) and the
/// computed minimap region (so `new` doesn't have to recompute geometry).
struct MinimapCapture {
    app: AppHandle,
    region: MinimapRegion,
    icon: usize,
}

impl GraphicsCaptureApiHandler for MinimapCapture {
    type Flags = (AppHandle, MinimapRegion);
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let (app, region) = ctx.flags;
        let icon = region.icon_size();
        Ok(MinimapCapture { app, region, icon })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut WcFrame<'_>,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        let r = self.region;
        // Crop to the minimap square. buffer_crop takes (start_x, start_y,
        // end_x, end_y) with end exclusive, so width == side.
        let end_x = (r.x + r.side).min(frame.width());
        let end_y = (r.y + r.side).min(frame.height());
        if r.x >= end_x || r.y >= end_y {
            return Ok(()); // region off-screen (bad calibration) — skip safely
        }
        let buf = frame.buffer_crop(r.x, r.y, end_x, end_y)?;
        let w = (end_x - r.x) as usize;
        let h = (end_y - r.y) as usize;
        // v2 fills our Vec with tightly-packed BGRA rows (stride padding removed)
        // and returns a slice into it; we keep the owned Vec for the Frame.
        let mut packed: Vec<u8> = Vec::new();
        let _ = buf.as_nopadding_buffer(&mut packed);

        if let Some(f) = Frame::from_bgra(w, h, packed) {
            let candidates = prefilter_candidates(&f, self.icon, DEFAULT_THRESHOLD_FRAC);
            let payload = MinimapDebug {
                region: r,
                icon: self.icon,
                count: candidates.len(),
                candidates,
            };
            let _ = self.app.emit("minimap-cv", payload);
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Spawn the minimap capture on its own thread. Non-blocking; logs and exits
/// quietly on any failure (e.g. WGC unavailable on older Windows) so the rest
/// of the app keeps running.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        if let Err(e) = run(app) {
            eprintln!("[capture] minimap capture stopped: {e}");
        }
    });
}

fn run(app: AppHandle) -> Result<(), String> {
    let monitor = Monitor::primary().map_err(|e| format!("no primary monitor: {e}"))?;
    let sw = monitor.width().map_err(|e| format!("monitor width: {e}"))?;
    let sh = monitor.height().map_err(|e| format!("monitor height: {e}"))?;
    let region = MinimapRegion::for_resolution(sw, sh);

    let settings = Settings::new(
        monitor,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(1000 / CAPTURE_HZ)),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        (app, region),
    );

    // Blocking: takes over this (spawned) thread running the WGC message loop.
    MinimapCapture::start(settings).map_err(|e| format!("capture failed: {e}"))
}
