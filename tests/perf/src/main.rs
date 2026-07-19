//! G-Signal Latency Harness — GATE P3
//!
//! Measures p50/p99 for every hop in the G-Signal critical path.
//! Engineering Spec §1 budget: p50 ≤ 250 ms (target), p99 ≤ 300 ms (hard max).
//! TDD §3 / Definition of Done §7.
//!
//! # Wiring status: REAL (headless mode)
//!
//! This used to spin-wait at the spec budget (± a jitter model) — a gate that
//! PASSED by construction, no matter what the code actually did. It now calls
//! the real `g_maiden` crate functions (the same lib the app + `src-tauri`'s
//! own in-crate tests use — see the lib-split, `src-tauri/Cargo.toml` `[lib]`)
//! for every hop that can run headless:
//!
//!   - **hop 2 vision**   — `cv::prefilter::prefilter_candidates` +
//!     `cv::detector::Detector::{load,detect}` on a synthetic minimap frame
//!     (same pixel pattern as `capture.rs`'s `synthetic_frame`, copied below
//!     because that helper is `#[cfg(test)]`-private to the app crate).
//!   - **hop 3 motion**   — `motion::Motion::{record,assess}`, clock-injected
//!     (`now_ms` advances one tick per iteration; no wall-clock sleep).
//!   - **hop 4 signal**   — `signal::Signal::evaluate` on the assessed risk.
//!     A deterministic missing-heroes schedule (see `missing_for_iteration`,
//!     lifted from `motion.rs`'s own
//!     `two_heroes_missing_crosses_danger_threshold` unit-test fixture) drives
//!     the risk across the danger threshold at a KNOWN iteration
//!     ([`ALERT_ARM_ITER`]) and back below it at another
//!     ([`REVISION_ITER`]), so both the `Alert` and `Revision` branches are
//!     actually executed, not just theoretically reachable.
//!   - **hop 5 interrupt** — audio admission + clip resolution, NOT playback:
//!     `audio::active_priority()` + `audio::priority_for_event("gank")` +
//!     `audio::pick_clip("gank")`. `audio::should_accept_incoming` itself is
//!     `pub(crate)` (visibility is the lib-split task's territory, out of
//!     scope here), so the admission check mirrors its one-line body
//!     (`incoming >= current`, `audio.rs:44`) using the `pub` `Priority` type
//!     — a real comparison over real data, not a stand-in number.
//!   - **hop-gsi** (new, reported alongside, NOT part of the 6-hop gate math
//!     below — the Engineering Spec's per-hop budget table has no slot for
//!     it, and in production it runs on the GSI web-server task, not
//!     serialized into this critical path) — `gsi::parse_tick_from_json` on
//!     three recorded tick fixtures (`tests/perf/fixtures/*.json`, lifted
//!     verbatim from the payloads `src-tauri/src/gsi.rs`'s
//!     `happy_path_in_match` / `parses_buyback_and_respawn_when_dead` tests
//!     and `src-tauri/src/capture.rs`'s
//!     `gsi_to_signal_audio_enqueue_latency_within_budget` test already use).
//!
//! **hop 1 (DXGI capture)** and **hop 6 (audio output buffer)** still can't
//! run headless — they need a live display / audio device. They report as
//! `SKIP` with their Engineering Spec budget shown, not a spun number. See
//! `latency_live` (the live-probes bin, `tests/perf/src/bin/latency_live.rs`)
//! for those two hops with a real display/device attached.
//!
//! # Honest gate
//!
//! The gate no longer asserts against a number this file invented. It sums
//! the MEASURED wall-clock p50/p99 across the four wired hops (2-5) and adds
//! the *budget* (not a measurement) for the two SKIP hops, then checks that
//! total against the Engineering Spec ceiling. If a SKIP hop turns out to
//! blow its budget in real play, `latency_live` — not this file — is what
//! catches it.
//!
//! # Exit codes
//! 0 = GATE P3 PASS   1 = GATE P3 FAIL   77 = SKIP (ONNX model not found —
//! hop 2 is unmeasurable, so no gate verdict would mean anything)
//!
//! # Runtime
//! ITERATIONS (300) of real (sub-millisecond to low-millisecond) work — a few
//! seconds total in `--release`. Debug adds significant `tract-onnx` /
//! optimizer overhead; use `cargo run --release`.

use std::path::{Path, PathBuf};
use std::time::Instant;

use g_maiden::audio::{self, Priority};
use g_maiden::cv::detector::Detector;
use g_maiden::cv::prefilter::{prefilter_candidates, DEFAULT_THRESHOLD_FRAC};
use g_maiden::cv::region::MinimapRegion;
use g_maiden::cv::{Frame, DIRE_RING};
use g_maiden::gsi;
use g_maiden::motion::Motion;
use g_maiden::signal::{Signal, SignalEvent};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Matches the sample size of the in-crate `pipeline_latency_within_budget`
/// test (`src-tauri/src/capture.rs`) that this harness composes from the same
/// public building blocks.
const ITERATIONS: usize = 300;

/// POSIX skip convention (matches `perf_p7`'s `EXIT_SKIP` / automake /
/// cargo-nextest semantics) — not a pass, not a fail, prerequisites missing.
const EXIT_SKIP: i32 = 77;

// ---------------------------------------------------------------------------
// Engineering Spec §1 — per-hop latency budgets (ms)
// ---------------------------------------------------------------------------

const BUDGET_CAPTURE_MS: f64 = 30.0; // Hop 1: DXGI minimap frame ready
const BUDGET_VISION_MS: f64 = 50.0; // Hop 2: CV enemy icon detection
const BUDGET_MOTION_MS: f64 = 20.0; // Hop 3: G-Motion gank probability
const BUDGET_SIGNAL_MS: f64 = 10.0; // Hop 4: G-Signal threshold + clip key
const BUDGET_INTERRUPT_MS: f64 = 30.0; // Hop 5: audio interrupt + playback start
const BUDGET_AUDIO_MS: f64 = 40.0; // Hop 6: audio output buffer

/// Hops 1 and 6 can't run headless; their budget is added to the measured
/// wired total as a flat offset (see the HONEST GATE section of `main`).
const SKIP_BUDGET_MS: f64 = BUDGET_CAPTURE_MS + BUDGET_AUDIO_MS;

// ---------------------------------------------------------------------------
// GATE P3 thresholds (Engineering Spec §1 / Definition of Done §7)
// ---------------------------------------------------------------------------

const P50_GATE_MS: f64 = 250.0;
const P99_GATE_MS: f64 = 300.0;

// ---------------------------------------------------------------------------
// Deterministic missing-heroes schedule — drives G-Signal's Alert AND
// Revision branches at known iterations (real Motion::assess + Signal::
// evaluate calls, not hand-typed SignalEvent values).
//
// The "armed" numbers (2 heroes, each missing 11_000 ms, at (0.4,0.4) and
// (0.6,0.6)) are lifted verbatim from `src-tauri/src/motion.rs`'s own
// `two_heroes_missing_crosses_danger_threshold` unit test, which already
// proves this exact input crosses the danger threshold (probability >= 0.85
// — clears even the strictest Sensitivity::Low bar, so it's independent of
// whichever Sensitivity `Signal::new()`'s default happens to be).
// ---------------------------------------------------------------------------

/// Iteration the two heroes start being reported "missing" — G-Signal's
/// `Alert` branch fires here.
const ALERT_ARM_ITER: usize = 120;
/// Iteration they reappear (missing list goes empty again) — G-Signal's
/// `Revision` branch fires here.
const REVISION_ITER: usize = 280;

fn missing_for_iteration(i: usize) -> Vec<(String, u64, (f32, f32))> {
    if !(ALERT_ARM_ITER..REVISION_ITER).contains(&i) {
        return Vec::new();
    }
    // Elapsed grows slightly each armed iteration (mimics a hero staying gone)
    // — starts at exactly the proven-crossing fixture value.
    let elapsed_ms = 11_000u64 + ((i - ALERT_ARM_ITER) as u64) * 40;
    vec![
        ("npc_dota_hero_axe".to_string(), elapsed_ms, (0.4, 0.4)),
        ("npc_dota_hero_lina".to_string(), elapsed_ms, (0.6, 0.6)),
    ]
}

// ---------------------------------------------------------------------------
// Synthetic minimap frame — copied from `src-tauri/src/capture.rs`
// (`backend::tests::synthetic_frame`, the same helper
// `pipeline_latency_within_budget` uses). That helper is `#[cfg(test)]`-
// private to the app crate, so it can't be imported across the crate
// boundary; this reproduces the exact pixel pattern instead. Keep in sync if
// the spike's blip colour/geometry ever changes.
// ---------------------------------------------------------------------------

fn synthetic_frame(n: usize) -> Frame {
    let (w, h, icon) = (256usize, 256usize, 20usize);
    let mut bgra = vec![0u8; w * h * 4];
    for (i, px) in bgra.chunks_mut(4).enumerate() {
        let (x, _y) = (i % w, i / w);
        px[0] = 18;
        px[1] = 36 + (x % 7) as u8;
        px[2] = 14;
        px[3] = 255;
    }
    for k in 0..n {
        let bx = (k * 37) % (w - icon);
        let by = (k * 53) % (h - icon);
        for yy in by..by + icon {
            for xx in bx..bx + icon {
                let p = (yy * w + xx) * 4;
                bgra[p] = 41;
                bgra[p + 1] = 41;
                bgra[p + 2] = 219;
            }
        }
    }
    Frame::from_bgra(w, h, bgra).unwrap()
}

// ---------------------------------------------------------------------------
// Recorded GSI ticks — embedded at compile time (deterministic regardless of
// the process's runtime cwd; see the model/voice-cache path notes in
// `main()` for why runtime cwd matters for the OTHER hops but not this one).
// Lifted verbatim from `src-tauri/src/gsi.rs` (`happy_path_in_match`,
// `parses_buyback_and_respawn_when_dead`) and `src-tauri/src/capture.rs`
// (`gsi_to_signal_audio_enqueue_latency_within_budget`).
// ---------------------------------------------------------------------------

struct Fixture {
    name: &'static str,
    body: &'static str,
}

const FIXTURES: [Fixture; 3] = [
    Fixture {
        name: "radiant_midgame",
        body: include_str!("../fixtures/tick_radiant_midgame.json"),
    },
    Fixture {
        name: "dire_midgame",
        body: include_str!("../fixtures/tick_dire_midgame.json"),
    },
    Fixture {
        name: "dead_buyback",
        body: include_str!("../fixtures/tick_dead_buyback.json"),
    },
];

// ---------------------------------------------------------------------------
// Path resolution — absolute, independent of the process's runtime cwd.
// ---------------------------------------------------------------------------

/// `models/minimap-detector.onnx` + `models/labels.json` live at the repo
/// root (ground-truth map); `tests/perf` is two levels under it.
fn model_paths() -> (PathBuf, PathBuf) {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    (
        repo_root.join("models").join("minimap-detector.onnx"),
        repo_root.join("models").join("labels.json"),
    )
}

/// `src-tauri/voice-pack-default/` is where `audio::pick_clip`'s dev-mode
/// fallback finds bundled clips when there's no user pack — but that lookup
/// is relative to the process's *working directory*, and it's the app's,
/// not ours. We chdir the harness process there (see `main`) so hop 5
/// measures a real resolved clip, not the fast "not found" path.
fn src_tauri_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("src-tauri")
}

// ---------------------------------------------------------------------------
// Statistics (unchanged from the stub — still the right tool for real data)
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
// Per-iteration sample — one entry per wired hop, plus the wall-clock total
// across hops 2-5 (captures inter-hop gaps too), plus the separate hop-gsi
// diagnostic timing.
// ---------------------------------------------------------------------------

struct Sample {
    vision_ms: f64,
    motion_ms: f64,
    signal_ms: f64,
    interrupt_ms: f64,
    wired_total_ms: f64,
    gsi_ms: f64,
}

// ---------------------------------------------------------------------------
// Report helpers
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

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

fn main() {
    println!("=================================================================");
    println!(" G-Signal Latency Harness   GATE P3");
    println!(" Engineering Spec §1  |  {} iterations", ITERATIONS);
    println!(" WIRING: REAL (headless mode) — hops call the actual g_maiden");
    println!("         crate (gsi/cv/motion/signal/audio), not spin-wait stubs.");
    println!("=================================================================");
    println!();

    // --- hop 2 prerequisite: the ONNX model must exist, or nothing about
    //     the vision hop (and therefore the gate) means anything. ---------
    let (model_path, labels_path) = model_paths();
    if !model_path.exists() || !labels_path.exists() {
        println!("Hop 2  CV detection      SKIP  — model not found:");
        println!("  {}", model_path.display());
        println!("  {}", labels_path.display());
        println!();
        println!("GATE P3 SKIPPED — vision hop unmeasurable, nothing meaningful to gate.");
        std::process::exit(EXIT_SKIP);
    }
    let detector = Detector::load(&model_path, &labels_path);

    // --- chdir so hop 5's audio::pick_clip resolves a REAL clip from the
    //     bundled default pack (src-tauri/voice-pack-default/), instead of
    //     measuring the fast "nothing found" path from an unrelated cwd. ---
    let src_tauri = src_tauri_dir();
    if let Err(e) = std::env::set_current_dir(&src_tauri) {
        eprintln!(
            "[warn] could not chdir to {}: {e} — hop 5 clip resolution may \
             report no clips found (still a real call, just resolved from \
             the wrong base directory)",
            src_tauri.display()
        );
    }

    println!("Collecting {ITERATIONS} samples ...");

    let region = MinimapRegion {
        x: 0,
        y: 0,
        side: 256,
    };
    let icon = 20usize;
    // One reused frame across every iteration — matches
    // `pipeline_latency_within_budget`'s `synthetic_frame(5)` exactly.
    let frame = synthetic_frame(5);

    let mut motion = Motion::new();
    let mut signal = Signal::new();

    let mut samples: Vec<Sample> = Vec::with_capacity(ITERATIONS);
    let mut alert_iter: Option<usize> = None;
    let mut revision_iter: Option<usize> = None;
    let mut clip_found_count: usize = 0;

    for i in 0..ITERATIONS {
        let now_ms = (i as u64) * 100;

        let t_wired_start = Instant::now();

        // Hop 2: vision — prefilter + ONNX classify.
        let t0 = Instant::now();
        let cands = prefilter_candidates(&frame, icon, DEFAULT_THRESHOLD_FRAC, DIRE_RING);
        let dets = detector.detect(&frame, &cands, icon);
        let vision_ms = t0.elapsed().as_secs_f64() * 1000.0;

        // Hop 3: motion — real history ring-buffer + gank-risk assessment.
        let t0 = Instant::now();
        motion.record(&dets, &region, now_ms);
        let missing = missing_for_iteration(i);
        let risk = motion.assess(&missing, now_ms);
        let motion_ms = t0.elapsed().as_secs_f64() * 1000.0;

        // Hop 4: signal — edge-triggered threshold state machine.
        let t0 = Instant::now();
        let event = signal.evaluate(&risk);
        let signal_ms = t0.elapsed().as_secs_f64() * 1000.0;
        match event {
            SignalEvent::Alert(_) => {
                alert_iter.get_or_insert(i);
            }
            SignalEvent::Revision => {
                revision_iter.get_or_insert(i);
            }
            SignalEvent::None => {}
        }

        // Hop 5: interrupt — admission check + clip resolution, NO playback.
        let t0 = Instant::now();
        let current: Priority = audio::active_priority();
        let incoming: Priority = audio::priority_for_event("gank");
        let _accepted = incoming >= current; // mirrors should_accept_incoming (audio.rs:44)
        let clip = audio::pick_clip("gank");
        let interrupt_ms = t0.elapsed().as_secs_f64() * 1000.0;
        if clip.is_some() {
            clip_found_count += 1;
        }

        let wired_total_ms = t_wired_start.elapsed().as_secs_f64() * 1000.0;

        // hop-gsi: separate diagnostic timing, NOT part of wired_total_ms.
        let fx = &FIXTURES[i % FIXTURES.len()];
        let t0 = Instant::now();
        let tick = gsi::parse_tick_from_json(fx.body);
        let gsi_ms = t0.elapsed().as_secs_f64() * 1000.0;
        debug_assert!(!fx.name.is_empty());
        let _ = tick.in_game; // touch the result — this is a real parse, not a no-op

        samples.push(Sample {
            vision_ms,
            motion_ms,
            signal_ms,
            interrupt_ms,
            wired_total_ms,
            gsi_ms,
        });
    }

    println!("Done.\n");

    // Harness self-check: if the deterministic schedule never crossed either
    // threshold, the SCHEDULE is broken, not the app — fail loudly rather
    // than silently print a gate verdict that didn't actually exercise both
    // SignalEvent branches.
    assert!(
        alert_iter.is_some(),
        "harness bug: missing_for_iteration schedule never crossed the \
         Alert threshold — hop 4's Alert branch was not exercised"
    );
    assert!(
        revision_iter.is_some(),
        "harness bug: missing_for_iteration schedule never cleared back \
         below the clear threshold — hop 4's Revision branch was not \
         exercised"
    );

    // ------------------------------------------------------------------
    // Per-hop table
    // ------------------------------------------------------------------
    let vision_stat = compute_stat(samples.iter().map(|s| s.vision_ms).collect());
    let motion_stat = compute_stat(samples.iter().map(|s| s.motion_ms).collect());
    let signal_stat = compute_stat(samples.iter().map(|s| s.signal_ms).collect());
    let interrupt_stat = compute_stat(samples.iter().map(|s| s.interrupt_ms).collect());
    let wired_total_stat = compute_stat(samples.iter().map(|s| s.wired_total_ms).collect());
    let gsi_stat = compute_stat(samples.iter().map(|s| s.gsi_ms).collect());

    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12} {:>10}",
        "Hop", "status", "mean", "p50", "p99", "budget"
    );
    sep(84);
    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12} {:>10}",
        "Hop 1  minimap capture", "SKIP", "--", "--", "--", fmt_budget(BUDGET_CAPTURE_MS)
    );
    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12} {:>10}",
        "Hop 2  CV detection",
        "WIRED",
        fmt_ms(vision_stat.mean),
        fmt_ms(vision_stat.p50),
        fmt_ms(vision_stat.p99),
        fmt_budget(BUDGET_VISION_MS)
    );
    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12} {:>10}",
        "Hop 3  G-Motion prob",
        "WIRED",
        fmt_ms(motion_stat.mean),
        fmt_ms(motion_stat.p50),
        fmt_ms(motion_stat.p99),
        fmt_budget(BUDGET_MOTION_MS)
    );
    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12} {:>10}",
        "Hop 4  G-Signal thresh",
        "WIRED",
        fmt_ms(signal_stat.mean),
        fmt_ms(signal_stat.p50),
        fmt_ms(signal_stat.p99),
        fmt_budget(BUDGET_SIGNAL_MS)
    );
    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12} {:>10}",
        "Hop 5  audio interrupt",
        "WIRED",
        fmt_ms(interrupt_stat.mean),
        fmt_ms(interrupt_stat.p50),
        fmt_ms(interrupt_stat.p99),
        fmt_budget(BUDGET_INTERRUPT_MS)
    );
    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12} {:>10}",
        "Hop 6  audio output buf", "SKIP", "--", "--", "--", fmt_budget(BUDGET_AUDIO_MS)
    );
    sep(84);
    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12} {:>10}",
        "GSI parse (diagnostic)*",
        "WIRED",
        fmt_ms(gsi_stat.mean),
        fmt_ms(gsi_stat.p50),
        fmt_ms(gsi_stat.p99),
        "ref <10ms"
    );
    println!(
        "  * not part of the 6-hop Engineering Spec budget model — reported \
         alongside for visibility, excluded from the gate math below."
    );
    sep(84);
    println!(
        "{:<26} {:<6} {:>12} {:>12} {:>12}",
        "WIRED TOTAL (2-5, wall-clock)",
        "WIRED",
        fmt_ms(wired_total_stat.mean),
        fmt_ms(wired_total_stat.p50),
        fmt_ms(wired_total_stat.p99)
    );
    println!();
    println!(
        "  Alert branch exercised at iteration {} (2 heroes missing >=11000ms; \
         probability crossed the danger threshold)",
        alert_iter.unwrap()
    );
    println!(
        "  Revision branch exercised at iteration {} (heroes reappear; \
         probability dropped back to 0)",
        revision_iter.unwrap()
    );
    println!(
        "  Clip resolution (pick_clip(\"gank\")): found on {clip_found_count}/{ITERATIONS} \
         iterations (cwd: {})",
        std::env::current_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| "?".into())
    );

    // ------------------------------------------------------------------
    // GATE P3 — measured wired total (hops 2-5) + SKIP hop budgets (1, 6)
    // ------------------------------------------------------------------
    println!();
    println!("GATE P3  (Engineering Spec §1 / Definition of Done §7)");
    sep(84);
    println!(
        "  formula: measured(hops 2-5) + Σ SKIP budgets (hop1 {BUDGET_CAPTURE_MS:.0}ms + \
         hop6 {BUDGET_AUDIO_MS:.0}ms = {SKIP_BUDGET_MS:.0}ms) <= gate"
    );

    let p50_with_skip = wired_total_stat.p50 + SKIP_BUDGET_MS;
    let p99_with_skip = wired_total_stat.p99 + SKIP_BUDGET_MS;
    let p50_pass = p50_with_skip <= P50_GATE_MS;
    let p99_pass = p99_with_skip <= P99_GATE_MS;

    println!(
        "  MEASURED  p50  {:.3} + {:.0} = {:.3} ms  <=  {} ms   [{}]",
        wired_total_stat.p50,
        SKIP_BUDGET_MS,
        p50_with_skip,
        P50_GATE_MS as u32,
        if p50_pass { "PASS" } else { "FAIL" }
    );
    println!(
        "  MEASURED  p99  {:.3} + {:.0} = {:.3} ms  <=  {} ms   [{}]",
        wired_total_stat.p99,
        SKIP_BUDGET_MS,
        p99_with_skip,
        P99_GATE_MS as u32,
        if p99_pass { "PASS" } else { "FAIL" }
    );

    println!();
    println!("  WIRING STATUS: REAL (headless mode).");
    println!("    Hop 1  minimap capture   SKIP  (needs live display/audio — run latency_live)");
    println!("    Hop 2  CV detection      WIRED");
    println!("    Hop 3  G-Motion prob     WIRED");
    println!("    Hop 4  G-Signal thresh   WIRED");
    println!("    Hop 5  audio interrupt   WIRED");
    println!("    Hop 6  audio output buf  SKIP  (needs live display/audio — run latency_live)");

    sep(84);

    if !p50_pass || !p99_pass {
        eprintln!("GATE P3 FAILED  --  pipeline exceeds latency budget");
        std::process::exit(1);
    }
    println!("GATE P3 PASSED");
}

// ---------------------------------------------------------------------------
// Unit tests
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
    fn percentile_single_element() {
        let s = compute_stat(vec![42.0]);
        assert_eq!(s.p50, 42.0);
        assert_eq!(s.p99, 42.0);
    }

    #[test]
    fn percentile_sorted_range() {
        // 100 values 1..=100; p50 ≈ 50, p99 ≈ 99
        let v: Vec<f64> = (1..=100).map(|x| x as f64).collect();
        let s = compute_stat(v);
        assert!((s.p50 - 50.0).abs() < 2.0, "p50={}", s.p50);
        assert!((s.p99 - 99.0).abs() < 2.0, "p99={}", s.p99);
    }

    #[test]
    fn spec_budget_within_gate() {
        let total = BUDGET_CAPTURE_MS
            + BUDGET_VISION_MS
            + BUDGET_MOTION_MS
            + BUDGET_SIGNAL_MS
            + BUDGET_INTERRUPT_MS
            + BUDGET_AUDIO_MS;
        assert!(
            total <= P99_GATE_MS,
            "Spec budget ({total} ms) exceeds p99 gate ({P99_GATE_MS} ms)"
        );
        assert!(
            total <= P50_GATE_MS,
            "Spec budget ({total} ms) exceeds p50 gate ({P50_GATE_MS} ms)"
        );
    }

    #[test]
    fn gate_p3_with_spec_nominal_values() {
        // A set of samples exactly at spec nominal must pass both gates.
        let nominal_total: f64 = BUDGET_VISION_MS + BUDGET_MOTION_MS + BUDGET_SIGNAL_MS
            + BUDGET_INTERRUPT_MS
            + SKIP_BUDGET_MS; // 180 ms
        let samples: Vec<f64> = vec![nominal_total; 200];
        let s = compute_stat(samples);
        assert!(s.p50 <= P50_GATE_MS, "nominal p50 {} > gate {}", s.p50, P50_GATE_MS);
        assert!(s.p99 <= P99_GATE_MS, "nominal p99 {} > gate {}", s.p99, P99_GATE_MS);
    }

    #[test]
    fn gate_p3_fails_correctly_on_over_budget_samples() {
        // If all samples are 350 ms, gate must reject both thresholds.
        let samples: Vec<f64> = vec![350.0; 200];
        let s = compute_stat(samples);
        assert!(s.p50 > P50_GATE_MS, "over-budget p50 should fail gate");
        assert!(s.p99 > P99_GATE_MS, "over-budget p99 should fail gate");
    }

    #[test]
    fn missing_schedule_arms_and_clears_at_known_iterations() {
        // Before ALERT_ARM_ITER: nothing missing yet.
        assert!(missing_for_iteration(ALERT_ARM_ITER - 1).is_empty());

        // At ALERT_ARM_ITER: the proven-crossing fixture (two heroes, each
        // missing 11_000 ms) — real Motion::assess call, not a hand-typed risk.
        let armed = missing_for_iteration(ALERT_ARM_ITER);
        assert_eq!(armed.len(), 2);
        let m = Motion::new();
        let risk = m.assess(&armed, (ALERT_ARM_ITER as u64) * 100);
        assert!(
            risk.probability >= 0.85,
            "expected a clear danger-threshold crossing, got {}",
            risk.probability
        );

        // At REVISION_ITER: heroes reappear, missing list empties out again.
        assert!(missing_for_iteration(REVISION_ITER).is_empty());
        let cleared = m.assess(&[], (REVISION_ITER as u64) * 100);
        assert_eq!(cleared.probability, 0.0);
    }

    #[test]
    fn gsi_fixtures_round_trip_via_parse_tick_from_json() {
        let radiant = gsi::parse_tick_from_json(FIXTURES[0].body);
        assert!(radiant.in_game);
        assert_eq!(radiant.team_name, "radiant");
        assert_eq!(radiant.hero, "npc_dota_hero_crystal_maiden");

        let dire = gsi::parse_tick_from_json(FIXTURES[1].body);
        assert!(dire.in_game);
        assert_eq!(dire.team_name, "dire");

        let dead = gsi::parse_tick_from_json(FIXTURES[2].body);
        assert!(!dead.alive);
        assert_eq!(dead.buyback_cost, 1500);
        assert_eq!(dead.respawn_seconds, 30);
    }

    #[test]
    fn audio_priority_ordering_supports_the_hop5_admission_mirror() {
        // `audio::should_accept_incoming` is `pub(crate)` (visibility is the
        // lib-split task's territory), so hop 5 mirrors its one-line body
        // (`incoming >= current`, audio.rs:44) directly via the `pub`
        // `Priority` type's `Ord` impl. Pin that relationship here so a
        // future reordering of the enum can't silently break the mirror.
        assert!(Priority::Critical >= Priority::Cosmetic);
        assert!(Priority::Critical >= Priority::Normal);
        assert!(Priority::Cosmetic < Priority::Critical);
    }

    #[test]
    fn model_paths_resolve_and_exist_in_this_repo() {
        // models/*.onnx + labels.json are committed to the repo (not
        // gitignored) — if this ever fails, the model went missing, which
        // is exactly the condition `main()` treats as EXIT_SKIP (77).
        let (model, labels) = model_paths();
        assert!(model.ends_with("models/minimap-detector.onnx") || model.ends_with("models\\minimap-detector.onnx"));
        assert!(model.exists(), "expected {} to exist", model.display());
        assert!(labels.exists(), "expected {} to exist", labels.display());
    }
}
