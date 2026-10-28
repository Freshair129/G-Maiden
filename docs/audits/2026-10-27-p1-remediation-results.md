---
title: "G-Maiden — Seven P1 Remediation Results"
doc_id: "AUDIT-P1-REMEDIATION-RESULTS-20261027"
status: draft
version: "0.6.1"
updated: "2026-10-28"
owner: "G-Maiden"
related_docs: ["AUDIT-FEATURE-LOGIC-20261027", "PLAN-P1-REMEDIATION-20261027"]
---

# ผลการแก้เจ็ดจุดเร่งด่วน

**Current MVP decision:900,000,000bytes aggregate Working Set** per owner instruction and [[mvp-decisions]] v0.5.0. Earlier400/800MB statements below are historical; no old result is reclassified as900MB acceptance. Continue event corrections per [[PLAN-MVP-EVENT-CORRECTIONS-20261028]].

**Historical800MB contract:** Owner explicitly approved800,000,000bytes on2026-10-28 ([[mvp-decisions]] v0.4.0). Historical400MB failures below retain their original classification. New800MB code/build/native verification is required; the approval itself is not a passing runtime receipt.

ขอบเขตที่ผู้ใช้อนุมัติคือ F01/F03/F04/F05/F06/F07/F25 จาก [audit เดิม](2026-10-27-feature-logic-audit.md) ตาม [แผนที่อนุมัติ](2026-10-27-p1-remediation-plan.md). Audit เดิมเก็บข้อค้นพบ ณ ฐานก่อนแก้; เอกสารนี้แยกผลแก้และหลักฐานใหม่ ไม่เปลี่ยน baseline ให้ดูเหมือนผ่านมาก่อน.

## Implementation

| Finding | การแก้ | ขอบเขตหลักฐาน |
| --- | --- | --- |
| F01 | เลือก loopback 3000–3010; health ระบุ service/port; cfg/port file/Studio/feeder ใช้พอร์ตจริง; startup และการเลือก/ล้าง path reconcile ผ่าน native ก่อนซ่อม cfg | Busy/all-busy listener fixtures, config parser/repair, selected-root persistence, frontend reconciliation, feeder health/ACK; native startup pending |
| F03 | แยก roster identity จาก presence; ใช้ confirmed `visible_heroes`; unready/หมดอายุ/กลับจาก background ต้องไม่ขึ้น visible | Builder และ event-consumer integration, board dot, epoch/expiry/refocus regressions; live-match CV accuracy ยังแยกอยู่ |
| F04 | Threat/allies/recommendation ที่ไม่มีหลักฐานเป็น null/Unknown; UI และ prompt ไม่อ้าง safe/no-buyback | Actual Rust revive/respawn and both overlay surfaces; known-threat positive retained |
| F05 | ตรวจ idle ก่อนดาวน์โหลด หลังดาวน์โหลด และหลังเตรียม installer ก่อน cleanup/launch; กัน concurrent install | Pure race/reentrancy regressions; exact updater 2.10.1 patch reviewed; no real installer executed |
| F06 | Config snapshot/generation เป็นชุดเดียว; ตรวจ actual provider spawn/cache/publication; ส่ง generation ถึง renderer และ speech admission | Deterministic fake-provider barriers, delayed IPC/events, opt-out/regrant, stale validation order, static preview/native admission; no live cloud/model calls |
| F07 | RAM รวม verified process members; CPU ใช้ cumulative Job รวมลูกที่จบระหว่าง samples; unavailable ไม่เป็น green | Pure aggregate/process identity/decimal budget fixtures and read-only native process probe; sustained whole-app acceptance pending |
| F25 | Frame-driven bounded acquisition; T0 รวม wait/intervening work; pressure/late/stale frames ถอน readiness; prepared audio before native deadline; priority-aware cancellation | Fake frame/deadline, native-source audio admission/priority/prepared fallback fixtures; audible T0–T3/FPS acceptance pending |

## Review corrections

Independent review identified delayed renderer delivery, completed-child CPU, installer preparation after admission and mismatched selected-root persistence. Astra then identified unconditional audio cancellation and a missing prewarmed fallback. These were corrected and re-reviewed; final source follow-up found no further actionable blocker in those inspected paths. This is source review, not full runtime acceptance.

The Windows updater has a narrow vendored patch because upstream 2.10.1 has no fallible post-extraction hook. Download/minisign verification is unchanged. See `src-tauri/vendor/tauri-plugin-updater/GMAIDEN-PATCH.md`; raw updater JS permission is removed.

Shared external Ollama cannot prove a reservation under the unchanged 400,000,000-byte whole-app resource contract. Generation/readiness therefore reports unavailable and dispatch is refused. It is not silently rerouted to cloud; no shared model/process was killed, reparented or unloaded.

## Verification before the latest bounded memory follow-up

- Latest frontend: TypeScript and ESLint exit 0; Vitest **384 passed / 45 files**, including overlay bootstrap/cleanup, idle heartbeat deduplication and formatter reuse regressions.
- Data provenance: **5 artifacts valid; 6 tests passed**.
- Doc graph integration: PASS; **14 existing checklist-covered findings, 0 uncovered**.
- Latest native integration: **475 passed / 0 failed / 7 ignored**; root Clippy all targets with `-D warnings` passed. GPU feeder **24 passed**, Clippy all targets passed. Unsigned embedded-frontend Tauri debug smoke build passed (`nvml-delivery-build-summary.log`). The real-image portrait probe also passed separately; it does not establish full five-enemy live accuracy.
- Latest doc graph: PASS, including215 gate unit tests, encoding/ledger/orphan checks and14 checklist-covered findings with0 uncovered. Sustained runtime acceptance remains **open**.
- First native integration failure retained: the vendored updater build required its unchanged upstream `api-iife.js` asset. The asset was added; no check was disabled. Earlier focused compile errors during parallel interface changes are retained separately from behavioral RED evidence.

Evidence directory: `D:/G-Maiden/src-tauri/target/p1-remediation-20261027`. Each task retains behavioral RED/GREEN logs; standalone extraction harnesses are explicitly distinguished from the final Cargo suite. Prior work's six-image portrait probe remains a static-image result, not proof of five correct enemy reads in a live match.

## Local candidate and remaining acceptance

The requested candidate will be a local unsigned debug build with embedded frontend and the original `ann-pack` staged separately. All 15 original WAV files and 13 mapped events must match hashes; no default/flat AI announcer fallback is staged. Existing Maiden/Signal prewarmed voice remains a separate channel. No Store receipt is forged, version bumped, tag pushed or signed release activated.

Original 15-WAV hash parity was verified for staged candidates; native health reported the selected service/port. Corrected GUI-subsystem startup produced exact Job/descendant membership, and supported WebView2 LOW targets succeeded for both windows. These are startup checks, not full feature acceptance.

**F07 remains open:** Owner explicitly chose to retain **400,000,000 bytes** and reduce RAM further; the 1,000 MB proposal is not approved. The combined opt-level2/idle-deduplication candidate PID24388 was measured after 152.7s warmup: 31 samples, **466,542,592–529,367,040 bytes**, all over budget; CPU diagnostic samples were 0.37–7.26% normalized across 12 logical CPUs. CV correctly withdraws readiness under this pressure. This build cannot be called ready.

The subsequent numeric heap/frame diagnostic candidate faulted inside installed WebView2 `155.0.4283.62` (`0xc0000005`, Windows Application Error). The user confirmed the window disappeared itself. A second instrumented attempt reproduced the fault after requests were queued and before callbacks; the faulting extended frame/process enumeration was subsequently removed; bounded numeric heap-only sampling survived. This does not prove a general WebView2 crash fix. No raw response, game data or crash dump was uploaded. Runtime candidate metadata and first-failure receipts remain local in the evidence directory. A successful build/test result does not clear this runtime defect.

Follow-up work is tracked in [keep-400 plan](2026-10-27-400mb-remediation-plan.md). Full acoustic latency, sustained CPU/RAM/FPS and real-match behavior remain explicit acceptance gates. The other P2 findings from the original audit remain outside this seven-fix scope; feeder ACK checking was included only as a necessary F01 integration dependency.

Formatter candidate PID15520 (`p1-formatter-ann-20261028-000913`, SHA256 `79774E2AD989716D3B5982D2DE6C141C92DA47522E810BEE6FB7472A3107133D`) passed the same build/tests with original pack staged. Heap-only sampling survived; faulting frame/process enumeration was removed. After269s warmup,30complete samples measured467.30–491.24MB, allover400; oneNVSMI membershipchange sample remainedunavailable. PreciseCPUcountertimestamps gave2.61% maximum over31samples. Requested601-sample run stopped at31 under the early-RAM-failure rule;10-minute acceptance is incomplete. This candidate remains a diagnostic build, not RAM-qualified. A related-view experiment and native process-name enumeration are the next documented steps.

## Related windows and NVML follow-up

The reviewed related-view bootstrap uses supported opener/window features, exact mode-selected root URLs, denied nested popup/frame navigation and native readiness only after all overlay listeners are attached. Both native windows loaded trusted packaged roots; the overlay acknowledged readiness and both reported the same browser PID. Full in-game HUD behavior and the normal dev/HMR runtime remain separate gates; unit tests cover packaged/dev root selection but do not replace those observations.

Related candidate PID26484 completed 601 samples over 600.0008s after 186.8s warmup: 599 complete RAM samples **310.37–407.54 MB**, two over400 and two unavailable; 601 valid normalized CPU samples peaked **10.289%**, six over10. Therefore the full ten-minute run failed. Its peak comprised stable eight-process residency366.58MB plus NVIDIA-SMI32.60MB and conhost8.36MB; these processes were not excluded.

Toolhelp process-name snapshots remove the watchdog tasklist child. The next candidate replaces GPU-feeder subprocess sampling with persistent read-only NVML loaded from the trusted Windows system directory. Unavailable GPU reads do not become zero; a 30s retry wait does not consume the actual-failure counter, while missing/unhealthy application endpoints retain the original finite exit behavior. ABI/lifetime/path/error/recovery tests and the local native probe passed; this is not RAM acceptance.

The historical local unsigned NVML candidate was `D:/G-Maiden/src-tauri/target/p1-nvml-ann-20261028-015549/g-maiden.exe`, PID30984, SHA256 `8BFC6F9993A2CBD442B0AA24F2235493F6BC7994BF3610796D8B21C02EB2A318`. It opened with both trusted roots and overlay readiness. The original Nakhom pack remained active. After275.2s warmup, all31 complete RAM samples were **436,809,728–449,773,568 bytes**, all over400M;31 valid normalized CPU samples peaked **5.2084%**, none over10. The601-sample run stopped at31 under the early-RAM-failure rule; **ten-minute acceptance is incomplete and F07 remains open**. Exact nine-process Job membership was stable, with no tasklist/NVIDIA-SMI/conhost sampled. See `f07-nvml-final-native-receipt.json`; removing subprocesses alone did not clear the RAM gate.

## Additional user-requested VRZO authoring

The user provided `D:/User/Downloads/VRZO-ANNOUNCER.mp4` and authorized choosing phrases/event mappings. Prepared35 original-voice clips;21 mapped clips cover15 existing events,14 objective/result/special-event clips remain separate because no corresponding trigger exists. No generated speech was added. Source SHA256 `d06176c748013e59a3a66d04e26dc36ac72c57ae372ce240c71ec3ad8f469366` is unchanged.

Outputs are local at `D:/User/Downloads/VRZO-ANNOUNCER-pack-20261028`: listening page, preview, manifest/ZIP, source timestamps, mapping rationale and validation receipts. All35 WAVs are nonempty PCM16 mono44.1kHz with quiet padding and no clipped samples; ZIP CRC and contained manifest paths passed. This verifies file/audio structure, not human listening acceptance or live event playback.

The local debug author's `/announcer/install` reader accepted pack `pack_vrzo_20261028` with21 clips/15events/zero missing files and `activate:false`. Original active-pack ID stayed `pack_mrijgajn`. The new candidate carries both packs; this is not Store publication, entitlement bypass, release installation or a signed release. Nine unsupported events retain the existing fallback chain; no unrelated objective/result clip is assigned to them.

## Subsequent failures and current source verification boundary

Automatic diagnostic removal completed601 samples but failed at431.98MB/12.36565% CPU. Late183 GSI ticks prove actual live play only for02:28:39–02:31:41; early phase is unknown. An owned PowerShell/conhost burst was counted, not excluded; its exact caller is unproven. Four46-byte empty prewarm WAVs were independently found and fixed with positive-frame validation and playback admission/priority-reset regressions.

The next optimized authoring binary passed479 default and optimized Rust tests/7ignored,384 frontend tests,24 feeder tests and all static/smoke checks. Its CPU operating cap is800(8%) under the unchanged10% acceptance threshold. This exact binary failed AX-assisted desktop/UI601samples:600 complete RAM388,784,128–429,359,104bytes,517 over400M, one unavailable; CPUmax6.380773%, none over10. A screenshot-only same-binary comparison also failed31complete samples379,420,672–405,282,816bytes, one over400M; CPUmax3.777248%. It stopped before scheduled UI actions/full601. Neither comparison clears F07 or identifies accessibility as the sole cause.

Current source adds a64-entry formatted-label cache, lazy full-screen DXGI staging, native classic SAPI voice-metadata enumeration and bounded native waveform metadata/audio-only inventory previews. The cache passed full390 frontend tests/TSC/ESLint before waveform edits. Focused waveform/UI/native adapter tests and review are distinct from a final integrated build. Native catalog parity covered both installed voices and four DTO fields, with20 clean native probe exits after fixing COM release order. No live/prewarm speech engine route changes. The selected-preview resolver must retain bundled/debug/Store eligibility and avoid activation/banner side effects.

The integrated source subsequently passed510 default and optimized Rust tests/7ignored, Clippy,422 frontend tests/47files, TSC/ESLint and the unsigned optimized no-bundle build. Real-display DXGI tests passed5/5 on unchanged source with normal desktop updates after the retained1pass/4no-frame first run. These are composed checks, not a claim that the first complete runner succeeded without a failure. All raw logs remain local. See [the keep-400 plan](2026-10-27-400mb-remediation-plan.md) and `keep400-next-20261028/` receipts.

The opened waveform candidate is `D:/G-Maiden/src-tauri/target/p1-native-wave-ann-20261028-043304/g-maiden.exe`, SHA256 `36D12B34B93B4AD3E58B8F9BDD5B1B5F6EFDDA462D1F33D80BE52A933346A650`. Both trusted roots loaded, overlay readiness acknowledged and original Nakhom/VRZO/new HoN/Signal hashes matched. It remains **not RAM-qualified**: full601 complete readings364,027,904–458,104,832bytes,426 breaches,0unavailable. CPU601valid readings peaked9.245385%,0over10; actual operating cap800/flags5, exact eight members throughout. The first breach followed the Voice-category click by0.847s. It preceded the later Overlay-editor visit. These are desktop/UI observations with GSI offline, not live-match acceptance.

Native audio-only Play was clicked without a visible UI error. Banner/waveform runtime rendering and physical audibility were not established by the preview clicks; Control's cosmetic preview clears when leaving its Overlay category. No synthetic GSI tick, persistent-setting change or active-pack change was made. Font-mapping metadata does not support attributing the excess to a large mapped emoji font. The next bounded, separately measured experiment isolates Voice rendering from unrelated telemetry while retaining all controls and freshness gates; source changes and its new measurements are pending.

## Additional user-requested HoN Nakhom authoring

Downloaded the public YouTube compilation [MisterTak HoN Nakhom announcer](https://www.youtube.com/watch?v=ES28hPbqIUw) and retained source hashes/timestamps. Prepared38 original-voice cuts:12 mapped clips cover12 supported events and26 remain extras where event/phrase correspondence is uncertain. No generated speech or guessed mappings. The late compilation's ordering warning is retained; ASR was diagnostic only. Output WAVs are PCM16 mono44.1kHz. Validation confirms exact source-derived samples with fades/padding;191 source rail samples remain, with no additional clipping introduced.

Outputs at `D:/User/Downloads/NAKOM-HON-ANNOUNCER-pack-20261028` include `listen.html`, mapped and all38-review ZIPs, preview, manifest, provenance and validation receipts. Native local-authoring installation accepted `pack_nakom_hon_20261028` with activate:false; current inspected UI shows all three packs and original `pack_mrijgajn` equipped. VRZO and all15 original Nakhom WAV hashes remain unchanged. This is local authoring only, not Store publication, release activation or human listening acceptance.

## Owner budget change and retained render isolation

The Voice-only memo boundary passed428 frontend tests/48files, TSC/ESLint and its embedded optimized smoke build; Rust source remained byte-identical to the510-test baseline. Artifact335485A3250CDFEE3B1840C5ABE83D0EE1F003003E2161112F59B09CF546C8F0 opened with all original/VRZO/HoN/Signal hashes preserved.

Its400MB diagnostic stopped at221 valid samples after the first breach402,595,840bytes; the verified sampler alone was stopped and the app remained running. The breach followed an explicit pack-preview click and preceded the later Settings/Voice clicks, which are outside that measured interval. Initial creation age and operator action timing differed from the earlier601sample run. This incomplete failure cannot be compared with the old458MB full-run peak as proof of a causal memory saving. Render-count regressions prove less unnecessary work, not memory acceptance. Source/evidence remain local under `final-voice-isolation-cap800-run/` and `isolation-native-ui-action-receipt.json`.

Owner then replaced400MB with800MB. Backend thresholds, frontend labels and canonical requirements are aligned to800,000,000decimal bytes while retaining full process accounting and CPU/latency/FPS/privacy/provider-admission rules. The old1000MB proposal remains unapproved. No further image/font/CSS optimization was introduced; native800MB validation is pending.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-27 | Record seven P1 implementations, review corrections, evidence boundaries and pending final verification. |
| 0.2.0 | 2026-10-28 | Record passing integration checks, unchanged owner RAM decision, failing native RAM measurements and diagnostic WebView2 crash. |
| 0.3.0 | 2026-10-28 | Record475 Rust/384 frontend/24 feeder checks, related ten-minute failure, NVML candidate and separate VRZO authoring receipts. |
| 0.4.0 | 2026-10-28 | Retain later native failures and pending integrated memory follow-up; record separate original-voice HoN Nakhom pack without changing the active announcer. |
| 0.5.0 | 2026-10-28 | Record510/422 integrated checks, same-source native DXGI retest, fresh waveform candidate and full458MB failure with explicit runtime-evidence limits. |
| 0.6.0 | 2026-10-28 | Retain428-test render isolation and incomplete400MB failure; record owner-approved800MB contract with new verification pending. |
| 0.6.1 | 2026-10-28 | Record current900MB MVP decision; preserve historical400/800MB results without acceptance claims. |
