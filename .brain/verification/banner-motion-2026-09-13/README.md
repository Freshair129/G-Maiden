---
title: "Maiden motion renderer comparison — evidence"
doc_id: "maiden-motion-renderer-evidence"
version: "0.1.0"
status: "active"
updated: "2026-09-13"
owner: "RWANG"
---

# Four-method motion prototype

[Interactive comparison](index.html) · [Results](report.html) · [Raw trials](benchmark.json)
· [Asset manifest](asset-manifest.json) · [Approved scope](../../../docs/operations/banner-motion-comparison.md)

Original procedural ice crest authored and rendered with Blender 4.5.0. No imported game art,
real hero/player data, credentials or account/provider actions. This is a small motion study,
not final AAA art direction or a production Overlay replacement.

## Deliverables

- `assets/maiden-crest.blend`: original geometry/materials, camera, lights and 90-frame animation.
- `assets/frames/crest-*.png`: 640×320 RGBA source, 30 fps / 3 seconds.
- Layers: four isolated renders (`core`, `wings`, `ring`, `shards`), CSS transform/opacity.
- Sprite: three 3840×1600 atlases, 30 frames each; Canvas 2D playback.
- Video: WebM VP9 alpha from those same 90 frames, CRF 24, no audio.
  A paused/scrubbed frame is copied from the video decoder into a temporary canvas because
  the paused video compositor may keep the previous frame. The canvas is removed and released
  before playback; active video measurements do not include a canvas draw loop.
- Realtime: the Blender mesh exported to JSON and drawn with four WebGL batches.
  Its simple directional/specular shader does not reproduce Eevee's materials and lights exactly.
- `index.html`, `lab.js`, `lab.css`: one active renderer, replay, scrub and three backdrops.
- `NativeHost.cs`: isolated .NET/WinForms WebView2 host. It has no G-Maiden IPC/auth/GSI hooks.

## Measurement definitions

`benchmark.json` contains every accepted trial and raw half-second samples. Each runtime has
three rounds, with rotated method order. Every trial launches a new process and profile;
loads only its renderer; warms for 3 s; samples loaded/static idle for 3 s; then loops for 9 s.
The two accepted first trials were retained when the range-serving defect was fixed; failed
attempts are preserved separately and excluded from summaries.
After correcting paused video presentation, all six video measurements were replaced;
the other 18 accepted trials were retained. The final one-shot hide rule affects end cleanup
only, not the continuous-loop workload, and is checked separately for all eight combinations.

- Hardware: Intel i7-14700KF, 28 logical processors, RTX 5060 Ti, approximately 32 GB RAM.
- Chrome uses the installed browser; WebView2 uses the installed runtime. `info.userAgent`
  and each ignored profile's `native-version.txt` identify versions.
- **Focus emulation is enabled in both runtimes.** Windows occlusion otherwise suspends rAF
  on this interactive desktop. This is a controlled active-renderer test, not physical-window
  visibility or click-through acceptance.
- CPU: summed user+kernel time deltas of the owned process tree divided by wall time and
  28 logical processors. A single fully busy logical core would be approximately 3.57%.
- Private MiB: sum of Windows process private bytes; includes runtime/renderer/page,
  and is not asset-only RAM. Working-set sum is also recorded but can double-count shared pages.
- GPU: Windows PDH `GPU Engine(*)\\Utilization Percentage`, filtered to owned process ids;
  grouped/summed by engine type. `3D` is not total device utilization or dedicated VRAM.
  Missing counter data remains unavailable. Device memory was not measured.
- rAF p95 is the page's frame scheduling interval, not presented game FPS. The source clip
  is 30 fps, even when the page's rAF runs near 60 Hz. Video frame/drop counters are separate.
- Three rounds describe this machine/workload; close CPU differences are not proof of
  universal superiority. Background system CPU is retained in raw samples.

## Verification boundaries

Check screenshots for all four renderers on dark/light/checker backdrops in both runtimes.
Canvas readback checks alpha at a corner and non-empty center artwork; one-shot animation
must stop; repeated playback must progress without JS errors. RGB/alpha compression may
produce different antialiasing for WebM; no pixel-identical quality claim is made.

**Not tested:** actual Tauri overlay compositor/click-through behavior, Dota FPS impact,
GSI-to-voice latency, full application RAM budget, production accounts or installed release.
No app code, production dependency, version, release tag, deployment or commit changed here.
Existing unrelated UI remediation remains in the working tree.

## Reproduce

Use the bundled Python interpreter listed by Codex workspace dependencies. Runtime tools
are intentionally ignored by git and live under `runtime/`.

1. Official portable Blender 4.5.0 zip SHA256:
   `2ee75e9466d293a784fdf020f60fe1309c1e0610ecf73c64f1fc09b01e5eec56`.
   The digest was checked against Blender's published `.sha256` before execution.
2. Run Blender `--background --factory-startup --python build_scene.py`.
3. Run `package_assets.py` with Pillow available under `runtime/python`.
   The encoder is the existing FormatFactory FFmpeg build; its exact build is in `encode.log`.
4. Run `serve.py` (127.0.0.1:8768 only). Do not substitute Python's basic server: WebM seeking
   requires its HTTP Range implementation. `runtime/` is blocked from web access.
5. Compile `NativeHost.cs` with the system .NET Framework compiler and the Microsoft WebView2
   SDK assemblies; the benchmark expects `runtime/MaidenMotionBench.exe`.
6. Run `benchmark.py`; it is bounded to 1100 s and owns/closes only its child processes.
   `--resume` retains already accepted trials after an unrelated harness failure; never reuse
   accepted data when the animation/renderer or timing conditions have changed.
7. Run `make_report.py` to regenerate tables and source hashes.

## Invalid runs and gates

[RCA](../../rca/2026-09-13-motion-prototype-harness.md) records document navigation race,
occlusion, negative first-frame index and missing HTTP Range support. Discarded JSON files
are not performance evidence. The initial paused-video screenshots are separately checked
against presented playback, not accepted solely from a successful seek event.

Doc-graph: 215 unit tests passed; wrapper passed with 14 existing checklist-covered strict
errors and zero uncovered errors. CodeDoc model preflight fails because the required Mellum
model is not installed; the log is **INDETERMINATE**, not semantic alignment success.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-13 | Original assets, four prototypes, controlled benchmark protocol and evidence boundaries. |
