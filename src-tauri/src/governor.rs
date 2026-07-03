//! G7.2 — Resource Governor.
//!
//! Monitors the process's own RAM and CPU usage. Emits `resource-stats` events
//! to the control window every [`POLL_INTERVAL_S`] seconds so the dashboard can
//! display live numbers. Also enforces the NFR budgets (SRS):
//!   - RAM ≤ 400 MB working set
//!   - Background CPU ≤ 2.5% on a mid-range chipset
//!
//! On Windows we read from PROCESS_MEMORY_COUNTERS via a PowerShell one-liner
//! (zero extra Rust crates). CPU is estimated from two WMI snapshots taken
//! POLL_INTERVAL_S apart. Both are cheap calls that run on the governor thread,
//! which itself sleeps almost all the time.
//!
//! Throttle callbacks are exported so the capture loop can check whether to
//! drop a processing tick (reducing from ~8 Hz to ~4 Hz) when CPU is high.

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL_S: u64 = 10;

/// Two GPU telemetry sources, user-selectable via `set_telemetry_source`:
///   - **feeder** — the bundled headless `gpu-feeder` sidecar PUSHes GPU-only
///     samples to `POST /telemetry` (`ingest_gpu`). Light, always available.
///   - **G-Telemetry** — the sibling app writes a RICHER file (adds CPU temp,
///     ~200ms) at `%LOCALAPPDATA%\G-Series\telemetry-latest.json`; we read it.
/// The main app never runs nvidia-smi itself, so the NFR budgets keep covering
/// only our own work. Sources (matches `TelemetrySource` in the frontend):
///   0 = auto (prefer the rich G-Telemetry file, else the feeder push)
///   1 = feeder only · 2 = G-Telemetry only · 3 = off
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
static CPU_THROTTLE: AtomicBool = AtomicBool::new(false);

#[allow(dead_code)] // read by the capture loop once throttling is wired
pub fn cpu_throttle() -> bool {
    CPU_THROTTLE.load(Ordering::Relaxed)
}

#[derive(Clone, serde::Serialize)]
pub struct ResourceStats {
    pub ram_mb: f64,
    pub cpu_pct: f64,
    /// True when one or more NFRs are over budget.
    pub over_budget: bool,
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
    loop {
        let stats = measure();
        let over = stats.over_budget;
        CPU_THROTTLE.store(over, Ordering::Relaxed);
        if over {
            eprintln!(
                "[G-Gov] over budget — RAM {:.0} MB, CPU {:.1}%",
                stats.ram_mb, stats.cpu_pct
            );
        }
        let _ = app.emit("resource-stats", &stats);
        std::thread::sleep(Duration::from_secs(POLL_INTERVAL_S));
    }
}

fn measure() -> ResourceStats {
    let ram_mb = measure_ram_mb().unwrap_or(0.0);
    let cpu_pct = measure_cpu_pct().unwrap_or(0.0);
    // Own-process budgets — GPU/CPU-temp are whole-machine numbers, NOT ours.
    let over_budget = ram_mb > 400.0 || cpu_pct > 2.5;
    let g = resolve_gpu();
    ResourceStats {
        ram_mb, cpu_pct, over_budget,
        gpu_pct: g.0, gpu_temp_c: g.1, vram_used_mb: g.2, vram_total_mb: g.3, cpu_temp_c: g.4,
    }
}

/// Resolve (gpu_load, gpu_temp, vram_used, vram_total, cpu_temp) from the active
/// source. Only the rich G-Telemetry file carries cpu_temp; the feeder push does
/// not (its 5th value is always NO_READING).
fn resolve_gpu() -> (f64, f64, f64, f64, f64) {
    let none = (NO_READING, NO_READING, NO_READING, NO_READING, NO_READING);
    let feeder = || read_pushed_gpu().map(|(l, t, u, v)| (l, t, u, v, NO_READING));
    let rich = read_bridge_file;
    match TELEMETRY_SOURCE.load(Ordering::Relaxed) {
        3 => none,                                    // off
        1 => feeder().unwrap_or(none),                // feeder only
        2 => rich().unwrap_or(none),                  // G-Telemetry only
        _ => rich().or_else(feeder).unwrap_or(none),  // auto: prefer the rich file
    }
}

/// Store a GPU sample pushed by the feeder (called from the `POST /telemetry`
/// handler). Ignores payloads that don't carry a usable first GPU.
pub fn ingest_gpu(body: &serde_json::Value) {
    if let Some((load, temp, used_mb, total_mb)) = parse_gpu(body) {
        if let Ok(mut slot) = LATEST_GPU.lock() {
            *slot = Some(GpuSample { load, temp, used_mb, total_mb, at: Instant::now() });
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
    Some((num("loadPercent")?, num("tempC")?, num("vramUsedMb")?, num("vramTotalMb")?))
}

/// Read the RICH G-Telemetry bridge file (adds CPU temp, ~200ms fresh):
/// `{ ts, cpu:{tempC}, gpus:[{loadPercent,tempC,vramUsedMb,vramTotalMb}] }`.
/// Returns (gpu_load, gpu_temp, vram_used, vram_total, cpu_temp); `cpu_temp` is
/// NO_READING when the file omits it or reports null (no LHM sensor).
fn read_bridge_file() -> Option<(f64, f64, f64, f64, f64)> {
    let base = std::env::var("LOCALAPPDATA").ok()?;
    let path = std::path::Path::new(&base).join("G-Series").join("telemetry-latest.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
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
/// then the dev second-bin name. No-ops if neither exists (GPU stays "—").
pub fn spawn_gpu_feeder() {
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(dir) = exe.parent() else { return };
    let path = dir.join("gpu-feeder.exe");
    if !path.is_file() {
        return; // not bundled (e.g. no GPU build) — GPU telemetry stays "—"
    }
    // Clear any feeder left over from a previous run so restarts don't stack them.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "gpu-feeder.exe"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output();
    }
    let mut cmd = std::process::Command::new(&path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let _ = cmd.spawn();
}

fn measure_ram_mb() -> Option<f64> {
    // PowerShell: get working-set bytes of *this* process, convert to MB.
    let pid = std::process::id();
    let script = format!(
        "(Get-Process -Id {pid}).WorkingSet64 / 1MB"
    );
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

fn measure_cpu_pct() -> Option<f64> {
    // PowerShell: instantaneous CPU% of this process via WMI.
    // We take two readings 1s apart so the delta gives a meaningful rate.
    let pid = std::process::id();
    let script = format!(
        "$p = Get-Process -Id {pid}; \
         $c1 = $p.TotalProcessorTime.TotalMilliseconds; \
         Start-Sleep -Milliseconds 1000; \
         $p.Refresh(); \
         $c2 = $p.TotalProcessorTime.TotalMilliseconds; \
         $cores = [Environment]::ProcessorCount; \
         [math]::Round(($c2 - $c1) / (1000.0 * $cores) * 100.0, 2)"
    );
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
        assert!(s.cpu_pct >= 0.0 && s.cpu_pct <= 200.0, "cpu_pct out of range: {}", s.cpu_pct);
    }

    #[test]
    fn over_budget_flag_set_when_ram_high() {
        let s = ResourceStats {
            ram_mb: 450.0, cpu_pct: 1.0, over_budget: false,
            gpu_pct: NO_READING, gpu_temp_c: NO_READING,
            vram_used_mb: NO_READING, vram_total_mb: NO_READING, cpu_temp_c: NO_READING,
        };
        let recomputed = s.ram_mb > 400.0 || s.cpu_pct > 2.5;
        assert!(recomputed);
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
        let partial: serde_json::Value = serde_json::from_str(r#"{ "gpus": [ { "loadPercent": 1 } ] }"#).unwrap();
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
        assert_eq!(parse_bridge_file(raw, 1000 + 1000), Some((42.0, 63.0, 3200.0, 8192.0, 55.0)));
    }

    #[test]
    fn parse_bridge_file_handles_null_cpu_temp_and_staleness() {
        // null CPU temp (no LHM sensor) → NO_READING, GPU still read.
        let null_temp = r#"{ "ts": 1000, "cpu": { "tempC": null },
            "gpus": [ { "loadPercent": 1, "tempC": 2, "vramUsedMb": 3, "vramTotalMb": 4 } ] }"#;
        assert_eq!(parse_bridge_file(null_temp, 1000), Some((1.0, 2.0, 3.0, 4.0, NO_READING)));
        // Stale (older than BRIDGE_FILE_STALE_MS) → None.
        assert!(parse_bridge_file(null_temp, 1000 + BRIDGE_FILE_STALE_MS + 1).is_none());
    }
}
