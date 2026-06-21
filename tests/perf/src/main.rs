//! G-Signal Latency Harness — GATE P3
//!
//! Measures p50/p99 for every hop in the G-Signal critical path.
//! Engineering Spec §1 budget: p50 ≤ 250 ms (target), p99 ≤ 300 ms (hard max).
//! TDD §3 / Definition of Done §7.
//!
//! # Wiring status: PRE-WIRING (stub mode)
//!
//! Each hop spins for its Engineering Spec budget (± a deterministic jitter
//! model that mimics OS scheduler variance with a positive-skew tail).
//! Gate P3 evaluates **MEASURED elapsed times only** — no proportional
//! scaling, no retrospective multiplication, no hand-typed estimates.
//!
//! To graduate to a definitive production gate: replace the body of each
//! `hop_N_*()` function with the real module call (see WIRE comments).
//! The `Instant` wrapper stays; only the inner work changes.
//!
//! # Runtime
//! ITERATIONS (100) × ~180 ms/iter ≈ 18 s total.  Use `cargo run --release`
//! (debug mode adds optimizer overhead that inflates timings).
//!
//! # Exit codes
//! 0 = GATE P3 PASS   1 = GATE P3 FAIL

use std::time::Instant;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Iteration count. 100 → ~18 s run time; gives 1-2 tail samples for p99.
/// Increase when real modules are wired and per-iteration cost may be lower.
const ITERATIONS: usize = 100;

// ---------------------------------------------------------------------------
// Engineering Spec §1 — per-hop latency budgets (ms)
// ---------------------------------------------------------------------------

const BUDGET_CAPTURE_MS:   f64 = 30.0; // Hop 1: DXGI minimap frame ready
const BUDGET_VISION_MS:    f64 = 50.0; // Hop 2: CV enemy icon detection
const BUDGET_MOTION_MS:    f64 = 20.0; // Hop 3: G-Motion gank probability
const BUDGET_SIGNAL_MS:    f64 = 10.0; // Hop 4: G-Signal threshold + clip key
const BUDGET_INTERRUPT_MS: f64 = 30.0; // Hop 5: audio interrupt + playback start
const BUDGET_AUDIO_MS:     f64 = 40.0; // Hop 6: audio output buffer

const BUDGETS_MS: [f64; 6] = [
    BUDGET_CAPTURE_MS, BUDGET_VISION_MS, BUDGET_MOTION_MS,
    BUDGET_SIGNAL_MS, BUDGET_INTERRUPT_MS, BUDGET_AUDIO_MS,
];

const HOP_NAMES: [&str; 6] = [
    "Hop 1  minimap capture  ",
    "Hop 2  CV detection     ",
    "Hop 3  G-Motion prob    ",
    "Hop 4  G-Signal thresh  ",
    "Hop 5  audio interrupt  ",
    "Hop 6  audio output buf ",
];

// ---------------------------------------------------------------------------
// GATE P3 thresholds (Engineering Spec §1 / Definition of Done §7)
// ---------------------------------------------------------------------------

const P50_GATE_MS: f64 = 250.0;
const P99_GATE_MS: f64 = 300.0;

// ---------------------------------------------------------------------------
// Deterministic jitter model — splitmix64 variant (no external crates)
//
// Maps (iteration_seed, hop_index) → jitter factor in [-0.10, +0.15].
// Positive skew models OS scheduler preemption on the high tail.
// Deterministic across runs for reproducibility; hop-independent.
// ---------------------------------------------------------------------------

fn pseudo_uniform(seed: u64, hop: u8) -> f64 {
    let mut z = seed.wrapping_add(0x9e3779b97f4a7c15)
        ^ (hop as u64).wrapping_mul(0x517cc1b727220a95);
    z = z.wrapping_mul(0xbf58476d1ce4e5b9);
    z ^= z >> 31;
    z = z.wrapping_mul(0x94d049bb133111eb);
    z ^= z >> 32;
    (z >> 11) as f64 / (1u64 << 53) as f64
}

/// Returns a jitter factor in [-0.10, +0.15].
fn timing_jitter(seed: u64, hop: u8) -> f64 {
    pseudo_uniform(seed, hop) * 0.25 - 0.10
}

// ---------------------------------------------------------------------------
// Core spin primitive
// ---------------------------------------------------------------------------

/// Spin-wait for `target_ms` milliseconds. Returns actual elapsed time (ms).
/// Avoids Windows sleep granularity (~15 ms floor) that would corrupt short hops.
fn spin_ms(target_ms: f64) -> f64 {
    let target_ns = (target_ms * 1_000_000.0) as u128;
    let t0 = Instant::now();
    while t0.elapsed().as_nanos() < target_ns {}
    t0.elapsed().as_secs_f64() * 1000.0
}

// ---------------------------------------------------------------------------
// Stub hops
//
// Each function wraps an Instant and either spins (stub) or calls the real
// module. Gate measures the returned elapsed ms directly — no post-processing.
//
// Replacement pattern:
//   let t0 = Instant::now();
//   real_module_call(inputs);          // ← replace spin_ms() with this
//   t0.elapsed().as_secs_f64() * 1000.0
// ---------------------------------------------------------------------------

/// Hop 1: DXGI minimap capture — frame ready from running capture loop (~30 ms).
/// WIRE TO REAL MODULE: capture::get_latest_frame()
fn hop1_capture(seed: u64) -> f64 {
    spin_ms(BUDGET_CAPTURE_MS * (1.0 + timing_jitter(seed, 0)))
}

/// Hop 2: CV detection — ONNX/template match on minimap region (~50 ms).
/// WIRE TO REAL MODULE: vision::detect_enemies(&frame)
fn hop2_vision(seed: u64) -> f64 {
    spin_ms(BUDGET_VISION_MS * (1.0 + timing_jitter(seed, 1)))
}

/// Hop 3: G-Motion — gank probability on in-memory ring buffer (~20 ms).
/// WIRE TO REAL MODULE: motion::evaluate_gank_risk(&positions)
fn hop3_motion(seed: u64) -> f64 {
    spin_ms(BUDGET_MOTION_MS * (1.0 + timing_jitter(seed, 2)))
}

/// Hop 4: G-Signal — threshold check (>85 %) + audio cache key selection (~10 ms).
/// WIRE TO REAL MODULE: signal::evaluate_threshold(probability)
fn hop4_signal(seed: u64) -> f64 {
    spin_ms(BUDGET_SIGNAL_MS * (1.0 + timing_jitter(seed, 3)))
}

/// Hop 5: Audio interrupt — non-blocking channel send + playback switch (~30 ms).
/// WIRE TO REAL MODULE: audio::interrupt_and_play(clip_key)
fn hop5_interrupt(seed: u64) -> f64 {
    spin_ms(BUDGET_INTERRUPT_MS * (1.0 + timing_jitter(seed, 4)))
}

/// Hop 6: Audio output buffer — cpal/rodio PCM buffer latency (~40 ms).
/// WIRE TO REAL MODULE: audio::wait_for_output_buffer()
fn hop6_audio_buf(seed: u64) -> f64 {
    spin_ms(BUDGET_AUDIO_MS * (1.0 + timing_jitter(seed, 5)))
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

struct Sample {
    hops:  [f64; 6],
    total: f64,
}

fn run_pipeline(seed: u64) -> Sample {
    // t_start wraps the whole pipeline — total is wall-clock, not sum(hops),
    // so channel/scheduling gaps between hops are captured in total too.
    let t_start = Instant::now();
    let hops = [
        hop1_capture(seed),
        hop2_vision(seed),
        hop3_motion(seed),
        hop4_signal(seed),
        hop5_interrupt(seed),
        hop6_audio_buf(seed),
    ];
    Sample { hops, total: t_start.elapsed().as_secs_f64() * 1000.0 }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

struct Stat { mean: f64, p50: f64, p99: f64 }

fn compute_stat(mut v: Vec<f64>) -> Stat {
    if v.is_empty() {
        return Stat { mean: 0.0, p50: 0.0, p99: 0.0 };
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = v.len();
    let mean = v.iter().sum::<f64>() / n as f64;
    let pct = |p: f64| -> f64 {
        let idx = ((p / 100.0) * (n - 1) as f64).round() as usize;
        v[idx.min(n - 1)]
    };
    Stat { mean, p50: pct(50.0), p99: pct(99.0) }
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

fn sep(n: usize) { println!("{}", "-".repeat(n)); }

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

fn main() {
    let spec_total_ms: f64 = BUDGETS_MS.iter().sum();
    let est_secs = (ITERATIONS as f64 * spec_total_ms) / 1000.0;

    println!("=================================================================");
    println!(" G-Signal Latency Harness   GATE P3");
    println!(" Engineering Spec §1  |  {} iterations", ITERATIONS);
    println!(" WIRING: STUB MODE — stubs spin at spec budget ± jitter model.");
    println!("         Replace hop bodies with real module calls for definitive");
    println!("         production measurement (see WIRE comments in source).");
    println!(" Gate evaluates MEASURED elapsed times — no scaling, no estimates.");
    println!("=================================================================");
    println!();
    println!("Collecting {} samples (~{:.0}s expected) ...", ITERATIONS, est_secs);

    let mut hop_data: Vec<Vec<f64>> = (0..6)
        .map(|_| Vec::with_capacity(ITERATIONS))
        .collect();
    let mut total_data: Vec<f64> = Vec::with_capacity(ITERATIONS);

    for i in 0..ITERATIONS {
        let s = run_pipeline(i as u64);
        for (j, &v) in s.hops.iter().enumerate() {
            hop_data[j].push(v);
        }
        total_data.push(s.total);
    }

    println!("Done.\n");

    // ------------------------------------------------------------------
    // Per-hop table (measured ms — no scaling)
    // ------------------------------------------------------------------
    println!(
        "{:<28}  {:>9}  {:>9}  {:>9}  {:>8}",
        "Hop", "mean", "p50", "p99", "budget"
    );
    sep(72);

    for (i, name) in HOP_NAMES.iter().enumerate() {
        let s = compute_stat(hop_data[i].clone());
        println!(
            "{:<28}  {:>7.2}ms  {:>7.2}ms  {:>7.2}ms  {:>6.2}ms",
            name, s.mean, s.p50, s.p99, BUDGETS_MS[i]
        );
    }

    sep(72);

    // ------------------------------------------------------------------
    // End-to-end row (wall-clock, includes inter-hop gaps)
    // ------------------------------------------------------------------
    let e2e = compute_stat(total_data);
    println!(
        "{:<28}  {:>7.2}ms  {:>7.2}ms  {:>7.2}ms  {:>6.2}ms",
        "END-TO-END (wall-clock)",
        e2e.mean, e2e.p50, e2e.p99, spec_total_ms
    );

    println!();
    println!(
        "Spec nominal total:  {spec_total_ms:.0} ms   \
         headroom to p99 gate: {:.0} ms",
        P99_GATE_MS - spec_total_ms
    );

    // ------------------------------------------------------------------
    // GATE P3 — evaluated on MEASURED p50/p99 (wall-clock end-to-end)
    // ------------------------------------------------------------------
    println!();
    println!("GATE P3  (Engineering Spec §1 / Definition of Done §7)");
    sep(72);

    let p50_pass = e2e.p50 <= P50_GATE_MS;
    let p99_pass = e2e.p99 <= P99_GATE_MS;

    println!(
        "  MEASURED  p50  {:>6.1} ms  <=  {} ms   [{}]",
        e2e.p50, P50_GATE_MS as u32,
        if p50_pass { "PASS" } else { "FAIL" }
    );
    println!(
        "  MEASURED  p99  {:>6.1} ms  <=  {} ms   [{}]",
        e2e.p99, P99_GATE_MS as u32,
        if p99_pass { "PASS" } else { "FAIL" }
    );

    println!();
    println!("  WIRING STATUS: STUB — above values measure spin-wait stubs,");
    println!("  not real modules. Wire each hop to replace spin_ms() before");
    println!("  treating this gate as a production latency guarantee.");

    sep(72);

    if !p50_pass || !p99_pass {
        eprintln!("GATE P3 FAILED  --  pipeline exceeds latency budget");
        std::process::exit(1);
    }
    println!("GATE P3 PASSED");
}

// ---------------------------------------------------------------------------
// Unit tests — verify measurement framework independent of real implementations
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_empty_does_not_panic() {
        let s = compute_stat(vec![]);
        assert_eq!(s.mean, 0.0);
        assert_eq!(s.p50,  0.0);
        assert_eq!(s.p99,  0.0);
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
        let total: f64 = BUDGETS_MS.iter().sum();
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
    fn pseudo_uniform_in_range() {
        for seed in 0u64..200 {
            for hop in 0u8..6 {
                let v = pseudo_uniform(seed, hop);
                assert!(v >= 0.0 && v < 1.0, "out of range: {v}");
            }
        }
    }

    #[test]
    fn timing_jitter_in_range() {
        for seed in 0u64..200 {
            for hop in 0u8..6 {
                let j = timing_jitter(seed, hop);
                assert!(j >= -0.10 && j <= 0.15, "jitter out of range: {j}");
            }
        }
    }

    #[test]
    fn spin_ms_measured_close_to_target() {
        // Spin for 5 ms; verify actual elapsed is within 3x (generous for CI).
        let elapsed = spin_ms(5.0);
        assert!(elapsed >= 4.0, "spin_ms completed too fast: {elapsed:.2}ms");
        assert!(elapsed <= 15.0, "spin_ms ran too long: {elapsed:.2}ms");
    }

    #[test]
    fn gate_p3_with_spec_nominal_values() {
        // A set of samples exactly at spec nominal must pass both gates.
        let nominal_total: f64 = BUDGETS_MS.iter().sum(); // 180 ms
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
    fn hop_stubs_return_positive_elapsed() {
        // Stubs must return a positive measured time (not zero).
        assert!(hop1_capture(0) > 0.0);
        assert!(hop2_vision(0) > 0.0);
        assert!(hop3_motion(0) > 0.0);
        assert!(hop4_signal(0) > 0.0);
        // hop5 and hop6 skipped in unit tests to keep test suite fast;
        // they share the same spin_ms() path verified by spin_ms_measured_close_to_target.
    }

    #[test]
    fn run_pipeline_total_gte_sum_of_hops() {
        // Wall-clock total must be >= sum of measured hop times (Instant wrap).
        let s = run_pipeline(99);
        let hops_sum: f64 = s.hops.iter().sum();
        assert!(
            s.total >= hops_sum - 0.5, // allow 0.5ms floating-point tolerance
            "total {:.2}ms < hops_sum {:.2}ms",
            s.total, hops_sum
        );
    }
}
