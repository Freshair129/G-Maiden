# GATE P3 — G-Signal Latency Performance Gate

## What GATE P3 measures

**GATE P3 measures the end-to-end latency of G-Maiden's critical gank-warning path** in accordance with the Engineering Spec §1 ("SRS §1" in Thai docs). It enforces two hard constraints:

- **p50 latency** must not exceed **250 ms** (target)
- **p99 latency** must not exceed **300 ms** (hard ceiling)

The path spans 6 hops from raw GSI JSON to audio playback:

| Hop | Module | Measurement | Wiring |
|-----|--------|-------------|--------|
| 1 | **G-Sensory** (DXGI) | minimap frame ready from GPU capture | SKIP (headless) |
| 2 | **G-Vision** (CV) | enemy icon detection via ONNX minimap classifier | WIRED |
| 3 | **G-Motion** | gank-probability assessment from 5-min enemy history | WIRED |
| 4 | **G-Signal** | threshold check + Belief Revision state machine | WIRED |
| 5 | **audio interrupt** | clip resolution + admission check (no playback) | WIRED |
| 6 | **audio output** | device callback pulls first sample ("first audible") | SKIP (headless) |

**Hops 2-5** run headless in `latency_harness` and measure real wall-clock time.
**Hops 1 and 6** require a live display and audio device, so they report SKIP on CI but are measured by `latency_live` on a developer machine.

The gate sums measured hops (2-5) + budget for SKIP hops (1, 6) and checks against the p99 ceiling. If a SKIP hop later blows its budget in real play, `latency_live` is what catches it.

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

Probes hops 1 and 6 independently. Each hop self-detects whether its device exists and reports SKIP if not.

> **Hop 1 caveat — run it with screen content changing.** DXGI Desktop Duplication only
> delivers a frame when the screen actually repaints. On an idle desktop the acquire loop is
> dominated by waiting for the next repaint (timeouts, `present0` frames), which inflates
> hop-1 p99 far beyond real capture cost — a FAIL on an idle desktop is expected and is *not*
> a capture regression. The meaningful hop-1 number comes from running the probe while
> content updates continuously (a game, a video, or a fullscreen animation). In-game, Dota
> presents at 60–144 fps, so a new frame is available every ~7–16 ms.

**Exit codes:**
- `0` – LATENCY_LIVE PASS: all measured probes met their budgets
- `1` – LATENCY_LIVE FAIL: at least one live hop exceeded its budget
- `77` – LATENCY_LIVE SKIP/PARTIAL: at least one probe could not measure (missing display or audio device) and none failed — a partially-measured run never reads as a full pass

**Runtime:** ~25–30 seconds (100 DXGI frame acquisitions + 30 audio plays).

## The two-machine story

**Headless CI** (e.g., GitHub Actions runner):
- Runs `latency_harness` only (hops 2-5 wired).
- Reports hops 1 and 6 as SKIP with their budgets (30 ms + 40 ms = 70 ms) factored into the gate math.
- If the critical path (hops 2-5) stays within (300 ms – 70 ms = 230 ms), the gate passes.

**Local with display/audio** (developer machine):
- Runs both `latency_harness` and `latency_live` via `run_gate_p3.bat`.
- `latency_live` measures the two SKIPped hops (1 and 6) with real hardware.
- Provides full end-to-end visibility: headless wired p99 + live hop 1/6 p99 = true E2E estimate.
- Catches regressions in display capture or audio playback latency that CI cannot see.

## Exit code conventions

Both binaries follow the POSIX `automake` convention:
- **0** – success
- **1** – failure (test condition not met)
- **77** – skip (prerequisites missing, test not applicable)

This allows `run_gate_p3.bat` and CI workflows to distinguish meaningful failures from expected skips.

## References

- **Engineering Spec §1** (Thai: `docs/product/software-requirements-specification.md` §1) – latency budgets and Definition of Done criteria
- **src-tauri/src/main.rs** – module list (gsi, cv, motion, signal, audio)
- **latency_harness** (`tests/perf/src/main.rs`) – headless harness, real hops 2-5, honest gate math
- **latency_live** (`tests/perf/src/bin/latency_live.rs`) – live probes for hops 1/6, self-detection
