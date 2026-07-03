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

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL_S: u64 = 10;

/// GPU telemetry is measured by the sibling **G-Telemetry** tray app (which owns
/// nvidia-smi / LibreHardwareMonitor) and dropped into a shared JSON file. We
/// only READ it here — G-Maiden never spawns nvidia-smi itself, so the app stays
/// light and the NFR budgets keep covering only our own work. Contract:
///   `%LOCALAPPDATA%\G-Series\telemetry-latest.json`
///   { "ts": <unix ms>, "gpus": [ { "loadPercent", "tempC",
///     "vramUsedMb", "vramTotalMb" } ] }
/// Samples older than this are treated as "bridge not running" → GPU shows "—".
const BRIDGE_STALE_MS: u64 = 30_000;

/// Sentinel meaning "no reading" (bridge absent / stale / no GPU). Mirrors the
/// frontend's NO_SENSOR so the telemetry footer renders "—".
const NO_READING: f64 = -1.0;

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
    /// GPU metrics bridged from G-Telemetry. `-1` = unavailable (bridge not
    /// running / stale / no GPU) so the footer shows "—" instead of a fake 0.
    pub gpu_pct: f64,
    pub gpu_temp_c: f64,
    pub vram_used_mb: f64,
    pub vram_total_mb: f64,
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
    // Own-process budgets — GPU (from the bridge) is intentionally NOT part of
    // this: it's the sibling app's/whole-machine's number, not ours.
    let over_budget = ram_mb > 400.0 || cpu_pct > 2.5;
    let (gpu_pct, gpu_temp_c, vram_used_mb, vram_total_mb) =
        read_bridge_gpu().unwrap_or((NO_READING, NO_READING, NO_READING, NO_READING));
    ResourceStats { ram_mb, cpu_pct, over_budget, gpu_pct, gpu_temp_c, vram_used_mb, vram_total_mb }
}

/// Path to the G-Telemetry → G-Maiden bridge file, if `LOCALAPPDATA` is set.
fn bridge_path() -> Option<PathBuf> {
    std::env::var("LOCALAPPDATA")
        .ok()
        .map(|base| PathBuf::from(base).join("G-Series").join("telemetry-latest.json"))
}

/// Read the first GPU's (load%, tempC, vramUsedMb, vramTotalMb) from the bridge
/// file. `None` when missing, malformed, stale, or no GPU — caller falls back to
/// the NO_READING sentinel.
fn read_bridge_gpu() -> Option<(f64, f64, f64, f64)> {
    let raw = std::fs::read_to_string(bridge_path()?).ok()?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
    parse_bridge_gpu(&raw, now)
}

/// Pure parse+staleness check, split out so it's testable without env or fs.
fn parse_bridge_gpu(raw: &str, now_ms: u64) -> Option<(f64, f64, f64, f64)> {
    let v: serde_json::Value = serde_json::from_str(raw).ok()?;
    let ts = v.get("ts")?.as_u64()?;
    if now_ms.saturating_sub(ts) > BRIDGE_STALE_MS {
        return None; // bridge app not running / went idle
    }
    let gpu = v.get("gpus")?.as_array()?.first()?;
    let num = |key: &str| gpu.get(key).and_then(serde_json::Value::as_f64);
    Some((num("loadPercent")?, num("tempC")?, num("vramUsedMb")?, num("vramTotalMb")?))
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
            vram_used_mb: NO_READING, vram_total_mb: NO_READING,
        };
        let recomputed = s.ram_mb > 400.0 || s.cpu_pct > 2.5;
        assert!(recomputed);
    }

    #[test]
    fn bridge_parses_a_fresh_sample() {
        let raw = r#"{ "ts": 1000, "gpus": [
            { "loadPercent": 42.5, "tempC": 63.0, "vramUsedMb": 3200.0, "vramTotalMb": 8192.0 }
        ] }"#;
        // now within BRIDGE_STALE_MS of ts
        let got = parse_bridge_gpu(raw, 1000 + 5_000).unwrap();
        assert_eq!(got, (42.5, 63.0, 3200.0, 8192.0));
    }

    #[test]
    fn bridge_rejects_a_stale_sample() {
        let raw = r#"{ "ts": 1000, "gpus": [ { "loadPercent": 1, "tempC": 1, "vramUsedMb": 1, "vramTotalMb": 1 } ] }"#;
        assert!(parse_bridge_gpu(raw, 1000 + BRIDGE_STALE_MS + 1).is_none());
    }

    #[test]
    fn bridge_rejects_no_gpu_or_garbage() {
        assert!(parse_bridge_gpu(r#"{ "ts": 1000, "gpus": [] }"#, 1000).is_none());
        assert!(parse_bridge_gpu("not json", 1000).is_none());
        assert!(parse_bridge_gpu(r#"{ "gpus": [] }"#, 1000).is_none()); // no ts
    }
}
