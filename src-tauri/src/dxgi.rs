//! DXGI Desktop Duplication capture backend (ADR-13 / CR-001).
//!
//! Replaces the WGC (`windows-capture`) path with `IDXGIOutputDuplication`, which
//! copies the desktop image straight off the GPU. Unlike WGC it does not fight the
//! game's compositor, has no busy-wait (the `AcquireNextFrame` timeout blocks), and
//! works on Win10 without the unsupported `SetBorderRequired` call.
//!
//! Output is tightly-packed **BGRA8** bytes — the exact format
//! [`crate::cv::Frame::from_bgra`] expects, so the downstream CV pipeline is unchanged.
//!
//! Only ever used from the single dedicated capture thread, so it is intentionally
//! not `Send`/`Sync` and holds no locks.

use windows::core::{Interface, BOOL};
use windows::Win32::Foundation::{CloseHandle, HMODULE, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIDevice, IDXGIFactory1, IDXGIOutput1,
    IDXGIOutputDuplication, IDXGIResource, DXGI_ERROR_ACCESS_LOST, DXGI_ERROR_WAIT_TIMEOUT,
    DXGI_OUTDUPL_FRAME_INFO,
};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClientRect, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
    IsWindowVisible,
};

/// How long `acquire_frame` blocks waiting for a new desktop frame before giving
/// up for this tick (ms). Keeps the loop responsive without busy-waiting.
const ACQUIRE_TIMEOUT_MS: u32 = 100;

/// CR012-P2-01: consecutive DXGI `ACCESS_LOST` results (each followed by a
/// `recreate()` attempt) before we give up on the GPU duplication path for
/// now and fall back to a GDI `BitBlt` of the desktop. A live diagnostic
/// showed Dota 2's borderless-fullscreen independent-flip/MPO ownership of
/// the output makes `AcquireNextFrame` return `ACCESS_LOST` on *every* call
/// and `recreate()` never recovers, so this threshold exists only to ride
/// out a single transient loss (e.g. one alt-tab / mode switch) before
/// switching backends.
const GDI_FALLBACK_THRESHOLD: u32 = 5;

/// While in GDI fallback mode, re-probe DXGI once every this-many
/// `acquire_frame` calls (a few seconds at the 4-8Hz capture rate) in case
/// Dota exited or the duplication became available again, so capture can
/// hop back onto the cheaper GPU path.
const GDI_RETRY_INTERVAL: u32 = 60;

/// A live Desktop Duplication session for one monitor.
pub struct DxgiCapture {
    duplication: IDXGIOutputDuplication,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    staging: ID3D11Texture2D,
    /// Kept so the duplication can be rebuilt after `DXGI_ERROR_ACCESS_LOST`.
    output1: IDXGIOutput1,
    width: u32,
    height: u32,
    /// Virtual-desktop origin of the captured monitor (`DXGI_OUTPUT_DESC`'s
    /// `DesktopCoordinates`, NOT the duplication's `ModeDesc` which only
    /// gives resolution). Used by the GDI fallback's `BitBlt` to copy the
    /// right screen region — `GetDC(None)` addresses the whole virtual
    /// desktop, so the source offset must be in that same coordinate space.
    desktop_left: i32,
    desktop_top: i32,
    /// CR012-P2-01: consecutive `ACCESS_LOST` results since the last
    /// successful DXGI acquire; drives the switch into `gdi_mode` at
    /// [`GDI_FALLBACK_THRESHOLD`].
    consecutive_access_lost: u32,
    /// True once Desktop Duplication has been given up on for this session
    /// (until a periodic recovery probe succeeds) — `acquire_frame` then
    /// serves frames via GDI `BitBlt` instead of `AcquireNextFrame`.
    gdi_mode: bool,
    /// Counts `acquire_frame` calls while `gdi_mode` is active, so a DXGI
    /// recovery probe runs only once every [`GDI_RETRY_INTERVAL`] calls.
    gdi_probe_tick: u32,
    /// CR012-P1b: the very first acquired frame after a (re)create has undefined
    /// contents (can be all-zero), so it — and ONLY it — is skipped. Every later
    /// frame is copied even when `LastPresentTime == 0`: with some borderless
    /// flip models the desktop-duplication present clock stays 0 while the
    /// framebuffer is genuinely live (the exact failure Boss hit — the old code
    /// skipped every such frame and CV never saw the game).
    first_frame: bool,
    /// CR012-P1b diagnostics — throttled counters so error.log shows whether
    /// frames are actually flowing (acquired / timed-out / present0 / copied).
    diag: FrameDiag,
}

/// Throttled DXGI frame-flow counters (CR012-P1b). Logged ≈ every 5s so a stuck
/// capture is visible in error.log instead of silently starving CV.
struct FrameDiag {
    calls: u32,
    acquired: u32,
    timeout: u32,
    access_lost: u32,
    other_err: u32,
    present0: u32,
    copied: u32,
    /// CR012-P2-01: frames served via the GDI `BitBlt` fallback this window.
    gdi_copied: u32,
    last_err: String,
    last_log: std::time::Instant,
}
impl FrameDiag {
    fn new() -> Self {
        Self {
            calls: 0,
            acquired: 0,
            timeout: 0,
            access_lost: 0,
            other_err: 0,
            present0: 0,
            copied: 0,
            gdi_copied: 0,
            last_err: String::new(),
            last_log: std::time::Instant::now(),
        }
    }
    fn maybe_log(&mut self) {
        if self.last_log.elapsed().as_millis() >= 5000 {
            crate::log::error(&format!(
                "[dxgi] frames/5s: calls={} acquired={} timeout={} access_lost={} other_err={} present0={} copied={} gdi_copied={} last_err='{}'",
                self.calls, self.acquired, self.timeout, self.access_lost,
                self.other_err, self.present0, self.copied, self.gdi_copied, self.last_err
            ));
            self.calls = 0;
            self.acquired = 0;
            self.timeout = 0;
            self.access_lost = 0;
            self.other_err = 0;
            self.present0 = 0;
            self.copied = 0;
            self.gdi_copied = 0;
            self.last_err.clear();
            self.last_log = std::time::Instant::now();
        }
    }
}

impl DxgiCapture {
    /// Initialise D3D11 + an output duplication for `monitor_index` (0 = primary).
    ///
    /// Returns `Err` with a human-readable reason on any failure — the caller is
    /// expected to fall back to GSI-only Lite mode rather than crash.
    pub fn new(monitor_index: u32) -> Result<Self, String> {
        // SAFETY: all calls below are FFI into the Windows graphics stack. Each
        // out-param is a local `Option<_>`/`MaybeUninit`-style slot we own; we
        // immediately check the returned `Result` and reject null handles, so no
        // uninitialised COM pointer ever escapes this function.
        unsafe {
            let (device, context) = create_d3d11_device()?;

            let dxgi_device: IDXGIDevice = device
                .cast()
                .map_err(|e| format!("cast ID3D11Device->IDXGIDevice failed: {e}"))?;
            let adapter: IDXGIAdapter = dxgi_device
                .GetAdapter()
                .map_err(|e| format!("IDXGIDevice::GetAdapter failed: {e}"))?;
            let output = adapter.EnumOutputs(monitor_index).map_err(|e| {
                format!("EnumOutputs({monitor_index}) failed (no such monitor?): {e}")
            })?;
            let output1: IDXGIOutput1 = output
                .cast()
                .map_err(|e| format!("cast IDXGIOutput->IDXGIOutput1 failed: {e}"))?;

            // The duplication's ModeDesc (below) only gives resolution, not
            // where the monitor sits in virtual-desktop space — the GDI
            // fallback's BitBlt needs that origin, which only the output
            // description carries.
            let output_desc = output
                .GetDesc()
                .map_err(|e| format!("IDXGIOutput::GetDesc failed: {e}"))?;
            let desktop_left = output_desc.DesktopCoordinates.left;
            let desktop_top = output_desc.DesktopCoordinates.top;

            let duplication = output1
                .DuplicateOutput(&device)
                .map_err(|e| format!("DuplicateOutput failed (exclusive fullscreen?): {e}"))?;

            let desc = duplication.GetDesc();
            let width = desc.ModeDesc.Width;
            let height = desc.ModeDesc.Height;
            if width == 0 || height == 0 {
                return Err(format!("duplication reported zero size {width}x{height}"));
            }

            let staging = create_staging_texture(&device, width, height)?;

            crate::log::error(&format!(
                "[dxgi] capture ready — monitor {monitor_index}, {width}x{height} BGRA8"
            ));

            Ok(Self {
                duplication,
                device,
                context,
                staging,
                output1,
                width,
                height,
                desktop_left,
                desktop_top,
                consecutive_access_lost: 0,
                gdi_mode: false,
                gdi_probe_tick: 0,
                first_frame: true,
                diag: FrameDiag::new(),
            })
        }
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    /// Grab the next desktop frame as tightly-packed BGRA8 `(bytes, width, height)`.
    ///
    /// Returns `None` when no new frame arrived within the timeout (normal — the
    /// desktop simply didn't change) or on a recoverable error. On
    /// `DXGI_ERROR_ACCESS_LOST` (alt-tab, resolution change, mode switch) it
    /// transparently rebuilds the duplication and returns `None` for this tick.
    ///
    /// CR012-P2-01: if `ACCESS_LOST` persists for [`GDI_FALLBACK_THRESHOLD`]
    /// consecutive attempts (Desktop Duplication cannot attach while Dota 2
    /// owns the output via independent-flip/MPO — confirmed live: `recreate()`
    /// never recovers in that case), capture falls back to a GDI `BitBlt` of
    /// the same monitor region. While in that mode a DXGI recovery probe runs
    /// every [`GDI_RETRY_INTERVAL`] calls so capture can hop back onto the
    /// cheaper GPU path once it becomes available again (e.g. the game exits).
    pub fn acquire_frame(&mut self) -> Option<(Vec<u8>, u32, u32)> {
        if self.gdi_mode {
            self.gdi_probe_tick = self.gdi_probe_tick.wrapping_add(1);
            if self.gdi_probe_tick.is_multiple_of(GDI_RETRY_INTERVAL) {
                if let Some(frame) = self.try_dxgi_acquire_once() {
                    self.gdi_mode = false;
                    crate::log::error(
                        "[dxgi] Desktop Duplication recovered — leaving GDI fallback",
                    );
                    return Some(frame);
                }
                // Still access-lost (or another transient error) — fall
                // through to the GDI capture below so this tick still
                // yields a frame instead of a dropped one.
            }
            let frame = self.gdi_capture();
            if frame.is_some() {
                self.diag.gdi_copied += 1;
            }
            self.diag.maybe_log();
            return frame;
        }

        self.try_dxgi_acquire_once()
    }

    /// One DXGI `AcquireNextFrame` + copy — the exact pre-GDI-fallback path.
    /// Also drives `consecutive_access_lost` and flips `gdi_mode` on once the
    /// threshold is hit. Used both for the normal (non-fallback) capture path
    /// and for the periodic recovery probe while already in GDI mode.
    fn try_dxgi_acquire_once(&mut self) -> Option<(Vec<u8>, u32, u32)> {
        let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource: Option<IDXGIResource> = None;

        // SAFETY: out-params are owned locals; we check the Result before use.
        let acquired = unsafe {
            self.duplication
                .AcquireNextFrame(ACQUIRE_TIMEOUT_MS, &mut info, &mut resource)
        };
        self.diag.calls += 1;
        if let Err(e) = acquired {
            match e.code() {
                DXGI_ERROR_WAIT_TIMEOUT => self.diag.timeout += 1, // no change this tick — common
                DXGI_ERROR_ACCESS_LOST => {
                    self.diag.access_lost += 1;
                    self.consecutive_access_lost += 1;
                    eprintln!("[dxgi] access lost — recreating duplication");
                    self.recreate();
                    if self.consecutive_access_lost >= GDI_FALLBACK_THRESHOLD && !self.gdi_mode {
                        self.gdi_mode = true;
                        self.gdi_probe_tick = 0;
                        crate::log::error(
                            "[dxgi] Desktop Duplication access-lost x5 — falling back to GDI capture",
                        );
                    }
                }
                _ => {
                    self.diag.other_err += 1;
                    self.diag.last_err = format!("{:?}", e.code());
                    eprintln!("[dxgi] AcquireNextFrame error: {e}");
                }
            }
            self.diag.maybe_log();
            return None;
        }
        self.diag.acquired += 1;
        self.consecutive_access_lost = 0;

        // CR012-P1b: `LastPresentTime == 0` means desktop-duplication saw no NEW
        // present this tick — but the acquired frame still holds the CURRENT
        // desktop image (CopyResource below reads live staging), and with some
        // borderless flip models the present clock stays 0 while the framebuffer
        // is genuinely live. The OLD code returned here on every such frame, so
        // CV was starved whenever Dota didn't bump the present clock (the exact
        // symptom Boss hit). We now skip ONLY the very first frame after a
        // (re)create, whose contents are truly undefined/all-zero.
        if info.LastPresentTime == 0 {
            self.diag.present0 += 1;
            if self.first_frame {
                // SAFETY: matched 1:1 with the successful AcquireNextFrame above.
                unsafe {
                    let _ = self.duplication.ReleaseFrame();
                }
                self.first_frame = false;
                self.diag.maybe_log();
                return None;
            }
        }

        let result = self.copy_frame(resource);
        // Always release the frame, even if the copy failed, or the next
        // AcquireNextFrame will deadlock.
        // SAFETY: matched 1:1 with the successful AcquireNextFrame above.
        unsafe {
            let _ = self.duplication.ReleaseFrame();
        }
        if result.is_some() {
            self.first_frame = false;
            self.diag.copied += 1;
        }
        self.diag.maybe_log();
        result
    }

    /// GDI `BitBlt` fallback capture of the monitor this instance was opened
    /// on, used once Desktop Duplication is confirmed unable to attach (see
    /// [`GDI_FALLBACK_THRESHOLD`]). Produces a monitor-local tightly-packed
    /// top-down BGRA8 buffer identical in layout to [`Self::copy_frame`]'s
    /// output, so `process_frame` crops it exactly the same way.
    ///
    /// Cost: one `BitBlt` of the full monitor is a CPU-side copy — a few
    /// milliseconds for a 1920x1080 region — acceptable at the 4-8Hz capture
    /// rate and non-blocking (no compositor/present wait like the DXGI path).
    /// Never BitBlts more than once per call.
    fn gdi_capture(&self) -> Option<(Vec<u8>, u32, u32)> {
        let w = self.width as i32;
        let h = self.height as i32;

        // SAFETY: every GDI object created below (`screen_dc`, `mem_dc`,
        // `bitmap`) is released on every exit path, success or failure:
        // `SelectObject` restores `mem_dc`'s previous (stock) bitmap before
        // `bitmap` is deleted, then `mem_dc` is deleted and `screen_dc` is
        // released via `ReleaseDC` — the standard GDI
        // create/select/restore/delete/release protocol, run unconditionally
        // via the tail cleanup block regardless of which branch produced
        // `result`. Handles are checked with `is_invalid()` before use; on a
        // failure partway through, only the handles actually created so far
        // are cleaned up before returning `None`.
        unsafe {
            let screen_dc = GetDC(None);
            if screen_dc.is_invalid() {
                return None;
            }
            let mem_dc = CreateCompatibleDC(Some(screen_dc));
            if mem_dc.is_invalid() {
                let _ = ReleaseDC(None, screen_dc);
                return None;
            }
            let bitmap = CreateCompatibleBitmap(screen_dc, w, h);
            if bitmap.is_invalid() {
                let _ = DeleteDC(mem_dc);
                let _ = ReleaseDC(None, screen_dc);
                return None;
            }

            let old_obj = SelectObject(mem_dc, bitmap.into());

            let blt_ok = BitBlt(
                mem_dc,
                0,
                0,
                w,
                h,
                Some(screen_dc),
                self.desktop_left,
                self.desktop_top,
                SRCCOPY,
            )
            .is_ok();

            let result = if blt_ok {
                let mut bmi = BITMAPINFO::default();
                bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
                bmi.bmiHeader.biWidth = w;
                bmi.bmiHeader.biHeight = -h; // negative = top-down, matches DXGI layout
                bmi.bmiHeader.biPlanes = 1;
                bmi.bmiHeader.biBitCount = 32;
                bmi.bmiHeader.biCompression = BI_RGB.0;

                let mut out = vec![0u8; self.width as usize * self.height as usize * 4];
                let lines = GetDIBits(
                    mem_dc,
                    bitmap,
                    0,
                    h as u32,
                    Some(out.as_mut_ptr() as *mut core::ffi::c_void),
                    &mut bmi,
                    DIB_RGB_COLORS,
                );
                if lines > 0 {
                    Some((out, self.width, self.height))
                } else {
                    None
                }
            } else {
                None
            };

            // Tail cleanup — reached on every path that got this far
            // (success or `BitBlt`/`GetDIBits` failure alike).
            SelectObject(mem_dc, old_obj);
            let _ = DeleteObject(bitmap.into());
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);

            result
        }
    }

    /// Copy the acquired desktop texture into our CPU-readable staging texture and
    /// read it out as tightly-packed BGRA8.
    fn copy_frame(&mut self, resource: Option<IDXGIResource>) -> Option<(Vec<u8>, u32, u32)> {
        let resource = resource?;
        let desktop: ID3D11Texture2D = resource.cast().ok()?;

        // SAFETY: `desktop` and `self.staging` are valid same-size BGRA textures;
        // Map yields a CPU pointer valid until Unmap, which we always pair below.
        unsafe {
            self.context.CopyResource(&self.staging, &desktop);

            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            self.context
                .Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .ok()?;

            let w = self.width as usize;
            let h = self.height as usize;
            let tight = w * 4;
            let row_pitch = mapped.RowPitch as usize;
            let src = mapped.pData as *const u8;
            let mut out = vec![0u8; tight * h];

            if row_pitch == tight {
                std::ptr::copy_nonoverlapping(src, out.as_mut_ptr(), tight * h);
            } else {
                // GPU rows are padded to a stride; copy each row without its padding.
                for row in 0..h {
                    let s = src.add(row * row_pitch);
                    let d = out.as_mut_ptr().add(row * tight);
                    std::ptr::copy_nonoverlapping(s, d, tight);
                }
            }

            self.context.Unmap(&self.staging, 0);
            Some((out, self.width, self.height))
        }
    }

    /// Rebuild the output duplication after the OS revoked it. Best-effort: on
    /// failure the next `acquire_frame` simply keeps returning `None`.
    fn recreate(&mut self) {
        // SAFETY: FFI; on success we swap in the fresh duplication, on error we
        // keep the (now-dead) old one and report None until the next attempt.
        unsafe {
            match self.output1.DuplicateOutput(&self.device) {
                Ok(dup) => {
                    self.duplication = dup;
                    // The first frame of the fresh duplication is undefined again.
                    self.first_frame = true;
                }
                Err(e) => eprintln!("[dxgi] recreate DuplicateOutput failed: {e}"),
            }
        }
    }
}

impl Drop for DxgiCapture {
    fn drop(&mut self) {
        // The `windows` crate wraps every COM interface in an RAII handle, so the
        // duplication / device / context / staging texture all `Release()` on drop
        // automatically — no manual cleanup needed beyond a lifecycle log.
        eprintln!("[dxgi] DxgiCapture dropped — GPU resources released");
    }
}

/// Create a hardware D3D11 device + immediate context with BGRA support (required
/// to map the BGRA8 desktop format).
unsafe fn create_d3d11_device() -> Result<(ID3D11Device, ID3D11DeviceContext), String> {
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    D3D11CreateDevice(
        None,
        D3D_DRIVER_TYPE_HARDWARE,
        HMODULE::default(),
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        Some(&[D3D_FEATURE_LEVEL_11_0]),
        D3D11_SDK_VERSION,
        Some(&mut device),
        None,
        Some(&mut context),
    )
    .map_err(|e| format!("D3D11CreateDevice failed: {e}"))?;

    let device = device.ok_or_else(|| "D3D11CreateDevice returned null device".to_string())?;
    let context = context.ok_or_else(|| "D3D11CreateDevice returned null context".to_string())?;
    Ok((device, context))
}

/// Create the CPU-readable staging texture frames are copied into before mapping.
unsafe fn create_staging_texture(
    device: &ID3D11Device,
    width: u32,
    height: u32,
) -> Result<ID3D11Texture2D, String> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut texture: Option<ID3D11Texture2D> = None;
    device
        .CreateTexture2D(&desc, None, Some(&mut texture))
        .map_err(|e| format!("CreateTexture2D (staging) failed: {e}"))?;
    texture.ok_or_else(|| "CreateTexture2D returned null staging texture".to_string())
}

// ---------------------------------------------------------------------------
// Dota-2-monitor auto-detection (CR012-P1-01)
// ---------------------------------------------------------------------------
//
// `DxgiCapture::new` hardwires whatever monitor index the caller passes to
// `adapter.EnumOutputs(monitor_index)`. On a dual/multi-monitor rig, if Dota 2
// runs on a monitor other than the one the app happened to start on, capture
// silently grabs the wrong screen. `detect_dota_monitor` finds Dota's window
// and maps it to the DXGI output index the capture path can actually open.

/// Find Dota 2's window and return the adapter-0 DXGI output index whose
/// desktop rect contains the window's center point.
///
/// **Index-space constraint (read before changing):** [`DxgiCapture::new`]
/// always resolves its adapter via `ID3D11Device -> IDXGIDevice::GetAdapter`,
/// which is adapter 0 of the D3D11 default-adapter chain, then calls
/// `adapter.EnumOutputs(monitor_index)` on that ONE adapter. So the index
/// this function returns is only meaningful if it is built by walking THAT
/// SAME adapter's outputs in THAT SAME order — an index taken from any other
/// adapter (relevant on hybrid-graphics/multi-GPU machines) would point
/// `new()` at an unrelated or nonexistent output. We therefore always
/// enumerate `IDXGIFactory1::EnumAdapters(0)`'s outputs. If Dota's monitor is
/// driven by a different adapter, no rect will contain the window and we
/// correctly return `None` (caller keeps its current/primary monitor) rather
/// than guessing.
///
/// Returns `None` — never panics — when: no visible Dota 2 window is found,
/// or DXGI enumeration fails, or the window isn't on any of adapter 0's
/// outputs.
pub fn detect_dota_monitor() -> Option<u32> {
    let (cx, cy) = find_dota_window_center()?;
    let outputs = adapter0_output_rects()?;
    outputs
        .iter()
        .position(|&rect| point_in_rect(cx, cy, rect))
        .map(|i| i as u32)
}

/// Pure containment check: is point `(px, py)` inside `rect` given as
/// `(left, top, right, bottom)`? Right/bottom are treated as exclusive,
/// matching Win32 `RECT` conventions. Kept free of any Windows types so the
/// core matching logic is unit-testable without a real display/GPU.
fn point_in_rect(px: i32, py: i32, rect: (i32, i32, i32, i32)) -> bool {
    let (left, top, right, bottom) = rect;
    px >= left && px < right && py >= top && py < bottom
}

/// Accumulator threaded through the `EnumWindows` callback: the largest
/// visible Dota 2 window rect seen so far (by screen-rect area), so a
/// stray small/hidden window with a matching process never wins over the
/// real game window.
struct DotaWindowScan {
    best_area: i64,
    best_rect: Option<RECT>,
}

/// Find Dota 2's main window and return the center point of its screen rect
/// (in virtual-desktop coordinates, matching `DXGI_OUTPUT_DESC.DesktopCoordinates`).
fn find_dota_window_center() -> Option<(i32, i32)> {
    let mut scan = DotaWindowScan {
        best_area: 0,
        best_rect: None,
    };
    // SAFETY: `EnumWindows` is synchronous — it only returns once every
    // top-level window has been visited (or the callback stops it), so
    // `scan` outlives every call the callback makes into it. The callback
    // reconstructs the pointer as `&mut DotaWindowScan`, the exact type it
    // was created from, and never stores it beyond the call.
    unsafe {
        let lparam = LPARAM(std::ptr::addr_of_mut!(scan) as isize);
        let _ = EnumWindows(Some(enum_windows_proc), lparam);
    }
    let r = scan.best_rect?;
    Some(((r.left + r.right) / 2, (r.top + r.bottom) / 2))
}

/// `EnumWindows` callback: skip anything that isn't a visible Dota 2 window,
/// otherwise keep it if it's the largest match seen so far. Always returns
/// `TRUE` (continue enumerating) since we want the largest match overall,
/// not just the first hit.
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: `lparam` was set by `find_dota_window_center` to a live
    // `&mut DotaWindowScan` valid for the duration of this synchronous
    // `EnumWindows` call. `hwnd` is a handle Windows owns; every API used
    // below either takes it read-only or writes into a local out-param.
    unsafe {
        let scan = &mut *(lparam.0 as *mut DotaWindowScan);
        if !is_dota_window(hwnd) {
            return BOOL(1);
        }
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return BOOL(1);
        }
        let w = (rect.right - rect.left) as i64;
        let h = (rect.bottom - rect.top) as i64;
        if w <= 0 || h <= 0 {
            return BOOL(1);
        }
        let area = w * h;
        if area > scan.best_area {
            scan.best_area = area;
            scan.best_rect = Some(rect);
        }
        BOOL(1)
    }
}

/// Is `hwnd` a visible Dota 2 window? Prefers matching the owning process's
/// image base name (`dota2.exe`, case-insensitive); falls back to an exact
/// window-title match (`"Dota 2"`) when the process name can't be resolved
/// cheaply (e.g. `OpenProcess` denied across an elevation boundary).
unsafe fn is_dota_window(hwnd: HWND) -> bool {
    // SAFETY: `hwnd` comes straight from the OS via `EnumWindows`; every
    // call below either takes it read-only or writes into a local
    // out-param we own.
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        let mut client = RECT::default();
        if GetClientRect(hwnd, &mut client).is_ok() {
            let w = client.right - client.left;
            let h = client.bottom - client.top;
            if w <= 0 || h <= 0 {
                return false; // minimized / zero-size — not the real game window
            }
        }
        if let Some(exe_name) = process_exe_name(hwnd) {
            return exe_name.eq_ignore_ascii_case("dota2.exe");
        }
        window_title(hwnd).map(|t| t == "Dota 2").unwrap_or(false)
    }
}

/// Resolve the base exe filename (e.g. `"dota2.exe"`) of the process that
/// owns `hwnd`. Returns `None` on any failure (invalid pid, access denied,
/// truncated name, ...) — the caller falls back to a title match.
unsafe fn process_exe_name(hwnd: HWND) -> Option<String> {
    // SAFETY: `hwnd` is a valid window handle from `EnumWindows`; `pid` is a
    // local out-param; the process `HANDLE`, once opened, is always closed
    // below regardless of which path is taken.
    unsafe {
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        if !ok || len == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit(['\\', '/']).next().map(|s| s.to_string())
    }
}

/// Read `hwnd`'s window title text, if any (used only as the fallback match
/// when the owning process's exe name couldn't be resolved).
unsafe fn window_title(hwnd: HWND) -> Option<String> {
    // SAFETY: `hwnd` is a valid handle; `buf` is a local owned buffer and
    // the returned length is always `<= buf.len()`.
    unsafe {
        let mut buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len <= 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// Enumerate **adapter 0**'s DXGI outputs and return each one's virtual-
/// desktop rect as `(left, top, right, bottom)`, in `EnumOutputs` index
/// order — the exact index space [`DxgiCapture::new`] uses. `None` if the
/// factory/adapter can't be created (no DXGI-capable GPU, extremely rare).
fn adapter0_output_rects() -> Option<Vec<(i32, i32, i32, i32)>> {
    // SAFETY: all FFI; every fallible call is checked via `.ok()?`/`match`
    // before use. The loop's exit condition is `EnumOutputs` returning
    // `Err` (its normal "no more outputs" signal), not a fixed count, so it
    // can never run past what the adapter actually reports.
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().ok()?;
        let adapter0 = factory.EnumAdapters(0).ok()?;
        let mut rects = Vec::new();
        let mut i = 0u32;
        loop {
            let output = match adapter0.EnumOutputs(i) {
                Ok(o) => o,
                Err(_) => break, // no more outputs on this adapter
            };
            match output.GetDesc() {
                Ok(desc) => {
                    let c = desc.DesktopCoordinates;
                    rects.push((c.left, c.top, c.right, c.bottom));
                }
                Err(_) => break,
            }
            i += 1;
        }
        if rects.is_empty() {
            None
        } else {
            Some(rects)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn point_in_rect_inside_and_edges() {
        let rect = (100, 200, 300, 400); // left, top, right, bottom
        assert!(point_in_rect(150, 250, rect), "clearly inside");
        assert!(point_in_rect(100, 200, rect), "top-left corner is inclusive");
        assert!(
            !point_in_rect(300, 250, rect),
            "right edge is exclusive (belongs to the next monitor)"
        );
        assert!(
            !point_in_rect(150, 400, rect),
            "bottom edge is exclusive (belongs to the next monitor)"
        );
        assert!(!point_in_rect(99, 250, rect), "just left of the rect");
        assert!(!point_in_rect(150, 199, rect), "just above the rect");
    }

    #[test]
    fn point_in_rect_multi_monitor_layout() {
        // A common dual-monitor virtual-desktop layout: primary at
        // (0,0)-(1920,1080), secondary to its right at (1920,0)-(3840,1080).
        let primary = (0, 0, 1920, 1080);
        let secondary = (1920, 0, 3840, 1080);
        // Dota's window center sits on the secondary monitor.
        let (cx, cy) = (1920 + 960, 540);
        assert!(!point_in_rect(cx, cy, primary));
        assert!(point_in_rect(cx, cy, secondary));
    }

    // These need a real display + GPU, so they are #[ignore] by default. DXGI
    // allows only ONE duplication per output, so they must run serially. Run on a
    // desktop session with:
    //   cargo test --lib dxgi -- --ignored --test-threads=1

    #[test]
    #[ignore = "requires a real display/GPU"]
    fn capture_init() {
        let cap = DxgiCapture::new(0).expect("init primary monitor");
        assert!(cap.width() > 0 && cap.height() > 0);
    }

    #[test]
    #[ignore = "requires a real display/GPU"]
    fn capture_10_frames() {
        let mut cap = DxgiCapture::new(0).expect("init primary monitor");
        let (w, h) = (cap.width() as usize, cap.height() as usize);
        let mut got = 0;
        for _ in 0..30 {
            if let Some((buf, fw, fh)) = cap.acquire_frame() {
                assert_eq!(fw as usize, w);
                assert_eq!(fh as usize, h);
                assert_eq!(buf.len(), w * h * 4);
                got += 1;
                if got >= 10 {
                    break;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(16));
        }
        assert!(got > 0, "expected at least one frame in 30 tries");
    }

    #[test]
    #[ignore = "requires a real display/GPU"]
    fn capture_not_blank() {
        let mut cap = DxgiCapture::new(0).expect("init primary monitor");
        for _ in 0..30 {
            if let Some((buf, _, _)) = cap.acquire_frame() {
                assert!(buf.iter().any(|&b| b != 0), "frame was entirely zero");
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(16));
        }
        panic!("no frame captured");
    }
}
