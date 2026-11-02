---
title: "CR-040/C OBS CV source compatibility proposal"
doc_id: "cr040-obs-cv-compatibility-proposal"
status: "draft"
version: "0.1.2"
updated: "2026-11-02"
owner: "G-Maiden"
---

# CR-040/C OBS CV source compatibility proposal

## Scope and evidence boundary

This file proposes a review boundary for a future adapter. It does not add a Rust provider, connect to OBS, capture a frame, or change the selected runtime backend. The accompanying JavaScript contract and JSON fixtures are deterministic synthetic logic; they contain no Dota or OBS frame bytes.

The reviewed source is the task branch's exact base, `a9d7a47339fb5dc09ded3a62c85bce32e61384b5`.

## Current source contract

- `src-tauri/src/capture_frame.rs` defines screen-space `CaptureRect` / `CaptureRoi`, `FrameCaptureMetadata`, `CapturedRoi`, and `FrameBundle`. Crops are tightly packed BGRA8. Metadata carries a local frame id, session epoch, acquisition time, display identity, and screen dimensions. `CaptureBackend` currently lists `Dxgi` and `Gdi`.
- `src-tauri/src/dxgi.rs` implements `DxgiCapture::acquire_regions`: it validates ROIs against the selected display and copies requested regions from one acquired frame. A GDI recovery route crops requested ROIs from one full-frame acquisition. The capture clock is process monotonic time; source presentation timestamps are not exposed in this bundle.
- `src-tauri/src/capture.rs` directly constructs `DxgiCapture`, checks the Dota monitor and foreground state, and submits minimap / HUD ROIs to the existing CV path. Lost or stale frames suspend observation and may trigger capture recovery. The current loop has no shared capture-provider trait.
- `src-tauri/src/cv/mod.rs` consumes BGRA8 `Frame` pixels. `src-tauri/src/cv/region.rs` defines a minimap ROI in physical screen pixels and anchors the default square to the bottom-left of the display. Its default 1080p square is 292 px; per-user precision belongs to calibration.
- `src-tauri/src/minimap_preview.rs` and `minimap_preview_wire.rs` use display geometry, session/generation fences, receipt-age checks, and explicit unavailable/stale preview states. Preview timing fields are scoped to that preview protocol.

These are source facts. They do not establish OBS compatibility, game capture privacy, image quality, timing, resource use, or live behavior.

## Candidate adapter boundary for later review

A future adapter should first produce a bounded observation record, before any pixel becomes eligible for CV:

```text
source:
  transport = obs_virtual_camera
  selected source type = game_capture
  target process = dota2.exe
  visible active-scene source types = [game_capture, ...]
frame:
  local monotonically increasing frame id
  source dimensions
  receipt time from the G-Maiden monotonic clock
  optional source timestamp with an explicit clock-domain label
  pixels = tightly packed BGRA8 only after validation
```

Eligibility requires an OBS Virtual Camera transport, a Dota `game_capture` source, and an inspected active scene containing only game-capture sources. Desktop capture, webcam capture, mixed scenes, missing scene inventory, unknown source types, and non-Dota process bindings remain unavailable. The synthetic classifier in `contract.mjs` models this fail-closed gate. It cannot inspect OBS configuration or verify frame contents.

Use the host monotonic receipt time to check frame freshness. Preserve a provider timestamp only when the source supplies it and its clock domain is recorded. Leave it absent otherwise; do not copy receipt time into a field that claims source presentation time. Production clock mapping remains an integration decision.

Map the existing physical-screen ROI into the video frame through a measured active viewport. Preserve aspect ratio, report the centered letterbox or pillarbox bounds, and reject any ROI that intersects a bar or falls outside the active image. The helper models a centered contain transform only; it does not detect OBS scene crop, offsets, or content bounds. Those must be measured or validated from source configuration before any integration. It uses conservative outward pixel rounding so the mapped integer crop contains the full requested target ROI.

After source and geometry admission, a future adapter can be reviewed for a BGRA8 crop payload compatible with `CapturedRoi`. The current `CaptureBackend` enum has no OBS value, and the current capture loop has no provider trait. A later integration must settle backend provenance and timestamp representation without conflating local receipt time with source time. This proposal makes no source edit to those types.

## Runtime preservation rule

Keep DXGI selected for MVP until a paired live comparison clears source privacy, CV quality, signal latency, Dota FPS impact, and resource gates. Accepted OBS-provider mode must select one CV provider at a time. A rejected, lost, stale, or uncalibrated OBS frame leaves CV unavailable; it never produces a safe-state assertion.

## Synthetic contract files

- `fixtures.json` contains synthetic source classifications and geometry only.
- `contract.test.mjs` covers source eligibility, geometry mapping, timestamp provenance, and fail-closed freshness.
- `acceptance-matrix.md` defines the future Windows / OBS / Dota measurement plan. All live rows remain `NOT RUN` and all runtime results remain `UNKNOWN`.

The focused command is `node --test tools/obs-cv-spike/contract.test.mjs`. Author-lane focused-test status for this candidate is `NOT RUN`. Focused-test commands and receipts are recorded in the PR's current exact-SHA verification. Each receipt qualifies only the SHA it names. Hosted CI does not invoke this file.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 2026-11-02 | Record source review and a non-binding adapter boundary for the isolated OBS CV spike. |
| 0.1.1 | 2026-11-02 | Distinguish author-lane test status from the prior-head independent Terra receipt. |
| 0.1.2 | 2026-11-02 | Clarify exact-SHA focused-test receipts and hosted CI coverage. |
