//! G-Signal Latency LIVE Probes — Hop 1 (DXGI capture) + Hop 6 (audio output
//! buffer).
//!
//! `latency_harness` (GATE P3, `src/main.rs`) wires every hop that can run
//! headless (2-5) but reports hops 1 and 6 as SKIP because they need a real
//! display / audio device — resources CI never has. This binary is the
//! counterpart that runs on a machine that DOES have both: it measures those
//! two hops for real and leaves everything else alone.
//!
//! # Wiring status: LIVE
//!
//!   - **Hop 1 — DXGI capture**: [`g_maiden::dxgi::DxgiCapture`] (the exact
//!     capture backend `capture.rs` drives in production, ADR-13/CR-001) is
//!     opened on the primary output (monitor 0) and driven the same way the
//!     in-crate `#[ignore]`d tests around `dxgi.rs:820` do — repeated
//!     acquire calls, timing only the calls that return a frame.
//!     `DxgiCapture::new`/`acquire_frame`/`acquire_rect` take no Tauri handle
//!     and no lock, so the public surface really is usable standalone (see
//!     `dxgi.rs` doc comment: "not `Send`/`Sync`... holds no locks"). Two
//!     series are measured off the same `DxgiCapture` instance:
//!       - **1a full-frame (legacy)** — `acquire_frame()`, the old
//!         whole-desktop copy path. Since the capture-switch task, production
//!         no longer takes this path outside calibration mode, so 1a is
//!         **informational only** (status `INFO`, no PASS/FAIL verdict).
//!       - **1b minimap-rect (production)** — `acquire_rect(x, y, side,
//!         side)` with the rect derived exactly like `capture.rs` does:
//!         `g_maiden::cv::region::MinimapRegion::for_resolution(w, h)`. This
//!         is the real hop-1 cost after the capture-switch and is the one the
//!         30ms Engineering Spec §1 budget applies to.
//!   - **Hop 6 — audio output buffer**: independent of the app's audio
//!     thread (`audio.rs` owns its own dedicated thread + channel — this
//!     probe does NOT touch that code path). It opens its own
//!     `rodio::OutputStream`, decodes one bundled clip
//!     (`src-tauri/voice-pack-default/gank/*.mp3`), and wraps the decoded
//!     `Source` in [`TimedSource`], which records an `Instant` the first
//!     time `next()` is pulled — the moment the audio thread's device
//!     callback starts consuming the source, the closest measurable proxy
//!     for "first audible". Latency = that instant minus the instant
//!     `Sink::append` was called.
//!
//! # Self-detection (no device → SKIP, never a hard failure)
//!
//! Each probe independently detects whether its device exists and reports
//! `SKIP` with a one-line reason instead of panicking or spinning forever:
//!   - Hop 1 (1a/1b): `DxgiCapture::new(0)` returning `Err` (no GPU/output —
//!     e.g. a display-less RDP session), OR zero frames arriving within the
//!     wall-clock budget (desktop is fully idle / duplication unavailable).
//!     Each series self-detects independently — 1a can SKIP (idle desktop)
//!     while 1b still measures, or vice versa.
//!   - Hop 6: `OutputStream::try_default()` returning `Err` (no audio
//!     device), the bundled clip missing, or every play timing out waiting
//!     for a first sample pull (device stalled).
//!
//! All probes always run — one failing to detect its device does not skip
//! the others (see `main`).
//!
//! # Exit codes (worst-probe-wins, matches `latency_harness`/`perf_p7`;
//! computed from **1b + hop 6 only** — 1a is informational and never
//! contributes a verdict)
//!   0  = every probe that RAN is within its Engineering Spec §1 hop budget
//!   1  = at least one probe that ran exceeded its budget (FAIL dominates)
//!   77 = both 1b and hop 6 SKIPped (no display AND no audio device found)
//!
//! # Usage
//!   cargo run --release --manifest-path tests/perf/Cargo.toml --bin latency_live

use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use rodio::{Decoder, OutputStream, Sink, Source};

use g_maiden::cv::region::MinimapRegion;
use g_maiden::dxgi::DxgiCapture;

// ---------------------------------------------------------------------------
// Engineering Spec §1 — the budgets this binary can actually measure.
// Names match `latency_harness`'s `BUDGET_CAPTURE_MS`/`BUDGET_AUDIO_MS`.
// ---------------------------------------------------------------------------

/// Hop 1b: DXGI minimap-rect frame ready — the production path after the
/// capture-switch task (production no longer full-copies outside
/// calibration mode). Hop 1a (full-frame, legacy) has no budget — see
/// `probe_capture`.
const BUDGET_CAPTURE_MS: f64 = 30.0;
const BUDGET_AUDIO_MS: f64 = 40.0; // Hop 6: audio output buffer

/// POSIX skip convention — matches `latency_harness`/`perf_p7`/`perf_cpu_tree`.
const EXIT_SKIP: i32 = 77;

// ---------------------------------------------------------------------------
// Hop 1 probe parameters
// ---------------------------------------------------------------------------

/// How many successful frame acquisitions we'd like before stopping — per
/// series (both 1a and 1b target this many independently).
const CAPTURE_TARGET_SAMPLES: usize = 100;
/// Wall-clock ceiling for EACH hop-1 series (1a and 1b each get up to this
/// long, so the hop-1 stage as a whole can take up to ~2x this) — a fully
/// idle desktop (no window repainting) may never present a new frame; give
/// up rather than hang forever, and report whatever we did collect (or SKIP
/// on zero).
const CAPTURE_MAX_WALL: Duration = Duration::from_secs(20);

// ---------------------------------------------------------------------------
// Hop 6 probe parameters
// ---------------------------------------------------------------------------

/// Matches the "~30 plays" in the task brief.
const AUDIO_PLAYS: usize = 30;
/// Per-play ceiling waiting for `TimedSource`'s first `next()` pull. Real
/// device latency is low-milliseconds; this only guards against a wedged
/// device so one bad play can't hang the whole probe.
const AUDIO_PULL_TIMEOUT: Duration = Duration::from_secs(2);
/// Poll interval while waiting for the first sample pull.
const AUDIO_POLL_INTERVAL: Duration = Duration::from_micros(200);

// ---------------------------------------------------------------------------
// Statistics — same percentile method as `latency_harness::compute_stat`
// (separate binary, so re-implemented rather than shared).
// ---------------------------------------------------------------------------

struct Stat {
    mean: f64,
    p50: f64,
    p99: f64,
}

fn compute_stat(mut v: Vec<f64>) -> Stat {
    if v.is_empty() {
        return Stat {
            mean: 0.0,
            p50: 0.0,
            p99: 0.0,
        };
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = v.len();
    let mean = v.iter().sum::<f64>() / n as f64;
    let pct = |p: f64| -> f64 {
        let idx = ((p / 100.0) * (n - 1) as f64).round() as usize;
        v[idx.min(n - 1)]
    };
    Stat {
        mean,
        p50: pct(50.0),
        p99: pct(99.0),
    }
}

// ---------------------------------------------------------------------------
// Per-probe result
// ---------------------------------------------------------------------------

#[derive(PartialEq, Clone, Copy, Debug)]
enum Status {
    Pass,
    Fail,
    Skip,
    /// Measured, but no budget applies — informational only (hop 1a,
    /// full-frame legacy path). Never contributes to `combine_exit`'s
    /// verdict; treat it like Pass for exit-code purposes.
    Info,
}

impl Status {
    fn label(self) -> &'static str {
        match self {
            Status::Pass => "PASS",
            Status::Fail => "FAIL",
            Status::Skip => "SKIP",
            Status::Info => "INFO",
        }
    }
}

struct HopResult {
    label: &'static str,
    status: Status,
    n: usize,
    mean_ms: f64,
    p50_ms: f64,
    p99_ms: f64,
    budget_ms: f64,
    /// Whether `budget_ms` means anything. `false` for hop 1a (informational
    /// — no budget was ever assigned to the legacy full-frame path).
    has_budget: bool,
    note: String,
}

impl HopResult {
    fn skip(label: &'static str, budget_ms: f64, reason: String) -> Self {
        Self {
            label,
            status: Status::Skip,
            n: 0,
            mean_ms: 0.0,
            p50_ms: 0.0,
            p99_ms: 0.0,
            budget_ms,
            has_budget: true,
            note: reason,
        }
    }

    /// A `SKIP` with no budget to report — hop 1a's "no frames captured"
    /// path (informational series, so there's nothing to have blown).
    fn skip_no_budget(label: &'static str, reason: String) -> Self {
        Self {
            label,
            status: Status::Skip,
            n: 0,
            mean_ms: 0.0,
            p50_ms: 0.0,
            p99_ms: 0.0,
            budget_ms: 0.0,
            has_budget: false,
            note: reason,
        }
    }

    fn measured(label: &'static str, budget_ms: f64, samples: Vec<f64>, note: String) -> Self {
        let stat = compute_stat(samples.clone());
        let status = if stat.p99 <= budget_ms {
            Status::Pass
        } else {
            Status::Fail
        };
        Self {
            label,
            status,
            n: samples.len(),
            mean_ms: stat.mean,
            p50_ms: stat.p50,
            p99_ms: stat.p99,
            budget_ms,
            has_budget: true,
            note,
        }
    }

    /// Same shape as `measured`, but with no budget to check against —
    /// always `Status::Info`, never `Pass`/`Fail`. Used for hop 1a
    /// (full-frame legacy), which production no longer takes outside
    /// calibration mode, so there's no verdict to render.
    fn measured_info(label: &'static str, samples: Vec<f64>, note: String) -> Self {
        let stat = compute_stat(samples.clone());
        Self {
            label,
            status: Status::Info,
            n: samples.len(),
            mean_ms: stat.mean,
            p50_ms: stat.p50,
            p99_ms: stat.p99,
            budget_ms: 0.0,
            has_budget: false,
            note,
        }
    }

    /// p99 to feed into the full-E2E estimate line — the real measurement
    /// when we have one, else the Engineering Spec budget (clearly labeled
    /// as such), exactly like `latency_harness`'s `SKIP_BUDGET_MS` treats
    /// its own two un-wirable hops. Only ever called on hops that carry a
    /// budget (1b, hop 6) — hop 1a is informational and excluded from the
    /// full-E2E estimate.
    fn p99_or_budget(&self) -> (f64, &'static str) {
        if self.status == Status::Skip {
            (self.budget_ms, "budget, SKIPPED")
        } else {
            (self.p99_ms, "measured")
        }
    }
}

// ---------------------------------------------------------------------------
// Hop 1 — DXGI capture probes (1a full-frame legacy, 1b minimap-rect prod)
// ---------------------------------------------------------------------------

const LABEL_CAPTURE_A: &str = "Hop 1a DXGI full-frame (legacy)";
const LABEL_CAPTURE_B: &str = "Hop 1b DXGI minimap-rect (prod)";

/// Drive one capture series to `target` successful acquisitions or
/// `max_wall`, whichever comes first, timing only the calls that return a
/// frame. Shared by both the full-frame (1a) and minimap-rect (1b) series —
/// same sample count / wall-clock cap for both, per the task brief.
///
/// No manual sleep between calls: both `acquire_frame`/`acquire_rect` already
/// block inside DXGI's `AcquireNextFrame` (up to 100ms, a kernel wait, not a
/// spin) when no new frame has presented, so this loop can't busy-spin the
/// CPU.
fn run_capture_series<F>(target: usize, max_wall: Duration, mut acquire: F) -> (Vec<f64>, u64)
where
    F: FnMut() -> Option<(Vec<u8>, u32, u32)>,
{
    let mut samples: Vec<f64> = Vec::with_capacity(target);
    let mut attempts: u64 = 0;
    let wall_start = Instant::now();

    while samples.len() < target && wall_start.elapsed() < max_wall {
        attempts += 1;
        let t0 = Instant::now();
        if acquire().is_some() {
            samples.push(t0.elapsed().as_secs_f64() * 1000.0);
        }
    }

    (samples, attempts)
}

fn zero_frames_note(attempts: u64, call_name: &str) -> String {
    format!(
        "no frames captured in {:?} ({attempts} {call_name} calls) — desktop fully idle, or \
         Desktop Duplication unavailable on this session (RDP / exclusive-fullscreen owner)",
        CAPTURE_MAX_WALL
    )
}

fn capture_note(n: usize, attempts: u64, call_name: &str) -> String {
    if n < CAPTURE_TARGET_SAMPLES {
        format!(
            "only {n}/{CAPTURE_TARGET_SAMPLES} frames captured within {:?} wall-clock \
             ({attempts} attempts) — desktop activity was sparse; numbers below are still real \
             measurements, just fewer of them",
            CAPTURE_MAX_WALL
        )
    } else {
        format!("{attempts} {call_name} calls to collect {CAPTURE_TARGET_SAMPLES} frames")
    }
}

/// Run both hop-1 series off one `DxgiCapture` instance. Returns `(1a, 1b)`.
/// If the device can't be opened at all, both series SKIP with the same
/// reason. Each series otherwise self-detects independently (e.g. 1a could
/// SKIP on zero frames while 1b still measures, or vice versa) since a rect
/// grab and a full-desktop grab don't necessarily fail together.
fn probe_capture() -> (HopResult, HopResult) {
    let mut cap = match DxgiCapture::new(0) {
        Ok(c) => c,
        Err(e) => {
            let reason = format!("DxgiCapture::new(0) failed — no display/GPU output: {e}");
            return (
                HopResult::skip_no_budget(LABEL_CAPTURE_A, reason.clone()),
                HopResult::skip(LABEL_CAPTURE_B, BUDGET_CAPTURE_MS, reason),
            );
        }
    };

    // 1a — full-frame (legacy). Informational: production no longer takes
    // this path outside calibration mode (capture-switch task), so there's
    // no budget to check it against.
    let (samples_a, attempts_a) =
        run_capture_series(CAPTURE_TARGET_SAMPLES, CAPTURE_MAX_WALL, || cap.acquire_frame());
    let hop_a = if samples_a.is_empty() {
        HopResult::skip_no_budget(LABEL_CAPTURE_A, zero_frames_note(attempts_a, "acquire_frame"))
    } else {
        let note = capture_note(samples_a.len(), attempts_a, "acquire_frame");
        HopResult::measured_info(LABEL_CAPTURE_A, samples_a, note)
    };

    // 1b — minimap-rect (production path). Rect derived exactly like
    // `capture.rs` does: `state.region = MinimapRegion::for_resolution(w, h)`
    // (capture.rs:221), which is resolution-derived (region.rs).
    let region = MinimapRegion::for_resolution(cap.width(), cap.height());
    let (samples_b, attempts_b) = run_capture_series(CAPTURE_TARGET_SAMPLES, CAPTURE_MAX_WALL, || {
        cap.acquire_rect(region.x, region.y, region.side, region.side)
    });
    let hop_b = if samples_b.is_empty() {
        HopResult::skip(
            LABEL_CAPTURE_B,
            BUDGET_CAPTURE_MS,
            zero_frames_note(attempts_b, "acquire_rect"),
        )
    } else {
        let note = capture_note(samples_b.len(), attempts_b, "acquire_rect");
        HopResult::measured(LABEL_CAPTURE_B, BUDGET_CAPTURE_MS, samples_b, note)
    };

    (hop_a, hop_b)
}

// ---------------------------------------------------------------------------
// Hop 6 — audio output buffer probe
// ---------------------------------------------------------------------------

/// A `Source` adapter that records the `Instant` of the FIRST `next()` call
/// — the moment rodio's audio thread (the cpal device callback) actually
/// starts pulling samples out of the decoded clip. That's the closest
/// measurable proxy for "the device started consuming this audio" available
/// from outside rodio's internals, and it happens on a different thread than
/// the one that called `Sink::append`, hence the `Arc<OnceLock<_>>` instead
/// of a plain field the caller could read back directly.
struct TimedSource<S> {
    inner: S,
    first_pull: Arc<OnceLock<Instant>>,
}

impl<S> Iterator for TimedSource<S>
where
    S: Source<Item = i16>,
{
    type Item = i16;

    fn next(&mut self) -> Option<i16> {
        // `OnceLock::set` only succeeds once; every call after the first is
        // a no-op `Err` we intentionally ignore — we want exactly the FIRST
        // pull's timestamp, not the latest.
        let _ = self.first_pull.set(Instant::now());
        self.inner.next()
    }
}

impl<S> Source for TimedSource<S>
where
    S: Source<Item = i16>,
{
    fn current_frame_len(&self) -> Option<usize> {
        self.inner.current_frame_len()
    }
    fn channels(&self) -> u16 {
        self.inner.channels()
    }
    fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }
}

/// First `*.mp3` (sorted, so the pick is deterministic) under
/// `src-tauri/voice-pack-default/gank/`, resolved via `CARGO_MANIFEST_DIR` so
/// it doesn't depend on the process's working directory (unlike
/// `latency_harness`'s hop-5 clip lookup, which deliberately chdirs — this
/// probe reads the file directly instead of going through `audio::pick_clip`,
/// per the task brief).
fn find_gank_clip() -> Option<PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("src-tauri")
        .join("voice-pack-default")
        .join("gank");
    let mut clips: Vec<PathBuf> = fs::read_dir(&dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("mp3"))
                .unwrap_or(false)
        })
        .collect();
    clips.sort();
    clips.into_iter().next()
}

fn probe_audio() -> HopResult {
    let label = "Hop 6  audio output buf";

    let clip_path = match find_gank_clip() {
        Some(p) => p,
        None => {
            return HopResult::skip(
                label,
                BUDGET_AUDIO_MS,
                "no bundled clip found under src-tauri/voice-pack-default/gank/*.mp3".to_string(),
            );
        }
    };

    let (_stream, handle) = match OutputStream::try_default() {
        Ok(s) => s,
        Err(e) => {
            return HopResult::skip(
                label,
                BUDGET_AUDIO_MS,
                format!("OutputStream::try_default() failed — no audio output device: {e}"),
            );
        }
    };

    let mut samples: Vec<f64> = Vec::with_capacity(AUDIO_PLAYS);
    let mut timeouts: u32 = 0;

    for i in 0..AUDIO_PLAYS {
        let file = match fs::File::open(&clip_path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[latency_live] play {i}: open {}: {e}", clip_path.display());
                continue;
            }
        };
        let decoder = match Decoder::new(BufReader::new(file)) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[latency_live] play {i}: decode {}: {e}", clip_path.display());
                continue;
            }
        };
        let sink = match Sink::try_new(&handle) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[latency_live] play {i}: Sink::try_new: {e}");
                continue;
            }
        };
        // Quieter than production default (rodio default is 1.0, the app's
        // own default is 0.8 — see `audio.rs`'s `VOLUME`) since this probe
        // plays 30 short blips back to back. Volume scaling happens in
        // rodio's mixer chain downstream of `TimedSource`, so it has no
        // effect on the measured first-pull latency.
        sink.set_volume(0.2);

        let first_pull: Arc<OnceLock<Instant>> = Arc::new(OnceLock::new());
        let timed = TimedSource {
            inner: decoder,
            first_pull: Arc::clone(&first_pull),
        };

        let t_append = Instant::now();
        sink.append(timed);

        let wait_start = Instant::now();
        let mut got = false;
        while wait_start.elapsed() < AUDIO_PULL_TIMEOUT {
            if let Some(&t_pull) = first_pull.get() {
                let ms = t_pull.saturating_duration_since(t_append).as_secs_f64() * 1000.0;
                samples.push(ms);
                got = true;
                break;
            }
            std::thread::sleep(AUDIO_POLL_INTERVAL);
        }
        if !got {
            timeouts += 1;
            eprintln!(
                "[latency_live] play {i}: no sample pulled within {:?} — device may be stalled",
                AUDIO_PULL_TIMEOUT
            );
        }
        // Cut playback short now that we have (or gave up on) the timing —
        // we only need the first sample pull, not the whole clip.
        sink.stop();
    }

    if samples.is_empty() {
        return HopResult::skip(
            label,
            BUDGET_AUDIO_MS,
            format!(
                "audio device opened but no play produced a first-pull sample in {AUDIO_PLAYS} \
                 attempts ({timeouts} timeouts)"
            ),
        );
    }

    let note = if samples.len() < AUDIO_PLAYS {
        format!(
            "{}/{AUDIO_PLAYS} plays yielded a timing sample ({timeouts} timed out) — clip: {}",
            samples.len(),
            clip_path.display()
        )
    } else {
        format!("{AUDIO_PLAYS} plays, clip: {}", clip_path.display())
    };

    HopResult::measured(label, BUDGET_AUDIO_MS, samples, note)
}

// ---------------------------------------------------------------------------
// Report helpers — same column set as `latency_harness`'s table (Hop /
// status / mean / p50 / p99 / budget), just a wider label column (32 vs 26)
// to fit the longer "Hop 1a DXGI full-frame (legacy)" / "Hop 1b DXGI
// minimap-rect (prod)" labels without truncation.
// ---------------------------------------------------------------------------

fn sep(n: usize) {
    println!("{}", "-".repeat(n));
}

fn fmt_ms(v: f64) -> String {
    format!("{v:.3}ms")
}

fn fmt_budget(v: f64) -> String {
    format!("{v:.2}ms")
}

fn print_row(label: &str, status: &str, n: &str, mean: &str, p50: &str, p99: &str, budget: &str) {
    println!(
        "{:<32} {:<6} {:>5} {:>12} {:>12} {:>12} {:>10}",
        label, status, n, mean, p50, p99, budget
    );
}

fn print_hop_row(r: &HopResult) {
    let budget_str = if r.has_budget {
        fmt_budget(r.budget_ms)
    } else {
        "--".to_string()
    };
    if r.status == Status::Skip {
        print_row(r.label, r.status.label(), "--", "--", "--", "--", &budget_str);
    } else {
        // Pass / Fail / Info all carry real measured stats — only the
        // budget column differs (Info has none).
        print_row(
            r.label,
            r.status.label(),
            &r.n.to_string(),
            &fmt_ms(r.mean_ms),
            &fmt_ms(r.p50_ms),
            &fmt_ms(r.p99_ms),
            &budget_str,
        );
    }
}

/// Combine probe verdicts: FAIL dominates (any budget blown is a real
/// problem), else ANY skip → 77 (a partially-unmeasured run must not read as
/// a full pass to exit-code consumers — matches run_gate_p3.bat's convention
/// "at least one SKIP and no FAIL → 77"), else PASS. `Status::Info` (hop 1a,
/// informational) never appears in the exit-verdict inputs by construction
/// (`main` only feeds this hop 1b + hop 6) — but if it ever did, it matches
/// neither the FAIL nor the SKIP arm, so it's silently treated like PASS,
/// consistent with "no budget verdict".
fn combine_exit(results: &[&HopResult]) -> i32 {
    if results.iter().any(|r| r.status == Status::Fail) {
        1
    } else if results.iter().any(|r| r.status == Status::Skip) {
        EXIT_SKIP
    } else {
        0
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

fn main() {
    println!("=================================================================");
    println!(" G-Signal Latency LIVE Probes   (Hop 1 + Hop 6)");
    println!(" Engineering Spec §1  |  the two device-dependent hops");
    println!(" latency_harness (GATE P3, headless) reports as SKIP.");
    println!(" WIRING: LIVE — real g_maiden::dxgi::DxgiCapture acquire_frame()/");
    println!("         acquire_rect() calls and a real rodio OutputStream + Sink,");
    println!("         not headless stand-ins.");
    println!("=================================================================");
    println!();

    println!(
        "Hop 1  probing primary output (monitor 0): 1a full-frame (legacy) + 1b minimap-rect \
         (production), target {CAPTURE_TARGET_SAMPLES} frames each, <= {:?} wall-clock each ...",
        CAPTURE_MAX_WALL
    );
    println!(
        "       caveat: both series share the same repaint-wait reality — DXGI Desktop \
         Duplication only delivers a frame when the screen actually repaints, so on an idle \
         desktop both are dominated by waiting for the next repaint, not by copy cost. Run \
         with screen content changing (game/video/animation) for a meaningful number."
    );
    let (capture_a, capture_b) = probe_capture();
    println!("  1a [{}] {}", capture_a.status.label(), capture_a.note);
    println!("  1b [{}] {}", capture_b.status.label(), capture_b.note);
    println!();

    println!("Hop 6  probing default audio output device: {AUDIO_PLAYS} plays ...");
    let audio = probe_audio();
    println!("  [{}] {}", audio.status.label(), audio.note);
    println!();

    println!(
        "{:<32} {:<6} {:>5} {:>12} {:>12} {:>12} {:>10}",
        "Hop", "status", "n", "mean", "p50", "p99", "budget"
    );
    sep(90);
    print_hop_row(&capture_a);
    print_hop_row(&capture_b);
    print_hop_row(&audio);
    sep(90);
    println!(
        "  (1a is informational only — no budget, no PASS/FAIL verdict; production takes 1b's \
         path since the capture-switch task, which the 30ms budget applies to.)"
    );
    println!();

    println!("WIRING STATUS: LIVE.");
    println!(
        "    {:<28} {}  (needs a real display/GPU output)",
        capture_a.label,
        capture_a.status.label()
    );
    println!(
        "    {:<28} {}  (needs a real display/GPU output)",
        capture_b.label,
        capture_b.status.label()
    );
    println!(
        "    {:<28} {}  (needs a real audio output device)",
        audio.label,
        audio.status.label()
    );
    println!();

    // ------------------------------------------------------------------
    // full-E2E estimate = headless wired p99 (run latency_harness) + hop 1b
    // (production capture path) + hop 6. Hop 1a is informational and
    // deliberately excluded — it's not what production pays anymore.
    // ------------------------------------------------------------------
    let (cap_p99, cap_src) = capture_b.p99_or_budget();
    let (aud_p99, aud_src) = audio.p99_or_budget();
    println!(
        "full-E2E estimate = headless wired p99 (run latency_harness) + hop 1b + hop 6 \
         (measured live hops)"
    );
    println!(
        "  hop1b p99 = {:.3}ms ({cap_src})  +  hop6 p99 = {:.3}ms ({aud_src})  =  {:.3}ms",
        cap_p99,
        aud_p99,
        cap_p99 + aud_p99
    );
    println!(
        "  -> run `cargo run --release --manifest-path tests/perf/Cargo.toml --bin \
         latency_harness` for the headless WIRED TOTAL p99 (hops 2-5) and add it to the \
         number above for a full end-to-end estimate."
    );
    println!();

    sep(90);
    // Exit verdict uses 1b + hop 6 only — 1a is informational and never
    // contributes (see `combine_exit` doc comment).
    let results = [&capture_b, &audio];
    let exit_code = combine_exit(&results);
    let skipped = results.iter().filter(|r| r.status == Status::Skip).count();
    match exit_code {
        0 => println!("LATENCY_LIVE PASSED -- hop 1b + hop 6 measured within budget"),
        1 => eprintln!("LATENCY_LIVE FAILED -- a live-probed hop exceeded its Engineering Spec budget"),
        _ if skipped == results.len() => {
            println!("LATENCY_LIVE SKIPPED -- neither probe found its device (no display, no audio)")
        }
        _ => println!(
            "LATENCY_LIVE PARTIAL ({skipped}/{} probes skipped, rest within budget) -- exit 77",
            results.len()
        ),
    }
    std::process::exit(exit_code);
}

// ---------------------------------------------------------------------------
// Unit tests — kept headless-safe (no display/audio device required) so
// `cargo test --manifest-path tests/perf/Cargo.toml` passes on CI too.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_empty_does_not_panic() {
        let s = compute_stat(vec![]);
        assert_eq!(s.mean, 0.0);
        assert_eq!(s.p50, 0.0);
        assert_eq!(s.p99, 0.0);
    }

    #[test]
    fn percentile_sorted_range() {
        let v: Vec<f64> = (1..=100).map(|x| x as f64).collect();
        let s = compute_stat(v);
        assert!((s.p50 - 50.0).abs() < 2.0, "p50={}", s.p50);
        assert!((s.p99 - 99.0).abs() < 2.0, "p99={}", s.p99);
    }

    #[test]
    fn gank_clip_resolves_and_exists_in_this_repo() {
        // src-tauri/voice-pack-default/gank/*.mp3 is committed to the repo
        // (ground-truth map: "gank/ revision/ danger/ (3 each)"), so this
        // must resolve regardless of platform/display/audio device.
        let clip = find_gank_clip().expect("expected a gank/*.mp3 clip to resolve");
        assert!(clip.exists(), "resolved path does not exist: {}", clip.display());
        assert_eq!(
            clip.extension().and_then(|x| x.to_str()),
            Some("mp3"),
            "expected an mp3 clip, got {}",
            clip.display()
        );
    }

    #[test]
    fn hop_result_skip_has_zeroed_stats_and_carries_the_reason() {
        let r = HopResult::skip("Hop X", 12.5, "no device".to_string());
        assert_eq!(r.status, Status::Skip);
        assert_eq!(r.n, 0);
        assert_eq!(r.note, "no device");
        assert_eq!(r.budget_ms, 12.5);
    }

    #[test]
    fn hop_result_measured_passes_within_budget_and_fails_over() {
        let under = HopResult::measured("Hop X", 30.0, vec![5.0; 50], String::new());
        assert_eq!(under.status, Status::Pass);

        let over = HopResult::measured("Hop X", 30.0, vec![50.0; 50], String::new());
        assert_eq!(over.status, Status::Fail);
    }

    #[test]
    fn p99_or_budget_prefers_measurement_over_budget() {
        let measured = HopResult::measured("Hop X", 30.0, vec![10.0; 20], String::new());
        let (v, src) = measured.p99_or_budget();
        assert_eq!(v, measured.p99_ms);
        assert_eq!(src, "measured");

        let skipped = HopResult::skip("Hop X", 30.0, "reason".to_string());
        let (v, src) = skipped.p99_or_budget();
        assert_eq!(v, 30.0);
        assert_eq!(src, "budget, SKIPPED");
    }

    #[test]
    fn combine_exit_fail_dominates_skip_and_pass() {
        let pass = HopResult::measured("A", 30.0, vec![1.0; 10], String::new());
        let fail = HopResult::measured("B", 30.0, vec![100.0; 10], String::new());
        let skip = HopResult::skip("C", 30.0, "no device".to_string());

        assert_eq!(combine_exit(&[&pass, &fail]), 1);
        assert_eq!(combine_exit(&[&fail, &skip]), 1);
        assert_eq!(combine_exit(&[&skip, &skip]), EXIT_SKIP);
        // Partial skip must NOT read as a full pass (matches run_gate_p3.bat).
        assert_eq!(combine_exit(&[&pass, &skip]), EXIT_SKIP);
        assert_eq!(combine_exit(&[&pass, &pass]), 0);
    }

    #[test]
    fn measured_info_is_never_pass_or_fail_regardless_of_samples() {
        // Hop 1a (full-frame, legacy): informational only. Even wildly
        // over what would be a budget elsewhere, `measured_info` must never
        // render a Pass/Fail verdict — that's the whole point of dropping
        // the budget for this series.
        let fast = HopResult::measured_info("Hop 1a", vec![1.0; 20], String::new());
        assert_eq!(fast.status, Status::Info);
        assert!(!fast.has_budget);

        let slow = HopResult::measured_info("Hop 1a", vec![500.0; 20], String::new());
        assert_eq!(slow.status, Status::Info);
        assert!(!slow.has_budget);
        assert_eq!(slow.status.label(), "INFO");
    }

    #[test]
    fn skip_no_budget_has_zeroed_stats_and_no_budget() {
        let r = HopResult::skip_no_budget("Hop 1a", "no frames".to_string());
        assert_eq!(r.status, Status::Skip);
        assert_eq!(r.n, 0);
        assert!(!r.has_budget);
        assert_eq!(r.note, "no frames");
    }

    #[test]
    fn combine_exit_ignores_info_status() {
        // An Info-status hop must never flip the verdict either way — not a
        // FAIL trigger, not a SKIP trigger. (Hop 1a is excluded from the
        // exit-verdict inputs by construction in `main`, but the combinator
        // itself should still be safe if ever handed one.)
        let info = HopResult::measured_info("A", vec![500.0; 10], String::new());
        let pass = HopResult::measured("B", 30.0, vec![1.0; 10], String::new());
        let fail = HopResult::measured("C", 30.0, vec![100.0; 10], String::new());
        let skip = HopResult::skip("D", 30.0, "no device".to_string());

        assert_eq!(combine_exit(&[&info, &pass]), 0);
        assert_eq!(combine_exit(&[&info, &fail]), 1);
        assert_eq!(combine_exit(&[&info, &skip]), EXIT_SKIP);
    }
}
