# GATE P3 — G-Signal Latency Performance Gate

## What GATE P3 measures

**GATE P3 measures the end-to-end latency of G-Maiden's critical gank-warning path** in accordance with the Engineering Spec §1 ("SRS §1" in Thai docs). It enforces two hard constraints:

- **p50 latency** must not exceed **250 ms** (target)
- **p99 latency** must not exceed **300 ms** (hard ceiling)

The path spans 6 hops from raw GSI JSON to audio playback:

| Hop | Module | Measurement | Wiring |
|-----|--------|-------------|--------|
| 1b | **G-Sensory** (DXGI) | minimap-**rect** frame ready from GPU capture (production path — `acquire_rect` over the `MinimapRegion`, since the capture-switch task) | SKIP (headless) |
| 2 | **G-Vision** (CV) | enemy icon detection via ONNX minimap classifier | WIRED |
| 3 | **G-Motion** | gank-probability assessment from 5-min enemy history | WIRED |
| 4 | **G-Signal** | threshold check + Belief Revision state machine | WIRED |
| 5 | **audio interrupt** | clip resolution + admission check (no playback) | WIRED |
| 6 | **audio output** | device callback pulls first sample ("first audible") | SKIP (headless) |

**Hops 2-5** run headless in `latency_harness` and measure real wall-clock time.
**Hop 1b and hop 6** require a live display and audio device, so they report SKIP on CI but are measured by `latency_live` on a developer machine.

The gate sums measured hops (2-5) + budget for SKIP hops (1b, 6) and checks against the p99 ceiling. If a SKIP hop later blows its budget in real play, `latency_live` is what catches it.

> **1a vs 1b.** `latency_live` actually measures *two* hop-1 series: **1a** is the
> old full-desktop `acquire_frame()` copy (legacy path, now **informational only** —
> status `INFO`, no budget/verdict, since production no longer full-copies outside
> calibration mode) and **1b** is `acquire_rect()` over the exact `MinimapRegion` the
> CV pipeline crops in production. The 30ms Engineering Spec §1 budget — and the
> gate's exit verdict — apply to **1b**, not 1a.

## Running the gate

### Full gate (both phases, best on a local machine with display/audio)

```bash
tests/perf/run_gate_p3.bat
```

This runs both `latency_harness` and `latency_live` in sequence and exits with an overall verdict (0 PASS / 1 FAIL / 77 SKIP).

### Headless harness only (CI, no display/audio)

```bash
cargo run --release --manifest-path tests/perf/Cargo.toml
```

**Exit codes:**
- `0` – GATE P3 PASS: measured p99 (hops 2-5) + SKIP budgets (70 ms) ≤ 300 ms
- `1` – GATE P3 FAIL: measured p99 exceeds budget
- `77` – GATE P3 SKIP: ONNX model not found (prerequisites missing)

**Runtime:** ~5–10 seconds in `--release` (300 iterations of real CV/motion/signal/audio work).

### Live probes only (local machine with display/audio)

```bash
cargo run --release --manifest-path tests/perf/Cargo.toml --bin latency_live
```

Probes hop 1 (as **1a** full-frame legacy + **1b** minimap-rect production, both off one
`DxgiCapture` instance) and hop 6 independently. Each series self-detects whether its device
exists and reports SKIP if not.

> **Hop 1 caveat — run it with screen content changing.** DXGI Desktop Duplication only
> delivers a frame when the screen actually repaints. On an idle desktop the acquire loop is
> dominated by waiting for the next repaint (timeouts, `present0` frames), which inflates
> hop-1 p99 far beyond real capture cost — a FAIL on an idle desktop is expected and is *not*
> a capture regression. This applies to **both 1a and 1b** — they share the same repaint-wait
> reality, only the copy size differs. The meaningful hop-1 number comes from running the probe
> while content updates continuously (a game, a video, or a fullscreen animation). In-game, Dota
> presents at 60–144 fps, so a new frame is available every ~7–16 ms.

**Exit codes:**
- `0` – LATENCY_LIVE PASS: all measured probes met their budgets
- `1` – LATENCY_LIVE FAIL: at least one live hop exceeded its budget
- `77` – LATENCY_LIVE SKIP/PARTIAL: at least one probe could not measure (missing display or audio device) and none failed — a partially-measured run never reads as a full pass

**Runtime:** ~25–30 seconds with active screen content (100 DXGI frame acquisitions each for 1a
and 1b, + 30 audio plays); up to ~70s if the desktop is idle enough for either capture series to
hit its 20s wall-clock cap.

## The two-machine story

**Headless CI** (e.g., GitHub Actions runner):
- Runs `latency_harness` only (hops 2-5 wired).
- Reports hops 1b and 6 as SKIP with their budgets (30 ms + 40 ms = 70 ms) factored into the gate math.
- If the critical path (hops 2-5) stays within (300 ms – 70 ms = 230 ms), the gate passes.

**Local with display/audio** (developer machine):
- Runs both `latency_harness` and `latency_live` via `run_gate_p3.bat`.
- `latency_live` measures the two SKIPped hops (1b and 6) with real hardware (plus informational 1a).
- Provides full end-to-end visibility: headless wired p99 + live hop 1b/6 p99 = true E2E estimate.
- Catches regressions in display capture or audio playback latency that CI cannot see.

## replay_fit — offline G-Log replay/fit harness

**What it does.** `replay_fit` closes the loop G-Log was built for: it reads archived
match logs (`%LOCALAPPDATA%\G-Maiden\logs\match-*.jsonl` by default, or a directory
passed as the first argument), reconstructs each match's missing-hero timeline and
death timestamps, then replays that timeline through the **real**
`g_maiden::motion::Motion` / `g_maiden::signal::Signal` state machines for a grid of
candidate `MotionParams` (`peak_s`, `peak_risk`, `multi_boost`) × `Sensitivity`
(Low/Med/High) combinations. Each candidate is scored by precision/recall/F1 against
real deaths (rising `tick.deaths`, same semantics as `log.rs`/`tools/analyze-log/analyze.py`),
and the top 10 by F1 are printed per mode, plus the row matching today's shipped
defaults (`MotionParams::default()` + `Sensitivity::Med`) shown explicitly for
comparison.

```bash
# against the real local log dir
cargo run --release --manifest-path tests/perf/Cargo.toml --bin replay_fit

# against a specific directory, with a custom death-attribution window
cargo run --release --manifest-path tests/perf/Cargo.toml --bin replay_fit -- \
  C:\path\to\logs --window-ms 8000
```

**Two reconstruction modes** (every output row is labeled so one is never mistaken
for the other):
- **FULL** — logs that carry `risk_trace` samples (the measured G-Motion input at
  each throttled ~1 Hz tick). Replay is exact.
- **APPROX** — legacy logs with only edge-triggered `enemy_missing` events. The
  missing-hero timeline is reconstructed by extrapolating `missing_for_ms` linearly
  forward from the event, capped at 30s — a bounded guess, not a measurement.

**Privacy.** Read-only, zero network. It only reads the JSONL files `log.rs` already
wrote to the local machine (CLAUDE.md: G-Log raw data is local-only) and never writes
back to them or sends anything anywhere.

## Exit code conventions

Both binaries follow the POSIX `automake` convention:
- **0** – success
- **1** – failure (test condition not met)
- **77** – skip (prerequisites missing, test not applicable)

This allows `run_gate_p3.bat` and CI workflows to distinguish meaningful failures from expected skips.

## GATE P7 FPS Boss-run (PresentMon / ETW)

`perf_p7` keeps the FPS leg honest: it never treats a design estimate, a missing
capture, or a stale baseline as a pass. The two phases are operator-controlled
because the harness cannot inspect whether the transparent overlay is actually
visible.

Prerequisites:

- Windows 10/11 with Dota 2 running borderless fullscreen (`dota2.exe`)
- `PresentMon.exe` (pass an explicit path or put it on `PATH`)
- PowerShell started **as Administrator** so PresentMon can subscribe to ETW
- the same map/graphics/settings and a repeatable camera/gameplay segment for both phases
- no recording, shader compilation, downloads, or other workload changes between phases

Run from `tests/perf` (or use an absolute `--output-dir`):

```powershell
# Phase 1: keep G-Maiden overlay OFF and visibly verify it before confirming.
cargo run --release --bin perf_p7 -- \
  --fps-baseline --confirm-overlay-off \
  --presentmon C:\Tools\PresentMon.exe --duration-secs 30 --output-dir .\p7-run

# Phase 2: enable the same G-Maiden build/overlay and visibly verify it before confirming.
cargo run --release --bin perf_p7 -- \
  --fps-overlay --confirm-overlay-on \
  --presentmon C:\Tools\PresentMon.exe --duration-secs 30 --output-dir .\p7-run
```

The run writes three local artifacts under `--output-dir`:

| Artifact | Meaning |
|---|---|
| `fps-baseline.json` | Measured overlay-off phase; includes schema, process, duration, PresentMon path, ETW/elevation evidence, present count, and baseline FPS. |
| `fps-baseline.csv` | Raw PresentMon capture for the baseline phase. |
| `fps-report.json` | Measured overlay phase and verdict (`pass`/`fail`), or a truthful `skip` reason when prerequisites/confirmation are missing. |
| `fps-overlay.csv` | Raw PresentMon capture for the overlay-on phase. |

The JSON report is local evidence only and contains no GSI, CV, G-Log, match,
or player data. The overlay phase accepts a baseline only when it is schema
version 1, measured, explicitly overlay-off, non-empty, and has a positive FPS.
Therefore an old or hand-written `fps-baseline.json` cannot silently produce a
PASS. The report's `fps_drop_pct` is the non-negative reduction from baseline;
the gate passes only when it is `<= 3.0`.

Expected outcomes:

- exit `0`: both real ETW measurements completed and the overlay phase is within budget;
- exit `1`: the real overlay-on measurement exceeds the 3% budget;
- exit `77`: missing PresentMon/Dota/admin token/operator confirmation, invalid baseline,
  or another measurement prerequisite. A skip is not evidence of compliance.

Boss-run checklist:

1. Record the commit/build identifier and GPU/driver before Phase 1.
2. Use the same reproducible in-game segment for both 30-second captures.
3. Keep the overlay disabled/enabled exactly as confirmed; do not change settings between phases.
4. Attach `fps-report.json` plus both raw CSVs to the validation record. Do not claim P7 closeout
   until `verdict` is `pass` from a real run.
5. If ETW cannot be captured, preserve the `skip` report and record the exact admin/PresentMon
   error rather than substituting Task Manager, DWM composition timing, or a design estimate.

## References

- **Engineering Spec §1** (Thai: `docs/product/software-requirements-specification.md` §1) – latency budgets and Definition of Done criteria
- **src-tauri/src/main.rs** – module list (gsi, cv, motion, signal, audio)
- **latency_harness** (`tests/perf/src/main.rs`) – headless harness, real hops 2-5, honest gate math
- **latency_live** (`tests/perf/src/bin/latency_live.rs`) – live probes for hops 1/6, self-detection
