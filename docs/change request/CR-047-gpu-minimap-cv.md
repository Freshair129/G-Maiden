---
title: "CR-047 — GPU minimap CV: measurement and architecture options"
doc_id: "CR-047-gpu-minimap-cv"
status: "draft"
approved_by: ""
version: "0.1.0"
updated: "2026-11-08"
owner: "Boss"
complexity: "C-3"
risk: "HIGH"
related_docs: ["mvp-decisions", "software-requirements-specification", "ADR-13-dxgi-capture-migration", "CR-046-demo-mvp-announcer-gank-slice", "GIT-WORKTREE-POLICY"]
---

# CR-047: GPU minimap CV

> **Draft, no approval.** This document proposes an investigation and staged change; it authorizes no production implementation, dependency, budget increase, ADR, release or live test. Codex is the sole writer of the assigned `gm-docs-cr047-gpu-cv` worktree; Claude orchestrates/reviews and independently reruns checks. **The native CPU timing benchmark is BLOCKED by missing build-resource qualification (§3.3); no inference timing result is claimed.** The completed offline measurement is the artifact inventory, not a substitute for the requested CPU profile.

## 1. Problem, authority and scope

Owner direction, 2026-11-08: **“Use the GPU to read the map.”** The assignment reports live minimap throughput around one frame/second, approximately 1,345 classifier calls per 10 frames, and `classifier_ms` of 1,100–4,000 per five-second reporting interval while Dota and Blender were loaded. These are **owner-supplied observations, not independently measured by this draft**. The quoted intervals are not paired raw receipts: do not divide one interval's milliseconds by another interval's call count to invent milliseconds/call. Missing positions, missing roster and late warnings are symptoms; faster inference alone does not prove their complete cause or repair.

[[mvp-decisions]] wins over historical statements in [[ADR-13-dxgi-capture-migration]], AGENTS/CLAUDE and older performance comments. Preserve the SRS §5 and MVP-006 acceptance contract:

| Contract | Unchanged requirement |
| --- | --- |
| G-Signal | Pure Rust decision/audio-admission path; no cloud, SLM, WebView or mandatory GPU-runtime dependency. T3−T0 p50 ≤250 ms and **every measured sample ≤300 ms**. T0 precedes scheduling/acquisition/inference waits. Report observation age separately. |
| CPU | Aggregate owned and used external process group, normalized by logical capacity; **every one-second sample ≤10%**. The inspected governor starts with a 6% Job cap and admits 8% operating quota; these are implementation facts, not new budgets. |
| RAM | Aggregate peak **full Working Set ≤900,000,000 bytes**, including host, WebView2, feeder, Voice/SLM and any used model processes. Shared resident pages are counted under the existing method. |
| Dota | FPS drop **≤3% for each paired run**; no assumed spare GPU capacity. |
| Privacy | All crops, tensors, detections, identity, diagnostics and timing receipts remain local. No extension to AI or G-Party allowlists. |
| Coverage | Unknown/late/unavailable observations stay unknown; never become “safe,” confirmed visibility, or a fabricated missing roster. |

**This branch:** draft CR, measurement-only ignored test, offline inventory/evidence and required generated documentation. No production behavior or dependencies change. No ADR is written. No runtime is launched; no other worktree/app is changed or stopped. No push, tag, merge, rebase, force or amend.

**Future implementation boundary:** classifier/preprocessing/capture handoff only after owner selection and an approved architecture follow-up. GANN warning-media readiness and CR-046 work remain separate dependencies; acceleration cannot repair an unmapped critical audio pack.

## 2. Inspected implementation and evidence baseline

Source baseline: `6a26d628992f0267ef4d848d92f2050bdbfa3c0f`, branch `docs/cr047-gpu-minimap-cv`; HEAD equaled the **cached** `origin/main` ref at entry. No Git fetch or package download was performed; external API/package facts below were checked against official web documentation. The GANN comparison reads Git object `32e6a17f5fe6741e3267eb90346f1b2de42e72a0`, not another checkout.

| Source inspected | Observed behavior and consequence |
| --- | --- |
| `src-tauri/src/cv/prefilter.rs` | BGRA → normalized RGB; team-ring proximity and brightness averaged into icon-sized cells. Gate is `max(0.18 × peak, 1.5 × mean)`; each passing cell emits 3×3 offsets, then coordinate sort/dedup. Candidates are patch hypotheses, not hero count. A flat frame is rejected. |
| `src-tauri/src/cv/detector.rs` | `tract-onnx` CPU model; fixed `[1,3,32,32]` float32 RGB input. Every candidate is bilinear resized/normalized, copied into a bit-vector key, then looked up in the exact-input cache. Misses run the model individually; softmax rejects `__negative__` or confidence <0.72; NMS follows inference. NMS currently saves no model calls. |
| `src-tauri/src/cv/patch_cache.rs` | Exact normalized-input bits, collision-safe equality; current and previous frame maps, up to 512 entries each. Successful classifications, including negative results, may be reused. Failed inference is retried. **Cache hits still pay preprocessing, key copy/hash and equality.** Only exact input reuse is implemented, not optical flow or approximate temporal reuse. |
| `src-tauri/src/capture.rs::process_frame` | Fingerprints the whole crop before prefilter. Identical admitted crops do not count as fresh observations. `classifier_ms` brackets the entire `Detector::detect`, therefore includes resize/key/cache/model/softmax/NMS, but excludes prefilter and capture. A late inference is discarded without consuming the crop. |
| `src-tauri/src/capture_schedule.rs` | Acquisition wait 32 ms; decision must finish before 200 ms. Cooperative recovery `min(4 × active_ms,100 ms)` is charged to the **next** cycle's unchanged T0; 500 ms is a freshness watchdog, not an acceptable critical polling period. Do not reuse historical 250/125/500 ms cadence prose as current performance evidence. |
| `cv/identity.rs`, `roster.rs`, `draft_detector.rs`, `draft_region.rs`, `hero_hud.rs`, `selected_target.rs` | ONNX label indices are not Valve hero IDs. Portrait NCC and stable roster votes are separate evidence; unknown team/roster never falls back to all classifier labels. Current filtering by allowed enemy labels happens after minimap classification. Faster minimap inference neither creates portrait references nor certifies a roster. |
| `cv/region.rs`, `cv/mod.rs` | Default 1080p ROI is 292×292 with 23-pixel icon; `Frame` stores CPU BGRA bytes. The existing latency fixture is 256×256/20-pixel synthetic data, so its geometry is diagnostic rather than the full target matrix. |
| `src-tauri/src/dxgi.rs` | Acquired resource is a D3D11 texture. `copy_rect` already crops on GPU with `CopySubresourceRegion`, then synchronously maps a small staging texture and copies rows into a CPU `Vec`. GPU proposals should retain GPU residency beyond that boundary, not claim current capture is full-frame CPU cropping. Current code can report a **GDI fallback** after DXGI access loss; that path does not provide the promised GPU texture. Preserve actual backend/coverage reporting. |
| `src-tauri/src/governor.rs` | CPU/aggregate RAM pressure and unavailable accounting throttle capture; startup and steady-state quotas differ. GPU load/VRAM telemetry is informational and does not enforce a GPU-time or Dota-FPS budget. |
| GANN commit `32e6a17f`: `gann_native_gpu.rs`, `gann_native_color.hlsl`, `gann_native_windows.rs`, `gann_native_pixels.rs` | Reuses D3D11 textures/views, uploads Y/U/V/A planes, uses **vertex + pixel shaders** and a full-screen triangle for color/alpha conversion, with CPU oracle tests. It is **not an existing compute/CNN engine**. Reuse device/resource lifetime, bounded allocation and oracle-testing patterns; do not reuse GANN mutable context/queues or interrupt active playback. |

Historical ADR-13 claims about CPU savings, no GPU contention, or GSI-only gank-risk substitution are not acceptance evidence for this change. Its primary DXGI/Lite direction remains; the current MVP requires honest unavailable coverage.

## 3. Offline evidence and reproducible CPU-profile plan

### 3.1 Completed artifact measurement

Command (repository root, Python standard library only; no installation or inference):

```powershell
python tests/benches/cr047_inventory.py
```

Recorded output: [cr047-inventory.json](../../tests/benches/cr047-inventory.json). The script reads the checked-in ONNX protobuf and hashes the existing fixtures. All values in the following table are **measured-offline artifact properties**, not runtime timing/RAM:

| Property | Result |
| --- | --- |
| ONNX file | 129,932 bytes; SHA-256 `706bd9d5edad0242bc24dbb2289e0c3a8609a48a1c5faf222f847a19641e4121` |
| Input / output | `[1,3,32,32]` / `[1,128]`; opset 13 |
| Label file | 128 labels; 2,042 bytes; SHA-256 `df83d7adb85d36e278a3cfe622102781a6e921f11d60a64b5b3d7e7d9100e0ca` |
| Operators | 3 Conv, 3 Relu, 3 MaxPool, 1 GlobalAveragePool, 1 Flatten, 1 Gemm |
| Initializers | 127,616 raw float32 bytes; BN is absent from the exported graph (training source uses BN). |

The model is small on disk; this says nothing about tract/ORT execution-plan allocations, native DLL residency, GPU driver allocations or whole-app RAM.

### 3.2 Deterministic current-path harness

[cr047_cv_spike.rs](../../tests/benches/cr047_cv_spike.rs) is a `#[ignore]` test included through a `#[cfg(test)]` declaration in `detector.rs`. It directly calls the existing private preprocessing, model, cache, softmax and NMS functions; production compilation excludes the spike. There are no new dependencies or lockfile changes.

The harness uses the existing `capture.rs::tests::synthetic_frame` construction with zero/five blips, a fifteen-blip **synthetic stress extension**, and a deterministic composite of five existing `assets/minimap-icons` PNGs. Composites are not real minimap frames or labeled accuracy evidence. Each case has ten ordered frames, exact repeats and deterministic blue-channel changes, cache enabled/disabled, and prefilter threshold 0.18/0.36. Five model warmups are separate from measured startup. The changed sequence is an explicit stress perturbation, not claimed to model live animation statistics.

Per-frame JSON reports candidate count, actual model invocations, exact cache hits, prefilter time, crop/resize/normalize time, model time and ms/call, softmax, NMS and residual key/cache overhead. It also counts the same deduplicated grid-offset universe with gating removed: the candidate reduction is count evidence; avoided model milliseconds remain an extrapolation unless that ungated path is separately timed. Calls returning errors fail the test; missing models do not silently pass. After every timed frame, an untimed comparison checks bit-exact final detections against production `Detector::detect`. Timestamp overhead remains in the measurement. Uncached ablation still constructs keys, so it isolates model-call savings without pretending to be an optimized alternative implementation.

Repeated-frame tests deliberately exercise detector cache behavior in isolation. **Production's whole-crop freshness gate would skip identical admitted crops**; warm repeated-frame cache rates must never be advertised as additional live savings. Changed-frame cases and later real sequences are required.

Run only after §3.3 is resolved, from `src-tauri`, with the assigned process-scoped `CARGO_TARGET_DIR`, `VCPKG_ROOT` and `VCPKG_DEFAULT_TRIPLET=x64-windows-static-md`. The orchestrator must hold the exclusive target-lane lock through all children and impose a 900-second ceiling on the suite:

```text
cargo test --release --lib --offline --locked cv::detector::cr047_spike::cr047_cpu_profile -- --ignored --exact --nocapture --test-threads=1
```

Retain complete stdout/stderr, command/environment/toolchain/CPU/OS identity, source/model/fixture hashes, actual logical CPU count, concurrent-load description and admission receipt. Capture `CR047_JSON` records, aggregate per case (cold frame separately; median/p95/max, total calls, weighted model ms/call), and retain outliers. Fix case ordering for replay; for performance comparisons also rerun in reversed order to expose thermal/load bias. A separately admitted serial release build is required; debug results are not comparable. No app, capture, audio device or live game is needed for this test.

| Requested metric | Current evidence status |
| --- | --- |
| Candidates/frame; model calls/frame | **NOT MEASURED in native harness**; owner report is separate. |
| Native preprocessing vs model ms; ms/call | **NOT MEASURED**; no estimate is labeled a result. |
| Prefilter/cache savings under fixture sequences | **NOT MEASURED**; harness has paired ablations, pending execution. |
| CPU %, GPU time, aggregate WS, Dota FPS, T3−T0 | **NOT MEASURED**; a detector-only stopwatch does not measure these. |

### 3.3 Build admission blocker and resume condition

The assigned Cargo lane did not exist at inspection. No matching owned build artifact or qualified per-volume floor/peak-write/concurrent-growth record was supplied or found in the scoped records. There were two visible Cargo processes (ownership/command lines unresolved); neither was stopped. WMI process/volume inspection returned access denied; .NET logical-volume free-space reads succeeded, but **free bytes do not establish physical mapping, resource ownership or a qualified floor**.

Potential writes requiring qualification are the F: target/lock/log outputs; C: Cargo/rustup metadata, dependency/build-script caches, vcpkg boundary, compiler temporary files and OS/runtime growth; and D: Tauri-generated source/schema artifacts plus worktree/Git/document output. `--offline --locked` prevents neither all cache metadata writes nor build-script writes. This record deliberately does not invent cold-build sizes or operational floors.

Under host lifecycle policy §J and the assigned AGENTS resource constraints, Cargo was **not invoked**. Resume when Claude/owner supplies the existing qualified admission basis for the exact release test command, resolves effective physical paths and active consumers, bounds per-volume peak writes and concurrent growth, and obtains the owned lane lock; recheck immediately before execution. If dependencies/toolchain are not cached, stop and report the missing prerequisite under this task's no-download rule. Keep implementation choice **BLOCKED_BY_DECISION**, and native CPU measurement **BLOCKED_BY_DEPENDENCY** until that evidence and the resulting timings exist.

## 4. Cost model and estimate discipline

Let `N` be candidates after prefilter, `H` exact patch hits, `M=N−H` calls, `P` preprocessing ms/candidate, `I` model ms/call, `K` key/cache cost, `F` prefilter cost and `Q` postprocessing. Then the serial detector path is approximately:

`Tcpu = F + N×P + K + M×I + Q`.

**Estimated algebra, not measured savings:** at the owner's illustrative `N≈130`, reducing actual misses from 130 to 32 removes 98/130 = **75.4% of model invocations**, provided accuracy is preserved. A 50% exact-hit rate halves model calls, not total frame time. Perfect preprocessing offload saves at most the measured `N×P` fraction, before GPU scheduling/copy/readback costs. Amdahl's law applies; a model-dominated profile would rule out preprocessing-only as a sufficient fix.

Batching 130 samples changes 130 API invocations into one invocation, **not** 130 CNN evaluations into one sample's arithmetic. Current model and runtime input fact both fix batch=1. A batched path needs an explicitly validated shape/export/plan change, ordering and numerical-parity checks; changing only tensor allocation is insufficient. Dynamic dimensions can add startup and memory variability; prefer a bounded prebuilt batch-size policy with masked/padded rows only after proving output mapping. Do not wait to collect another frame to fill a batch.

**Estimated allocation arithmetic** (float32, excluding allocator/driver/plan overhead): one input is `3×32×32×4 = 12,288` bytes; batch 130 input is **1,597,440 bytes**; its 128-class output is **66,560 bytes**. First Conv activation at batch 130 is `130×16×32×32×4 = 8,519,680` bytes. Exact cache's two-map tensor payload bound is `2×512×3×32×32×4 = 12,582,912` bytes, before map/entry overhead. A 292×292 BGRA ROI is **341,056 bytes**. GPU preprocessing followed by CPU inference can read back more tensor bytes than today's small BGRA crop; there is no automatic transfer saving.

The following ranges are **unvalidated planning estimates/experiment targets**, chosen to test whether a bounded CV slice can fit below the existing 200 ms decision admission. They are not benchmark predictions or confidence intervals. They assume one frame, around 130 candidate hypotheses before gating, warm state, bounded buffers and the reference tier; exact CPU/GPU models and driver are still required. Startup, queue wait and acquisition are additional and must appear in end-to-end receipts.

| Option | Estimated warm CV compute/frame | Estimated incremental CV CPU at 8 frames/s on 12 logical CPUs | Estimated GPU work/frame | Estimated RAM delta vs current path |
| --- | --- | --- | --- | --- |
| A: ORT + DirectML batched model/preprocessing | 5–30 ms CPU+GPU completion target, excluding contended queue wait | 3–15 CPU-ms/frame → 0.2–1.0 percentage points, assuming bounded threads/no spinning | 1–8 ms target, not a measured GPU budget | +20–100 MB planning allowance for native/session/host buffers; actual unknown, GPU allocations tracked separately |
| B1: D3D11 preprocessing + batched tract CPU | `Tcpu − measured preprocessing savings + batch change + GPU/readback cost`; 20–100 ms experiment target only if CPU batching/gating helps | 15–80 CPU-ms/frame → 1.0–5.3 points | 0.1–2 ms preprocessing/copy target | +2–25 MB allowance; batching peak and readback buffers can exceed it |
| B2: D3D11 preprocessing + custom HLSL CNN | 5–25 ms completion target | 2–12 CPU-ms/frame → 0.13–0.8 points | 1–6 ms target; unoptimized kernels may be slower than A | +2–30 MB host allowance; GPU activation/scratch/weights require separate accounting |
| C: CPU gating/exact reuse/batching | 20–100 ms experiment target after successful reduction; unchanged path may miss the deadline | 20–100 CPU-ms/frame → 1.3–6.7 points | No added compute shader; current capture/mirror/GANN GPU work remains | 0–25 MB allowance; scalar gating may reduce allocations, batches may increase them |

CPU arithmetic is `100 × CPU_ms_per_frame × fps / (1000 × logical_cpus)`. These are **incremental illustrative averages**, not whole-app one-second peaks; multithreaded CPU time is summed across threads. They cannot establish compliance with either 8% operating quota or 10% acceptance. RAM admission is `observed aggregate baseline + measured peak delta ≤900,000,000`; do not subtract model-file bytes from the ceiling or exempt driver/shared host residency.

At eight CV frames/s, even an estimated eight GPU-ms per frame consumes 64 GPU-ms/s and can collide with Dota's frame deadline. Average GPU duty is **not an FPS-loss prediction**; contention, memory bandwidth, power limits and submission timing can violate ≤3% for every GPU option. CPU option C may also worsen FPS through CPU contention. No option is certified by this table.

## 5. Alternatives

### A. ONNX Runtime with DirectML execution provider

Use a bounded, reusable local ORT session and an explicitly selected hardware adapter; warm before gameplay off the G-Signal path. This is a **new native runtime/DLL dependency** and Rust FFI/integration change, requiring owner approval and a packaging/privacy review before installation or implementation.

Official DirectML EP documentation requires DX12-capable hardware; examples include NVIDIA Kepler+, AMD GCN 1+, Intel Haswell+, Qualcomm Adreno 600+. Windows 10 1903 is the documented OS baseline. Target Windows builds 19045/26100 satisfy that version baseline, but neither GPUs nor driver versions are certified by this CR. Require adapter LUID/driver/feature/operator probes; reject software/WARP as proof of GPU execution. DXGI/display and inference adapters must be compatible; hybrid/different-adapter copies need explicit evidence. [ORT DirectML EP](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html), [DMLCreateDevice](https://learn.microsoft.com/en-us/windows/win32/api/directml/nf-directml-dmlcreatedevice).

The EP requires `ORT_SEQUENTIAL`, memory patterns disabled and no concurrent `Run` on the same session. Sequential execution does not disable CPU worker pools/spinning. Fix thread count/spinning behavior and inspect node placement: unsupported nodes may silently use CPU. During qualification require a complete placement report or explicit failure when CPU EP fallback is disabled; application fallback must be separately visible and bounded. [ORT threading](https://onnxruntime.ai/docs/performance/tune-performance/threading.html), [session configuration](https://github.com/microsoft/onnxruntime/blob/main/include/onnxruntime/core/session/onnxruntime_session_options_config_keys.h).

DirectML consumes **D3D12 tensor buffers**, not the existing D3D11 texture. A same-adapter sharing/fence/resource-state/texture-to-tensor boundary is additional work. A CPU upload baseline can establish correctness first but must include copies in timing; do not promise zero-copy. [DirectML tensor layout](https://learn.microsoft.com/en-us/windows/win32/api/directml/ns-directml-dml_buffer_tensor_desc), [ORT device tensors](https://onnxruntime.ai/docs/performance/device-tensor.html), [D3D11/D3D12 interop](https://learn.microsoft.com/en-us/windows/win32/direct3d12/direct3d-12-with-direct3d-11--direct-2d-and-gdi).

**Packaging evidence, not a size forecast:** official NuGet pages inspected for ORT DirectML 1.24.4 list a published package download size of 11.88 MB and dependency Microsoft.AI.DirectML ≥1.15.4; the DirectML 1.15.4 package lists 192.92 MB. These whole-package figures do not equal selected Windows x64 DLLs, installed footprint, or Working Set. No package was downloaded. Inventory exact `onnxruntime.dll`, DirectML redistributable and transitive native files, hashes, architecture and startup requirements in a separately approved dependency spike. The generic EP page and versioned package differ in dependency versions; pin the selected artifact. [ORT package](https://www.nuget.org/packages/Microsoft.ML.OnnxRuntime.DirectML/1.24.4), [DirectML package](https://www.nuget.org/packages/Microsoft.AI.DirectML/1.15.4).

ORT source is MIT; DirectML binary redistribution has separate Microsoft terms. Preserve actual binary notices rather than assuming DirectML's MIT sample repository licenses its redistributable. This is an identified review requirement, not a legal sign-off. [ORT license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE), [DirectML package license](https://www.nuget.org/packages/Microsoft.AI.DirectML/1.15.4/License).

**Privacy prerequisite:** v1.24.4 documents Windows TraceLogging telemetry enabled by default; current main describes different/newer telemetry behavior. Pin and inspect the actual build, disable telemetry at the earliest supported initialization boundary, and prove zero runtime egress including startup/error/fallback. If the artifact cannot meet the local-only contract, reject it; model inference being local is insufficient. Do not apply an environment switch from current main to an unverified older binary. [Pinned privacy document](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.24.4/docs/Privacy.md).

**Startup/fallback/rollout:** measure DLL load, session creation, shader/operator compilation, first run, warm run and device reset separately. Local core starts without the GPU provider; no first-use loading on a critical warning. On missing DLL, unsupported graph/driver, device removal or budget pressure, attempt already-qualified CPU mode only within the original freshness/deadline budget; otherwise withdraw CV coverage and retain local GSI features. Do not synchronously run a full CPU retry after an expensive timed-out GPU run. Experimental candidates only until §7 passes. Microsoft marks DirectML as supported but in sustained engineering; this lifecycle risk informs maintenance, not a silent switch to a different new dependency.

### B. D3D11 compute path using the existing DXGI texture

Keep the acquired texture or a bounded ROI copy GPU-resident, then dispatch crop/resize/BGRA→RGB/normalize with the **exact half-pixel and clamp rules** from `patch_rgb_tensor`. Existing `windows` D3D11/FXC bindings and GANN patterns provide a starting point without a new model-runtime dependency. Feature queries, actual resource bind flags, release-frame lifetime and context ownership remain new engineering work. Conservative support target is FL11_0/`cs_5_0`; downlevel FL10.x compute is optional with tighter limits and is unsupported until separately qualified. [D3D11 compute](https://learn.microsoft.com/en-us/windows/win32/direct3d11/direct3d-11-advanced-stages-compute-shader), [downlevel capabilities](https://learn.microsoft.com/en-us/windows/win32/direct3d11/overviews-direct3d-11-devices-downlevel-compute-shaders).

**B1 — GPU preprocessing + batched CPU model:** download bounded packed tensors, not a desktop image; run batched tract only after batch shape/plan parity is proved. If prefilter remains CPU, a small BGRA ROI readback is still needed; moving it to GPU adds candidate-reduction/ordering work and parity tests. Compare total copies and stalls against today's 341,056-byte ROI, not a fictional full-screen readback baseline. Batch-130 tensor readback alone is about 1.60 MB (estimated arithmetic, §4), so B1 may lose on this model. Recommend B1 only if the measured preprocessing share and end-to-end transfer budget justify it.

**B2 — GPU preprocessing + handwritten HLSL CNN:** implement the **exported** graph's Conv/ReLU/MaxPool/GAP/Flatten/Gemm using the same weights and label order. There is no BatchNorm node to implement in the checked-in export. Shader layouts, padding, accumulation, pooling, activation buffers, numerical drift near 0.72, NaN/finite handling and negative-class selection all require independent parity. FP16 is a new accuracy decision; HLSL minimum precision does not promise hardware FP16. [HLSL precision](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/using-hlsl-minimum-precision).

B2 removes a native ONNX runtime dependency but makes this project responsible for a model executor, weight conversion/versioning and every future operator change. Reuse GANN's bounded resource pools and CPU oracle pattern, not its integer color transform as evidence that CNN parity/performance is already solved. Do not run CV on GANN's mutable immediate context. Keep contexts/resources owned, queues bounded, and collect completion asynchronously with no unbounded spin or blocking wait in decision/audio code.

**Startup/fallback/rollout:** compile/cache shader bytecode and allocate bounded reusable resources off the critical path; measure cold/first/warm initialization. On compile/device/feature failure or GDI capture, use a qualified CPU path or report CV unavailable; no WARP “GPU” fallback. For device loss, invalidate caches and late results by capture/model/session generation before retry. Same acceptance and operational disable behavior as A; no GPU support claim from offline shader compilation alone. Both B variants share Dota's GPU and must pass paired FPS tests.

### C. No-GPU algorithmic reduction

Retain tract/DXGI, first eliminate demonstrably redundant work: inspect prefilter hit distribution and overlap, gate cheap obvious background candidates, batch unique cache misses, and extend **exact** reuse only when current observation identity/freshness remains valid. Test tighter threshold 0.36 against the existing 0.18 as an ablation, not an approved production threshold. Reducing nine offsets or doing pre-inference spatial suppression can miss boundary/overlapping heroes; NMS on unclassified candidates is not equivalent to current post-classification NMS.

Use a bounded `[N,3,32,32]` plan for same-frame misses after validating fixed-batch model changes. Preserve row-to-candidate mapping, negative class and confidence calibration. Never remove non-roster logits and renormalize only the five enemies: that would inflate confidence and change the classifier. Roster evidence can inform scheduling, but it cannot manufacture minimap presence or bypass portrait admission. Fresh unobserved/new heroes still need discovery opportunities.

**Quantified expectations:** §4's 75.4% call-count example and cache/buffer arithmetic are estimates. Actual saved milliseconds and present prefilter/cache savings await §3.2. If inference accounts for 80% of measured cost and gating removes 75.4% of misses without other changes, estimated total reduction is `0.8×0.754=60.3%`, not 75.4%; both premises are hypothetical. If preprocessing dominates, batch model calls alone may have little effect. Do not advertise 130× acceleration.

**Temporal reuse boundary:** exact cached classifier results are reusable only for the same current input; detection coordinates, match/session, capture timestamp and observation freshness remain current and separately validated. Approximate ROI tracking, motion prediction or reusing old positions requires a separate accuracy/freshness design. Repeated or dropped frames never add roster/presence confirmations, reset missing clocks, or assert safety.

**Startup/fallback/rollout:** no new native dependency; measure changed batch-plan startup and memory. Keep the existing scalar model as the diagnostic oracle during experiments, not a permanent feature-flag framework. If an optimized batch path fails, select a qualified scalar implementation before the next admitted cycle; an expensive same-cycle retry is forbidden. If neither meets deadline/resources, withdraw coverage. CPU reduction can help a busy game but has no guaranteed FPS benefit without matched runs.

## 6. Recommendation and required ADR follow-up

**Recommend a conditional staged plan: measure → C → select the GPU branch that addresses the measured bottleneck.** This is a recommendation pending owner decision, not an approved implementation order.

1. Resolve build admission and run the current-path ablations. Capture a separately authorized representative minimap sequence later; synthetic repeats are insufficient to size temporal savings or diagnose the live incident.
2. Trial C's bounded candidate reduction and same-frame batching without adding dependencies. Establish accuracy parity/recall and a CPU baseline. Stop if missed-hero/unknown-state regressions outweigh saved work.
3. If preprocessing/readback dominates after C, trial B1 using the existing D3D11 texture and compare **complete** transfers + CPU + GPU time. If inference remains dominant, prioritize **A**'s standard GPU operator implementation, subject to dependency/privacy/size approval; GPU preprocessing alone cannot solve a model bottleneck.
4. Consider B2 only if A's packaging/privacy/resource constraints are unacceptable and owner accepts the higher correctness/maintenance burden of a custom CNN executor. Do not select B2 solely because GANN already has shaders.

**Required follow-up ADR, not authored here:** classifier execution backend; batch/model compatibility; D3D11/D3D12 resource ownership and synchronization; Rust observation publication/deadline isolation; precision and confidence parity; buffer/CPU/GPU/RAM admission; device-loss/GDI behavior; local-only runtime/package policy; operational CV suspension. Explicitly reconcile ADR-13's historical cadence and overly broad fallback/performance statements with MVP-006 without weakening it.

G-Signal continues to evaluate admitted, timestamped observations in Rust. GPU inference is an optional upstream producer; it must not make Signal or local startup depend on an ORT session, GPU queue, WebView or external service. A latest-result mailbox/producer is an architectural proposal requiring the ADR, not a claim about current synchronous capture. A Rust worker wrapping native inference does not make the inference itself “pure Rust.” No queued old frame can become a late warning: invalidate by epoch and reject stale/incomplete data. Full T3−T0 still includes GPU waiting; isolation is not permission to move T0.

## 7. Verification and acceptance plan

| Stage | What it can prove | Required evidence / what it cannot prove |
| --- | --- | --- |
| Current offline profile | Per-case candidate/call counts; preprocessing/model breakdown; paired cache/prefilter effects on checked-in fixtures | §3 command, raw frame JSON, hashes, warm/cold separation. Pending resource admission; does not prove current live bottleneck or safety. |
| CPU batch prototype | Scalar/batch logits within explicit tolerance, same final labels/rejections/NMS, deterministic row mapping, bounded buffers, model-load and error behavior | Fail missing artifacts; zero/one/max/overflow candidates, both team rings, edges, duplicate inputs, altered pixels, cache collision/expiry, session reset. Numerical tolerance and threshold-edge tests approved before evaluation. |
| Offline GPU prototype | Preprocessing/graph parity and measured GPU execution for a pinned adapter/driver; fallback/device-loss and stale-result handling | Layer-by-layer parity for B2; placement report for A; GDI/unsupported adapter/missing DLL/failed init/no-GPU/pressure/retry tests. Shader compilation or successful device creation alone does not prove GPU execution/performance. |
| GPU timing | GPU duration with timestamp queries, separate CPU enqueue/completion/readback and queue depth | D3D11 timestamp pairs within a valid timestamp-disjoint interval; discard invalid/disjoint readings, report them. Poll via delayed query ring without busy waits. Measure D3D12 work with corresponding queue timestamp/fence evidence for A. No claim that GPU time alone predicts Dota FPS. |
| Identity/coverage corpus | Presence precision/recall ≥95%/90%; per-class identity ≥95%/85% under the accepted matrix | Independent labels, ≥50 appearance episodes/class in ≥5 held-out matches and ≥20 whole held-out matches, 95% CI/disagreement; both teams, fog, overlap, motion, wards/creeps, empty map, unknown roster. Do not tune and certify on the same sequence. |
| Native/live owner match | Actual coverage, roster, warnings, local-only behavior, device recovery and interaction with GANN/preview/Voice | Owner-controlled Windows 19045/26100, 1080p16:9, primary display,100%DPI, default bottom-left minimap, borderless, live 5v5 All Pick ranked/unranked; ≥10 sessions per required OS/mode/geometry cell. Missing cells are SKIP/INDETERMINATE. |
| End-to-end audible latency | MVP-006 T3−T0 p50≤250 ms, every sample≤300 ms, ≥300 samples/scenario/profile | Actual loopback audible onset, acquisition due timestamp, scheduling/queue/copy/inference waits and observation age. Include GPU congestion, failure/withdrawal and 100 Voice overlap trials. No headless/native-log substitution for audio. |
| CPU/RAM | Whole-app every-second CPU≤10%, peak aggregate full WS≤900,000,000 bytes | Two-minute warmup, idle/live-CV/Voice+Signal phases ten minutes each ×3 runs; reference tier 6 physical/12 logical CPU,16GB RAM, actual hardware recorded. No concurrent builds/local model reviews. Include external used model PIDs; record dedicated/shared GPU allocations separately without replacing full WS accounting. |
| Dota FPS | ≤3% loss in **each** baseline/candidate pair | PresentMon targeting actual Dota PID, version/schema pinned, ≥3 paired off/on runs ×60 seconds each, same device/segment/settings/FPS cap; alternate pair order and record frame-time tails/stutters/clock/power. Also compare current CPU backend versus candidate to attribute the change. No unrelated-process shutdown; schedule clean measurement with owner. |
| Privacy/package | Runtime/model/crops/diagnostics remain local, deterministic native file set | No runtime downloads; hashes/notices/DLL search boundary; capture zero-egress behavior including cold initialization and fallback. Local diagnostics must not include player imagery/IDs in public artifacts. |

For GPU queries use Microsoft [query definitions](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/ne-d3d11-d3d11_query), [disjoint validity](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/ns-d3d11-d3d11_query_data_timestamp_disjoint) and [non-flushing query behavior](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/ne-d3d11-d3d11_async_getdata_flag). FPS collection follows a pinned [PresentMon console schema](https://github.com/GameTechDev/PresentMon/blob/v2.3.0/README-ConsoleApplication.md). These APIs do not establish product acceptance by themselves.

The later implementation must pass the repository's full Rust/Clippy/frontend/Tauri checks in admitted lanes and Claude's independent rerun. This documentation/spike branch reports only checks actually executed; it is not “implementation ready.”

## 8. Rollout and operational disable behavior

This draft ships nothing. After owner approval and ADR: isolated offline prototype → qualified internal candidate → owner native/live acceptance → ordinary protected-main PR/release process. No per-option production feature-flag matrix or compatibility shim is introduced by this proposal; select one qualified implementation through review. Existing CPU behavior remains the comparison oracle and may be an explicit qualified fallback according to the ADR.

The requested **kill-switch** is operational suspension of optional CV, not a new remote rollout service: on owner disable, device loss, missing dependencies, queue/deadline breach or resource pressure, stop admitting new CV work, invalidate pending generations and expose unavailable/unknown coverage; preserve local GSI/announcer and the pure Rust Signal engine's valid-input rules. Recovery must reinitialize/qualify off the critical path. Disabling audible Signal alone is not sufficient to stop CV GPU consumption; a future implementation must prove actual work admission stops. If existing controls cannot provide this, the owner must explicitly approve the narrow control addition. Source rollback uses a reviewed revert; no tag, push or release is authorized here.

## 9. Explicit owner decisions needed

1. **Investigation resources:** provide the qualified build-admission basis and owned lane serialization so the native CPU profile can run; name the owner of representative local frame evidence and the later live test window.
2. **Implementation sequence:** approve or change the conditional C → measured B1/A plan; choose whether B2's custom-inference maintenance cost is acceptable if standard runtime admission fails.
3. **New dependency:** if A is selected, explicitly approve a pinned ORT/DirectML native artifact set, Rust integration approach, deployment footprint, binary licensing/notice review and enforceable zero-egress initialization. No install/download is authorized by this draft.
4. **Architecture:** approve commissioning the follow-up ADR with texture/queue ownership, batch/model contract, precision policy, freshness and pure-Rust Signal isolation; clarify the upstream native-runtime boundary. No ADR is accepted or created here.
5. **Budgets:** keep current CPU/RAM/FPS/latency ceilings. Approve experimental **sub-budgets** and abort rules for GPU time/VRAM, host session/batch RAM and startup only after baseline headroom is measured. Any increase to accepted limits requires a separate explicit MVP/SRS decision; this CR does not request an implicit increase.
6. **Support and fallback:** select initial GPU/driver certification cells and what qualifies CPU fallback; require honest unavailable CV on unsupported/GDI/late/pressured paths rather than an asserted safe state.
7. **Acceptance and disable control:** approve the local fixture/live sequence plan, PresentMon matched pairs and owner live window; decide the narrow CV suspension control if existing controls cannot stop work. Preserve the repository's no-new-feature-flags rule.

## 10. Disposition and handoff

**Draft prepared; decision and native measurement gates remain open.** No accepted status, approval signature, production behavior, dependency, ADR or native/live pass is implied. Claude must independently review the test-only integration, resolve §3.3, compile/run the ignored release profile and replace unmeasured cells with raw receipt-backed results before choosing an implementation. Keep this worktree and its unpushed evidence protected; documentation completion never authorizes cleanup. Documentation gate and local commit outcomes are reported in the writer's handoff, separate from implementation/acceptance.

Writer verification receipt: [cr047-verification.json](../../tests/benches/cr047-verification.json). Results on 2026-11-08:

| Check | Actual result |
| --- | --- |
| Offline inventory | Exit 0; recorded model/fixture hashes and properties in §3.1. No inference executed. |
| Pinned Rust 1.96.0 `rustfmt --edition 2021 --check tests/benches/cr047_cv_spike.rs` | Exit 0; syntax/format only, **not compilation or test execution**. |
| `git diff --check` | Exit 0. |
| `node tools/doc-graph/ci-gate.mjs` | Exit 1. Node child creation fails with `spawnSync ... EPERM`; required full gate **not passed**. No gate code changed. |
| In-process diagnostic unit suite (`node --test --test-isolation=none` over the gate's test files) | 221 tests: 202 passed, 19 failed. Failed child-CLI/Git/runner fixtures are consistent with the observed spawn restriction. This diagnostic is not a replacement green gate. |
| Direct `encoding-check.mjs`, `scan.mjs --strict`, `ledger.mjs --quiet`, `orphan-report.mjs` | Each exit 0 after final source adjustment; 293 nodes, 1,353 edges, 26 informational violations, **0 blocking**; orphan candidates 0. All six generated artifacts regenerated. |
| `node tools/doc-graph/artifact-freshness.mjs` | Exit 1; reports all six artifacts as MISSING because its child `git show` cannot run. Files exist; comparison against committed HEAD is **unverified**, and generated changes are not committed. |
| Stage/commit | Explicit-path `git add` failed creating the linked worktree's `index.lock`: permission denied. **No commit**, no retry through another tool, no change to Git permissions/index/ref storage. Claude must commit intended paths after prerequisites/checks are resolved. |
| Cargo profile / full native checks / live acceptance | Not run. §3.3 and owner native/live prerequisites remain open; no production-ready claim. |

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-08 | Draft GPU/CPU alternatives, inspect current source and model, prepare ignored CPU-profile spike, record resource-admission blocker and distinguish inventory/estimates from unmeasured performance; no approval or production changes. |
