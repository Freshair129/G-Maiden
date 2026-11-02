---
title: "CR-040/C OBS CV live measurement plan and acceptance matrix"
doc_id: "cr040-obs-cv-acceptance-matrix"
status: "draft"
version: "0.1.0"
updated: "2026-11-02"
owner: "G-Maiden"
---

# CR-040/C OBS CV live measurement plan and acceptance matrix

## Evidence status

This is a plan only. No Dota 2, OBS, Windows capture, CV quality, FPS, latency, CPU, RAM, or GPU measurement was performed for this spike. Each live result is `UNKNOWN`, and each live row is `NOT RUN`. `fixtures.json` contains synthetic values only; it is not captured game data.

A later runtime snapshot found Dota 2 and two G-Maiden processes active. The local Node focused test was therefore deferred. No capture, OBS control, UI, audio, game, or native workload was started by this lane.

## Status vocabulary

- **PASS** — exact-candidate evidence meets the row's stated acceptance rule and has a reproducible receipt.
- **FAIL** — measured evidence violates the rule, or a disallowed/lost/stale source is treated as available.
- **SKIP** — the requested mode or prerequisite is unavailable. Record the reason; skipped cells do not count as acceptance.
- **NOT RUN** — the scenario was not attempted.

Keep raw observation, run metadata, and interpretation separate. Do not convert unknown or skipped coverage into a pass. Do not average failed, interrupted, or excluded runs out of the report.

## Live test plan

1. **Bind the candidate.** Record the source commit, application build hash, Windows build, Dota build, OBS version, GPU/driver, monitor arrangement, DPI, display mode, game resolution, HUD scale, and OBS scene/source settings. Store local evidence paths and hashes; exclude account, match, and player identifiers from shared evidence.
2. **Establish the DXGI baseline.** Run the existing DXGI minimap crop through the same CV model, thresholds, labels, and G-Signal path planned for the OBS comparison. Preserve the DXGI path as the MVP selection.
3. **Run OBS source-only comparisons sequentially.** Capture the same labeled game scenarios through OBS Virtual Camera, then through DXGI. Never leave two CV providers active in one accepted mode. Keep OBS recording active in the resource and end-to-end latency scenarios required by #109.
4. **Verify source admission and privacy.** Inspect the active OBS scene and process binding. Admit only a Dota `game_capture` scene. Reject display/desktop capture, webcam, unknown sources, mixed scenes, missing scene inventory, and non-Dota process bindings. Check that G-Maiden records no desktop/private-window pixels, microphone input without explicit consent, or non-local frame/data egress.
5. **Exercise geometry and lifecycle.** Use the required 1920×1080 16:9 target plus calibrated non-16:9 cases. Verify exact source-to-target active viewport and ROI pixels against the corresponding DXGI crop. Exercise borderless fullscreen, exclusive fullscreen, alt-tab/minimize/restore, resize/resolution changes, single/dual monitors, OBS stop/restart, camera unavailable, and lost/stale frames.
6. **Measure quality, safety, latency, and resources.** Use the existing MVP-006 labeling and sampling requirements. Measure full G-Signal T0-to-T3 latency with a live audible probe and report upstream frame age separately. Record per-process and combined G-Maiden + OBS CPU, Working Set, GPU/encoder use, and paired Dota FPS impact while recording is active.
7. **Decide by cell.** Mark unsupported or unmeasured cells `SKIP` or `NOT RUN`. Keep DXGI selected until the required cells pass; any source, geometry, freshness, quality, latency, resource, or privacy failure leaves OBS CV unavailable for MVP.

## Acceptance matrix

All results below are `UNKNOWN` because no live Windows/OBS/Dota measurement has run.

| Cell / measure | Evidence to collect | Acceptance rule | Status | Result |
| --- | --- | --- | --- | --- |
| Candidate and machine binding | Commit and build hashes; Windows / Dota / OBS versions; GPU and driver; display geometry, DPI, and game mode | Every receipt binds to the exact candidate and records the actual machine/configuration | NOT RUN | UNKNOWN |
| Source privacy and Dota binding | Active-scene source inventory, Dota process binding, local-only traffic evidence, no-microphone state | Only Dota game capture is admitted; desktop, webcam, mixed, unknown, and unverified sources fail closed; no unapproved egress | NOT RUN | UNKNOWN |
| Required 1080p geometry | 1920×1080, 16:9, primary display, 100% DPI, default bottom-left minimap; mapped ROI and paired DXGI/OBS frames | Active viewport and minimap ROI align exactly after calibration; no bar pixels enter the crop | NOT RUN | UNKNOWN |
| Non-16:9 geometry | Actual source and display dimensions, viewport bars, mapped ROI, calibration evidence | Every supported geometry has a calibrated transform; unsupported geometry reports unavailable/unknown coverage | NOT RUN | UNKNOWN |
| Borderless fullscreen | Per-session foreground state, output identity, frame freshness and CV result | Required MVP mode remains correctly bound to the selected Dota display; no stale frame is reported ready | NOT RUN | UNKNOWN |
| Exclusive fullscreen | Actual mode, source availability, output geometry and CV result | Pass only with direct evidence; otherwise mark unsupported and keep CV unavailable in that mode | NOT RUN | UNKNOWN |
| Alt-tab, minimize, and restore | State transitions, last receipt time, source status, recovery trace | Source loss or stale frames become unavailable; recovery does not reuse stale geometry or pixels | NOT RUN | UNKNOWN |
| Resize and resolution change | Before/after dimensions, active viewport, ROI transform, geometry generation | New geometry is revalidated before use; invalid or uncalibrated geometry fails closed | NOT RUN | UNKNOWN |
| Single and dual monitor | Display identity, desktop origin, selected output, geometry and source binding | No cross-display crop or stale display identity; each supported cell has its own evidence | NOT RUN | UNKNOWN |
| OBS / Virtual Camera lifecycle | Start, stop, restart, absent/busy camera, active scene change, frame sequence | No frame or invalid scene means unavailable; restore requires new validated frames and geometry | NOT RUN | UNKNOWN |
| Lost and stale frames | Frame ids, host monotonic receipt time, optional source timestamp and clock domain | Missing frame is unavailable; stale age uses host receipt time; never infer a source timestamp from receipt time | NOT RUN | UNKNOWN |
| Hero presence CV quality | Labeled episodes, class-level precision/recall, holdout split, confidence intervals and disagreements | MVP-006: precision ≥95%, recall ≥90%; at least 50 appearance episodes/class across at least 5 held-out matches, at least 20 whole held-out matches, report 95% CI | NOT RUN | UNKNOWN |
| Hero identity CV quality | Per-certified-class labels, confusion evidence, holdout split and confidence intervals | MVP-006: per-class precision ≥95% and recall ≥85%; pooled score cannot replace class-level evidence | NOT RUN | UNKNOWN |
| G-Signal end-to-end latency | T0 acquisition-due/GSI-arrival, T1 decision, T2 audio admission, T3 loopback audible onset; sample list and profile | MVP-006: p50 ≤250 ms and every measured sample ≤300 ms; at least 300 samples/scenario/profile plus live audible probe | NOT RUN | UNKNOWN |
| G-Maiden CPU and memory | One-second CPU samples and full aggregate Working Set for all app processes | MVP-006: each normalized CPU sample ≤10%; peak aggregate Working Set ≤900,000,000 bytes with required host/child/provider accounting | NOT RUN | UNKNOWN |
| OBS and combined resources | OBS CPU/RAM, GPU and encoder utilization; G-Maiden values; combined totals while recording | Record each process and combined values. No separate OBS threshold is stated in this contract; report measured values without implying the G-Maiden cap covers OBS | NOT RUN | UNKNOWN |
| Dota FPS impact | Paired same-device/same-segment/settings runs with OBS recording active; Dota frame-time/FPS evidence | MVP-006: ≤3% impact per paired run, at least 3 pairs ×60 s; preserve each pair and exclusions | NOT RUN | UNKNOWN |
| Single-provider operation and rollback | Provider selection trace, frame ids, failure transitions | Accepted mode has one active CV provider. OBS failure keeps CV unavailable and leaves the MVP DXGI path selectable | NOT RUN | UNKNOWN |

## Synthetic fixture suite

`contract.test.mjs` defines Node `node:test` cases for source eligibility, desktop/webcam/unknown rejection, centered letterbox/pillarbox mapping, exact ROI transforms, timestamp provenance, and lost/stale frame behavior. The fixture file declares `syntheticOnly: true`.

- Focused command: `node --test tools/obs-cv-spike/contract.test.mjs`
- Local result: **NOT RUN**, deferred after the later active-process snapshot.
- Hosted result: the existing workflows do not invoke this new path, so CI does not validate the focused suite. Report general exact-SHA CI gates separately.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 2026-11-02 | Define the live Windows / OBS / Dota measurement plan and leave all runtime results unqualified. |
