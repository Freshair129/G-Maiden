use super::{decode, Asset, Control};
use std::{
    sync::{atomic::Ordering, mpsc, Arc},
    time::{Duration, Instant},
};
use windows::{
    core::*,
    Win32::{
        Foundation::*,
        Graphics::{
            Direct3D::*,
            Direct3D11::*,
            DirectComposition::*,
            Dxgi::{Common::*, *},
        },
        Media::Audio::*,
        System::{Com::*, Performance::*, Threading::*},
        UI::WindowsAndMessaging::*,
    },
};

type NativeResult<T> = std::result::Result<T, Box<dyn std::error::Error>>;
#[link(name = "winmm")]
unsafe extern "system" {
    fn timeBeginPeriod(period: u32) -> u32;
    fn timeEndPeriod(period: u32) -> u32;
}
struct Period;
impl Drop for Period {
    fn drop(&mut self) {
        unsafe {
            timeEndPeriod(1);
        }
    }
}
struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}
struct Audio(IAudioClient);
impl Drop for Audio {
    fn drop(&mut self) {
        unsafe {
            let _ = self.0.Stop();
            let _ = self.0.Reset();
        }
    }
}
struct Window(HWND);
impl Drop for Window {
    fn drop(&mut self) {
        unsafe {
            let _ = DestroyWindow(self.0);
        }
    }
}
struct WaitHandle(HANDLE);
impl Drop for WaitHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}
struct AudioTask(Option<HANDLE>);
impl Drop for AudioTask {
    fn drop(&mut self) {
        if let Some(h) = self.0 {
            unsafe {
                let _ = AvRevertMmThreadCharacteristics(h);
            }
        }
    }
}
fn qpc() -> f64 {
    unsafe {
        let mut p = 0;
        let mut f = 0;
        QueryPerformanceCounter(&mut p).expect("QPC");
        QueryPerformanceFrequency(&mut f).expect("QPC frequency");
        p as f64 / f as f64
    }
}
unsafe extern "system" fn proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    if msg == WM_NCHITTEST {
        return LRESULT(HTTRANSPARENT as isize);
    }
    DefWindowProcW(hwnd, msg, w, l)
}

pub(super) fn run(
    asset: Arc<Asset>,
    pcm: Vec<i16>,
    control: Arc<Control>,
    ready: mpsc::SyncSender<std::result::Result<(), String>>,
    critical: bool,
) -> std::result::Result<(), String> {
    unsafe { play(asset, pcm, control, ready, critical) }.map_err(|e| e.to_string())
}

unsafe fn play(
    asset: Arc<Asset>,
    pcm: Vec<i16>,
    control: Arc<Control>,
    ready: mpsc::SyncSender<std::result::Result<(), String>>,
    critical: bool,
) -> NativeResult<()> {
    if control.cancelled() {
        return Ok(());
    }
    CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
    let _apartment = Apartment;
    if timeBeginPeriod(1) != 0 {
        return Err("native timer resolution unavailable".into());
    }
    let _period = Period;
    let mut task_index = 0;
    let _task = AudioTask(AvSetMmThreadCharacteristicsW(w!("Audio"), &mut task_index).ok());
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let endpoint = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
    let client = Audio(endpoint.Activate::<IAudioClient>(CLSCTX_ALL, None)?);
    // Windows performs endpoint rate/channel conversion. GANN PCM stays mono48k.
    let format = WAVEFORMATEX {
        wFormatTag: 3,
        nChannels: 1,
        nSamplesPerSec: 48000,
        nAvgBytesPerSec: 192000,
        nBlockAlign: 4,
        wBitsPerSample: 32,
        cbSize: 0,
    };
    client.0.Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
        500_000,
        0,
        &format,
        None,
    )?;
    let render: IAudioRenderClient = client.0.GetService()?;
    let clock: IAudioClock = client.0.GetService()?;
    let volume = super::volume::StreamGain::new(&client.0)?;
    let frequency = clock.GetFrequency()?;
    let capacity = client.0.GetBufferSize()?;
    let preroll = if critical { 0.05 } else { 0.25 };
    let silence = (preroll * 48000.) as usize;
    let mut cursor = 0usize;
    let fill = |cursor: &mut usize| -> windows::core::Result<u32> {
        let padding = client.0.GetCurrentPadding()?;
        let available = capacity.saturating_sub(padding);
        if available > 0 {
            let dest = render.GetBuffer(available)? as *mut f32;
            for n in 0..available as usize {
                let sample = (*cursor + n)
                    .checked_sub(silence)
                    .and_then(|i| pcm.get(i))
                    .copied()
                    .unwrap_or(0);
                *dest.add(n) = f32::from(sample) / 32768.;
            }
            *cursor += available as usize;
            render.ReleaseBuffer(available, 0)?;
        }
        Ok(padding)
    };
    let mut device = None;
    let mut context = None;
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
    )?;
    let device = device.ok_or("native D3D device")?;
    let context = context.ok_or("native D3D context")?;
    let (w, h) = (asset.video.width as u32, asset.video.height as u32);
    let factory: IDXGIFactory2 = CreateDXGIFactory1()?;
    let desc = DXGI_SWAP_CHAIN_DESC1 {
        Width: w,
        Height: h,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
        BufferCount: 3,
        Scaling: DXGI_SCALING_STRETCH,
        SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
        AlphaMode: DXGI_ALPHA_MODE_PREMULTIPLIED,
        Flags: DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT.0 as u32,
        ..Default::default()
    };
    let swap = factory.CreateSwapChainForComposition(&device, &desc, None)?;
    let swap2: IDXGISwapChain2 = swap.cast()?;
    let media: IDXGISwapChainMedia = swap.cast()?;
    swap2.SetMaximumFrameLatency(2)?;
    let latency = WaitHandle(swap2.GetFrameLatencyWaitableObject());
    static CLASS: std::sync::OnceLock<std::result::Result<(), String>> = std::sync::OnceLock::new();
    CLASS
        .get_or_init(|| {
            let wc = WNDCLASSW {
                lpfnWndProc: Some(proc),
                lpszClassName: w!("GMaidenGannNative"),
                ..Default::default()
            };
            if RegisterClassW(&wc) == 0 {
                Err(Error::from_win32().to_string())
            } else {
                Ok(())
            }
        })
        .clone()?;
    let window = Window(CreateWindowExW(
        WS_EX_NOREDIRECTIONBITMAP
            | WS_EX_TOPMOST
            | WS_EX_TOOLWINDOW
            | WS_EX_NOACTIVATE
            | WS_EX_TRANSPARENT,
        w!("GMaidenGannNative"),
        w!("G-Maiden GANN"),
        WS_POPUP,
        0,
        0,
        1,
        1,
        None,
        None,
        None,
        None,
    )?);
    let dxgi: IDXGIDevice = device.cast()?;
    let comp: IDCompositionDevice = DCompositionCreateDevice(&dxgi)?;
    let target = comp.CreateTargetForHwnd(window.0, true)?;
    let visual = comp.CreateVisual()?;
    visual.SetContent(&swap)?;
    target.SetRoot(&visual)?;
    let place = |layout: super::Layout| -> windows::core::Result<()> {
        let screen_w = GetSystemMetrics(SM_CXSCREEN).max(1) as f32;
        let screen_h = GetSystemMetrics(SM_CYSCREEN).max(1) as f32;
        let width = 680f32.min(screen_w * 0.72) * layout.scale;
        let height = width * h as f32 / w as f32;
        visual.SetTransform2(&windows_numerics::Matrix3x2 {
            M11: width / w as f32,
            M22: height / h as f32,
            M12: 0.,
            M21: 0.,
            M31: 0.,
            M32: 0.,
        })?;
        SetWindowPos(
            window.0,
            Some(HWND_TOPMOST),
            (screen_w * layout.x / 100. - width / 2.).round() as i32,
            (screen_h * layout.y / 100. - height / 2.).round() as i32,
            width.ceil() as i32,
            height.ceil() as i32,
            SWP_NOACTIVATE,
        )?;
        let _ = ShowWindow(
            window.0,
            if layout.enabled {
                SW_SHOWNOACTIVATE
            } else {
                SW_HIDE
            },
        );
        comp.Commit()?;
        Ok(())
    };
    let mut layout = super::layout();
    place(layout)?;
    let clear = vec![0u8; w as usize * h as usize * 4];
    for _ in 0..6 {
        if control.cancelled() {
            return Ok(());
        }
        let warmup = Instant::now();
        while WaitForSingleObject(latency.0, 1) != WAIT_OBJECT_0 {
            if control.cancelled() {
                return Ok(());
            }
            if warmup.elapsed() >= Duration::from_millis(250) {
                return Err("native composition warmup timeout".into());
            }
        }
        let back: ID3D11Texture2D = swap.GetBuffer(0)?;
        context.UpdateSubresource(&back, 0, None, clear.as_ptr().cast(), w * 4, 0);
        swap.Present(1, DXGI_PRESENT(0)).ok()?;
    }
    let warmup_present_count = swap.GetLastPresentCount()?;
    let (tx, rx) = mpsc::sync_channel(3);
    let decoded_asset = asset.clone();
    let decode_control = control.clone();
    let decoder = std::thread::Builder::new()
        .name("g-gann-decode".into())
        .spawn(move || {
            let outcome = (|| -> std::result::Result<(), String> {
                let mut frames = decode::Frames::new(&decoded_asset)?;
                for index in 0..decoded_asset.video.frames.len() {
                    if decode_control.cancelled() {
                        break;
                    }
                    let pixels = frames.frame(index)?;
                    if tx.send(Ok((index, pixels))).is_err() {
                        break;
                    }
                }
                Ok(())
            })();
            if let Err(error) = outcome {
                let _ = tx.send(Err(error));
            }
        })?;
    let outcome = (|| -> NativeResult<()> {
        let mut next = Some(rx.recv_timeout(Duration::from_secs(1))??);
        fill(&mut cursor)?;
        if ready.send(Ok(())).is_err() {
            return Ok(());
        }
        let prepared = Instant::now();
        let mut msg = MSG::default();
        while !control.start.load(Ordering::Acquire) {
            if control.cancelled() || prepared.elapsed() > Duration::from_secs(3) {
                return Ok(());
            }
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        if control.cancelled() {
            return Ok(());
        }
        volume.set(control.gain())?;
        client.0.Start()?;
        let start = qpc();
        let wall = Instant::now();
        let duration = asset.video.duration_us as f64 / 1e6;
        let finish = duration.max(pcm.len() as f64 / 48000.);
        let mut records = Vec::new();
        let mut statistics = Vec::new();
        let mut previous = (u32::MAX, u32::MAX);
        let mut index = 0;
        let mut clear_count = None;
        let mut available = false;
        let mut authored_end = false;
        let mut last_fill = Instant::now();
        let mut last_scope = Instant::now() - Duration::from_secs(1);
        let mut fade_start = None;
        let mut underruns = 0;
        while wall.elapsed().as_secs_f64() < finish + preroll + 2. {
            if control.cancelled() {
                break;
            }
            if last_scope.elapsed() >= Duration::from_millis(20) {
                if control.scope.as_ref().is_some_and(|scope| !scope()) {
                    control.stop.store(true, Ordering::Release);
                    break;
                }
                last_scope = Instant::now();
            }
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let current_layout = super::layout();
            if current_layout != layout {
                place(current_layout)?;
                layout = current_layout;
            }
            if control.fade.load(Ordering::Acquire) {
                fade_start.get_or_insert_with(Instant::now);
            }
            let fade = fade_start
                .map(|t| 1. - t.elapsed().as_secs_f32() / 0.15)
                .unwrap_or(1.)
                .max(0.);
            if fade == 0. {
                break;
            }
            volume.set(control.gain() * fade)?;
            if last_fill.elapsed() >= Duration::from_millis(3) {
                if fill(&mut cursor)? == 0 {
                    underruns += 1;
                }
                last_fill = Instant::now();
            }
            let mut s = DXGI_FRAME_STATISTICS_MEDIA::default();
            if media.GetFrameStatisticsMedia(&mut s).is_ok()
                && (s.PresentCount, s.PresentRefreshCount) != previous
            {
                statistics.push(serde_json::json!({"observed_qpc":qpc(),"present_count":s.PresentCount,"present_refresh":s.PresentRefreshCount,"sync_refresh":s.SyncRefreshCount,"sync_qpc_raw":s.SyncQPCTime,"mode":s.CompositionMode.0}));
                previous = (s.PresentCount, s.PresentRefreshCount);
            }
            let mut pos = 0;
            let mut correlated = 0;
            clock.GetPosition(&mut pos, Some(&mut correlated))?;
            let time = pos as f64 / frequency as f64
                + if pos > 0 {
                    (qpc() - correlated as f64 / 1e7).max(0.)
                } else {
                    0.
                }
                - preroll;
            if time >= pcm.len() as f64 / 48000. {
                control.audio_done.store(true, Ordering::Release);
            }
            if index == asset.video.frames.len() {
                if clear_count.is_none()
                    && time + 2. / 60. >= duration
                    && WaitForSingleObject(latency.0, 1) == WAIT_OBJECT_0
                {
                    let back: ID3D11Texture2D = swap.GetBuffer(0)?;
                    context.UpdateSubresource(&back, 0, None, clear.as_ptr().cast(), w * 4, 0);
                    swap.Present(1, DXGI_PRESENT(0)).ok()?;
                    clear_count = Some(swap.GetLastPresentCount()?);
                }
                if time >= finish
                    && (!layout.enabled || clear_count.is_some_and(|id| previous.0 >= id))
                {
                    authored_end = true;
                    break;
                }
            } else {
                if next.is_none() {
                    match rx.try_recv() {
                        Ok(result) => next = Some(result?),
                        Err(mpsc::TryRecvError::Disconnected) => {
                            return Err("native decoder ended early".into())
                        }
                        Err(mpsc::TryRecvError::Empty) => {
                            std::thread::sleep(Duration::from_millis(1));
                            continue;
                        }
                    }
                }
                if !available {
                    available = WaitForSingleObject(latency.0, 1) == WAIT_OBJECT_0;
                }
                let pts = asset.video.frames[index].pts_us as f64 / 1e6;
                if available && time + 2. / 60. >= pts {
                    let (actual, pixels) = next.take().ok_or("native frame missing")?;
                    if actual != index {
                        return Err("native decode sequence mismatch".into());
                    }
                    let back: ID3D11Texture2D = swap.GetBuffer(0)?;
                    let submit = qpc();
                    context.UpdateSubresource(&back, 0, None, pixels.as_ptr().cast(), w * 4, 0);
                    swap.Present(1, DXGI_PRESENT(0)).ok()?;
                    records.push(serde_json::json!({"index":index,"pts":pts,"audio_time":time,"submit_qpc":submit,"present_count":swap.GetLastPresentCount()?}));
                    index += 1;
                    available = false;
                }
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        client.0.Stop()?;
        let hidden = qpc();
        let _ = ShowWindow(window.0, SW_HIDE);
        for _ in 0..40 {
            if control.cancelled() || fade_start.is_some() {
                break;
            }
            let mut s = DXGI_FRAME_STATISTICS_MEDIA::default();
            if media.GetFrameStatisticsMedia(&mut s).is_ok()
                && (s.PresentCount, s.PresentRefreshCount) != previous
            {
                statistics.push(serde_json::json!({"observed_qpc":qpc(),"present_count":s.PresentCount,"present_refresh":s.PresentRefreshCount,"sync_refresh":s.SyncRefreshCount,"sync_qpc_raw":s.SyncQPCTime,"mode":s.CompositionMode.0}));
                previous = (s.PresentCount, s.PresentRefreshCount);
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        eprintln!(
            "[G-NativeMedia] {}",
            serde_json::json!({"phase":"finished","source_video_sha256":crate::vrzo_mix::hex_digest(ring::digest::digest(&ring::digest::SHA256,&asset.bytes).as_ref().try_into().expect("SHA256 length")),"start_qpc":start,"hidden_qpc":hidden,"submitted":records,"warmup_present_count":warmup_present_count,"clear_present_count":clear_count,"compositor_statistics":statistics,"expected_frames":asset.video.frames.len(),"duration_seconds":duration,"preroll_seconds":preroll,"completed":authored_end && index==asset.video.frames.len() && !control.cancelled() && fade_start.is_none(),"audio_underrun_observations":underruns})
        );
        Ok(())
    })();
    control.stop.store(true, Ordering::Release);
    drop(rx);
    let _ = decoder.join();
    outcome
}
