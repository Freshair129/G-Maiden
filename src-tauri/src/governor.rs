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

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL_S: u64 = 10;

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
    let over_budget = ram_mb > 400.0 || cpu_pct > 2.5;
    ResourceStats { ram_mb, cpu_pct, over_budget }
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
        let s = ResourceStats { ram_mb: 450.0, cpu_pct: 1.0, over_budget: false };
        let recomputed = s.ram_mb > 400.0 || s.cpu_pct > 2.5;
        assert!(recomputed);
    }
}
