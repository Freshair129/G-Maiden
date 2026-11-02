---
title: "Native GPU color conversion"
doc_id: "2026-11-02-native-gpu-color"
status: active
version: "0.1.1"
updated: "2026-11-02"
owner: "G-Maiden"
---
# Native GPU Color Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move only GANN I420 color/alpha conversion to D3D11 while preserving the current native presentation loop and audio clock.

**Architecture:** The existing decoder sends bounded owned Y/U/V/alpha planes through its existing three-frame channel. A reusable D3D11 pixel shader performs the original integer conversion, clamping and alpha premultiplication into the current swap-chain buffer. Compilation errors fail preparation; no CPU playback fallback is introduced.

**Tech Stack:** Rust, libvpx, D3D11 Shader Model 5, existing WASAPI/DirectComposition.

**Spec:** Owner explicitly selected "move only color conversion to GPU and test the existing loop" in this chat on 2026-11-02 after the five-event preview-reserve batch failed three timings. This plan implements that selected scope; independently scheduled composition was considered and not selected.

## Global Constraints

- Keep verified GANN identity, pairing, source PTS/duration, audio ownership, Stop/fade/session fences and the presentation loop unchanged.
- Keep the approved 5 FPS mirror cap during actual playback, restoration afterward, and continuous DXGI/CV processing.
- Whole-app CPU <=10% per normalized 1s sample; aggregate peak RAM <=900,000,000 bytes.
- Every expected frame and GANN audio content must pass actual app acceptance before merge/tag/release. The owner subsequently accepted approximately 400–500ms timing for MVP; use a 500ms maximum duration/timestamp deviation. Source/unit tests remain separate evidence.
- Match Start is an owner-waived MVP limitation, kept separate from the mandatory four-event acceptance and minimap/resource requirements.
- The announcer playback allowance does not change the G-Signal acquisition-to-audible latency requirement.
- Preserve unrelated Store/Party/Friends files and all user work. Evidence stays local.

## Review Focus

- Exact integer color/clamp/premultiplication parity, including transparent alpha and odd dimensions/strides.
- Validate plane lengths before unsafe GPU uploads; keep allocations bounded by admitted video dimensions.
- Release swap-chain render-target bindings before Present; no stale shader resources on reuse.
- Diagnostic frame indices must remain distinguishable while normal clips have no marker.
- GPU availability/compile errors fail closed before admission; no changed event mapping or CPU fallback.

## Tasks

- [ ] Add failing planar/actual GPU parity tests; observe failure before implementation.
- [ ] Add `Planar` frames in `gann_native_decode.rs`, row-copy planes with stride checks, retain CPU conversion only as a test reference.
- [ ] Add `gann_native_gpu.rs` plus HLSL shader and hardware tests: reusable textures/shaders, checked uploads, exact integer conversion and optional diagnostic marker.
- [ ] Integrate conversion at the existing upload point in `gann_native_windows.rs`; preserve queue size, Present, audio clock and all timing decisions.
- [ ] Run GPU readback parity for synthetic edge cases, VP8/VP9 alpha fixtures and all 2,022 actual GANN frames; request focused review.
- [ ] Run bounded required checks/native build, verify fresh runtime identity/ONNX/VRZO, then actual five-event desktop/endpoint/minimap/resource tests and repeat if successful.
- [ ] Only after required acceptance, continue PR/main CI/tag/release and signed old-version update validation.

## Changelog

| Version | Date | Changes |
| --- | --- | --- |
| 0.1.0 | 2026-11-02 | Record owner-selected GPU conversion scope and verification steps. |
| 0.1.1 | 2026-11-02 | Record owner-revised 500ms MVP timing gate; preserve frame/audio content and resource gates. |
