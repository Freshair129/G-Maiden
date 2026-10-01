---
title: "G-Motion Heuristic Contract"
doc_id: gap-motion-contract
status: draft
version: 0.2.0
updated: 2026-10-01
owner: RWANG
---

# G-Motion Heuristic Contract

## 1. Scope and decision boundary

This C-3/HIGH contract records the G-Motion behavior present at source baseline `origin/main` commit `2d969ac643533b4b8e24494356da2e818eac874f`. It is documentation only: it does not change Rust behavior, close GAP-12, accept a product promise, approve tuning, or authorize a new prediction model.

The current implementation is a missing-time plus last-visible-heading heuristic. Its `GankRisk.probability` field is a 0–1 heuristic score used by G-Signal; no inspected source establishes that it is empirically calibrated as a probability. Documentation and UX claims must call it a heuristic risk estimate unless calibration evidence is separately approved and produced.

The feature spec title says “Heatmap & Path Prediction,” while the spec itself records that the current backend has no full heatmap, lanes, or through-fog path prediction. The Product Owner's delegated decision, recorded in the [exact-hash review](../../../.brain/execution/gap-closure-2026-10-01/wave-2-evidence-po-review.json), accepts the bounded heuristic above as the current documented scope. Route, heatmap, and through-fog work remain separate and blocked pending their own C-3/HIGH contract, authorized local-data/provenance boundary, held-out evaluation, and explicit approval. This revision records that choice but leaves the contract in draft until the feature title and quantitative/persona wording are reconciled; GAP-12 is not yet closed. See [feature status and limits](../../features/FEAT-G-MOTION.md#L14-L22) and [GAP-12 closure options](../../audits/gap-analysis-2026-09-12.md#L164-L166).

## 2. Current source contract

### Inputs, history, and lifecycle

- Each capture frame records detector sightings in a five-minute `VecDeque`; coordinates are normalized through the active minimap region. Entries older than `WINDOW_MS` are evicted. The history stores visible samples only; it ends when a hero disappears. See [`Motion::record`](../../../src-tauri/src/motion.rs#L140-L157).
- `Motion::assess` receives Sentry’s current missing set `(hero, missing_ms, last_pos)`. The per-hero missing-time function and pre-vanish heading function are applied to that set. The `last_pos` tuple is not used by the current formula. See [`Motion::assess`](../../../src-tauri/src/motion.rs#L165-L181).
- The capture caller constructs `Motion::new()`, records current detections, supplies `runtime::dead_enemy_count()`, and assesses current missing heroes. It rebuilds Sentry/Motion/Signal at match-epoch changes and monitor-region changes so the old coordinate history is discarded. See [capture initialization and reset](../../../src-tauri/src/capture.rs#L245-L335) and [frame call path](../../../src-tauri/src/capture.rs#L785-L796).
- The dead-enemy input is a count, not per-hero identity. The implementation removes that many lowest-risk missing contributors. Its source comments identify a bounded false-negative case when an enemy dies while visible; attribution is intentionally not guessed. This behavior and its tradeoff are part of the current contract, not proof that the count is always fresh or correct in live play. See [discount logic](../../../src-tauri/src/motion.rs#L183-L206) and its unit cases in [motion tests](../../../src-tauri/src/motion.rs#L408-L505).
- Capture failure can leave the app in GSI-only Lite mode, with minimap CV off; in that mode this G-Motion capture path is unavailable. The fallback is explicit in [capture startup](../../../src-tauri/src/capture.rs#L338-L355).

### Heuristic calculation and output

| Stage | Current behavior from source | Interpretation boundary |
| --- | --- | --- |
| Per-hero missing-time risk | Defaults: zero before 5 seconds; linear ramp to 0.7 at 12 seconds; then decay by 0.03 per second to a 0.1 floor. | Hand-set shape and constants; no fit/calibration evidence is asserted. |
| Heading adjustment | Uses the last two visible samples for the same hero. It multiplies risk by `1 + cosine * 0.22`, bounded to 0.78–1.22; no usable trail yields 1.0. | Direction toward the map center is a proxy, not lane/route inference. It cannot follow a hero through fog. |
| Multiple missing heroes | Combines contributors as `1 - product(1 - rᵢ)`; if two or more remain, multiplies by 1.15 and clamps at 1.0. | Independence plus coordination boost is an explicit heuristic assumption, not a learned joint model. |
| Death-count discount | Drops up to the supplied count of lowest-risk contributors before aggregation. | Count-only suppression cannot identify which hero is dead; source documents the visible-death false-negative tradeoff. |
| ETA | `(peak_s - missing_seconds)` floored at 1 second. | Time-only proxy; no distance, travel speed, lane, or arrival observation is used. |
| Output | `GankRisk { probability: f32, missing_heroes, eta_ms }`. | Serialized field name `probability` does not establish calibrated probability or location-specific forecast quality. |

The defaults and formula are in [`MotionParams`](../../../src-tauri/src/motion.rs#L23-L78), [aggregation and death-count handling](../../../src-tauri/src/motion.rs#L165-L227), and [heading, missing-risk, and ETA functions](../../../src-tauri/src/motion.rs#L229-L303). The feature spec’s persona example includes “78%” and “around here” while noting that no real heatmap exists; that user-facing quantitative/location phrasing needs a separate owner decision and evidence review. See [persona behavior](../../features/FEAT-G-MOTION.md#L83-L89).

## 3. Offline replay is an analysis tool, not adoption

`tests/perf/src/bin/replay_fit.rs` declares a read-only, zero-network consumer for local archived match logs. It separates `FULL` risk-trace input from `APPROX` legacy reconstruction; APPROX linearly extrapolates edge-triggered missing events and caps them at 30 seconds. Its default death-attribution window is 8 seconds. These modes must remain separate in any result report. See [replay assumptions](../../../tests/perf/src/bin/replay_fit.rs#L1-L77) and [window/mode constants](../../../tests/perf/src/bin/replay_fit.rs#L86-L112).

The current harness does not reproduce all current live inputs: it constructs `Motion::with_params` without calling `record`, so heading is neutral; it does not supply the capture caller’s dead-enemy count. The grid varies `peak_s`, `peak_risk`, and `multi_boost` plus G-Signal sensitivity, leaving other `MotionParams` at defaults. Its precision/recall/F1 score alert/death timing within the selected window; this is not probability calibration, causal efficacy, or a complete tuning of the live model. See [replay input and scoring path](../../../tests/perf/src/bin/replay_fit.rs#L345-L399) and [candidate grid](../../../tests/perf/src/bin/replay_fit.rs#L408-L435).

The replay binary’s source describes a local log-directory argument and `--window-ms`, but the allowed source set does not include its Cargo manifest or a build/run instruction. This contract therefore does not invent an invocation command, run the harness, open archived match logs, or treat any ranked row as adopted. The source says the tool prints results and does not write them back; runtime capture still constructs `Motion::new()`, not `Motion::with_params`.

## 4. Evidence and unverified claims

| Claim or artifact | Evidence available in assigned sources | Status for this contract |
| --- | --- | --- |
| Formula/defaults and visible-history behavior | Rust implementation and unit-test declarations. | Source-verified; tests were not run. |
| Five-minute retention and reset boundaries | `Motion::record` plus capture match/monitor reset code. | Source-verified; live lifecycle not exercised. |
| Full route/heatmap/through-fog prediction | Feature spec and historical audit say these are absent; inspected `Motion` output has no route, heatmap, lane, or predicted-path field. | Not implemented in inspected path; no claim of hidden-feed capability. |
| Replay-fit exists and separates FULL/APPROX | Binary source and its scoring/reconstruction code. | Source-verified only; no dataset or replay output inspected. |
| 20 ms latency and ≤1 MB memory targets | Feature acceptance criteria state these targets. | `NOT_VERIFIED`; this draft ran no tests or performance work. |
| Empirical calibration, model accuracy, or improved player outcomes | No current held-out result in the assigned sources. | `NOT_VERIFIED`; do not make these claims. |
| Current end-to-end UAT or deployed/released behavior | Not in the assigned sources. | `NOT_RUN / NOT_ESTABLISHED`. |

The feature spec lists ≤20 ms, ≤1 MB, five-minute eviction, and empty-history behavior as acceptance criteria; these are requirements, not measured results. Its criteria remain unchecked in the inspected source. See [feature acceptance criteria](../../features/FEAT-G-MOTION.md#L107-L114). `capture.rs` also declares a synthetic `pipeline_latency_within_budget` test that returns early in debug builds and excludes capture I/O from measurement; it is not a live-capture, full-device, or release-performance result. See [latency harness boundary](../../../src-tauri/src/capture.rs#L955-L1018).

## 5. Acceptance gates

### Baseline heuristic contract

The Product Owner has selected the bounded heuristic-only description as the current scope. This contract remains a draft until the feature title and quantitative/persona wording are reconciled and this revision receives exact-hash review. GAP-12 remains open until that documentation alignment is complete. Acceptance should preserve these observable properties:

1. Defaults and missing-time curve remain explicit and deterministic; the `probability` field is described as an uncalibrated heuristic score.
2. Heading uses only pre-vanish visible history and falls back to neutral when no usable trail exists; no through-fog state is inferred.
3. History expires at the five-minute window and is reset at the existing match/coordinate-space boundaries.
4. The count-only death discount remains explicit, with its visible-death false-negative tradeoff covered by regression cases.
5. Lite mode does not present minimap-derived G-Motion output as live when the capture sensor is unavailable.
6. Privacy and input boundaries remain local visible observations plus the existing local game-state count; no hidden enemy feed or external provider input is authorized by this contract.

The source declares unit cases for empty/no-risk, one/two missing heroes, eviction, heading, neutral fallback, full wipe/death discount, default compatibility, and explicit params. Their presence is not a passing test result. Any implementation change must run the appropriate source-level suite and record the exact revision and outcome before acceptance.

### Separate future calibration/model gate

A future change may be proposed only as its own reviewed C-3/HIGH work item. The historical audit explicitly requires an owner choice, authorized data, held-out calibration, preserved uncertainty, and no hidden enemy feed for route/heatmap work; the feature spec identifies G-Log tuning as a later phase. See [audit closure criteria](../../audits/gap-analysis-2026-09-12.md#L164-L166) and [feature tuning dependency](../../features/FEAT-G-MOTION.md#L91-L105).

At minimum, a future evidence package must:

- identify approved, local-only match logs and report sample counts and FULL/APPROX modes separately;
- close the replay/live-input mismatch for heading history and dead-enemy count, or explicitly limit claims to the inputs replay actually models;
- split evaluation by match (not by frame) and use an untouched holdout before comparing candidate parameters with shipped defaults;
- report alert/death association metrics and uncertainty without converting F1 or a ranked grid row into calibrated probability or causal efficacy;
- record exact parameter values, source revision, data provenance, review decision, rollback path, and whether parameters are manually reviewed or automatically applied.

No auto-tuning, runtime parameter loading, heatmap, route prediction, or new data feed is approved here. An automatic application path needs a separate owner-approved policy and acceptance contract; a static offline fit output is not authorization to change live defaults.

## 6. Review record

- Source baseline: `origin/main` at `2d969ac643533b4b8e24494356da2e818eac874f`.
- Scope: documentation draft only; no code, tests, benchmark, dataset, provider, or runtime operation was performed.
- Tests and performance: `NOT_RUN`.
- Product Owner decision: heuristic-only current scope accepted with limitations; this revision records the delegated choice and awaits exact-hash review. It does not close GAP-12 or approve a future model path.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-01 | Recorded the source-pinned heuristic contract, replay limitations, unverified performance/calibration claims, and separate owner gates for acceptance or future model work. |
| 0.2.0 | 2026-10-01 | Recorded the delegated heuristic-only product decision; kept GAP-12 open pending feature-spec wording alignment and exact-hash review. |
