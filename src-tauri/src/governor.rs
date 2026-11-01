//! G7.2 — Resource Governor.
//!
//! Monitors aggregate owned/job and used external-provider RAM and CPU usage. Emits `resource-stats` events
//! to the control window every [`POLL_INTERVAL_S`] seconds so the dashboard can
//! display live numbers. Also enforces the NFR budgets (SRS):
//!   - RAM ≤ 900 MB aggregate full working set (900,000,000 bytes)
//!   - Whole-app CPU ≤ 10% of logical CPU capacity
//!
//! On Windows, a Job Object both hard-caps CPU and accounts the host plus its
//! inherited child processes (WebView2 and sidecars). Tauri startup aborts if the
//! job cannot be configured or assigned. After successful initialization, an
//! accounting-query failure reports CPU as unavailable and keeps capture
//! suspended while the OS hard cap remains active. Owned membership is verified
//! against the Job; external Ollama trees are included conservatively when used.
//!
//! Resource pressure withdraws critical capture readiness; the 500ms recovery
//! watchdog does not issue late alarms. The Job hard cap covers owned members,
//! never an unmanaged shared provider.

#[cfg(windows)]
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::process::{Child, Command};
#[path = "resource_accounting.rs"]
mod resource_accounting;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;
#[cfg(windows)]
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
#[cfg(windows)]
use windows::core::PCWSTR;
#[cfg(windows)]
use windows::Win32::Foundation::HANDLE;
#[cfg(windows)]
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectCpuRateControlInformation,
    JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
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
// Leave operating headroom for OS cap windows versus the measured 1s ceiling.
// The unchanged acceptance limit above remains 10%, not this operating rate.
const CPU_HARD_CAP_RATE: u32 = 800;
const CPU_THROTTLE_RELEASE_PCT: f64 = 8.0;
const CPU_THROTTLE_RELEASE_SAMPLES: u8 = 3;
const RAM_BUDGET_MB: f64 = resource_accounting::RAM_BUDGET_BYTES as f64 / 1_000_000.;

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

/// True while resource usage is over budget; the capture loop reads this to
/// drop half its ticks automatically.
static CPU_THROTTLE: AtomicBool = AtomicBool::new(true);
static PREVIEW_ALLOWED: AtomicBool = AtomicBool::new(false);
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
struct CpuSample {
    cpu: std::collections::BTreeMap<resource_accounting::Identity, u64>,
    job_cpu_100ns: u64,
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
    .map_err(|error| format!("setting the 8% operating Job Object CPU hard cap failed: {error}"))?;

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

/// True means critical capture readiness must be withdrawn. Both unavailable
/// accounting and CPU/RAM pressure fail closed; recovery uses a separate watchdog.
pub fn cpu_throttle() -> bool {
    CPU_THROTTLE.load(Ordering::Relaxed)
}

pub(crate) fn preview_allowed() -> bool {
    PREVIEW_ALLOWED.load(Ordering::Relaxed) && !cpu_throttle()
}

pub(crate) fn owns_child_process(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let Some(Ok(job)) = PROCESS_JOB.get() else {
            return false;
        };
        job_pids(job).is_some_and(|members| members.contains(&pid))
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        false
    }
}

#[derive(Clone, serde::Serialize)]
pub struct ResourceStats {
    pub ram_mb: f64,
    pub cpu_pct: f64,
    /// Accounted owned/job and used external-provider processes; `-1` means
    /// complete membership/accounting is unavailable.
    pub cpu_group_processes: i32,
    /// True when one or more NFRs are over budget.
    pub over_budget: bool,
    /// Maxima of observed 1-second samples, not continuous peak/acceptance proof.
    /// CPU is normalized aggregate usage; the Job cap covers owned members only.
    /// Shared external provider processes are measured conservatively, never capped
    /// by this application's Job Object.
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
    let mut preview = crate::minimap_admission::Admission::default();
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
        let preview_allowed = preview.update(stats.ram_mb, stats.cpu_pct, throttled);
        if PREVIEW_ALLOWED.swap(preview_allowed, Ordering::Relaxed) != preview_allowed {
            eprintln!(
                "[G-Gov] preview admitted={} RAM {:.0} MB CPU {:.1}%",
                preview_allowed, stats.ram_mb, stats.cpu_pct
            );
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
    let (ram_mb, cpu_pct, cpu_group_processes) =
        measure_process_group().unwrap_or((NO_READING, NO_READING, -1));
    #[cfg(not(windows))]
    let (ram_mb, cpu_pct, cpu_group_processes) = (NO_READING, NO_READING, -1);
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
    !(0.0..=RAM_BUDGET_MB).contains(&ram_mb) || !(0.0..=CPU_BUDGET_PCT).contains(&cpu_pct)
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

/// Owns the exact feeder child started by this application.
pub struct GpuFeederProcess {
    child: Mutex<Option<Child>>,
}

impl GpuFeederProcess {
    fn new(child: Option<Child>) -> Self {
        Self {
            child: Mutex::new(child),
        }
    }

    /// Stop and reap the feeder started by this app. Keep its handle in app
    /// state if termination or waiting fails.
    pub fn shutdown(&self) -> bool {
        let mut child_slot = self
            .child
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(mut child) = child_slot.take() else {
            return true;
        };

        let stopped = match child.try_wait() {
            Ok(Some(_)) => true,
            Ok(None) => match child.kill() {
                Ok(()) => match child.wait() {
                    Ok(_) => true,
                    Err(error) => {
                        eprintln!("failed to reap owned gpu-feeder process: {error}");
                        false
                    }
                },
                Err(kill_error) => match child.try_wait() {
                    Ok(Some(_)) => true,
                    Ok(None) => {
                        eprintln!("failed to stop owned gpu-feeder process: {kill_error}");
                        false
                    }
                    Err(wait_error) => {
                        eprintln!(
                            "failed to stop owned gpu-feeder process: {kill_error}; could not check child state: {wait_error}"
                        );
                        false
                    }
                },
            },
            Err(error) => {
                eprintln!("failed to check owned gpu-feeder process: {error}");
                false
            }
        };

        if !stopped {
            *child_slot = Some(child);
        }
        stopped
    }
}

/// Spawn the headless `gpu-feeder` sidecar (own process; runs nvidia-smi and
/// pushes to `POST /telemetry`). Looks next to our exe: the bundled name first,
/// then the dev second-bin name. The child joins this process's Job Object only
/// if setup and host assignment succeeded and it starts without a breakaway flag;
/// this app only stops its exact owned child on normal exit. No-ops if neither
/// binary exists (GPU stays "—").
pub fn spawn_gpu_feeder() -> GpuFeederProcess {
    let Ok(exe) = std::env::current_exe() else {
        return GpuFeederProcess::new(None);
    };
    let Some(dir) = exe.parent() else {
        return GpuFeederProcess::new(None);
    };
    let path = dir.join("gpu-feeder.exe");
    if !path.is_file() {
        return GpuFeederProcess::new(None); // not bundled (e.g. no GPU build)
    }
    let mut cmd = Command::new(&path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let child = match cmd.spawn() {
        Ok(child) => Some(child),
        Err(error) => {
            eprintln!("failed to start gpu-feeder sidecar: {error}");
            None
        }
    };
    GpuFeederProcess::new(child)
}

// Shared providers are never reparented, killed, or covered by the host Job cap.
static EXTERNAL_OLLAMA_USED: AtomicBool = AtomicBool::new(false);

// Called only on the real provider launch path, never by readiness/tag probes.
pub fn record_external_ollama_use() {
    EXTERNAL_OLLAMA_USED.store(true, Ordering::Release);
}

pub fn admit_local_provider() -> Result<(), String> {
    Err(format!("Ollama unavailable under the {RAM_BUDGET_MB:.0} MB ({}-byte) whole-app budget: shared external model loading has no provable resource reservation or app Job CPU cap. Select a budget-qualified local implementation before generating advice.", resource_accounting::RAM_BUDGET_BYTES))
}

#[cfg(windows)]
fn job_pids(job: &ProcessJob) -> Option<Vec<u32>> {
    use windows::Win32::System::JobObjects::JobObjectBasicProcessIdList;
    // Fixed bounded capacity; a truncated/changing membership is unavailable.
    let mut storage = vec![0_usize; 4098];
    unsafe {
        QueryInformationJobObject(
            Some(HANDLE(job.handle.as_raw_handle())),
            JobObjectBasicProcessIdList,
            storage.as_mut_ptr().cast(),
            (storage.len() * std::mem::size_of::<usize>()) as u32,
            None,
        )
        .ok()?;
    }
    let counts = storage.as_ptr().cast::<u32>();
    let (assigned, returned) = unsafe { (*counts, *counts.add(1)) };
    if assigned == 0 || assigned != returned || returned > 4096 {
        return None;
    }
    let list = unsafe {
        std::slice::from_raw_parts(
            storage.as_ptr().cast::<u8>().add(8).cast::<usize>(),
            returned as usize,
        )
    };
    list.iter().map(|pid| u32::try_from(*pid).ok()).collect()
}

#[cfg(windows)]
fn process_membership(job: &ProcessJob) -> Option<Vec<resource_accounting::Identity>> {
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    let pids = job_pids(job)?;
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.ok()?;
    let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot.0) };
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    unsafe { Process32FirstW(HANDLE(snapshot.as_raw_handle()), &mut entry) }.ok()?;
    let mut processes = Vec::new();
    loop {
        let len = entry
            .szExeFile
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(entry.szExeFile.len());
        processes.push((
            entry.th32ProcessID,
            entry.th32ParentProcessID,
            String::from_utf16_lossy(&entry.szExeFile[..len]).to_ascii_lowercase(),
        ));
        if let Err(error) = unsafe { Process32NextW(HANDLE(snapshot.as_raw_handle()), &mut entry) }
        {
            if error.code() != windows::core::HRESULT::from_win32(18) {
                return None;
            }
            break;
        }
    }
    // Verify app descendants did inherit the OS cap; never quietly exempt a breakaway.
    let edges: Vec<_> = processes
        .iter()
        .map(|(pid, parent, _)| (*pid, *parent))
        .collect();
    let owned = resource_accounting::descendants(&[std::process::id()], &edges, process_created)?;
    if !resource_accounting::all_in_job(&owned, &pids) {
        return None;
    }
    let mut required = std::collections::BTreeMap::new();
    for pid in pids {
        let identity = resource_accounting::Identity {
            pid,
            created: process_created(pid)?,
        };
        if identity.created == 0 || required.insert(pid, identity).is_some() {
            return None;
        }
    }
    for identity in owned {
        if required.get(&identity.pid) != Some(&identity) {
            return None;
        }
    }
    if EXTERNAL_OLLAMA_USED.load(Ordering::Acquire) {
        let providers: Vec<u32> = processes
            .iter()
            .filter(|(_, _, name)| name.starts_with("ollama") && name.ends_with(".exe"))
            .map(|(pid, _, _)| *pid)
            .collect();
        if providers.is_empty() {
            return None;
        }
        for identity in resource_accounting::descendants(&providers, &edges, process_created)? {
            if required
                .insert(identity.pid, identity)
                .is_some_and(|previous| previous != identity)
            {
                return None;
            }
        }
    }
    Some(required.into_values().collect())
}

#[cfg(windows)]
fn process_created(pid: u32) -> Option<u64> {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    let raw = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let handle = unsafe { OwnedHandle::from_raw_handle(raw.0) };
    let (mut created, mut exited, mut kernel, mut user) = (
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
    );
    unsafe {
        GetProcessTimes(
            HANDLE(handle.as_raw_handle()),
            &mut created,
            &mut exited,
            &mut kernel,
            &mut user,
        )
    }
    .ok()?;
    let ticks = (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime);
    (ticks != 0).then_some(ticks)
}

#[cfg(windows)]
fn process_reading(pid: u32) -> Option<resource_accounting::Reading> {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };
    let raw =
        unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) }.ok()?;
    let handle = unsafe { OwnedHandle::from_raw_handle(raw.0) };
    let raw = HANDLE(handle.as_raw_handle());
    let (mut created, mut exited, mut kernel, mut user) = (
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
    );
    unsafe { GetProcessTimes(raw, &mut created, &mut exited, &mut kernel, &mut user) }.ok()?;
    let mut memory = PROCESS_MEMORY_COUNTERS::default();
    unsafe {
        GetProcessMemoryInfo(
            raw,
            &mut memory,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        )
    }
    .ok()?;
    let ticks =
        |time: FILETIME| (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime);
    Some(resource_accounting::Reading {
        identity: resource_accounting::Identity {
            pid,
            created: ticks(created),
        },
        working_set: memory.WorkingSetSize as u64,
        cpu_100ns: ticks(kernel).checked_add(ticks(user))?,
    })
}

#[cfg(windows)]
fn measure_process_group() -> Option<(f64, f64, i32)> {
    let job = PROCESS_JOB.get()?.as_ref().ok()?;
    let mut owned = job_pids(job)?;
    owned.sort_unstable();
    let required = process_membership(job)?;
    let readings: Vec<_> = required
        .iter()
        .map(|identity| process_reading(identity.pid))
        .collect::<Option<_>>()?;
    let mut owned_after = job_pids(job)?;
    owned_after.sort_unstable();
    if owned != owned_after
        || process_membership(job)? != required
        || !resource_accounting::same_identities(&required, &readings)
    {
        return None;
    }
    let pids: Vec<_> = required.iter().map(|identity| identity.pid).collect();
    let (bytes, mut cpu) = resource_accounting::aggregate(&pids, &readings)?;
    cpu.retain(|identity, _| !owned.contains(&identity.pid));
    use windows::Win32::System::JobObjects::{
        JobObjectBasicAccountingInformation, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
    };
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
    let job_cpu_100ns = u64::try_from(accounting.TotalUserTime)
        .ok()?
        .checked_add(u64::try_from(accounting.TotalKernelTime).ok()?)?;
    let wall = Instant::now();
    let mut sample = job.sample.lock().ok()?;
    let previous = sample.replace(CpuSample {
        cpu: cpu.clone(),
        job_cpu_100ns,
        wall,
    });
    let pct = previous
        .and_then(|previous| {
            resource_accounting::normalized_with_job(
                previous.job_cpu_100ns,
                job_cpu_100ns,
                &previous.cpu,
                &cpu,
                wall.duration_since(previous.wall)
                    .as_nanos()
                    .checked_div(100)?
                    .try_into()
                    .ok()?,
                std::thread::available_parallelism().ok()?.get(),
            )
        })
        .unwrap_or(NO_READING);
    Some((bytes as f64 / 1_000_000., pct, required.len() as i32))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;
    use std::time::Instant;

    const GPU_FEEDER_TEST_CHILD_ENV: &str = "G_MAIDEN_GPU_FEEDER_TEST_CHILD";

    #[test]
    fn operating_headroom_preserves_ten_percent_admission_contract() {
        assert!(!is_over_budget(100.0, 8.1));
        assert!(!is_over_budget(100.0, 10.0));
        assert!(is_over_budget(100.0, 10.0001));
        assert!(is_over_budget(900.000001, 0.0));
    }

    #[test]
    fn approved_ram_boundary_allows_six_and_eight_hundred_decimal_mb() {
        assert!(!is_over_budget(600.0, 0.0));
        assert!(!is_over_budget(900.0, 10.0));
        assert!(is_over_budget(900.000001, 0.0));
    }

    #[test]
    fn invalid_ram_or_cpu_measurements_fail_closed() {
        for invalid in [
            NO_READING,
            -f64::EPSILON,
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
        ] {
            assert!(is_over_budget(invalid, 0.0));
            assert!(is_over_budget(0.0, invalid));
        }
    }

    #[test]
    fn gpu_feeder_child_process_fixture() {
        match std::env::var(GPU_FEEDER_TEST_CHILD_ENV).as_deref() {
            Ok("running") => loop {
                std::thread::sleep(Duration::from_secs(60));
            },
            Ok("exited") => {}
            _ => {}
        }
    }

    struct TestChildGuard(Option<Child>);

    impl TestChildGuard {
        fn spawn(mode: &str) -> Self {
            let mut command = Command::new(std::env::current_exe().expect("test executable"));
            command
                .args([
                    "--exact",
                    "governor::tests::gpu_feeder_child_process_fixture",
                    "--nocapture",
                ])
                .env(GPU_FEEDER_TEST_CHILD_ENV, mode)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            }
            Self(Some(command.spawn().expect("spawn test-owned child")))
        }

        fn child(&self) -> &Child {
            self.0.as_ref().expect("child guard is populated")
        }

        fn child_mut(&mut self) -> &mut Child {
            self.0.as_mut().expect("child guard is populated")
        }

        fn take(&mut self) -> Child {
            self.0.take().expect("child guard is populated")
        }
    }

    impl Drop for TestChildGuard {
        fn drop(&mut self) {
            if let Some(mut child) = self.0.take() {
                if !matches!(child.try_wait(), Ok(Some(_))) {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }

    struct TestFeederGuard(GpuFeederProcess);

    impl Drop for TestFeederGuard {
        fn drop(&mut self) {
            let _ = self.0.shutdown();
        }
    }

    fn wait_for_exit(child: &mut Child) -> bool {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => return true,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(None) | Err(_) => return false,
            }
        }
    }

    #[test]
    fn gpu_feeder_shutdown_reaps_only_owned_child_and_accepts_exited_child() {
        let mut owned_child = TestChildGuard::spawn("running");
        let mut unrelated_child = TestChildGuard::spawn("running");
        let unrelated_pid = unrelated_child.child().id();
        let owned = TestFeederGuard(GpuFeederProcess::new(Some(owned_child.take())));

        assert!(
            owned.0.shutdown(),
            "owned feeder should be terminated and reaped"
        );
        assert!(owned.0.shutdown(), "shutdown should be idempotent");
        assert!(
            owned.0.child.lock().unwrap().is_none(),
            "successfully reaped child should no longer be retained"
        );
        assert_eq!(unrelated_child.child().id(), unrelated_pid);
        assert!(
            unrelated_child.child_mut().try_wait().unwrap().is_none(),
            "an unrelated same-test child must remain running"
        );

        let mut exited_child = TestChildGuard::spawn("exited");
        assert!(
            wait_for_exit(exited_child.child_mut()),
            "fixture should exit promptly"
        );
        let exited = TestFeederGuard(GpuFeederProcess::new(Some(exited_child.take())));
        assert!(
            exited.0.shutdown(),
            "an already-exited child should be harmless"
        );
        assert!(
            GpuFeederProcess::new(None).shutdown(),
            "missing sidecar should be harmless"
        );
    }

    #[test]
    fn measure_returns_plausible_values() {
        // Just verify the measurement path doesn't panic and returns plausible
        // values. Exact numbers depend on the host and are non-deterministic.
        let s = measure();
        // RAM: a running Rust test binary should be at least a few MB.
        // CPU: 0-100% per core.
        assert!(
            s.ram_mb == NO_READING || s.ram_mb >= 0.0,
            "ram_mb must be non-negative: {}",
            s.ram_mb
        );
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
            ram_mb: 901.0,
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
    fn unavailable_ram_and_unqualified_external_admission_fail_closed() {
        assert!(is_over_budget(NO_READING, 0.0));
        let denial = admit_local_provider().unwrap_err();
        assert!(denial.contains("900 MB"));
        assert!(denial.contains("900000000-byte"));
        assert!(denial.contains("no provable resource reservation or app Job CPU cap"));
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
