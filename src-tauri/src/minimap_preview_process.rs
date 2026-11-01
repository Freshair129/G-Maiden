//! One headless child owns preview DXGI; CV keeps its original process/output.
use crate::minimap_preview::{self as core, Geometry, Pixels, Snapshot, Status, Stream};
use crate::minimap_preview_wire as wire;
use std::io::{Read, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::{Duration, Instant};

pub(crate) use crate::minimap_clock::now_us as clock_us;

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    version: u32,
    parent: u32,
    lease: u64,
    epoch: u64,
    generation: u64,
    x: u32,
    y: u32,
    side: u32,
    screen_w: u32,
    screen_h: u32,
    display: u32,
    display_id: u64,
    origin_x: i32,
    origin_y: i32,
}
impl Request {
    fn new(source: Snapshot) -> Self {
        let g = source.geometry;
        Self {
            version: 2,
            parent: std::process::id(),
            lease: source.lease,
            epoch: source.epoch,
            generation: source.generation,
            x: g.x,
            y: g.y,
            side: g.side,
            screen_w: g.screen_w,
            screen_h: g.screen_h,
            display: g.display,
            display_id: g.display_id,
            origin_x: g.origin_x,
            origin_y: g.origin_y,
        }
    }
    fn source(&self) -> Option<Snapshot> {
        let geometry = Geometry {
            x: self.x,
            y: self.y,
            side: self.side,
            screen_w: self.screen_w,
            screen_h: self.screen_h,
            display: self.display,
            display_id: self.display_id,
            origin_x: self.origin_x,
            origin_y: self.origin_y,
        };
        (self.version == 2
            && self.parent != 0
            && self.lease != 0
            && self.epoch != 0
            && self.generation != 0
            && self.display < 32
            && geometry.valid())
        .then_some(Snapshot {
            lease: self.lease,
            epoch: self.epoch,
            generation: self.generation,
            geometry,
        })
    }
}
fn read_request(mut input: impl Read) -> Result<Request, String> {
    let mut bytes = Vec::with_capacity(256);
    loop {
        let mut b = [0];
        input.read_exact(&mut b).map_err(|_| "worker config EOF")?;
        if b[0] == b'\n' {
            break;
        }
        if bytes.len() >= 4096 {
            return Err("worker config too large".into());
        }
        bytes.push(b[0]);
    }
    let request: Request = serde_json::from_slice(&bytes).map_err(|_| "invalid worker config")?;
    request.source().ok_or("invalid worker source")?;
    Ok(request)
}

pub(crate) fn run_if_requested() -> Option<i32> {
    let role = wire::worker_role(&std::env::args().collect::<Vec<_>>())?;
    if !role {
        return Some(2);
    }
    #[cfg(feature = "wgc")]
    return Some(2);
    #[cfg(not(feature = "wgc"))]
    Some(match run_child() {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("[G-MinimapWorker] {error}");
            2
        }
    })
}

use crate::minimap_owned_child::OwnedChild;

enum Item {
    Frame(Pixels),
    State(Status),
}
struct Connection {
    child: OwnedChild,
    input: Option<ChildStdin>,
    latest: Arc<Mutex<Option<Item>>>,
    fault: Arc<AtomicBool>,
    packet_at: Arc<AtomicU64>,
    reader: Option<std::thread::JoinHandle<()>>,
    source: Snapshot,
    started: u64,
    last_heartbeat: u64,
}
impl Connection {
    fn spawn(source: Snapshot, wake: mpsc::SyncSender<()>) -> Result<Self, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut command = Command::new(exe);
        command.arg(wire::WORKER_ARG);
        Self::command(command, source, wake)
    }
    fn command(
        mut command: Command,
        source: Snapshot,
        wake: mpsc::SyncSender<()>,
    ) -> Result<Self, String> {
        use std::os::windows::process::CommandExt;
        use windows::Win32::System::Threading::{BELOW_NORMAL_PRIORITY_CLASS, CREATE_NO_WINDOW};
        command
            .creation_flags((CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS).0)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        let mut child = OwnedChild {
            process: command.spawn().map_err(|e| e.to_string())?,
        };
        if !crate::governor::owns_child_process(child.process.id()) {
            return Err("preview child is outside the application's CPU Job".into());
        }
        let mut input = child.process.stdin.take().ok_or("worker stdin missing")?;
        let mut output = child.process.stdout.take().ok_or("worker stdout missing")?;
        let mut request = serde_json::to_vec(&Request::new(source)).map_err(|e| e.to_string())?;
        request.push(b'\n');
        input
            .write_all(&request)
            .and_then(|()| input.flush())
            .map_err(|e| e.to_string())?;
        let latest = Arc::new(Mutex::new(None));
        let slot = latest.clone();
        let fault = Arc::new(AtomicBool::new(false));
        let failed = fault.clone();
        let packet_at = Arc::new(AtomicU64::new(0));
        let received = packet_at.clone();
        let reader = std::thread::Builder::new()
            .name("g-minimap-pipe".into())
            .spawn(move || {
                let mut sequence = 0;
                loop {
                    let item = (|| {
                        let mut bytes = [0; core::HEADER_LEN];
                        output.read_exact(&mut bytes).ok()?;
                        let h = wire::header(&bytes, source, clock_us())?;
                        let item = if h.status == Status::Frame {
                            if h.sequence <= sequence {
                                return None;
                            }
                            let mut rgba = vec![0; h.payload];
                            output.read_exact(&mut rgba).ok()?;
                            sequence = h.sequence;
                            if h.stale {
                                received.store(clock_us(), Ordering::Release);
                                return Some(None);
                            }
                            Item::Frame(Pixels {
                                width: h.width,
                                height: h.height,
                                acquired_us: h.acquired_us,
                                rgba,
                            })
                        } else {
                            Item::State(h.status)
                        };
                        received.store(clock_us(), Ordering::Release);
                        Some(Some(item))
                    })();
                    let Some(item) = item else {
                        failed.store(true, Ordering::Release);
                        eprintln!("[G-MinimapPreview] worker pipe closed or invalid packet");
                        let _ = wake.try_send(());
                        return;
                    };
                    let Some(item) = item else { continue };
                    let Ok(mut target) = slot.lock() else {
                        failed.store(true, Ordering::Release);
                        return;
                    };
                    *target = Some(item);
                    drop(target);
                    let _ = wake.try_send(());
                }
            })
            .map_err(|e| e.to_string())?;
        let started = clock_us();
        eprintln!(
            "[G-MinimapPreview] owned worker pid={} lease={} epoch={} geometry={}",
            child.process.id(),
            source.lease,
            source.epoch,
            source.generation
        );
        Ok(Self {
            child,
            input: Some(input),
            latest,
            fault,
            packet_at,
            reader: Some(reader),
            source,
            started,
            last_heartbeat: 0,
        })
    }
    fn heartbeat(&mut self, capture_enabled: bool) -> bool {
        if self.fault.load(Ordering::Acquire) {
            return false;
        }
        let Some(now) = core::packet_health(&self.packet_at, self.started, clock_us) else {
            return false;
        };
        if now.saturating_sub(self.last_heartbeat) >= 100_000 {
            let Some(input) = self.input.as_mut() else {
                return false;
            };
            let command = if capture_enabled {
                crate::governor::preview_fps()
            } else {
                0
            };
            if input
                .write_all(&[command])
                .and_then(|()| input.flush())
                .is_err()
            {
                return false;
            }
            self.last_heartbeat = now;
        }
        true
    }
    fn stop(&mut self) -> bool {
        self.input.take();
        let stopped = self.child.stop();
        if stopped {
            if let Some(reader) = self.reader.take() {
                if reader.is_finished() {
                    let _ = reader.join();
                }
            }
        }
        stopped
    }
}
impl Drop for Connection {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg_attr(feature = "wgc", allow(dead_code))]
pub(crate) fn parent_worker(
    state: Arc<Mutex<Stream>>,
    receiver: mpsc::Receiver<()>,
    wake: mpsc::SyncSender<()>,
) {
    let mut connection: Option<Connection> = None;
    let mut retry_at = 0;
    let mut stopping = false;
    let mut frames = 0u64;
    let mut logged_at = Instant::now();
    loop {
        let now = clock_us();
        let (epoch, generation, geometry) = crate::minimap_preview_runtime::context();
        let wanted = {
            let Ok(mut s) = state.lock() else {
                return;
            };
            s.source(epoch, geometry, generation);
            if now == 0 {
                s.set_status(Status::Unavailable);
                None
            } else {
                if !crate::governor::preview_allowed() {
                    s.set_status(Status::Pressure);
                }
                // Control may have renewed the lease while this worker waited for the lock.
                s.snapshot(clock_us())
            }
        };
        if let Some(active) = connection.as_mut() {
            let heartbeat_ok = active.heartbeat(crate::governor::preview_allowed());
            if stopping || Some(active.source) != wanted || !heartbeat_ok {
                if !stopping {
                    let reason = if wanted.is_none() {
                        "inactive source or expired lease"
                    } else if Some(active.source) != wanted {
                        "source changed"
                    } else {
                        "worker heartbeat or pipe failure"
                    };
                    eprintln!("[G-MinimapPreview] stopping worker: {reason}");
                }
                stopping = true;
                if active.stop() {
                    connection = None;
                    frames = 0;
                    logged_at = Instant::now();
                    stopping = false;
                    retry_at = now.saturating_add(250_000);
                }
                if let Ok(mut s) = state.lock() {
                    if wanted.is_some() {
                        s.set_status(Status::Unavailable);
                    }
                }
            }
        }
        if let Some(source) = wanted {
            if connection.is_none() && now >= retry_at && crate::governor::preview_allowed() {
                match Connection::spawn(source, wake.clone()) {
                    Ok(active) => {
                        connection = Some(active);
                        frames = 0;
                        logged_at = Instant::now();
                    }
                    Err(error) => {
                        eprintln!("[G-MinimapPreview] worker unavailable: {error}");
                        retry_at = now.saturating_add(1_000_000);
                        if let Ok(mut s) = state.lock() {
                            s.set_status(Status::Unavailable);
                        }
                    }
                }
            }
        }
        if !stopping {
            if let Some(active) = connection.as_mut() {
                let item = active.latest.lock().ok().and_then(|mut slot| slot.take());
                if let Some(item) = item {
                    let (epoch, generation, geometry) = crate::minimap_preview_runtime::context();
                    if let Ok(mut s) = state.lock() {
                        s.source(epoch, geometry, generation);
                        if crate::governor::preview_allowed()
                            && s.snapshot(clock_us()) == Some(active.source)
                        {
                            match item {
                                Item::Frame(pixels) => {
                                    if s.publish(active.source, pixels, clock_us()) {
                                        frames += 1;
                                    }
                                }
                                Item::State(status) => s.set_status(status),
                            }
                        }
                    }
                }
            }
        }
        if connection.is_some() && logged_at.elapsed() >= Duration::from_secs(5) {
            eprintln!("[G-MinimapPreview] interval_ms={} published={} target_fps={} (not presentation proof)",logged_at.elapsed().as_millis(),frames,crate::governor::preview_fps());
            frames = 0;
            logged_at = Instant::now();
        }
        if receiver.recv_timeout(Duration::from_millis(50))
            == Err(mpsc::RecvTimeoutError::Disconnected)
        {
            return;
        }
    }
}

#[cfg(not(feature = "wgc"))]
fn actual_parent() -> Option<u32> {
    use windows::Win32::{
        Foundation::CloseHandle,
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
    };
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut found = None;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == std::process::id() {
                    found = Some(entry.th32ParentProcessID);
                    break;
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
        found
    }
}

#[cfg(not(feature = "wgc"))]
fn trusted_parent(parent: u32) -> bool {
    use windows::core::PWSTR;
    use windows::Win32::{
        Foundation::CloseHandle,
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
    };
    if actual_parent() != Some(parent) {
        return false;
    }
    let path = unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, parent) else {
            return false;
        };
        let mut buffer = vec![0u16; 32768];
        let mut length = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        );
        let _ = CloseHandle(handle);
        if result.is_err() {
            return false;
        }
        std::path::PathBuf::from(String::from_utf16_lossy(&buffer[..length as usize]))
    };
    match (
        std::fs::canonicalize(path),
        std::env::current_exe().and_then(std::fs::canonicalize),
    ) {
        (Ok(parent), Ok(current)) => parent
            .to_string_lossy()
            .eq_ignore_ascii_case(&current.to_string_lossy()),
        _ => false,
    }
}

#[cfg(not(feature = "wgc"))]
fn game_covers(
    window: windows::Win32::Foundation::HWND,
    pid: u32,
    g: Geometry,
    origin: (i32, i32),
) -> bool {
    use windows::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{
            GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        },
    };
    unsafe {
        if !IsWindowVisible(window).as_bool() || IsIconic(window).as_bool() {
            return false;
        }
        let mut actual = 0;
        GetWindowThreadProcessId(window, Some(&mut actual));
        if actual != pid {
            return false;
        }
        let mut r = RECT::default();
        GetWindowRect(window, &mut r).is_ok()
            && core::within_window(g, origin, (r.left, r.top, r.right, r.bottom))
    }
}

#[cfg(not(feature = "wgc"))]
fn run_child() -> Result<(), String> {
    use windows::{
        core::BOOL,
        Win32::System::{JobObjects::IsProcessInJob, Threading::GetCurrentProcess},
    };
    let request = read_request(std::io::stdin().lock())?;
    if !trusted_parent(request.parent) {
        return Err("worker parent mismatch".into());
    }
    let mut in_job = BOOL::default();
    unsafe { IsProcessInJob(GetCurrentProcess(), None, &mut in_job) }.map_err(|e| e.to_string())?;
    if !in_job.as_bool() {
        return Err("worker is outside inherited process Job".into());
    }
    let source = request.source().ok_or("invalid source")?;
    let now = clock_us();
    if now == 0 {
        return Err("shared clock unavailable".into());
    }
    let heartbeat = Arc::new(AtomicU64::new(now));
    let beats = heartbeat.clone();
    let capture_enabled = Arc::new(AtomicU8::new(0));
    let enabled = capture_enabled.clone();
    std::thread::Builder::new()
        .name("g-preview-heartbeat".into())
        .spawn(move || {
            let mut input = std::io::stdin().lock();
            loop {
                let mut b = [0];
                if input.read_exact(&mut b).is_err() {
                    std::process::exit(0);
                }
                let Some(capture) = wire::capture_fps(b[0]) else {
                    std::process::exit(2);
                };
                enabled.store(capture, Ordering::Release);
                let now = clock_us();
                if now == 0 {
                    std::process::exit(2);
                }
                beats.store(now, Ordering::Release);
            }
        })
        .map_err(|e| e.to_string())?;
    std::thread::Builder::new()
        .name("g-preview-expiry".into())
        .spawn(move || loop {
            if !wire::heartbeat_live(heartbeat.load(Ordering::Acquire), clock_us()) {
                std::process::exit(0);
            }
            std::thread::sleep(Duration::from_millis(50));
        })
        .map_err(|e| e.to_string())?;
    let mut output = std::io::stdout().lock();
    let mut capture: Option<crate::dxgi::DxgiCapture> = None;
    let mut retry_at = 0;
    let mut window = None;
    let mut scan_at = 0;
    let mut pacer = core::Pacer::default();
    let mut sequence = 0u64;
    let mut last_status = 0;
    let mut stats_at = Instant::now();
    let (mut captures, mut frames_out, mut capture_us, mut crop_us, mut pipe_us) =
        (0u64, 0u64, 0u64, 0u64, 0u64);
    loop {
        let now = clock_us();
        if now == 0 {
            return Err("shared clock unavailable".into());
        }
        if !pacer.due(now) {
            std::thread::sleep(Duration::from_micros(
                pacer.wait_us(now).min(core::PERIOD_US),
            ));
            continue;
        }
        let fps = capture_enabled.load(Ordering::Acquire);
        pacer.advance(now, 1_000_000u64.div_ceil(u64::from(fps.max(15))));
        // Keep the D3D device and duplication alive: rebuilding them on every
        // pressure sample costs more CPU than retaining an idle capture owner.
        if fps == 0 {
            if now.saturating_sub(last_status) >= 100_000 {
                let packet = core::worker_packet(source, sequence, Status::Pressure, None, now);
                output
                    .write_all(&packet)
                    .and_then(|()| output.flush())
                    .map_err(|e| e.to_string())?;
                last_status = now;
            }
            std::thread::sleep(Duration::from_millis(50));
            continue;
        }
        if now.saturating_sub(scan_at) >= 500_000 || scan_at == 0 {
            window = crate::dxgi::preview_dota_window();
            scan_at = now;
        }
        let mut status = Status::Waiting;
        let mut pixels = None;
        if let Some((hwnd, pid)) = window {
            if capture.is_none() && now >= retry_at {
                match crate::dxgi::DxgiCapture::new(source.geometry.display) {
                    Ok(dxgi) => capture = Some(dxgi),
                    Err(error) => {
                        eprintln!("[G-MinimapWorker] {error}");
                        retry_at = now.saturating_add(1_000_000);
                    }
                }
            }
            if let Some(dxgi) = capture.as_mut() {
                let g = source.geometry;
                if dxgi.backend() != "dxgi"
                    || !core::matches_output(
                        g,
                        dxgi.display_id(),
                        dxgi.desktop_origin(),
                        (dxgi.width(), dxgi.height()),
                    )
                    || !game_covers(hwnd, pid, g, dxgi.desktop_origin())
                {
                    capture = None;
                    window = None;
                    retry_at = now.saturating_add(1_000_000);
                    status = Status::Unavailable;
                } else {
                    let acquired = clock_us();
                    let roi = crate::capture_frame::CaptureRoi::new(
                        crate::capture_frame::CaptureRoiKind::Minimap,
                        g.x,
                        g.y,
                        g.side,
                        g.side,
                    );
                    let stage = Instant::now();
                    let bundle = dxgi.acquire_regions(source.epoch, &[roi]);
                    capture_us += stage.elapsed().as_micros() as u64;
                    captures += 1;
                    if dxgi.backend() != "dxgi"
                        || !core::matches_output(
                            g,
                            dxgi.display_id(),
                            dxgi.desktop_origin(),
                            (dxgi.width(), dxgi.height()),
                        )
                        || !game_covers(hwnd, pid, g, dxgi.desktop_origin())
                    {
                        capture = None;
                        retry_at = now.saturating_add(1_000_000);
                        status = Status::Unavailable;
                    } else if let Some(bundle) = bundle {
                        if bundle.metadata.screen_width == g.screen_w
                            && bundle.metadata.screen_height == g.screen_h
                            && bundle.metadata.display_id == g.display_id
                        {
                            if let Some(roi) =
                                bundle.into_region(crate::capture_frame::CaptureRoiKind::Minimap)
                            {
                                let stage = Instant::now();
                                pixels = core::crop_rgba(
                                    &roi.bgra,
                                    roi.rect.width,
                                    roi.rect.height,
                                    acquired,
                                );
                                crop_us += stage.elapsed().as_micros() as u64;
                                if pixels.is_some() {
                                    status = Status::Frame;
                                }
                            }
                        }
                    }
                }
            } else {
                status = Status::Unavailable;
            }
        } else {
            capture = None;
            status = Status::Unavailable;
        }
        if status == Status::Frame || now.saturating_sub(last_status) >= 100_000 {
            if status == Status::Frame {
                sequence = sequence.saturating_add(1);
            }
            let packet = core::worker_packet(source, sequence, status, pixels.as_ref(), clock_us());
            let stage = Instant::now();
            output
                .write_all(&packet)
                .and_then(|()| output.flush())
                .map_err(|e| e.to_string())?;
            pipe_us += stage.elapsed().as_micros() as u64;
            if status == Status::Frame {
                frames_out += 1;
            }
            last_status = now;
        }
        if stats_at.elapsed() >= Duration::from_secs(5) {
            eprintln!("[G-MinimapWorker] interval_ms={} captures={} frames={} capture_us={} crop_us={} pipe_us={}", stats_at.elapsed().as_millis(), captures, frames_out, capture_us, crop_us, pipe_us);
            stats_at = Instant::now();
            (captures, frames_out, capture_us, crop_us, pipe_us) = (0, 0, 0, 0, 0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn worker_config_is_bounded_and_requires_nonzero_source_and_known_fields() {
        assert!(read_request(&b"{}\n"[..]).is_err());
        assert!(read_request(std::io::repeat(b'x').take(4097)).is_err());
        let source = Snapshot {
            lease: 1,
            epoch: 2,
            generation: 3,
            geometry: Geometry {
                x: 0,
                y: 788,
                side: 292,
                screen_w: 1920,
                screen_h: 1080,
                display: 0,
                display_id: 1,
                origin_x: 0,
                origin_y: 0,
            },
        };
        let request = Request::new(source);
        let mut unknown = serde_json::to_value(&request).unwrap();
        unknown["arbitrary_source"] = serde_json::json!(true);
        let mut unknown = serde_json::to_vec(&unknown).unwrap();
        unknown.push(b'\n');
        assert!(read_request(unknown.as_slice()).is_err());
        let mut bytes = serde_json::to_vec(&request).unwrap();
        bytes.push(b'\n');
        assert_eq!(
            read_request(bytes.as_slice()).unwrap().source(),
            Some(source)
        );
        let mut request = request;
        request.epoch = 0;
        assert!(request.source().is_none());
        request.epoch = 2;
        request.side = 1025;
        assert!(request.source().is_none());
    }
}
