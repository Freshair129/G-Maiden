//! G-Maiden Perf Suite — GATE P7 (Round-2 Revision)
//!
//! Measures two non-negotiable NFRs from SRS §5 / TDD §7:
//!   • RAM ≤ 400 MB  (always-on background footprint, cloud-online, SLM not loaded)
//!   • FPS drop ≤ 3% (Dota 2 in-game FPS measured via PresentMon ETW on dota2.exe)
//!
//! NOTE (ADR-13 — DXGI capture migration): this gate asserts RAM + FPS-drop only;
//! it does NOT assert raw capture CPU%.  Post-migration the capture CPU target
//! dropped from ~8% (old WGC backend, which also stalled at ~0.7 Hz) to ≤1.5%
//! (DXGI Desktop Duplication, GPU copy).  That CPU figure is observed separately
//! via the app's own resource-stats (governor/resource panel), not gated here.
//!
//! # Why NOT DwmGetCompositionTimingInfo
//!
//! DWM composition timing counts frames the Desktop Window Manager composites for
//! ALL windows combined.  This counter is locked to the monitor refresh rate and
//! does not reflect the application's own render rate.  Showing or hiding an
//! overlay window has no measurable effect on the DWM counter, so the delta is
//! trivially ≈ 0 regardless of actual game FPS impact — the gate would PASS even
//! if the overlay dropped Dota 2 from 144 fps to 60 fps.
//!
//! PresentMon (https://github.com/GameTechDev/PresentMon) uses ETW
//! (Event Tracing for Windows) to capture the DXGI Present event stream for a
//! specific process (dota2.exe), giving per-frame timestamps that directly
//! reflect the game's own render rate.  This is the only correct approach.
//!
//! # Usage
//!
//!   cd tests/perf
//!   cargo run --release --bin perf_p7 -- --pid 1234   # RAM only for a running G-Maiden
//!   cargo run --release --bin perf_p7 -- --stub        # Show design estimates (SKIP, not PASS)
//!   cargo run --release --bin perf_p7 -- --fps-baseline
//!   cargo run --release --bin perf_p7 -- --fps-overlay
//!
//! # FPS two-phase workflow (requires PresentMon in PATH or common locations)
//!
//!   1. Start Dota 2 (no G-Maiden overlay)
//!   2. cargo run --release --bin perf_p7 -- --fps-baseline
//!      (captures 30 s of dota2.exe DXGI Present events → fps-baseline.json)
//!   3. Start G-Maiden overlay
//!   4. cargo run --release --bin perf_p7 -- --fps-overlay
//!      (captures 30 s, compares, asserts ≤3% FPS drop)
//!
//! # Exit codes
//!
//!   0  = GATE P7 PASS  (real measurements, all within budget)
//!   1  = GATE P7 FAIL  (budget exceeded)
//!   77 = SKIP          (prerequisites missing: no G-Maiden process, no PresentMon,
//!                       no dota2.exe, or stub mode — not a failure, not a pass)

/// POSIX skip convention — matches automake/cargo-nextest skip semantics.
const EXIT_SKIP: i32 = 77;

// ─────────────────────────────────────────────────────────────────────────────
// Gate constants  (SRS §5 / Engineering Spec §7 / TDD §7)
// ─────────────────────────────────────────────────────────────────────────────

/// Always-on background footprint ceiling.
/// ADR-07: SLM lazy-load only — its ~1–1.3 GB is NOT included in this budget.
const RAM_BUDGET_MB: u64 = 400;

/// Max FPS reduction the overlay may cause vs. a game-with-no-overlay baseline.
const FPS_DROP_MAX_PCT: f64 = 3.0;

// Sampling parameters
const RAM_SAMPLE_INTERVAL_SECS: u64 = 5;
const RAM_SAMPLE_DURATION_SECS: u64 = 60;
const FPS_MEASURE_SECS: u64 = 30;

// Design estimates (documentation only — never reported as GATE P7 PASS)
/// Tauri v2 baseline: Rust core ~60 MB + WebView2 shared ~150 MB = ~210 MB.
const STUB_RAM_PEAK_MB: u64 = 210;
/// DWM-composited transparent overlay; GPU-assisted — expected overhead well under 3%.
const STUB_FPS_DROP_PCT: f64 = 0.8;

const BASELINE_FILE: &str = "fps-baseline.json";
const FPS_CAPTURE_FILE: &str = "fps-capture.csv";

// ─────────────────────────────────────────────────────────────────────────────
// Tri-state measurement result
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, PartialEq)]
enum MeasureState {
    Pass,
    Fail,
    /// Prerequisites missing or stub mode; not a measurement failure.
    Skip,
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared imports (child modules use `use super::*` to inherit these)
// ─────────────────────────────────────────────────────────────────────────────

use std::{
    env, fs,
    path::{Path, PathBuf},
    process,
    thread,
    time::{Duration, Instant},
};

// ─────────────────────────────────────────────────────────────────────────────
// RAM module
// ─────────────────────────────────────────────────────────────────────────────

mod ram {
    use super::*;
    use sysinfo::{Pid, System};

    pub struct RamResult {
        pub peak_mb: f64,
        pub samples: usize,
        pub state: MeasureState,
    }

    pub fn run(pid: Option<u32>) -> RamResult {
        match pid {
            Some(p) => measure_live(p),
            None => {
                println!("[RAM] SKIP — no G-Maiden process found (start the app first, or pass --pid)");
                RamResult { peak_mb: 0.0, samples: 0, state: MeasureState::Skip }
            }
        }
    }

    fn measure_live(pid: u32) -> RamResult {
        println!(
            "[RAM] Sampling pid {} every {}s for {}s …",
            pid, RAM_SAMPLE_INTERVAL_SECS, RAM_SAMPLE_DURATION_SECS
        );

        let sys_pid = Pid::from(pid as usize);
        let mut sys = System::new();
        let deadline = Instant::now() + Duration::from_secs(RAM_SAMPLE_DURATION_SECS);
        let mut peak_bytes: u64 = 0;
        let mut samples = 0usize;

        while Instant::now() < deadline {
            sys.refresh_process(sys_pid);
            match sys.process(sys_pid) {
                Some(proc) => {
                    let mem = proc.memory(); // bytes (WorkingSet on Windows, RSS on Linux)
                    peak_bytes = peak_bytes.max(mem);
                    samples += 1;
                    println!(
                        "[RAM]   #{:>3}  current {:.1} MB  peak {:.1} MB",
                        samples,
                        bytes_to_mb(mem),
                        bytes_to_mb(peak_bytes),
                    );
                }
                None => {
                    eprintln!("[RAM] WARNING: pid {} disappeared — stopping early", pid);
                    break;
                }
            }
            thread::sleep(Duration::from_secs(RAM_SAMPLE_INTERVAL_SECS));
        }

        let peak_mb = bytes_to_mb(peak_bytes);
        let state = if samples == 0 {
            println!("[RAM] SKIP — no samples collected (process may have exited immediately)");
            MeasureState::Skip
        } else {
            let passed = peak_bytes <= RAM_BUDGET_MB * 1_048_576;
            println!(
                "[RAM] RESULT  peak {:.1} MB  /  {} MB  →  {}",
                peak_mb, RAM_BUDGET_MB, gate_label(passed)
            );
            if passed { MeasureState::Pass } else { MeasureState::Fail }
        };

        RamResult { peak_mb, samples, state }
    }

    fn bytes_to_mb(b: u64) -> f64 { b as f64 / 1_048_576.0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// FPS module  — PresentMon ETW approach
// ─────────────────────────────────────────────────────────────────────────────

mod fps {
    use super::*;
    use sysinfo::System;

    pub struct FpsSample {
        pub fps: f64,
        pub drop_rate_pct: f64,
    }

    // ── Phase 1: record baseline (no overlay) ────────────────────────────────

    /// Returns true if the baseline was measured and saved to BASELINE_FILE.
    /// Returns false if prerequisites are missing (PresentMon not found, dota2.exe
    /// not running) — caller should exit SKIP.
    pub fn run_baseline() -> bool {
        let pm = match find_presentmon() {
            Some(p) => p,
            None => {
                eprintln!(
                    "[FPS] SKIP — PresentMon not found in PATH or common locations.\n\
                     [FPS]   Install from: https://github.com/GameTechDev/PresentMon"
                );
                return false;
            }
        };
        if !dota2_running() {
            eprintln!("[FPS] SKIP — dota2.exe not running. Start Dota 2 first (no overlay).");
            return false;
        }

        println!("[FPS] Capturing dota2.exe frame data via PresentMon ETW ({} s, overlay NOT active) …", FPS_MEASURE_SECS);
        match measure_fps_presentmon(&pm, "dota2.exe", FPS_MEASURE_SECS, FPS_CAPTURE_FILE) {
            Err(e) => {
                eprintln!("[FPS] SKIP — PresentMon error: {e}");
                false
            }
            Ok(sample) => {
                println!("[FPS] Baseline  {:.1} fps  drop {:.2}%", sample.fps, sample.drop_rate_pct);
                let json = format!(
                    r#"{{"fps":{:.6},"drop_rate_pct":{:.6}}}"#,
                    sample.fps, sample.drop_rate_pct
                );
                fs::write(BASELINE_FILE, &json).expect("cannot write fps-baseline.json");
                println!("[FPS] Baseline saved → {BASELINE_FILE}");
                println!("[FPS] Next: start G-Maiden overlay then run --fps-overlay");
                true
            }
        }
    }

    // ── Phase 2: measure with overlay, compare ───────────────────────────────

    pub struct OverlayResult {
        pub fps_delta_pct: f64,
        pub state: MeasureState,
    }

    pub fn run_overlay() -> OverlayResult {
        let json = match fs::read_to_string(BASELINE_FILE) {
            Ok(j) => j,
            Err(_) => {
                eprintln!("[FPS] ERROR: {BASELINE_FILE} not found — run --fps-baseline first");
                process::exit(EXIT_SKIP);
            }
        };
        let (b_fps, b_drop) = parse_baseline_json(&json);
        if b_fps <= 0.0 {
            eprintln!("[FPS] ERROR: baseline FPS is 0 in {BASELINE_FILE} (corrupt or empty) — re-run --fps-baseline");
            process::exit(EXIT_SKIP);
        }
        println!("[FPS] Loaded baseline  {:.1} fps  drop {:.2}%", b_fps, b_drop);

        let pm = match find_presentmon() {
            Some(p) => p,
            None => {
                eprintln!("[FPS] SKIP — PresentMon not found.");
                return OverlayResult { fps_delta_pct: 0.0, state: MeasureState::Skip };
            }
        };
        if !dota2_running() {
            eprintln!("[FPS] SKIP — dota2.exe not running. Start Dota 2 with the overlay active.");
            return OverlayResult { fps_delta_pct: 0.0, state: MeasureState::Skip };
        }

        println!("[FPS] Capturing dota2.exe frame data via PresentMon ETW ({} s, overlay ACTIVE) …", FPS_MEASURE_SECS);
        match measure_fps_presentmon(&pm, "dota2.exe", FPS_MEASURE_SECS, FPS_CAPTURE_FILE) {
            Err(e) => {
                eprintln!("[FPS] SKIP — PresentMon error: {e}");
                OverlayResult { fps_delta_pct: 0.0, state: MeasureState::Skip }
            }
            Ok(overlay) => {
                let baseline = FpsSample { fps: b_fps, drop_rate_pct: b_drop };
                compare(baseline, overlay)
            }
        }
    }

    // ── PresentMon integration ────────────────────────────────────────────────

    /// Searches PATH (via where.exe on Windows) and common install locations.
    fn find_presentmon() -> Option<PathBuf> {
        let candidates = [
            "PresentMon.exe",
            "PresentMon64.exe",
            "PresentMon64A.exe",
            r"C:\Program Files\PresentMon\PresentMon.exe",
            r"C:\Program Files (x86)\PresentMon\PresentMon.exe",
            r"C:\Tools\PresentMon.exe",
        ];
        for candidate in &candidates {
            let p = Path::new(candidate);
            if p.exists() {
                return Some(p.to_path_buf());
            }
        }
        // On Windows, also try where.exe for PATH lookup
        #[cfg(windows)]
        {
            for name in &["PresentMon.exe", "PresentMon64.exe", "PresentMon64A.exe"] {
                if let Ok(out) = process::Command::new("where.exe").arg(name).output() {
                    if out.status.success() {
                        if let Some(line) = String::from_utf8_lossy(&out.stdout).lines().next() {
                            let p = PathBuf::from(line.trim());
                            if p.exists() {
                                return Some(p);
                            }
                        }
                    }
                }
            }
        }
        None
    }

    fn dota2_running() -> bool {
        let mut sys = System::new_all();
        sys.refresh_all();
        sys.processes()
            .values()
            .any(|p| p.name().to_lowercase().contains("dota2"))
    }

    /// Invoke PresentMon and capture per-frame data for `process_name`.
    ///
    /// Tries PresentMon v1 CLI flags first; falls back to v2 flags if the first
    /// invocation exits with an error.  Both versions write a CSV with a
    /// `MsBetweenPresents` column derived from DXGI Present ETW timestamps.
    fn measure_fps_presentmon(
        presentmon: &Path,
        process_name: &str,
        secs: u64,
        output_file: &str,
    ) -> Result<FpsSample, String> {
        let _ = fs::remove_file(output_file); // clear stale capture

        // PresentMon v1 flags
        let v1_ok = process::Command::new(presentmon)
            .args([
                "-process_name", process_name,
                "-output_file", output_file,
                "-timed", &secs.to_string(),
                "-dont_restart_as_admin",
            ])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        if !v1_ok {
            // PresentMon v2 / newer CLI flags
            let v2_status = process::Command::new(presentmon)
                .args([
                    "--process_name", process_name,
                    "--output_file", output_file,
                    "--timer", &secs.to_string(),
                ])
                .status()
                .map_err(|e| format!("Cannot run PresentMon: {e}"))?;

            if !v2_status.success() {
                return Err(
                    "PresentMon exited with error — may need admin privileges for ETW access".to_string()
                );
            }
        }

        if !Path::new(output_file).exists() {
            return Err(format!(
                "{output_file} was not created — is {process_name} rendering frames?"
            ));
        }

        parse_presentmon_csv(output_file)
    }

    /// Parse PresentMon CSV output and compute average FPS from MsBetweenPresents.
    fn parse_presentmon_csv(file: &str) -> Result<FpsSample, String> {
        let content = fs::read_to_string(file)
            .map_err(|e| format!("Cannot read {file}: {e}"))?;

        let mut lines = content.lines().peekable();

        // Skip any leading comment lines (some PresentMon versions emit them)
        let header_line = loop {
            match lines.next() {
                None => return Err("No header row in PresentMon CSV".to_string()),
                Some(l) if l.trim_start().starts_with('#') => continue,
                Some(l) => break l,
            }
        };

        let cols: Vec<&str> = header_line.split(',').map(str::trim).collect();
        let ms_col = cols
            .iter()
            .position(|&c| c == "MsBetweenPresents")
            .ok_or("MsBetweenPresents column not found — unexpected PresentMon output format")?;
        let dropped_col = cols.iter().position(|&c| c == "Dropped");

        let mut frame_times: Vec<f64> = Vec::new();
        let mut dropped_count: u64 = 0;
        let mut total_count: u64 = 0;

        for line in lines {
            if line.trim().is_empty() || line.trim_start().starts_with('#') {
                continue;
            }
            let fields: Vec<&str> = line.split(',').collect();
            if fields.len() <= ms_col {
                continue;
            }
            if let Ok(ms) = fields[ms_col].trim().parse::<f64>() {
                if ms > 0.0 {
                    frame_times.push(ms);
                    total_count += 1;
                    if let Some(dc) = dropped_col {
                        if fields.get(dc).and_then(|f| f.trim().parse::<u64>().ok()) == Some(1) {
                            dropped_count += 1;
                        }
                    }
                }
            }
        }

        if frame_times.is_empty() {
            return Err(format!(
                "No frame data in {file} — is dota2.exe actually rendering?"
            ));
        }

        let avg_ms = frame_times.iter().sum::<f64>() / frame_times.len() as f64;
        let fps = 1000.0 / avg_ms;
        let drop_rate_pct = if total_count > 0 {
            dropped_count as f64 / total_count as f64 * 100.0
        } else {
            0.0
        };

        Ok(FpsSample { fps, drop_rate_pct })
    }

    // ── Comparison ────────────────────────────────────────────────────────────

    fn compare(baseline: FpsSample, overlay: FpsSample) -> OverlayResult {
        // Clamp to 0: if overlay is somehow faster than baseline (measurement noise),
        // that is not a failure — treat as 0% impact.
        let fps_delta_pct = if baseline.fps > 0.0 {
            ((baseline.fps - overlay.fps) / baseline.fps * 100.0).max(0.0)
        } else {
            0.0
        };
        let passed = fps_delta_pct <= FPS_DROP_MAX_PCT;

        println!(
            "[FPS] Baseline {:.1} fps  drop {:.2}%   →   Overlay {:.1} fps  drop {:.2}%",
            baseline.fps, baseline.drop_rate_pct, overlay.fps, overlay.drop_rate_pct,
        );
        println!(
            "[FPS] RESULT  Δ {:.2}%  /  {}%  →  {}",
            fps_delta_pct, FPS_DROP_MAX_PCT, gate_label(passed)
        );
        OverlayResult {
            fps_delta_pct,
            state: if passed { MeasureState::Pass } else { MeasureState::Fail },
        }
    }

    // ── JSON baseline parsing (no external deps) ──────────────────────────────

    pub fn parse_baseline_json(json: &str) -> (f64, f64) {
        let extract = |key: &str| -> f64 {
            let needle = format!(r#""{key}":"#);
            json.find(&needle)
                .and_then(|i| {
                    let rest = &json[i + needle.len()..];
                    let end = rest.find([',', '}']).unwrap_or(rest.len());
                    rest[..end].trim().parse().ok()
                })
                .unwrap_or(0.0)
        };
        (extract("fps"), extract("drop_rate_pct"))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

fn gate_label(passed: bool) -> &'static str {
    if passed { "PASS ✓" } else { "FAIL ✗" }
}

/// Find a running G-Maiden process and return its PID.
/// Fixed: uses .as_u32() — sysinfo::Pid does not implement From<Pid> for u32.
fn find_gmaiden_pid() -> Option<u32> {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();
    sys.processes()
        .values()
        .find(|p| p.name().to_lowercase().contains("g-maiden"))
        .map(|p| p.pid().as_u32())
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

fn main() {
    let args: Vec<String> = env::args().collect();
    let has = |flag: &str| args.iter().any(|a| a == flag);

    let force_stub   = has("--stub");
    let fps_baseline = has("--fps-baseline");
    let fps_overlay  = has("--fps-overlay");

    println!("═══════════════════════════════════════════════════════════");
    println!(" G-Maiden Perf Suite  —  GATE P7");
    println!(" SRS §5  |  TDD §7  |  FPS via PresentMon ETW on dota2.exe");
    println!("═══════════════════════════════════════════════════════════");
    println!();

    // ── Stub mode: show design estimates and exit SKIP (not PASS) ────────────
    if force_stub {
        println!("STUB MODE — architectural design estimates only");
        println!();
        println!(
            "  RAM estimate : {} MB  /  {} MB  (Tauri v2: Rust core + WebView2, SLM not loaded)",
            STUB_RAM_PEAK_MB, RAM_BUDGET_MB
        );
        println!(
            "  FPS estimate : Δ {:.1}%  /  {:.1}%  (DWM-composited transparent overlay, GPU-assisted)",
            STUB_FPS_DROP_PCT, FPS_DROP_MAX_PCT
        );
        println!();
        println!("  NOTE: These are projections from TDD §7 / Tech-Stack doc.");
        println!("  GATE P7 cannot be declared PASS from design estimates.");
        println!("  A real G-Maiden binary must be measured against dota2.exe.");
        println!();
        println!("  GATE P7: SKIP [stub — no real binary measured]");
        println!("═══════════════════════════════════════════════════════════");
        process::exit(EXIT_SKIP);
    }

    // ── FPS sub-commands (two-phase PresentMon workflow) ─────────────────────
    if fps_baseline {
        println!("Phase 1/2 — recording dota2.exe FPS baseline (overlay must be OFF)");
        println!();
        let saved = fps::run_baseline();
        println!();
        if saved {
            println!("Baseline recorded. Start G-Maiden overlay then run --fps-overlay.");
            // exit 0 — baseline phase is a success even though gate not yet evaluated
        } else {
            println!("GATE P7 (FPS baseline): SKIP — see errors above");
            process::exit(EXIT_SKIP);
        }
        return;
    }

    if fps_overlay {
        println!("Phase 2/2 — measuring dota2.exe FPS with overlay ACTIVE");
        println!();
        let result = fps::run_overlay();
        println!();
        match result.state {
            MeasureState::Pass => {
                println!("GATE P7 (FPS): {}", gate_label(true));
            }
            MeasureState::Fail => {
                println!("GATE P7 (FPS): {}", gate_label(false));
                process::exit(1);
            }
            MeasureState::Skip => {
                println!("GATE P7 (FPS): SKIP — see errors above");
                process::exit(EXIT_SKIP);
            }
        }
        return;
    }

    // ── Default mode: RAM measurement ─────────────────────────────────────────
    // The FPS gate REQUIRES the two-phase PresentMon workflow (--fps-baseline /
    // --fps-overlay) because the harness cannot toggle the G-Maiden overlay
    // in-process.  No auto-mode FPS measurement is provided — it would measure
    // the same condition twice and always produce Δ ≈ 0 (vacuous PASS).
    let pid: Option<u32> = if let Some(i) = args.iter().position(|a| a == "--pid") {
        args.get(i + 1).and_then(|v| v.parse().ok())
    } else {
        find_gmaiden_pid()
    };

    match pid {
        Some(p) => println!(" Target pid: {p}"),
        None    => println!(" Target pid: (none — start G-Maiden or pass --pid <pid>)"),
    }
    println!();

    println!("── 1 / 2  RAM Budget (≤{} MB) ──────────────────────────", RAM_BUDGET_MB);
    let ram = ram::run(pid);
    println!();

    println!("── 2 / 2  FPS Impact (≤{FPS_DROP_MAX_PCT}%) ─────────────────────────────");
    println!("[FPS] SKIP — FPS gate requires the two-phase PresentMon workflow:");
    println!("[FPS]   1. Start Dota 2 (no overlay)");
    println!("[FPS]   2. cargo run --release --bin perf_p7 -- --fps-baseline");
    println!("[FPS]   3. Start G-Maiden overlay");
    println!("[FPS]   4. cargo run --release --bin perf_p7 -- --fps-overlay");
    println!();

    // Summary
    println!("═══════════════════════════════════════════════════════════");
    let ram_label = match &ram.state {
        MeasureState::Pass => format!("{:.1} MB / {} MB  {}", ram.peak_mb, RAM_BUDGET_MB, gate_label(true)),
        MeasureState::Fail => format!("{:.1} MB / {} MB  {}", ram.peak_mb, RAM_BUDGET_MB, gate_label(false)),
        MeasureState::Skip => "SKIP".to_string(),
    };
    println!("  RAM  {ram_label}");
    println!("  FPS  SKIP (use --fps-baseline / --fps-overlay)");
    println!("───────────────────────────────────────────────────────────");

    match &ram.state {
        MeasureState::Fail => {
            println!("  GATE P7: {} (RAM budget exceeded)", gate_label(false));
            println!("═══════════════════════════════════════════════════════════");
            eprintln!("\nGATE P7 FAILED — RAM budget constraint violated");
            process::exit(1);
        }
        MeasureState::Pass => {
            println!("  GATE P7: SKIP (RAM passed; FPS not yet measured)");
            println!("  → Complete the FPS phase: --fps-baseline then --fps-overlay");
        }
        MeasureState::Skip => {
            println!("  GATE P7: SKIP (no live process found)");
            println!("  → Start G-Maiden then re-run (or pass --pid <pid>)");
        }
    }
    println!("═══════════════════════════════════════════════════════════");

    // Any incomplete measurement is SKIP, not PASS or FAIL
    process::exit(EXIT_SKIP);
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Gate constants match SRS ──

    #[test]
    fn ram_budget_matches_srs() {
        // SRS §5: RAM ≤ 400 MB (background footprint, SLM excluded per ADR-07)
        assert_eq!(RAM_BUDGET_MB, 400);
    }

    #[test]
    fn fps_drop_budget_matches_srs() {
        // SRS §5 / CLAUDE.md: overlay must not drop Dota 2 FPS by more than 3%
        assert!((FPS_DROP_MAX_PCT - 3.0).abs() < f64::EPSILON);
    }

    // ── Skip exit code ──

    #[test]
    fn skip_exit_code_is_77() {
        // POSIX skip convention; matches automake and cargo-nextest
        assert_eq!(EXIT_SKIP, 77);
    }

    // ── Stub estimates are within budget (design sanity, not gate proof) ──

    #[test]
    fn stub_ram_within_budget() {
        assert!(
            STUB_RAM_PEAK_MB <= RAM_BUDGET_MB,
            "Stub RAM {} MB > budget {} MB — update design estimate",
            STUB_RAM_PEAK_MB, RAM_BUDGET_MB
        );
    }

    #[test]
    fn stub_fps_within_budget() {
        assert!(
            STUB_FPS_DROP_PCT <= FPS_DROP_MAX_PCT,
            "Stub FPS drop {}% > budget {}%",
            STUB_FPS_DROP_PCT, FPS_DROP_MAX_PCT
        );
    }

    // ── Gate label ──

    #[test]
    fn gate_labels() {
        assert_eq!(gate_label(true), "PASS ✓");
        assert_eq!(gate_label(false), "FAIL ✗");
    }

    // ── FPS delta arithmetic ──

    #[test]
    fn fps_delta_within_budget_passes() {
        // 144 fps → 141 fps: Δ ≈ 2.08% → PASS
        let baseline = 144.0_f64;
        let overlay  = 141.0_f64;
        let delta = ((baseline - overlay) / baseline * 100.0).max(0.0);
        assert!(delta <= FPS_DROP_MAX_PCT, "2.08% should be ≤ 3.0%");
    }

    #[test]
    fn fps_delta_over_budget_fails() {
        // 144 fps → 138 fps: Δ ≈ 4.17% → FAIL
        let baseline = 144.0_f64;
        let overlay  = 138.0_f64;
        let delta = ((baseline - overlay) / baseline * 100.0).max(0.0);
        assert!(delta > FPS_DROP_MAX_PCT, "4.17% should be > 3.0%");
    }

    #[test]
    fn fps_delta_exactly_at_budget_passes() {
        // Exactly 3.0% drop should be accepted (≤, not <)
        let baseline = 100.0_f64;
        let overlay  = 97.0_f64;
        let delta = ((baseline - overlay) / baseline * 100.0).max(0.0);
        assert!(delta <= FPS_DROP_MAX_PCT, "3.0% should be ≤ 3.0%");
    }

    #[test]
    fn fps_delta_zero_baseline_does_not_panic() {
        // If measurement returns 0 fps (e.g. game not running), delta clamps to 0
        let baseline_fps = 0.0_f64;
        let overlay_fps  = 0.0_f64;
        let delta = if baseline_fps > 0.0 {
            ((baseline_fps - overlay_fps) / baseline_fps * 100.0).max(0.0)
        } else {
            0.0
        };
        assert_eq!(delta, 0.0);
    }

    #[test]
    fn fps_delta_overlay_faster_clamps_to_zero() {
        // Measurement noise can make overlay appear faster — must not produce negative delta
        let baseline = 100.0_f64;
        let overlay  = 102.0_f64;
        let delta = ((baseline - overlay) / baseline * 100.0).max(0.0);
        assert_eq!(delta, 0.0);
    }

    // ── RAM byte conversion ──

    #[test]
    fn ram_budget_in_bytes_is_correct() {
        let budget_bytes = RAM_BUDGET_MB * 1_048_576;
        assert_eq!(budget_bytes, 419_430_400); // 400 × 1024 × 1024
    }

    #[test]
    fn stub_ram_bytes_within_budget_bytes() {
        let stub_bytes   = STUB_RAM_PEAK_MB * 1_048_576;
        let budget_bytes = RAM_BUDGET_MB * 1_048_576;
        assert!(stub_bytes <= budget_bytes);
    }

    // ── Measurement parameters ──

    #[test]
    fn sample_duration_longer_than_interval() {
        assert!(RAM_SAMPLE_DURATION_SECS >= RAM_SAMPLE_INTERVAL_SECS);
        assert!(RAM_SAMPLE_DURATION_SECS > 0);
        assert!(RAM_SAMPLE_INTERVAL_SECS > 0);
    }

    #[test]
    fn fps_measure_window_nonzero() {
        assert!(FPS_MEASURE_SECS > 0);
    }

    // ── JSON baseline parsing (inline, no serde) ──

    #[test]
    fn parse_baseline_json_roundtrip() {
        let fps  = 144.123456_f64;
        let drop = 0.125000_f64;
        let json = format!(r#"{{"fps":{fps:.6},"drop_rate_pct":{drop:.6}}}"#);
        let (parsed_fps, parsed_drop) = fps::parse_baseline_json(&json);
        assert!((parsed_fps  - fps ).abs() < 1e-4, "fps mismatch: {parsed_fps}");
        assert!((parsed_drop - drop).abs() < 1e-6, "drop mismatch: {parsed_drop}");
    }

    // ── PresentMon CSV FPS arithmetic (offline, no real file) ──

    #[test]
    fn presentmon_avg_fps_from_frame_times() {
        // 8.333 ms/frame → 120.0 fps
        let frame_times = [8.333_f64; 5];
        let avg_ms = frame_times.iter().sum::<f64>() / frame_times.len() as f64;
        let fps = 1000.0 / avg_ms;
        assert!((fps - 120.0).abs() < 0.1, "Expected ~120 fps, got {fps:.2}");
    }

    #[test]
    fn presentmon_fps_drop_detection_fails_gate() {
        // Baseline 144 fps → overlay 137.3 fps: Δ ≈ 4.65% → exceeds 3% budget
        let baseline_fps = 144.0_f64;
        let overlay_fps  = 137.3_f64;
        let delta = ((baseline_fps - overlay_fps) / baseline_fps * 100.0).max(0.0);
        assert!(delta > FPS_DROP_MAX_PCT, "4.65% should exceed 3% budget: got {delta:.2}%");
    }

    #[test]
    fn presentmon_fps_drop_within_budget_passes() {
        // Baseline 144 fps → overlay 141 fps: Δ ≈ 2.08% → within budget
        let baseline_fps = 144.0_f64;
        let overlay_fps  = 141.0_f64;
        let delta = ((baseline_fps - overlay_fps) / baseline_fps * 100.0).max(0.0);
        assert!(delta <= FPS_DROP_MAX_PCT, "2.08% should be within budget: got {delta:.2}%");
    }

    // ── MeasureState ──

    #[test]
    fn measure_state_equality() {
        assert_eq!(MeasureState::Pass, MeasureState::Pass);
        assert_eq!(MeasureState::Fail, MeasureState::Fail);
        assert_eq!(MeasureState::Skip, MeasureState::Skip);
        assert_ne!(MeasureState::Pass, MeasureState::Fail);
        assert_ne!(MeasureState::Pass, MeasureState::Skip);
    }
}
