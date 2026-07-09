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

use windows::core::Interface;
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource,
    DXGI_ERROR_ACCESS_LOST, DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO,
};

/// How long `acquire_frame` blocks waiting for a new desktop frame before giving
/// up for this tick (ms). Keeps the loop responsive without busy-waiting.
const ACQUIRE_TIMEOUT_MS: u32 = 100;

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
    pub fn acquire_frame(&mut self) -> Option<(Vec<u8>, u32, u32)> {
        let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource: Option<IDXGIResource> = None;

        // SAFETY: out-params are owned locals; we check the Result before use.
        let acquired = unsafe {
            self.duplication
                .AcquireNextFrame(ACQUIRE_TIMEOUT_MS, &mut info, &mut resource)
        };
        if let Err(e) = acquired {
            match e.code() {
                DXGI_ERROR_WAIT_TIMEOUT => {} // no change this tick — silent, common
                DXGI_ERROR_ACCESS_LOST => {
                    eprintln!("[dxgi] access lost — recreating duplication");
                    self.recreate();
                }
                _ => eprintln!("[dxgi] AcquireNextFrame error: {e}"),
            }
            return None;
        }

        // A frame with no present time carries only pointer/metadata updates — the
        // desktop image is unchanged, and on the very first acquire it is undefined
        // (can be all-zero). Skip it so the CV pipeline never sees a blank/stale
        // frame. In-game the screen updates every vsync, so real frames always have
        // a non-zero present time.
        if info.LastPresentTime == 0 {
            // SAFETY: matched 1:1 with the successful AcquireNextFrame above.
            unsafe {
                let _ = self.duplication.ReleaseFrame();
            }
            return None;
        }

        let result = self.copy_frame(resource);
        // Always release the frame, even if the copy failed, or the next
        // AcquireNextFrame will deadlock.
        // SAFETY: matched 1:1 with the successful AcquireNextFrame above.
        unsafe {
            let _ = self.duplication.ReleaseFrame();
        }
        result
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
                Ok(dup) => self.duplication = dup,
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

#[cfg(test)]
mod tests {
    use super::*;

    // These need a real display + GPU, so they are #[ignore] by default. DXGI
    // allows only ONE duplication per output, so they must run serially. Run on a
    // desktop session with:
    //   cargo test --bin g-maiden dxgi -- --ignored --test-threads=1

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
