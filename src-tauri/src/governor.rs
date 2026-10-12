//! G7.2 — Resource Governor.
//!
//! Monitors the process's RAM and whole-app job-group CPU usage. Emits `resource-stats` events
//! to the control window every [`POLL_INTERVAL_S`] seconds so the dashboard can
//! display live numbers. Also enforces the NFR budgets (SRS):
//!   - RAM ≤ 400 MB working set
//!   - Whole-app CPU ≤ 10% of logical CPU capacity
//!
//! On Windows, a Job Object both hard-caps CPU and accounts the host plus its
//! inherited child processes (WebView2 and sidecars). If the job cannot be
//! configured or assigned, CPU is unavailable, capture throttling stays on,
//! and no whole-app hard-cap guarantee is made. A later accounting-query
//! failure is reported separately from cap initialization. We never infer
//! whole-app usage from process names.
//!
//! Throttle callbacks are exported so the capture loop can check whether to
//! drop a processing tick (reducing to ~2 Hz) when CPU is high. This is an
//! additional soft mitigation; the OS Job Object hard cap is the 10% ceiling.

#[cfg(windows)]
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
#[cfg(windows)]
use windows::core::PCWSTR;
#[cfg(windows)]
use windows::Win32::Foundation::HANDLE;
#[cfg(windows)]
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
    JobObjectCpuRateControlInformation, JobObjectExtendedLimitInformation,
    QueryInformationJobObject, SetInformationJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
    JOBOBJECT_CPU_RATE_CONTROL_INFORMATION, JOBOBJECT_CPU_RATE_CONTROL_INFORMATION_0,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_CPU_RATE_CONTROL_ENABLE,
    JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
#[cfg(windows)]
use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
#[cfg(windows)]
use windows::Win32::System::Threading::GetCurrentProcess;

const POLL_INTERVAL_S: u64 = 1;
const CPU_BUDGET_PCT: f64 = 10.0;
const CPU_HARD_CAP_RATE: u32 = 1_000;
const CPU_THROTTLE_RELEASE_PCT: f64 = 8.0;
const CPU_THROTTLE_RELEASE_SAMPLES: u8 = 3;
const RAM_BUDGET_MB: f64 = 400.0;

/// GPU telemetry source, user-selectable via `set_telemetry_source`. The bundled
/// headless `gpu-feeder` sidecar PUSHes GPU-only samples to `POST /telemetry`
/// (`ingest_gpu`) — light and always available. The sibling G-Telemetry app
/// writes a RICHER file (adds CPU temp, ~200ms) at
/// `%LOCALAPPDATA%\G-Series\telemetry-latest.json` which we read. The main app
/// never runs nvidia-smi itself, so the NFR budgets keep covering only our own
/// work. Source values (match `telemetrySource` in the frontend): 0 = auto
/// (prefer the rich G-Telemetry file, else the feeder push), 1 = feeder only,
/// 2 = G-Telemetry only, 3 = off.
static TELEMETRY_SOURCE: AtomicU8 = AtomicU8::new(0);

/// Set the active telemetry source (from the settings UI).
pub fn set_telemetry_source(source: u8) {
    TELEMETRY_SOURCE.store(source, Ordering::Relaxed);
}

/// A pushed feeder sample older than this = "feeder not running" → GPU "—".
const GPU_STALE: Duration = Duration::from_secs(30);
/// The G-Telemetry file refreshes ~200ms, so a much tighter staleness applies.
const BRIDGE_FILE_STALE_MS: u64 = 5_000;

/// Sentinel meaning "no reading" (source absent / stale / no sensor). Mirrors the
/// frontend's NO_SENSOR so the telemetry footer renders "—".
const NO_READING: f64 = -1.0;

/// Latest GPU sample pushed by the feeder, stamped with local arrival time for
/// staleness. `None` until the first push.
struct GpuSample {
    load: f64,
    temp: f64,
    used_mb: f64,
    total_mb: f64,
    at: Instant,
}
static LATEST_GPU: Mutex<Option<GpuSample>> = Mutex::new(None);
static GPU_FEEDER_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

/// True while resource usage is over budget; the capture loop reads this to
/// drop half its ticks automatically.
static CPU_THROTTLE: AtomicBool = AtomicBool::new(true);
#[cfg(windows)]
static PROCESS_JOB: OnceLock<Result<ProcessJob, String>> = OnceLock::new();

#[cfg(windows)]
struct ProcessJob {
    // PROCESS_JOB keeps this sole created handle open for the app lifetime; it
    // is not duplicated or inherited by children.
    handle: OwnedHandle,
    sample: Mutex<Option<CpuSample>>,
}

#[cfg(windows)]
#[derive(Clone, Copy)]
struct CpuSample {
    total_100ns: u64,
    wall: Instant,
}

/// Create and assign the app's CPU-limited process group before Tauri creates
/// WebView2 or the app starts any sidecars. Descendants inherit job membership.
pub fn initialize_process_group() -> Result<(), String> {
    #[cfg(windows)]
    let result = PROCESS_JOB
        .get_or_init(create_process_job)
        .as_ref()
        .map(|_| ())
        .map_err(Clone::clone);
    #[cfg(not(windows))]
    let result = Err("whole-app CPU job limits are only available on Windows".into());
    if result.is_err() {
        CPU_THROTTLE.store(true, Ordering::Relaxed);
    }
    result
}

#[cfg(windows)]
fn create_process_job() -> Result<ProcessJob, String> {
    let raw_handle = unsafe { CreateJobObjectW(None, PCWSTR::null()) }
        .map_err(|error| format!("CreateJobObjectW failed: {error}"))?;
    let handle = unsafe { OwnedHandle::from_raw_handle(raw_handle.0) };
    let job_handle = HANDLE(handle.as_raw_handle());
    let rate_control = JOBOBJECT_CPU_RATE_CONTROL_INFORMATION {
        ControlFlags: JOB_OBJECT_CPU_RATE_CONTROL_ENABLE | JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP,
        Anonymous: JOBOBJECT_CPU_RATE_CONTROL_INFORMATION_0 {
            CpuRate: CPU_HARD_CAP_RATE,
        },
    };
    unsafe {
        SetInformationJobObject(
            job_handle,
            JobObjectCpuRateControlInformation,
            (&rate_control as *const JOBOBJECT_CPU_RATE_CONTROL_INFORMATION).cast(),
            std::mem::size_of::<JOBOBJECT_CPU_RATE_CONTROL_INFORMATION>() as u32,
        )
    }
    .map_err(|error| format!("setting the 10% Job Object CPU hard cap failed: {error}"))?;

    let mut extended_limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    extended_limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    unsafe {
        SetInformationJobObject(
            job_handle,
            JobObjectExtendedLimitInformation,
            (&extended_limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    }
    .map_err(|error| format!("enabling Job Object kill-on-close failed: {error}"))?;

    let process = unsafe { GetCurrentProcess() };
    unsafe { AssignProcessToJobObject(job_handle, process) }
        .map_err(|error| format!("assigning G-Maiden to its CPU Job Object failed: {error}"))?;

    Ok(ProcessJob {
        handle,
        sample: Mutex::new(None),
    })
}

/// Read by the capture loop every tick (`capture.rs`) — when true it drops
/// capture cadence to ~2 Hz. Driven by CPU **or** RAM over-budget (see
/// `poll_loop` / `over_budget`), so the name is historical: a RAM breach
/// throttles capture too.
pub fn cpu_throttle() -> bool {
    CPU_THROTTLE.load(Ordering::Relaxed)
}

#[derive(Clone, serde::Serialize)]
pub struct ResourceStats {
    pub ram_mb: f64,
    pub cpu_pct: f64,
    /// Active processes accounted by the Windows Job Object; `-1` means that
    /// whole-app process-group containment/accounting is unavailable.
    pub cpu_group_processes: i32,
    /// True when one or more NFRs are over budget.
    pub over_budget: bool,
    /// Session peaks (max seen since launch) — lets the deck footer prove the
    /// SRS §5.1 budgets held over a whole match without an external harness.
    /// `cpu_pct` is the whole-app Job Object reading, normalized by logical CPU
    /// capacity and hard-capped by Windows at 10% when group setup succeeds.
    #[serde(default)]
    pub peak_cpu_pct: f64,
    #[serde(default)]
    pub peak_ram_mb: f64,
    /// GPU/CPU-temp metrics from the active telemetry source. `-1` = unavailable
    /// (source off / stale / no sensor) so the footer shows "—" instead of a 0.
    /// `cpu_temp_c` is only populated by the rich G-Telemetry source (the light
    /// feeder has no CPU-temp sensor).
    pub gpu_pct: f64,
    pub gpu_temp_c: f64,
    pub vram_used_mb: f64,
    pub vram_total_mb: f64,
    pub cpu_temp_c: f64,
}

/// Spawn the resource-governor polling loop. Non-blocking; runs on a dedicated
/// thread. App handle is used for event emission; cloned into the thread.
pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("g-governor".into())
        .spawn(move || poll_loop(app))
        .expect("governor thread spawn");
}

fn poll_loop(app: AppHandle) {
    let mut peak_cpu = NO_READING;
    let mut peak_ram = 0.0f64;
    let mut throttled = false;
    let mut release_samples = 0u8;
    loop {
        let mut stats = measure();
        if stats.cpu_pct >= 0.0 {
            peak_cpu = if peak_cpu < 0.0 {
                stats.cpu_pct
            } else {
                peak_cpu.max(stats.cpu_pct)
            };
        }
        peak_ram = peak_ram.max(stats.ram_mb);
        stats.peak_cpu_pct = peak_cpu;
        stats.peak_ram_mb = peak_ram;
        // Keep the reduced capture rate through noisy samples; restore full rate
        // only after a sustained margin below the CPU budget.
        if stats.over_budget {
            throttled = true;
            release_samples = 0;
        } else if throttled {
            if stats.cpu_pct <= CPU_THROTTLE_RELEASE_PCT {
                release_samples = release_samples.saturating_add(1);
                if release_samples >= CPU_THROTTLE_RELEASE_SAMPLES {
                    throttled = false;
                    release_samples = 0;
                }
            } else {
                release_samples = 0;
            }
        }
        CPU_THROTTLE.store(throttled, Ordering::Relaxed);
        if stats.over_budget {
            if stats.cpu_pct < 0.0 {
                eprintln!(
                    "[G-Gov] whole-app CPU group unavailable; capture throttling remains active"
                );
            } else {
                eprintln!(
                    "[G-Gov] over budget — RAM {:.0} MB, CPU {:.1}%",
                    stats.ram_mb, stats.cpu_pct
                );
            }
        }
        let _ = app.emit("resource-stats", &stats);
        std::thread::sleep(Duration::from_secs(POLL_INTERVAL_S));
    }
}

fn measure() -> ResourceStats {
    #[cfg(windows)]
    let ram_mb = measure_ram_mb_native()
        .or_else(measure_ram_mb)
        .unwrap_or(0.0);
    #[cfg(not(windows))]
    let ram_mb = measure_ram_mb().unwrap_or(0.0);

    #[cfg(windows)]
    let (cpu_pct, cpu_group_processes) = measure_cpu_group_pct().unwrap_or((NO_READING, -1));
    #[cfg(not(windows))]
    let (cpu_pct, cpu_group_processes) = (NO_READING, -1);
    let over_budget = is_over_budget(ram_mb, cpu_pct);
    let g = resolve_gpu();
    ResourceStats {
        ram_mb,
        cpu_pct,
        cpu_group_processes,
        over_budget,
        // Filled by poll_loop (which holds the running peaks across ticks); a
        // one-off measure() outside the loop reports 0.
        peak_cpu_pct: NO_READING,
        peak_ram_mb: 0.0,
        gpu_pct: g.0,
        gpu_temp_c: g.1,
        vram_used_mb: g.2,
        vram_total_mb: g.3,
        cpu_temp_c: g.4,
    }
}

fn is_over_budget(ram_mb: f64, cpu_pct: f64) -> bool {
    ram_mb > RAM_BUDGET_MB || !(0.0..=CPU_BUDGET_PCT).contains(&cpu_pct)
}

/// Resolve (gpu_load, gpu_temp, vram_used, vram_total, cpu_temp) from the active
/// source. Only the rich G-Telemetry file carries cpu_temp; the feeder push does
/// not (its 5th value is always NO_READING).
fn resolve_gpu() -> (f64, f64, f64, f64, f64) {
    let none = (NO_READING, NO_READING, NO_READING, NO_READING, NO_READING);
    let feeder = || read_pushed_gpu().map(|(l, t, u, v)| (l, t, u, v, NO_READING));
    let rich = read_bridge_file;
    match TELEMETRY_SOURCE.load(Ordering::Relaxed) {
        3 => none,                                   // off
        1 => feeder().unwrap_or(none),               // feeder only
        2 => rich().unwrap_or(none),                 // G-Telemetry only
        _ => rich().or_else(feeder).unwrap_or(none), // auto: prefer the rich file
    }
}

/// Store a GPU sample pushed by the feeder (called from the `POST /telemetry`
/// handler). Ignores payloads that don't carry a usable first GPU.
pub fn ingest_gpu(body: &serde_json::Value) {
    if let Some((load, temp, used_mb, total_mb)) = parse_gpu(body) {
        if let Ok(mut slot) = LATEST_GPU.lock() {
            *slot = Some(GpuSample {
                load,
                temp,
                used_mb,
                total_mb,
                at: Instant::now(),
            });
        }
    }
}

/// The freshest pushed GPU reading, or `None` if never pushed / gone stale.
fn read_pushed_gpu() -> Option<(f64, f64, f64, f64)> {
    let slot = LATEST_GPU.lock().ok()?;
    let s = slot.as_ref()?;
    if s.at.elapsed() > GPU_STALE {
        return None; // feeder stopped pushing
    }
    Some((s.load, s.temp, s.used_mb, s.total_mb))
}

/// Pure parse of the feeder's `{ "gpus": [ { loadPercent, tempC, vramUsedMb,
/// vramTotalMb } ] }` body. Split out so it's unit-testable.
fn parse_gpu(v: &serde_json::Value) -> Option<(f64, f64, f64, f64)> {
    let gpu = v.get("gpus")?.as_array()?.first()?;
    let num = |key: &str| gpu.get(key).and_then(serde_json::Value::as_f64);
    Some((
        num("loadPercent")?,
        num("tempC")?,
        num("vramUsedMb")?,
        num("vramTotalMb")?,
    ))
}

/// Read the RICH G-Telemetry bridge file (adds CPU temp, ~200ms fresh):
/// `{ ts, cpu:{tempC}, gpus:[{loadPercent,tempC,vramUsedMb,vramTotalMb}] }`.
/// Returns (gpu_load, gpu_temp, vram_used, vram_total, cpu_temp); `cpu_temp` is
/// NO_READING when the file omits it or reports null (no LHM sensor).
fn read_bridge_file() -> Option<(f64, f64, f64, f64, f64)> {
    let base = std::env::var("LOCALAPPDATA").ok()?;
    let path = std::path::Path::new(&base)
        .join("G-Series")
        .join("telemetry-latest.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    parse_bridge_file(&raw, now)
}

/// Pure parse + staleness for the rich file (testable without fs).
fn parse_bridge_file(raw: &str, now_ms: u64) -> Option<(f64, f64, f64, f64, f64)> {
    let v: serde_json::Value = serde_json::from_str(raw).ok()?;
    let ts = v.get("ts")?.as_u64()?;
    if now_ms.saturating_sub(ts) > BRIDGE_FILE_STALE_MS {
        return None; // G-Telemetry not writing / went idle
    }
    let gpu = v.get("gpus")?.as_array()?.first()?;
    let num = |o: &serde_json::Value, k: &str| o.get(k).and_then(serde_json::Value::as_f64);
    let cpu_temp = v
        .get("cpu")
        .and_then(|c| c.get("tempC"))
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(NO_READING); // null / missing → no CPU-temp sensor
    Some((
        num(gpu, "loadPercent")?,
        num(gpu, "tempC")?,
        num(gpu, "vramUsedMb")?,
        num(gpu, "vramTotalMb")?,
        cpu_temp,
    ))
}

/// Spawn the headless `gpu-feeder` sidecar (own process; runs nvidia-smi and
/// pushes to `POST /telemetry`). Looks next to our exe: the bundled name first,
/// then the dev second-bin name. The child joins this process's Job Object only
/// if setup and host assignment succeeded and it starts without a breakaway flag;
/// this app only stops its exact owned child on normal exit. No-ops if neither
/// binary exists (GPU stays "—").
pub fn spawn_gpu_feeder() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(dir) = exe.parent() else { return };
    let path = dir.join("gpu-feeder.exe");
    if !path.is_file() {
        return; // not bundled (e.g. no GPU build) — GPU telemetry stays "—"
    }
    let mut cmd = std::process::Command::new(&path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let child = match cmd.spawn() {
        Ok(child) => child,
        Err(error) => {
            eprintln!("[G-Gov] failed to start owned GPU feeder: {error}");
            return;
        }
    };
    let slot = GPU_FEEDER_CHILD.get_or_init(|| Mutex::new(None));
    let mut owned = slot
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    // This slot contains only a child created by this app; do not search for or
    // terminate unrelated processes by the gpu-feeder image name.
    if let Some(mut previous_owned_child) = owned.replace(child) {
        let _ = previous_owned_child.kill();
        let _ = previous_owned_child.wait();
    }
}

/// Stop only the exact feeder child started by this app, using its owned handle.
pub fn stop_owned_sidecars() {
    let Some(slot) = GPU_FEEDER_CHILD.get() else {
        return;
    };
    let mut owned = slot
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(mut child) = owned.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg(windows)]
fn measure_ram_mb_native() -> Option<f64> {
    let handle = unsafe { GetCurrentProcess() };
    let mut counters = PROCESS_MEMORY_COUNTERS::default();
    let ok = unsafe {
        GetProcessMemoryInfo(
            handle,
            &mut counters,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        )
    }
    .is_ok();
    if !ok {
        return None;
    }
    Some(counters.WorkingSetSize as f64 / 1_048_576.0)
}

#[cfg(windows)]
fn measure_cpu_group_pct() -> Option<(f64, i32)> {
    let job = PROCESS_JOB.get()?.as_ref().ok()?;
    let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
    unsafe {
        QueryInformationJobObject(
            Some(HANDLE(job.handle.as_raw_handle())),
            JobObjectBasicAccountingInformation,
            (&mut accounting as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
            std::mem::size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
            None,
        )
    }
    .ok()?;
    if accounting.ActiveProcesses == 0 {
        return None;
    }
    let total_100ns = (accounting.TotalUserTime.max(0) as u64)
        .saturating_add(accounting.TotalKernelTime.max(0) as u64);
    let now = Instant::now();
    let mut slot = job.sample.lock().ok()?;
    let prev = slot.replace(CpuSample {
        total_100ns,
        wall: now,
    });
    let prev = prev?;
    let cpu_delta_s = (total_100ns.saturating_sub(prev.total_100ns) as f64) / 10_000_000.0;
    let wall_s = now.duration_since(prev.wall).as_secs_f64();
    if wall_s <= 0.0 {
        return None;
    }
    let cores = std::thread::available_parallelism().ok()?.get() as f64;
    Some((
        ((cpu_delta_s / (wall_s * cores)) * 100.0).max(0.0),
        accounting.ActiveProcesses as i32,
    ))
}

fn measure_ram_mb() -> Option<f64> {
    // PowerShell: get working-set bytes of *this* process, convert to MB.
    let pid = std::process::id();
    let script = format!("(Get-Process -Id {pid}).WorkingSet64 / 1MB");
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — stop the PS console flashing every poll
    }
    let out = cmd.output().ok()?;
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<f64>()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measure_returns_plausible_values() {
        // Just verify the measurement path doesn't panic and returns plausible
        // values. Exact numbers depend on the host and are non-deterministic.
        let s = measure();
        // RAM: a running Rust test binary should be at least a few MB.
        // CPU: 0-100% per core.
        assert!(s.ram_mb >= 0.0, "ram_mb must be non-negative: {}", s.ram_mb);
        assert!(
            s.cpu_pct == NO_READING || (s.cpu_pct >= 0.0 && s.cpu_pct <= 200.0),
            "cpu_pct out of range: {}",
            s.cpu_pct
        );
        assert!(s.cpu_group_processes == -1 || s.cpu_group_processes >= 1);
    }

    #[test]
    fn over_budget_flag_set_when_ram_high() {
        let s = ResourceStats {
            ram_mb: 450.0,
            cpu_pct: 1.0,
            cpu_group_processes: 1,
            over_budget: false,
            peak_cpu_pct: 0.0,
            peak_ram_mb: 0.0,
            gpu_pct: NO_READING,
            gpu_temp_c: NO_READING,
            vram_used_mb: NO_READING,
            vram_total_mb: NO_READING,
            cpu_temp_c: NO_READING,
        };
        assert!(is_over_budget(s.ram_mb, s.cpu_pct));
    }

    #[test]
    fn unavailable_whole_app_cpu_fails_closed() {
        assert!(is_over_budget(100.0, NO_READING));
    }

    #[test]
    fn parse_gpu_reads_first_gpu() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{ "gpus": [ { "loadPercent": 42.5, "tempC": 63.0, "vramUsedMb": 3200.0, "vramTotalMb": 8192.0 } ] }"#,
        ).unwrap();
        assert_eq!(parse_gpu(&v), Some((42.5, 63.0, 3200.0, 8192.0)));
    }

    #[test]
    fn parse_gpu_rejects_no_gpu_or_missing_fields() {
        let empty: serde_json::Value = serde_json::from_str(r#"{ "gpus": [] }"#).unwrap();
        assert!(parse_gpu(&empty).is_none());
        let no_key: serde_json::Value = serde_json::from_str(r#"{}"#).unwrap();
        assert!(parse_gpu(&no_key).is_none());
        let partial: serde_json::Value =
            serde_json::from_str(r#"{ "gpus": [ { "loadPercent": 1 } ] }"#).unwrap();
        assert!(parse_gpu(&partial).is_none()); // missing tempC/vram
    }

    #[test]
    fn ingest_then_read_roundtrips_a_pushed_sample() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{ "gpus": [ { "loadPercent": 10.0, "tempC": 50.0, "vramUsedMb": 1024.0, "vramTotalMb": 4096.0 } ] }"#,
        ).unwrap();
        ingest_gpu(&v);
        // Just-pushed sample is fresh, so it reads back.
        assert_eq!(read_pushed_gpu(), Some((10.0, 50.0, 1024.0, 4096.0)));
    }

    #[test]
    fn parse_bridge_file_reads_cpu_temp_and_gpu() {
        let raw = r#"{ "ts": 1000, "cpu": { "loadPercent": 4.0, "tempC": 55.0 },
            "gpus": [ { "loadPercent": 42.0, "tempC": 63.0, "vramUsedMb": 3200.0, "vramTotalMb": 8192.0 } ] }"#;
        assert_eq!(
            parse_bridge_file(raw, 1000 + 1000),
            Some((42.0, 63.0, 3200.0, 8192.0, 55.0))
        );
    }

    #[test]
    fn parse_bridge_file_handles_null_cpu_temp_and_staleness() {
        // null CPU temp (no LHM sensor) → NO_READING, GPU still read.
        let null_temp = r#"{ "ts": 1000, "cpu": { "tempC": null },
            "gpus": [ { "loadPercent": 1, "tempC": 2, "vramUsedMb": 3, "vramTotalMb": 4 } ] }"#;
        assert_eq!(
            parse_bridge_file(null_temp, 1000),
            Some((1.0, 2.0, 3.0, 4.0, NO_READING))
        );
        // Stale (older than BRIDGE_FILE_STALE_MS) → None.
        assert!(parse_bridge_file(null_temp, 1000 + BRIDGE_FILE_STALE_MS + 1).is_none());
    }
}
