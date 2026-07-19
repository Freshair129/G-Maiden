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
//!     `acquire_frame()` calls, timing only the calls that return a frame.
//!     `DxgiCapture::new`/`acquire_frame` take no Tauri handle and no lock,
//!     so the public surface really is usable standalone (see `dxgi.rs`
//!     doc comment: "not `Send`/`Sync`... holds no locks").
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
//!   - Hop 1: `DxgiCapture::new(0)` returning `Err` (no GPU/output — e.g. a
//!     display-less RDP session), OR zero frames arriving within the
//!     wall-clock budget (desktop is fully idle / duplication unavailable).
//!   - Hop 6: `OutputStream::try_default()` returning `Err` (no audio
//!     device), the bundled clip missing, or every play timing out waiting
//!     for a first sample pull (device stalled).
//!
//! Both probes always run — one failing to detect its device does not skip
//! the other (see `main`).
//!
//! # Exit codes (worst-probe-wins, matches `latency_harness`/`perf_p7`)
//!   0  = every probe that RAN is within its Engineering Spec §1 hop budget
//!   1  = at least one probe that ran exceeded its budget (FAIL dominates)
//!   77 = both probes SKIPped (no display AND no audio device found)
//!
//! # Usage
//!   cargo run --release --manifest-path tests/perf/Cargo.toml --bin latency_live

use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use rodio::{Decoder, OutputStream, Sink, Source};

use g_maiden::dxgi::DxgiCapture;

// ---------------------------------------------------------------------------
// Engineering Spec §1 — the two budgets this binary can actually measure.
// Names match `latency_harness`'s `BUDGET_CAPTURE_MS`/`BUDGET_AUDIO_MS`.
// ---------------------------------------------------------------------------

const BUDGET_CAPTURE_MS: f64 = 30.0; // Hop 1: DXGI minimap frame ready
const BUDGET_AUDIO_MS: f64 = 40.0; // Hop 6: audio output buffer

/// POSIX skip convention — matches `latency_harness`/`perf_p7`/`perf_cpu_tree`.
const EXIT_SKIP: i32 = 77;

// ---------------------------------------------------------------------------
// Hop 1 probe parameters
// ---------------------------------------------------------------------------

/// How many successful frame acquisitions we'd like before stopping.
const CAPTURE_TARGET_SAMPLES: usize = 100;
/// Wall-clock ceiling for the whole hop-1 probe — a fully idle desktop (no
/// window repainting) may never present a new frame; give up rather than
/// hang forever, and report whatever we did collect (or SKIP on zero).
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
}

impl Status {
    fn label(self) -> &'static str {
        match self {
            Status::Pass => "PASS",
            Status::Fail => "FAIL",
            Status::Skip => "SKIP",
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
            note,
        }
    }

    /// p99 to feed into the full-E2E estimate line — the real measurement
    /// when we have one, else the Engineering Spec budget (clearly labeled
    /// as such), exactly like `latency_harness`'s `SKIP_BUDGET_MS` treats
    /// its own two un-wirable hops.
    fn p99_or_budget(&self) -> (f64, &'static str) {
        if self.status == Status::Skip {
            (self.budget_ms, "budget, SKIPPED")
        } else {
            (self.p99_ms, "measured")
        }
    }
}

// ---------------------------------------------------------------------------
// Hop 1 — DXGI capture probe
// ---------------------------------------------------------------------------

fn probe_capture() -> HopResult {
    let label = "Hop 1  DXGI capture";

    let mut cap = match DxgiCapture::new(0) {
        Ok(c) => c,
        Err(e) => {
            return HopResult::skip(
                label,
                BUDGET_CAPTURE_MS,
                format!("DxgiCapture::new(0) failed — no display/GPU output: {e}"),
            );
        }
    };

    let mut samples: Vec<f64> = Vec::with_capacity(CAPTURE_TARGET_SAMPLES);
    let mut attempts: u64 = 0;
    let wall_start = Instant::now();

    // No manual sleep between calls: `acquire_frame` already blocks inside
    // DXGI's `AcquireNextFrame` (up to 100ms, a kernel wait, not a spin) when
    // no new frame has presented, so this loop can't busy-spin the CPU.
    while samples.len() < CAPTURE_TARGET_SAMPLES && wall_start.elapsed() < CAPTURE_MAX_WALL {
        attempts += 1;
        let t0 = Instant::now();
        if let Some((_buf, _w, _h)) = cap.acquire_frame() {
            samples.push(t0.elapsed().as_secs_f64() * 1000.0);
        }
    }

    if samples.is_empty() {
        return HopResult::skip(
            label,
            BUDGET_CAPTURE_MS,
            format!(
                "no frames captured in {:?} ({attempts} acquire_frame calls) — desktop fully \
                 idle, or Desktop Duplication unavailable on this session (RDP / exclusive-\
                 fullscreen owner)",
                CAPTURE_MAX_WALL
            ),
        );
    }

    let note = if samples.len() < CAPTURE_TARGET_SAMPLES {
        format!(
            "only {}/{} frames captured within {:?} wall-clock ({attempts} attempts) — desktop \
             activity was sparse; numbers below are still real measurements, just fewer of them",
            samples.len(),
            CAPTURE_TARGET_SAMPLES,
            CAPTURE_MAX_WALL
        )
    } else {
        format!("{attempts} acquire_frame calls to collect {CAPTURE_TARGET_SAMPLES} frames")
    };

    HopResult::measured(label, BUDGET_CAPTURE_MS, samples, note)
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
// Report helpers — column layout matches `latency_harness`'s table exactly
// (Hop / status / mean / p50 / p99 / budget) so the two binaries' output
// reads as one system.
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
        "{:<26} {:<6} {:>5} {:>12} {:>12} {:>12} {:>10}",
        label, status, n, mean, p50, p99, budget
    );
}

fn print_hop_row(r: &HopResult) {
    if r.status == Status::Skip {
        print_row(r.label, r.status.label(), "--", "--", "--", "--", &fmt_budget(r.budget_ms));
    } else {
        print_row(
            r.label,
            r.status.label(),
            &r.n.to_string(),
            &fmt_ms(r.mean_ms),
            &fmt_ms(r.p50_ms),
            &fmt_ms(r.p99_ms),
            &fmt_budget(r.budget_ms),
        );
    }
}

/// Combine two probe verdicts: FAIL dominates (any budget blown is a real
/// problem), else SKIP only if BOTH probes skipped (no device at all found),
/// else PASS (at least one probe ran and stayed within budget).
fn combine_exit(results: &[&HopResult]) -> i32 {
    if results.iter().any(|r| r.status == Status::Fail) {
        1
    } else if results.iter().all(|r| r.status == Status::Skip) {
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
    println!(" WIRING: LIVE — real g_maiden::dxgi::DxgiCapture acquire_frame()");
    println!("         calls and a real rodio OutputStream + Sink, not");
    println!("         headless stand-ins.");
    println!("=================================================================");
    println!();

    println!(
        "Hop 1  probing primary output (monitor 0): target {CAPTURE_TARGET_SAMPLES} frames, \
         <= {:?} wall-clock ..."
    , CAPTURE_MAX_WALL);
    let capture = probe_capture();
    println!("  [{}] {}", capture.status.label(), capture.note);
    println!();

    println!("Hop 6  probing default audio output device: {AUDIO_PLAYS} plays ...");
    let audio = probe_audio();
    println!("  [{}] {}", audio.status.label(), audio.note);
    println!();

    println!(
        "{:<26} {:<6} {:>5} {:>12} {:>12} {:>12} {:>10}",
        "Hop", "status", "n", "mean", "p50", "p99", "budget"
    );
    sep(90);
    print_hop_row(&capture);
    print_hop_row(&audio);
    sep(90);
    println!();

    println!("WIRING STATUS: LIVE.");
    println!(
        "    {:<24} {}  (needs a real display/GPU output)",
        capture.label,
        capture.status.label()
    );
    println!(
        "    {:<24} {}  (needs a real audio output device)",
        audio.label,
        audio.status.label()
    );
    println!();

    // ------------------------------------------------------------------
    // full-E2E estimate = headless wired p99 (run latency_harness) + these
    // two measured hops
    // ------------------------------------------------------------------
    let (cap_p99, cap_src) = capture.p99_or_budget();
    let (aud_p99, aud_src) = audio.p99_or_budget();
    println!(
        "full-E2E estimate = headless wired p99 (run latency_harness) + these two measured hops"
    );
    println!(
        "  hop1 p99 = {:.3}ms ({cap_src})  +  hop6 p99 = {:.3}ms ({aud_src})  =  {:.3}ms",
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
    let results = [&capture, &audio];
    let exit_code = combine_exit(&results);
    match exit_code {
        0 => println!("LATENCY_LIVE PASSED"),
        1 => eprintln!("LATENCY_LIVE FAILED -- a live-probed hop exceeded its Engineering Spec budget"),
        _ => println!("LATENCY_LIVE SKIPPED -- neither probe found its device (no display, no audio)"),
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
        assert_eq!(combine_exit(&[&pass, &skip]), 0);
        assert_eq!(combine_exit(&[&pass, &pass]), 0);
    }
}
