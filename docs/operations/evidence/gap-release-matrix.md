---
title: "Gap 2 Release Acceptance Matrix"
doc_id: "gap-release-matrix"
status: "draft"
version: "0.1.0"
updated: "2026-10-01"
owner: "Product Owner Agent (Luna Max)"
related_docs:
  - "beta-roadmap"
  - "definition-of-done"
  - "release-channel-architecture"
---

# Gap 2 Release Acceptance Matrix

> This is a source-grounded acceptance map, not release evidence or approval. It records requirements and checked-in manifest state only. No build, performance run, install/update UAT, workflow, provider, or promotion was executed for this document.

## 1. Evidence rules and scope

The matrix is limited to the [beta roadmap](../../releases/beta-roadmap.md), [Wave 0 Definition of Done](../../releases/closed-beta/wave-0/definition-of-done.md), [release-channel architecture](../../releases/release-channel-architecture.md), [performance README](../../../tests/perf/README.md), [GATE P3 workflow](../../../.github/workflows/perf-gate.yml), and checked-in [`release/channels/`](../../../release/channels/) manifests.

Use these result meanings:

| Result | Meaning |
| --- | --- |
| PASS | The required test ran in the required environment, met its target, and its evidence is attached to the release record. |
| FAIL | A measured or controlled test missed its target. |
| SKIP | A prerequisite was missing or a probe could not measure; this is never a PASS. |
| PENDING | A stated gate has no actual result/evidence yet. |
| UNSPECIFIED | The inspected sources do not define a testable acceptance rule. |

The inspected release documents are marked `draft`. Wave 0's metrics show `Actual — / Status Pending`, and its coverage checklist is unchecked. Treat those as requirements, not completed validation. The roadmap frontmatter says `0.1.0` while its latest changelog row is `0.2.0`; this source-version mismatch is unresolved and does not change the matrix version.

The word **Full** has two different uses in the performance README: the two-phase full P3 gate, and `FULL` replay mode in `replay_fit`. The inspected release sources do not define an application runtime mode named Full or Lite. Wave 0 instead requires a disclosed, working **Compatibility Mode**. This matrix does not equate those labels or infer missing runtime behavior.

## 2. Runtime and native acceptance

| Runtime case | Source-grounded acceptance | Required validation lane | Current evidence/status |
| --- | --- | --- | --- |
| Full runtime / normal capture | Wave 0 targets GSI connection success ≥95%, DXGI capture success ≥90%, minimap readiness ≥85%, crash-free sessions ≥99%, and ≥90% of matches without restart. The inspected release sources do not define a single “Full mode” predicate or a pass command. | Controlled Wave 0 tester cohort on covered Windows/GPU/display configurations; record actual numerators, denominators, build identity, and evidence. | PENDING. Actuals are blank in the [Wave 0 metrics](../../releases/closed-beta/wave-0/definition-of-done.md); no runtime was exercised here. |
| Resource budget | Wave 0 targets background CPU ≤2.5%, application RAM ≤400 MB, and Dota FPS impact ≤3%. | CPU/RAM collection must be part of controlled runtime evidence; P7's operator FPS procedure is the source-grounded FPS test. | PENDING. The DoD actuals are blank; the inspected sources specify no CPU/RAM measurement command or method. |
| Lite / Compatibility Mode | Wave 0 entry requires Compatibility Mode to work and be clearly disclosed. Coverage requires exclusive-fullscreen fallback behavior to be documented. The sources specify no Lite-specific mode trigger, behavior matrix, metric, or test command. | Product/runtime definition plus controlled install and match tests. Keep fallback outcome and user disclosure in evidence. | UNSPECIFIED for Lite semantics; Wave 0 entry criterion remains unverified. Do not infer behavior from P3 headless skips. |
| ONNX model missing | The P3 harness returns exit `77` when the model is absent. Local meaning is SKIP/prerequisite missing, not a performance pass. The inspected hosted workflow converts exit `77` into workflow-step exit `0`. | Restore/verify the required committed model before a binding P3 run; retain a missing-model result as SKIP. The hosted green result alone is insufficient. | PENDING; missing-model path was not executed. See [perf-gate.yml](../../../.github/workflows/perf-gate.yml). |
| Native installer and updater artifacts | Wave 0 entry requires signed installer and updater artifacts. Candidate architecture calls for a Tauri smoke build, installers, updater artifacts, signatures, hashes, and release evidence. | Candidate build lane plus controlled install/UAT. Verify signatures and hashes against the exact candidate evidence before tester use. | No candidate artifacts were built or verified here. The permitted sources name a smoke-build step but provide no exact native build command. |
| Wave 0 install and first run | Installer success ≥95%; first-run completion ≥90%; diagnostic-bundle success ≥95%; at least 20 approved testers and 100 completed match sessions. | Controlled Wave 0 UAT. Report cohort size and each denominator; do not substitute a local smoke test for tester outcomes. | PENDING; all actuals blank in the DoD. |
| Platform and display coverage | Windows 10/11; 1080p and 1440p; ultrawide pass or explicitly documented unsupported impact; single/multi-monitor; borderless/windowed; documented exclusive-fullscreen fallback; multiple NVIDIA GPU generations. Every item must be `pass` except the documented ultrawide `unsupported` allowance. | Operator hardware matrix with OS, GPU/driver, resolution, monitor count, Dota mode, result, and known-issues evidence per cell. | PENDING; checklist remains unchecked. |
| Operational/privacy entry gates | Rollout pause, beta revocation, stable/candidate isolation, classified known issues, named S0/S1 owner, rollback/forward-fix drill, privacy/security checks, and signed-update verification. | Controlled release/UAT and owner-reviewed evidence record. | PENDING; no drill, signature validation, or privacy review was run here. |

## 3. Performance acceptance and exact commands

The [P3 README](../../../tests/perf/README.md) sets p50 ≤250 ms and p99 ≤300 ms for the critical G-Signal path. Its headless math measures hops 2–5 and adds 70 ms of budgets for skipped display/audio hops (30 ms capture + 40 ms first-audible) before comparing with the 300 ms ceiling. The documented exit-0 condition explicitly describes the p99 ceiling; whether p50 is independently enforced is not established by the inspected sources. Capture/report p50 and resolve that gate mismatch before treating P3 as complete. Wave 0 separately records G-Signal p99 ≤300 ms. The [P7 FPS run](../../../tests/perf/README.md) passes only at `fps_drop_pct ≤ 3.0` from real PresentMon/ETW measurements.

| Gate | Exact command from the authorized source | Where it can run / what it proves | Acceptance and limitations |
| --- | --- | --- | --- |
| P3 full two-phase gate | `tests/perf/run_gate_p3.bat` | Local Windows machine with display and audio; runs `latency_harness` and `latency_live`. | Overall exit 0 PASS, 1 FAIL, 77 SKIP. Requires full measurement for a full gate result; no run was made here. |
| P3 headless harness | `cargo run --release --manifest-path tests/perf/Cargo.toml` | Local/headless; measures wired hops 2–5 and includes the 70 ms skipped-hop budgets. | Exit 0 when documented p99 plus budgets is ≤300 ms; 77 is model-missing SKIP, not PASS. P50 ≤250 ms is a stated target but not explicitly included in the documented exit-0 condition. |
| Hosted P3 workflow invocation | `cargo run --release --manifest-path tests/perf/Cargo.toml --bin latency_harness` | The manual Windows hosted workflow runs only the headless harness. | It is explicitly advisory on a shared runner. It does not measure live DXGI/audio or P7. The workflow maps code 77 to exit 0; inspect the step log to distinguish SKIP from PASS. |
| P3 live probes | `cargo run --release --manifest-path tests/perf/Cargo.toml --bin latency_live` | Local machine with display/audio; probes DXGI hops 1a/1b and audio hop 6. | Exit 77 means SKIP/PARTIAL if no probe fails; a partial run is never a full pass. Run with changing screen content: an idle desktop can inflate DXGI p99 and produce an expected, non-regression FAIL. |
| P7 FPS, Phase 1 baseline | Exact README invocation is reproduced below. | Operator-controlled Windows 10/11 machine, Dota 2 borderless fullscreen, Administrator PowerShell, PresentMon/ETW, repeatable gameplay segment. | Must produce measured, non-empty, schema-v1 overlay-off `fps-baseline.json` with positive FPS plus baseline CSV. |
| P7 FPS, Phase 2 overlay | Exact README invocation is reproduced below. | Same machine/build/settings/game segment as Phase 1, with overlay visibly on. | `fps-report.json` must say `pass` and `fps_drop_pct ≤3.0`; retain report and both raw CSVs. Exit 77 for missing prerequisites/confirmation or invalid baseline is SKIP, not compliance. |

The P7 README labels these examples as PowerShell, but uses backslash (`\`) line continuation. They are transcribed exactly as shown and were not executed; confirm the documented shell syntax before an operator run rather than treating it as a verified command.

```powershell
cargo run --release --bin perf_p7 -- \
  --fps-baseline --confirm-overlay-off \
  --presentmon C:\Tools\PresentMon.exe --duration-secs 30 --output-dir .\p7-run

cargo run --release --bin perf_p7 -- \
  --fps-overlay --confirm-overlay-on \
  --presentmon C:\Tools\PresentMon.exe --duration-secs 30 --output-dir .\p7-run
```

The P3 full gate and P7 commands above are requirements copied from the README, not commands executed for this matrix. There is no exact installer build, update-isolation, or controlled-UAT invocation in the inspected sources; do not infer one.

## 4. Update channels, artifacts, and lineage

### Checked-in channel manifest snapshot

| Manifest | Checked-in value | What this establishes | What it does not establish |
| --- | --- | --- | --- |
| [`dev.json`](../../../release/channels/dev.json) | `dev`, version `0.13.1`, source SHA `53083075a1d7f5be1bf54fcab05628267f3fc308`, populated Windows MSI/NSIS URLs, hashes, signature fields, and publish timestamps. | The repository contains a populated Dev manifest record for that version/source SHA. | No artifact was downloaded, signature/hash verified, source-SHA lineage checked, endpoint queried, or Dev installation tested. |
| [`closed-beta.json`](../../../release/channels/closed-beta.json) | Version `0.0.0`, “not published” note, `example.invalid` URL, zero source/artifact hashes, `not-published` signature. | Checked-in value is an unpublished placeholder. | Not a usable beta update or proof of channel isolation. |
| [`stable.json`](../../../release/channels/stable.json) | Version `0.0.0`, “not published” note, `example.invalid` URL, zero source/artifact hashes, `not-published` signature. | Checked-in value is an unpublished placeholder. | Not a usable Stable update or proof of production promotion. |

Manifest contents are static repository evidence only. A source SHA, artifact hash, or signature field is not cryptographic verification or runtime channel evidence.

### Required lineage and UAT

The [channel architecture](../../releases/release-channel-architecture.md) defines the target sequence: verify candidate tag-to-SHA lineage; run Rust and frontend lint/tests plus Tauri smoke build; build/sign once; record artifact hashes/signatures; publish the candidate to Dev without changing Stable. Promotion is manual and requires candidate existence, matching SHA256 and updater signature, passed Dev DoD, no unresolved S0/S1, and production-environment approval; it must promote the byte-identical artifact and update Stable atomically while recording the prior Stable version. Rollback points Stable to the last approved artifact or uses a higher emergency patch if downgrade is unsupported.

For Wave 0, controlled install/update UAT must establish all of the following before expansion: Dev sees the candidate; Stable cannot see it; update success is ≥95%; installer success is ≥95%; signatures verify; the same signed artifact is used through promotion; rollback/forward-fix drill passes; and evidence is linked to the release record. These are separate observations: a manifest file does not prove a client consumed it, and a successful install does not prove channel isolation or same-artifact promotion.

The architecture source is draft and lists `candidate-release.yml` and `promote-release.yml` as target components. Those release workflow implementations and their hosted checks were outside the inspected path set, so their current presence, triggers, exact commands, production-environment protection, and artifact lineage are **UNVERIFIED** here. Its §4 description of a single `latest.json` endpoint also conflicts with the checked-in three-manifest layout; neither document proves which updater path is deployed. Resolve this source/runtime discrepancy before asserting channel isolation.

## 5. CI, operator, and approval boundary

| Evidence lane | What is evidenced by inspected sources | What it cannot close |
| --- | --- | --- |
| Worktree/local checks | The README gives the exact P3, live-probe, and P7 commands in §3. | No commands were run here. The authorized source set gives no exact native smoke-build command, update UAT command, or release-candidate workflow invocation. |
| Hosted PR CI | No pull-request trigger or general CI result is established by the selected files. | Do not treat a PR as passing release tests based on the manually dispatched performance workflow. Required candidate lint/test/build workflow status remains unverified. |
| Hosted performance workflow | [`perf-gate.yml`](../../../.github/workflows/perf-gate.yml) uses `workflow_dispatch`, runs on `windows-latest`, stages `gpu-feeder`, and executes only headless `latency_harness`. It calls itself advisory on a shared runner. | Not PR CI, not P3 full, not P7 hardware evidence, not a release artifact/signing/promotion workflow. Model-missing exit 77 is converted to workflow success; inspect logs. |
| Operator hardware | `latency_live`, P7 ETW/FPS, and Wave 0 coverage/compatibility checks require local hardware and visible/operator-controlled state. | Hosted green status cannot substitute for display/audio measurements, real FPS captures, or tester coverage. Skip/partial results remain open. |
| Controlled install/update UAT | Wave 0 DoD owns tester counts, install/first-run/GSI/DXGI/update success, coverage, stability, diagnostics, and operational drill results. | A local smoke build or populated manifest cannot supply cohort rates or prove release isolation. All inspected actuals are pending. |
| Owner-only promotion | The roadmap assigns promotion approval to the Product Owner/Boss; the channel architecture requires production-environment approval and auditable manifest promotion. | This matrix grants no promotion authority and records no owner approval. Only the designated owner can accept exceptions or promote Stable. |

## 6. Open gates before a release decision

1. Define the product meaning and acceptance tests for Full and Lite/Compatibility Mode. The inspected sources do not define Lite semantics; keep it distinct from P3 headless/full gates and `replay_fit` modes.
2. Resolve the P3 p50 target versus documented p99-only exit condition; ensure release evidence tests both stated latency limits.
3. Reconcile the draft release architecture's single-endpoint current-state statement with the checked-in channel manifests and verify which updater/workflow paths actually exist and are deployed.
4. Supply exact candidate workflow commands/results, tag/source lineage, installer/updater signature verification, artifact hashes, and evidence records; none were verified by this task.
5. Run and retain local full P3 and P7 measurements on appropriate operator hardware. Resolve all SKIPs; a P3 model-missing code 77 or P7 prerequisite code 77 is not a pass.
6. Complete controlled Wave 0 UAT and populate every required metric/coverage cell. Current DoD actuals are blank and status fields are Pending.
7. Demonstrate Dev/Stable isolation, same-artifact promotion, rollback/forward-fix, and production approval in controlled release evidence. Current closed-beta and Stable manifests are placeholders.
8. Reconcile the beta-roadmap header/changelog version mismatch before using its metadata as a release record.

No release, channel, artifact, performance, privacy, or promotion gate is marked passed by this document. Every runtime and UAT result remains **NOT RUN / UNVERIFIED** until its specified owner supplies evidence.

## Changelog

| Version | Date | Summary | Owner |
| --- | --- | --- | --- |
| 0.1.0 | 2026-10-01 | Mapped Full/Lite/model-missing, native/update, P3/P7, manifest lineage, hosted workflow, UAT, and owner-promotion acceptance evidence. | Product Owner Agent (Luna Max) |
