//! replay_fit — offline G-Log replay/fit harness (G-Log #7 closes the loop).
//!
//! **Read-only, zero network.** Reads archived match logs from disk
//! (`%LOCALAPPDATA%\G-Maiden\logs\match-*.jsonl` by default, or a directory
//! passed on the command line), replays each match's missing-hero timeline
//! through the REAL `g_maiden::motion::Motion` / `g_maiden::signal::Signal`
//! machinery for a grid of parameter choices, and scores each choice against
//! the match's own death timestamps. Nothing is written back to the logs and
//! nothing leaves the machine — this only reads what `log.rs` already wrote
//! locally (see CLAUDE.md privacy-first: G-Log raw data is local-only).
//!
//! ## Why this exists
//!
//! `motion.rs`'s gank-risk heuristic and `signal.rs`'s alert thresholds are
//! unmeasured magic numbers today (see `MotionParams::default()` doc comments
//! and `Sensitivity::thresholds()`). `capture.rs` now records a `risk_trace`
//! sample of the exact model inputs G-Motion saw each tick (throttled ~1 Hz),
//! and `log.rs::note_tick` already recorded death events via rising
//! `tick.deaths`. This binary is the offline consumer that joins the two: for
//! each candidate `(MotionParams, Sensitivity)` pair, replay the recorded
//! missing-hero timeline and see how many synthetic alerts would have
//! preceded a real death, vs. how many were "wasted".
//!
//! ## Two reconstruction modes
//!
//! - **FULL** — logs written after `risk_trace` shipped carry the missing-set
//!   directly (hero, `missing_for_ms`, `last_pos` at the moment G-Motion was
//!   asked to assess). This is the *measured* input — replay is exact.
//! - **APPROX** — older logs have no `risk_trace`, only edge-triggered
//!   `enemy_missing` events (fired once when G-Sentry confirms a hero has
//!   been gone >5s — `capture.rs:585-600`, `sentry.rs` MISSING_THRESHOLD_MS).
//!   We don't know when the hero actually reappeared, so `missing_for_ms` is
//!   extrapolated **linearly** forward from the event's own value, capped at
//!   [`APPROX_CAP_MS`] (30s) — a bounded, honest guess, never a measurement.
//!   Every output row is labeled `FULL` or `APPROX` so approximated numbers
//!   are never mistaken for measured ones.
//!
//! ## Replay mechanics
//!
//! Per match, per candidate params: a fresh `Motion::with_params(params)` is
//! built (no `record()` calls — this harness has no CV detection positions to
//! feed it, so `heading_multiplier` stays neutral 1.0 for every point, same
//! as the documented "no trail" fallback in `motion.rs`), and `.assess()` is
//! called with the reconstructed missing set at each timeline point — this is
//! the REAL parameterized combination formula (`p_safe *= 1.0 - r`,
//! `motion.rs:162`, with the `multi_boost` coordinated-gank scaling,
//! `motion.rs:168-170`), not a reimplementation. A fresh `Signal::new()` with
//! the candidate `Sensitivity` then applies the exact hysteresis state
//! machine from `signal.rs::evaluate` (alert at `danger`, re-arm below
//! `clear` — `signal.rs:102-116`) to the resulting risk series, producing
//! edge-triggered synthetic alerts.
//!
//! Because `risk_trace`/reconstructed points only exist while something is
//! actually missing (`log.rs::should_record_risk_trace`), a large gap between
//! two consecutive timeline points almost certainly means every missing hero
//! reappeared in between — which in the live pipeline would have driven
//! probability to 0 and fired `SignalEvent::Revision` if a warning was still
//! latched. [`GAP_RESET_MS`] approximates that: crossing a gap that large
//! injects one synthetic all-clear tick before continuing, so a stale
//! `alerted` latch from one missing episode can't suppress or bias detection
//! of the next.
//!
//! ## Scoring
//!
//! For each `(MotionParams, Sensitivity)` candidate, aggregated **per mode**
//! across every match in that mode:
//! - **precision** = alerts followed by a death within `--window-ms` (default
//!   [`DEFAULT_WINDOW_MS`], mirroring `log.rs::EFFICACY_WINDOW_MS`) / total
//!   alerts
//! - **recall** = deaths preceded by an alert within the window / total
//!   deaths
//! - **F1** = harmonic mean of the two
//!
//! Output: one ranked top-10 table per mode (by F1, richest signal first),
//! plus the row matching today's shipped defaults
//! (`MotionParams::default()` + `Sensitivity::Med`) always shown explicitly
//! for comparison, even when it isn't in the top 10.

use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use g_maiden::motion::{GankRisk, Motion, MotionParams};
use g_maiden::signal::{Sensitivity, Signal, SignalEvent};

/// Mirrors `log.rs::EFFICACY_WINDOW_MS` — the window after an alert within
/// which a death still counts as that alert's outcome.
const DEFAULT_WINDOW_MS: u64 = 8000;

/// APPROX-mode horizon: how far a legacy `enemy_missing` event's
/// `missing_for_ms` is extrapolated forward before we give up and assume the
/// hero reappeared. See module doc.
const APPROX_CAP_MS: u64 = 30_000;

/// A gap this large between two consecutive timeline points is treated as an
/// implicit all-clear (every missing hero reappeared) — see module doc.
const GAP_RESET_MS: u64 = 5_000;

const PEAK_S_GRID: [f32; 4] = [8.0, 10.0, 12.0, 15.0];
const PEAK_RISK_GRID: [f32; 3] = [0.6, 0.7, 0.8];
const MULTI_BOOST_GRID: [f32; 3] = [1.0, 1.15, 1.3];
const SENSITIVITY_GRID: [Sensitivity; 3] = [Sensitivity::Low, Sensitivity::Med, Sensitivity::High];

const TOP_N: usize = 10;

// ─────────────────────────────── data model ───────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    Full,
    Approx,
}

impl Mode {
    fn label(self) -> &'static str {
        match self {
            Mode::Full => "FULL",
            Mode::Approx => "APPROX",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
struct MissingEntry {
    hero: String,
    missing_for_ms: u64,
    last_pos: (f32, f32),
}

/// Sparse "missing heroes at ts" series, sorted ascending by `ts`.
type Timeline = Vec<(u64, Vec<MissingEntry>)>;
/// One `enemy_missing` event, reduced to what APPROX reconstruction needs:
/// `(ts, hero, missing_for_ms, last_pos)`.
type MissingEvent = (u64, String, u64, (f32, f32));

/// One reconstructed match: death timestamps + a sparse timeline of
/// "missing heroes at ts", already sorted by `ts`.
struct MatchData {
    file: String,
    mode: Mode,
    deaths: Vec<u64>,
    timeline: Timeline,
}

// ─────────────────────────────── JSONL parsing ───────────────────────────────

fn parse_pos(v: Option<&serde_json::Value>) -> (f32, f32) {
    match v.and_then(|p| p.as_array()) {
        Some(arr) if arr.len() == 2 => (
            arr[0].as_f64().unwrap_or(0.0) as f32,
            arr[1].as_f64().unwrap_or(0.0) as f32,
        ),
        _ => (0.0, 0.0),
    }
}

fn parse_missing_array(v: Option<&serde_json::Value>) -> Vec<MissingEntry> {
    v.and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let hero = item.get("hero")?.as_str()?.to_string();
                    let missing_for_ms = item.get("missing_for_ms")?.as_u64()?;
                    let last_pos = parse_pos(item.get("last_pos"));
                    Some(MissingEntry {
                        hero,
                        missing_for_ms,
                        last_pos,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Parse one match log's raw JSONL text (line shapes documented in
/// `log.rs`'s `*_record` helpers) into a death list + reconstructed missing
/// timeline. Tolerant of malformed/unknown/torn lines, matching the existing
/// posture in `log.rs::parse_efficacy_records` / `parse_timeline`.
fn parse_match(content: &str) -> (Mode, Vec<u64>, Timeline) {
    let mut deaths = Vec::new();
    let mut prev_deaths: Option<i64> = None;
    let mut tick_ts: Vec<u64> = Vec::new();
    let mut risk_points: Timeline = Vec::new();
    let mut missing_events: Vec<MissingEvent> = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let ts = v.get("ts").and_then(|t| t.as_u64()).unwrap_or(0);

        if let Some(tick) = v.get("tick") {
            tick_ts.push(ts);
            let d = tick.get("deaths").and_then(|d| d.as_i64()).unwrap_or(0);
            if let Some(prev) = prev_deaths {
                if d > prev {
                    deaths.push(ts);
                }
            }
            prev_deaths = Some(d);
            continue;
        }

        match v.get("type").and_then(|t| t.as_str()) {
            Some("risk_trace") => {
                let probability = v.get("probability").and_then(|p| p.as_f64()).unwrap_or(0.0);
                let missing = parse_missing_array(v.get("missing"));
                // A risk_trace with an empty missing set but positive residual
                // probability (documented in should_record_risk_trace) carries
                // no per-hero timeline info we can replay — skip it, same as
                // the live pipeline treating it as "nothing to act on" here.
                if !missing.is_empty() || probability <= 0.0 {
                    risk_points.push((ts, missing));
                }
            }
            Some("enemy_missing") => {
                if let (Some(hero), Some(mfm)) = (
                    v.get("hero").and_then(|h| h.as_str()),
                    v.get("missing_for_ms").and_then(|m| m.as_u64()),
                ) {
                    missing_events.push((ts, hero.to_string(), mfm, parse_pos(v.get("last_pos"))));
                }
            }
            _ => {}
        }
    }

    // FULL mode iff the log actually carries risk_trace samples — the
    // measured input. Otherwise fall back to the approximated enemy_missing
    // reconstruction (legacy logs).
    let mode = if !risk_points.is_empty() {
        Mode::Full
    } else {
        Mode::Approx
    };
    let timeline = match mode {
        Mode::Full => {
            risk_points.sort_by_key(|(ts, _)| *ts);
            risk_points
        }
        Mode::Approx => reconstruct_approx(&missing_events, &tick_ts),
    };
    deaths.sort_unstable();
    (mode, deaths, timeline)
}

/// APPROX-mode reconstruction: extrapolate each hero's `missing_for_ms`
/// linearly forward from its last `enemy_missing` event, on a grid made of
/// every tick timestamp (the ~1 Hz cadence `log.rs::note_tick` samples at)
/// plus the event timestamps themselves. A hero is dropped from the
/// reconstructed set once its extrapolated absence exceeds [`APPROX_CAP_MS`]
/// — beyond that horizon we have no evidence either way, so we stop
/// asserting it's still missing rather than guess indefinitely.
fn reconstruct_approx(events: &[MissingEvent], tick_ts: &[u64]) -> Timeline {
    let mut events_sorted = events.to_vec();
    events_sorted.sort_by_key(|(ts, ..)| *ts);

    let mut grid: BTreeSet<u64> = tick_ts.iter().copied().collect();
    for (ts, ..) in &events_sorted {
        grid.insert(*ts);
    }

    let mut anchors: HashMap<String, (u64, u64, (f32, f32))> = HashMap::new();
    let mut out = Vec::new();
    let mut ev_idx = 0usize;

    for t in grid {
        while ev_idx < events_sorted.len() && events_sorted[ev_idx].0 <= t {
            let (ets, hero, mfm, pos) = events_sorted[ev_idx].clone();
            anchors.insert(hero, (ets, mfm, pos));
            ev_idx += 1;
        }

        let mut missing = Vec::new();
        anchors.retain(|hero, (anchor_ts, base_ms, pos)| {
            let elapsed = t.saturating_sub(*anchor_ts);
            let extrapolated = base_ms.saturating_add(elapsed);
            if extrapolated > APPROX_CAP_MS {
                false
            } else {
                missing.push(MissingEntry {
                    hero: hero.clone(),
                    missing_for_ms: extrapolated,
                    last_pos: *pos,
                });
                true
            }
        });

        if !missing.is_empty() {
            out.push((t, missing));
        }
    }
    out
}

// ─────────────────────────────── replay + scoring ───────────────────────────────

#[derive(Default, Clone, Copy)]
struct Metrics {
    alerts: u64,
    deaths: u64,
    hit_alerts: u64,
    hit_deaths: u64,
}

impl Metrics {
    fn add(&mut self, other: Metrics) {
        self.alerts += other.alerts;
        self.deaths += other.deaths;
        self.hit_alerts += other.hit_alerts;
        self.hit_deaths += other.hit_deaths;
    }

    fn precision(&self) -> Option<f64> {
        if self.alerts == 0 {
            None
        } else {
            Some(self.hit_alerts as f64 / self.alerts as f64)
        }
    }

    fn recall(&self) -> Option<f64> {
        if self.deaths == 0 {
            None
        } else {
            Some(self.hit_deaths as f64 / self.deaths as f64)
        }
    }

    fn f1(&self) -> Option<f64> {
        match (self.precision(), self.recall()) {
            (Some(p), Some(r)) if p + r > 0.0 => Some(2.0 * p * r / (p + r)),
            (Some(_), Some(_)) => Some(0.0),
            _ => None,
        }
    }
}

/// Replay one match against one candidate `(params, sensitivity)` pair using
/// the REAL `Motion`/`Signal` types (see module doc), returning the
/// alert/death hit counts for this match alone.
fn replay_match(m: &MatchData, params: MotionParams, sensitivity: Sensitivity, window_ms: u64) -> Metrics {
    let motion = Motion::with_params(params);
    let mut signal = Signal::new();
    signal.set_sensitivity(sensitivity);

    let mut alerts: Vec<u64> = Vec::new();
    let mut last_ts: Option<u64> = None;

    for (ts, entries) in &m.timeline {
        if let Some(prev) = last_ts {
            if *ts > prev && *ts - prev > GAP_RESET_MS {
                // Implicit all-clear: see module doc on GAP_RESET_MS.
                let _ = signal.evaluate(&GankRisk::default());
            }
        }
        last_ts = Some(*ts);

        let missing: Vec<(String, u64, (f32, f32))> = entries
            .iter()
            .map(|e| (e.hero.clone(), e.missing_for_ms, e.last_pos))
            .collect();
        let risk = motion.assess(&missing, *ts);
        if let SignalEvent::Alert(_) = signal.evaluate(&risk) {
            alerts.push(*ts);
        }
    }

    let mut metrics = Metrics {
        alerts: alerts.len() as u64,
        deaths: m.deaths.len() as u64,
        ..Metrics::default()
    };
    for &a in &alerts {
        if m.deaths.iter().any(|&d| d > a && d <= a + window_ms) {
            metrics.hit_alerts += 1;
        }
    }
    for &d in &m.deaths {
        if alerts.iter().any(|&a| a < d && d <= a + window_ms) {
            metrics.hit_deaths += 1;
        }
    }
    metrics
}

fn is_default_combo(params: &MotionParams, sensitivity: Sensitivity) -> bool {
    let d = MotionParams::default();
    (params.peak_s - d.peak_s).abs() < 1e-6
        && (params.peak_risk - d.peak_risk).abs() < 1e-6
        && (params.multi_boost - d.multi_boost).abs() < 1e-6
        && sensitivity == Sensitivity::Med
}

struct Row {
    params: MotionParams,
    sensitivity: Sensitivity,
    metrics: Metrics,
    is_default: bool,
}

/// Run the full grid (see module-level grid constants) against every match
/// in `mode`, returning one [`Row`] per `(params, sensitivity)` combination.
fn run_grid(matches: &[&MatchData], window_ms: u64) -> Vec<Row> {
    let mut rows = Vec::new();
    for &peak_s in &PEAK_S_GRID {
        for &peak_risk in &PEAK_RISK_GRID {
            for &multi_boost in &MULTI_BOOST_GRID {
                let params = MotionParams {
                    peak_s,
                    peak_risk,
                    multi_boost,
                    ..MotionParams::default()
                };
                for &sensitivity in &SENSITIVITY_GRID {
                    let mut metrics = Metrics::default();
                    for m in matches {
                        metrics.add(replay_match(m, params, sensitivity, window_ms));
                    }
                    rows.push(Row {
                        params,
                        sensitivity,
                        metrics,
                        is_default: is_default_combo(&params, sensitivity),
                    });
                }
            }
        }
    }
    rows
}

fn sensitivity_label(s: Sensitivity) -> &'static str {
    match s {
        Sensitivity::Low => "Low",
        Sensitivity::Med => "Med",
        Sensitivity::High => "High",
    }
}

fn fmt_opt(v: Option<f64>) -> String {
    match v {
        Some(x) => format!("{:.3}", x),
        None => "  n/a".to_string(),
    }
}

fn print_row(rank: &str, r: &Row) {
    let marker = if r.is_default { " <== CURRENT DEFAULT" } else { "" };
    println!(
        "{rank:<4} peak_s={:<5.1} peak_risk={:<4.2} multi_boost={:<5.2} sens={:<4} | P={} R={} F1={} | alerts={:<5} deaths={:<5}{marker}",
        r.params.peak_s,
        r.params.peak_risk,
        r.params.multi_boost,
        sensitivity_label(r.sensitivity),
        fmt_opt(r.metrics.precision()),
        fmt_opt(r.metrics.recall()),
        fmt_opt(r.metrics.f1()),
        r.metrics.alerts,
        r.metrics.deaths,
    );
}

fn report_mode(mode: Mode, matches: &[&MatchData], window_ms: u64) {
    let total_deaths: u64 = matches.iter().map(|m| m.deaths.len() as u64).sum();
    println!();
    println!("──────────────────────────────────────────────────────────────────────────");
    println!(
        "MODE {} — {} match(es), {} death(s) total",
        mode.label(),
        matches.len(),
        total_deaths
    );
    println!("──────────────────────────────────────────────────────────────────────────");
    if matches.is_empty() {
        println!("(no matches in this mode)");
        return;
    }

    let mut rows = run_grid(matches, window_ms);
    // Highest F1 first; combos with no alerts/deaths (f1 = None) sort last.
    rows.sort_by(|a, b| {
        let fa = a.metrics.f1().unwrap_or(-1.0);
        let fb = b.metrics.f1().unwrap_or(-1.0);
        fb.partial_cmp(&fa).unwrap_or(std::cmp::Ordering::Equal)
    });

    println!(
        "Top {} of {} param combinations by F1:",
        TOP_N.min(rows.len()),
        rows.len()
    );
    for (i, r) in rows.iter().take(TOP_N).enumerate() {
        print_row(&format!("#{}", i + 1), r);
    }

    // Always show the shipped-default row explicitly, even if it didn't make
    // the top 10 — this is the baseline every other row is judged against.
    if let Some(default_row) = rows.iter().find(|r| r.is_default) {
        println!();
        println!("Current default (MotionParams::default() + Sensitivity::Med):");
        print_row("--", default_row);
    }
}

// ─────────────────────────────── I/O + main ───────────────────────────────

fn default_log_dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("G-Maiden").join("logs")
}

fn read_matches(dir: &Path) -> Vec<MatchData> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if !name.starts_with("match-") || !name.ends_with(".jsonl") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let (mode, deaths, timeline) = parse_match(&content);
        out.push(MatchData {
            file: name,
            mode,
            deaths,
            timeline,
        });
    }
    out.sort_by(|a, b| a.file.cmp(&b.file));
    out
}

fn parse_args() -> (PathBuf, u64) {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut log_dir: Option<PathBuf> = None;
    let mut window_ms = DEFAULT_WINDOW_MS;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--window-ms" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    if let Ok(parsed) = v.parse::<u64>() {
                        window_ms = parsed;
                    }
                }
            }
            other if log_dir.is_none() && !other.starts_with("--") => {
                log_dir = Some(PathBuf::from(other));
            }
            _ => {}
        }
        i += 1;
    }
    (log_dir.unwrap_or_else(default_log_dir), window_ms)
}

fn main() {
    let (dir, window_ms) = parse_args();

    println!("============================================================");
    println!(" G-Log replay_fit — offline gank-warning param fit harness");
    println!(" READ-ONLY. Zero network. Reads local match logs only.");
    println!(" Log dir : {}", dir.display());
    println!(" Window  : {} ms (death-attribution window)", window_ms);
    println!("============================================================");

    let matches = read_matches(&dir);
    if matches.is_empty() {
        println!();
        println!(
            "No match-*.jsonl files found in {} — nothing to replay.",
            dir.display()
        );
        return;
    }

    let full_count = matches.iter().filter(|m| m.mode == Mode::Full).count();
    let approx_count = matches.len() - full_count;
    println!();
    println!(
        "Found {} match log(s): {} FULL (risk_trace), {} APPROX (legacy, reconstructed)",
        matches.len(),
        full_count,
        approx_count
    );
    for m in &matches {
        println!(
            "  - {} [{}] {} death(s), {} timeline point(s)",
            m.file,
            m.mode.label(),
            m.deaths.len(),
            m.timeline.len()
        );
    }

    let full_matches: Vec<&MatchData> = matches.iter().filter(|m| m.mode == Mode::Full).collect();
    let approx_matches: Vec<&MatchData> = matches.iter().filter(|m| m.mode == Mode::Approx).collect();

    report_mode(Mode::Full, &full_matches, window_ms);
    report_mode(Mode::Approx, &approx_matches, window_ms);

    println!();
    println!("──────────────────────────────────────────────────────────────────────────");
    println!("Note: APPROX rows are reconstructed from edge-triggered enemy_missing");
    println!("events (linear extrapolation, capped at {}ms) — never mistake them for", APPROX_CAP_MS);
    println!("measured FULL-mode numbers. Nothing in this report was sent anywhere.");
    println!("──────────────────────────────────────────────────────────────────────────");
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─────────────────────────── line parsing ───────────────────────────

    #[test]
    fn parse_match_full_mode_from_risk_trace() {
        let content = concat!(
            "{\"ts\":0,\"type\":\"match_start\",\"silent_arm\":false,\"study\":true}\n",
            "{\"ts\":0,\"tick\":{\"deaths\":0}}\n",
            "{\"ts\":6000,\"type\":\"risk_trace\",\"probability\":0.3,\"missing\":[{\"hero\":\"CM\",\"missing_for_ms\":6000,\"last_pos\":[0.25,0.5]}]}\n",
            "{\"ts\":7000,\"tick\":{\"deaths\":0}}\n",
        );
        let (mode, deaths, timeline) = parse_match(content);
        assert_eq!(mode, Mode::Full);
        assert!(deaths.is_empty());
        assert_eq!(timeline.len(), 1);
        assert_eq!(timeline[0].0, 6000);
        assert_eq!(timeline[0].1.len(), 1);
        assert_eq!(timeline[0].1[0].hero, "CM");
        assert_eq!(timeline[0].1[0].missing_for_ms, 6000);
        assert!((timeline[0].1[0].last_pos.0 - 0.25).abs() < 1e-6);
    }

    #[test]
    fn parse_match_tolerates_malformed_and_unknown_lines() {
        let content = concat!(
            "not json, a torn power-cut line\n",
            "{\"ts\":10,\"type\":\"some_future_event\"}\n",
            "{\"ts\":20,\"type\":\"risk_trace\",\"probability\":0.0,\"missing\":[]}\n",
        );
        let (mode, deaths, timeline) = parse_match(content);
        assert!(deaths.is_empty());
        // Empty missing + zero probability risk_trace lines are recorded but
        // carry nothing to replay against — still counts as FULL mode since a
        // risk_trace line was present.
        assert_eq!(mode, Mode::Full);
        assert_eq!(timeline.len(), 1);
        assert!(timeline[0].1.is_empty());
    }

    // ─────────────────────────── death derivation ───────────────────────────

    #[test]
    fn death_derivation_on_rising_deaths_sequence() {
        let content = concat!(
            "{\"ts\":0,\"tick\":{\"deaths\":0}}\n",
            "{\"ts\":1000,\"tick\":{\"deaths\":0}}\n",
            "{\"ts\":2000,\"tick\":{\"deaths\":1}}\n", // death #1
            "{\"ts\":3000,\"tick\":{\"deaths\":1}}\n",
            "{\"ts\":4000,\"tick\":{\"deaths\":3}}\n", // multi-death jump still counts once
            "{\"ts\":5000,\"tick\":{\"deaths\":2}}\n", // a drop (e.g. log rotation) must not count
        );
        let (_, deaths, _) = parse_match(content);
        assert_eq!(deaths, vec![2000, 4000]);
    }

    // ─────────────────────────── APPROX reconstruction ───────────────────────────

    #[test]
    fn approx_reconstruction_extrapolates_linearly_and_caps() {
        // Hero missing event fires once at ts=5000 with missing_for_ms=5000
        // (just crossed the sentry threshold). Ticks continue every 1000ms.
        let events = vec![("CM".to_string(), 5000u64, 5000u64, (0.25f32, 0.5f32))];
        let events: Vec<MissingEvent> = events
            .into_iter()
            .map(|(h, t, m, p)| (t, h, m, p))
            .collect();
        let tick_ts: Vec<u64> = (0..=10).map(|i| i * 1000).collect(); // 0..10000
        let timeline = reconstruct_approx(&events, &tick_ts);

        // At ts=5000 the hero should show exactly missing_for_ms=5000.
        let at_5000 = timeline.iter().find(|(t, _)| *t == 5000).unwrap();
        assert_eq!(at_5000.1[0].missing_for_ms, 5000);

        // At ts=9000, elapsed=4000 since anchor -> extrapolated 9000ms.
        let at_9000 = timeline.iter().find(|(t, _)| *t == 9000).unwrap();
        assert_eq!(at_9000.1[0].missing_for_ms, 9000);
        assert!((at_9000.1[0].last_pos.0 - 0.25).abs() < 1e-6);
    }

    #[test]
    fn approx_reconstruction_drops_hero_past_cap() {
        let events: Vec<MissingEvent> = vec![(0u64, "CM".to_string(), 5000u64, (0.5, 0.5))];
        // Ticks well past the 30s cap (anchor missing_for_ms already 5000, so
        // cap is crossed once elapsed > 25_000).
        let tick_ts: Vec<u64> = vec![0, 10_000, 20_000, 25_000, 26_000, 40_000];
        let timeline = reconstruct_approx(&events, &tick_ts);

        assert!(timeline.iter().any(|(t, _)| *t == 25_000));
        // 25_000 elapsed + 5000 base = 30_000, exactly at the cap: still kept.
        let at_25000 = timeline.iter().find(|(t, _)| *t == 25_000).unwrap();
        assert_eq!(at_25000.1[0].missing_for_ms, 30_000);
        // Past the cap the hero must be dropped entirely (no entry at all).
        assert!(!timeline.iter().any(|(t, _)| *t == 26_000));
        assert!(!timeline.iter().any(|(t, _)| *t == 40_000));
    }

    // ─────────────────────────── grid scoring ───────────────────────────

    /// Build a tiny synthetic FULL-mode match, by construction, where a
    /// high-sensitivity, low-peak_s parameter set is clearly the best: one
    /// hero missing just long enough to cross High's danger threshold but
    /// never Low's, immediately followed by a death.
    fn synthetic_best_known_match() -> MatchData {
        // missing_for_ms=9000 -> with peak_s=8 the risk already exceeds
        // Low/Med's high bars is unlikely, but High's 0.50 danger bar is
        // crossed comfortably by a single hero deep in its ramp.
        let timeline = vec![(9000u64, vec![MissingEntry {
            hero: "CM".to_string(),
            missing_for_ms: 9000,
            last_pos: (0.5, 0.5),
        }])];
        MatchData {
            file: "match-synthetic.jsonl".to_string(),
            mode: Mode::Full,
            deaths: vec![10_000], // 1s after the missing sample -> within any reasonable window
            timeline,
        }
    }

    #[test]
    fn grid_scoring_finds_best_known_combo() {
        let m = synthetic_best_known_match();
        let matches = vec![&m];
        let rows = run_grid(&matches, DEFAULT_WINDOW_MS);

        // High sensitivity must produce at least one alert-recall hit;
        // Low sensitivity (SRS baseline 0.85) must produce none for this
        // single-hero, moderate-risk scenario.
        let any_high_hit = rows
            .iter()
            .any(|r| r.sensitivity == Sensitivity::High && r.metrics.hit_deaths > 0);
        assert!(any_high_hit, "High sensitivity should catch the synthetic death");

        let low_never_alerts = rows
            .iter()
            .filter(|r| r.sensitivity == Sensitivity::Low)
            .all(|r| r.metrics.alerts == 0);
        assert!(
            low_never_alerts,
            "a single moderately-missing hero must not cross Low's 0.85 bar"
        );

        // The best-F1 row (after sorting the way report_mode does) must be a
        // High-sensitivity row, since it's the only sensitivity that fires at
        // all in this scenario.
        let mut sorted = rows;
        sorted.sort_by(|a, b| {
            let fa = a.metrics.f1().unwrap_or(-1.0);
            let fb = b.metrics.f1().unwrap_or(-1.0);
            fb.partial_cmp(&fa).unwrap()
        });
        assert_eq!(sorted[0].sensitivity, Sensitivity::High);
        assert_eq!(sorted[0].metrics.f1(), Some(1.0));
    }

    #[test]
    fn is_default_combo_matches_only_the_shipped_defaults() {
        let d = MotionParams::default();
        assert!(is_default_combo(&d, Sensitivity::Med));
        assert!(!is_default_combo(&d, Sensitivity::Low));
        let other = MotionParams { peak_s: 8.0, ..d };
        assert!(!is_default_combo(&other, Sensitivity::Med));
    }

    #[test]
    fn metrics_f1_is_none_when_no_alerts_and_no_deaths() {
        let m = Metrics::default();
        assert_eq!(m.precision(), None);
        assert_eq!(m.recall(), None);
        assert_eq!(m.f1(), None);
    }

    #[test]
    fn metrics_f1_zero_when_alerts_and_deaths_exist_but_never_join() {
        let m = Metrics {
            alerts: 2,
            deaths: 2,
            hit_alerts: 0,
            hit_deaths: 0,
        };
        assert_eq!(m.precision(), Some(0.0));
        assert_eq!(m.recall(), Some(0.0));
        assert_eq!(m.f1(), Some(0.0));
    }
}
