# RCA - CPU budget overrun observation

## Symptom

- Latest observed CPU load reached `20%+` in Windows Task Manager, while the product spec requires background CPU to stay at or below `2.5%`.

## Evidence

- `docs/product/software-requirements-specification.md` defines background CPU budget as `<= 2.5%`.
- The latest over-budget observation came from Windows Task Manager directly, not just the in-app `resource-stats` display.
- `src-tauri/src/governor.rs` computes `over_budget = ram_mb > 400.0 || cpu_pct > 2.5`.
- `src-tauri/src/governor.rs` samples CPU with a 1-second `TotalProcessorTime` delta, but only polls every `10` seconds (`POLL_INTERVAL_S = 10`).
- `src-tauri/src/capture.rs` reacts to `cpu_throttle()` only by stretching the capture cadence to `500ms`; it does not disable detector work, minimap debug emission, control-window work, or other non-capture contributors.
- `tests/perf/src/bin/perf_cpu_tree.rs` now measures the full process tree the same way Windows Task Manager groups `g-maiden.exe` and its child processes.
- Before the overlay patches, the grouped harness saw `mean 107.90% / p95 126.15% / peak 127.28%`, with `msedgewebview2.exe` dominating the tree.
- After gating `minimap-cv` updates and switching governor sampling to native Win32 APIs, the visible app improved to `mean 0.39-0.46%`, but still hit `peak 9.23-12.31%`, again almost entirely in `msedgewebview2.exe`.
- When the same runtime was left running and the overlay was hidden via the existing global shortcut (`Ctrl+Alt+S`), the grouped harness immediately dropped to `mean 0.00% / peak 0.00%` for 20 seconds.
- When the control window was hidden to tray while leaving the app process alive, the grouped harness also dropped under spec with the overlay still running: `mean 0.08% / peak 1.54%`.

## Root Cause

The remaining budget violation is not coming from DXGI capture or the Rust hot path. It is coming from the visible WebView2 surfaces when both gameplay windows stay active together:

1. DXGI capture did reduce the old capture-side cost, but it does not eliminate WebView2/DWM composition cost for a transparent always-on-top overlay.
2. Task Manager is grouping the real child-process tree, and that tree shows the spikes in `msedgewebview2.exe`, not `g-maiden.exe` or `gpu-feeder.exe`.
3. Hiding either visible surface brings the process tree back under budget, which isolates the culprit to multi-window WebView2 rendering/mirroring rather than backend capture/audio/signal work.
4. The old governor measurement path did add noise, but replacing it with native Win32 sampling proved that measurement noise was only a secondary issue; the root over-budget path is still frontend rendering/compositing when both windows are active.

## Why The Issue Escaped Detection

- The repo already encodes the 2.5% limit as a hard NFR, but there is no current perf gate in local validation proving that the whole app stays under that budget during live capture and UI activity.
- Existing latency and correctness harnesses focus on CV/signal behavior, not sustained CPU-budget compliance of the full WebView2 process tree.
- Earlier profiling focused on the backend process and did not isolate visible-overlay-on versus overlay-hidden behavior, so the compositor cost stayed mixed together with capture/governor noise.

## Proposed Prevention

- Add a dedicated perf issue / harness for sustained CPU validation on the real app path, not just CV compute slices.
- Keep native process CPU sampling on Windows so governor telemetry matches Task Manager more closely.
- Add an explicit "overlay visible" CPU scenario to validation, because the app can pass the budget with the overlay hidden while still failing it in the real gameplay mode.
- Reduce overlay compositing cost next: prefer opaque/shadow styling over blur, then consider further visual throttling or an architecture change if transparent WebView2 still exceeds the 2.5% peak budget.
