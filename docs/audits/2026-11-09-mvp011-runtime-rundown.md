---
title: "G-Maiden MVP-011 Phase A runtime rundown"
doc_id: "2026-11-09-mvp011-runtime-rundown"
status: active
version: "0.1.1"
updated: "2026-11-09"
owner: "G-Maiden"
related_docs: ["mvp-backlog", "mvp-decisions", "PLAN-MVP011-READINESS-SEMANTICS-20261028"]
---

# MVP-011 Phase A runtime rundown

The assigned single-writer lane is `gm-wf-mvp-011`, branch `wf/mvp-011`, at base
`472de123f797fcfd136f8ebfadea482636cc44b6`. The worktree was clean at entry.
This is an uncommitted display-only change under [[mvp-decisions]] and [[mvp-backlog]].
The orchestrator retains commit/PR/integration responsibility. No version source,
Rust code, subscriptions, batching, capture-health semantics or cloud path changes.

## Evidence wired

- `ReadinessRundown` now calls the existing pure `readinessFromRuntime()` in production.
  Existing companion GSI activity/freshness inputs are mapped conservatively; fresh,
  active GSI is the only checkmark. No process/port/config evidence is invented.
- The dashboard passes `heroCv.health`. `liteMode()` distinguishes an absent payload
  from an explicit Lite backend. Lite reads `Lite mode · ไม่มี minimap CV` with `!`.
  Working capture reads `จับภาพทำงาน · ยังไม่ยืนยัน coverage` with an observation circle;
  a missing classifier remains degraded. Capture evidence never passes minimap coverage.
- `CompanionData.resourceSample` copies only the latest raw `live.stats` RAM/CPU/budget
  fields. Both MOCK and FALLBACK use null; the rundown never reads MOCK-backed telemetry.
  The separate `resourceReadiness()` returns unknown for null/no sensors, degraded for
  authoritative `over_budget`, and observed otherwise. It never returns ready or
  recomputes the 900,000,000-byte limit. Individual unavailable metrics display a dash.
  Every observed sample explicitly says whole-match acceptance is still unconfirmed.
- Overlay receives `overlayReady: null`. Audio retains the existing unknown contract
  and reads `ยังไม่ทราบ · รอ audio health`. Preview does not establish either health state.
- Pack, G-Signal, ANN and volume remain configuration/disabled/unknown rows. Preview's
  button and callback are unchanged. The existing fixed 276px seat cannot accommodate
  all nine rows, so R2 measures available list/row height, reserves an explicit `+N`
  overflow row, and exposes omitted values in its title. Rows do not shrink; the existing
  list/page overflow rules are retained. Only the degraded glyph adds a CSS rule, using
  the existing `--g-warn` token. Mounted resize tests are not rendered-layout acceptance.

## Verification and disposition

Initial tests were written before implementation. The standard Vitest commands fail
before collection because the execution environment rejects esbuild child-process
creation with `spawn EPERM`. Git Bash also fails with `CreateFileMapping ... error 5`.
A temporary, untracked runner uses installed Vitest 1.6.1, one worker thread,
TypeScript in-process transpilation and Vite `preserveSymlinks`; repository test/build
configuration and dependencies are unchanged. This alternate runner is supplementary
evidence, not a claim that the requested standard commands passed.

- Alternate targeted RED: **23 failed / 18 passed**. Missing helpers, runtime rows,
  null MOCK resource sample and bounded overflow explain the failures.
- Alternate resize regression RED: **1 failed / 40 passed**. Re-expansion from a
  summary-only list had used a detached first row; measurement now reads the current row.
  A further **1 failed / 40 passed** regression caught fractional row-height clipping;
  computed border-box height now preserves fractional pixels before deck scaling.
- Alternate targeted GREEN: **41 passed / 2 files** (12 added pure-helper cases and
  11 added mounted cases). Existing configuration/preview cases remain passing.
- `npx.cmd tsc --noEmit` and `npx.cmd eslint src`: exit **0**, no diagnostic output.
- Alternate full suite: **806 passed / 2 failed / 81 files**. The failures are
  `listenerLifetime.test.tsx` (late CommandDeck settings-listener disposal) and
  `voiceSettingsRendering.test.tsx` (Voice subtree stability during parent publications).
  Both existing jsdom setups lack `ResizeObserver`, now required by the rundown's R2
  measurement. They are outside the exact assigned file scope; the proposed correction
  is a no-op ResizeObserver stub in each setup, pending a specific scope update.
- A second temporary runner supplies exactly that browser-API stub without editing
  either out-of-scope test file: **808 passed / 81 files**, exit **0** on the final source.
  This validates the proposed setup correction; it does not mark the unchanged repository
  full-suite setup green. Existing GoTrueClient/React act warnings and the expected GANN
  decode-rejection diagnostic remain in the log; they were not changed.
- Production Vite build is **BLOCKED** by the missing qualified owner/OS operational
  floor, write/growth bounds and resolved volume preflight required by lifecycle policy
  section J. The sandbox's drive inventory also returned null free-byte measurements.
  No Rust build was attempted. A free-space percentage is not admission.
- `node tools/doc-graph/ci-gate.mjs`: exit **1**; its child suite exits null and child
  commands return -1 under the subprocess restriction. Direct generator commands ran
  serially: encoding **0**, strict scan **1**, ledger **0**, orphan report **0**. All six
  requested graph/ledger/orphan/index artifacts were regenerated in this worktree.
  Strict scan reports **296 nodes / 1388 edges / 31 violations / 5 blocking**: four
  line-anchor drifts after the additive source changes, plus the pre-existing CR-047
  version/changelog mismatch. The new audit has no violations. The aggregate gate's
  severity-based coverage display does not establish that these strict findings pass.
- `node tools/doc-graph/artifact-freshness.mjs`: exit **2**, reporting all six artifacts
  MISSING because its `git show` subprocess cannot run. The files exist. Independent
  direct `git show HEAD:<path>` plus the script's exported normalization/comparison
  confirms content drift in DOC-GRAPH.json, DOC-GRAPH-REPORT.md and atomic_index.jsonl;
  ledger/orphan changes are generation timestamps only. Freshness compares committed
  HEAD with generated files and must be rerun after the orchestrator's commit.
- `git diff --check`: exit **0**. HEAD remains the assigned base. No commit, push,
  tag, version bump or change to the MVP-011 backlog status occurred.

MVP-011 remains **IN_PROGRESS**; its backlog row is unchanged. Disposition:
**BLOCKED_BY_DEPENDENCY** for standard tool execution and the two test-setup scope
updates, with **BLOCKED_BY_UAT** for rendered 1280x720 compact standby/prep verification,
native overlay bootstrap/visibility, acoustic output, and Phase B's MVP-016/017/024
producers. Resume after the orchestrator supplies the test scope decision, normal
subprocess execution, qualified frontend build preflight, and the relevant UAT evidence.
No merge/release/cleanup eligibility is asserted.

## Out-of-scope findings

Resource samples have no staleness timestamp in this contract; observation is not
whole-match MVP-048 acceptance. Capture geometry/foreground/coverage remain with
MVP-016/017. A deck-side overlay health producer and audio health (MVP-024) remain absent.
Settings/Control readiness, G-Signal's pure-Rust latency path and privacy/data egress
are unchanged. No live/native/acoustic acceptance is inferred from unit tests.

The two missing jsdom ResizeObserver setups and four stale line anchors are recorded,
not silently repaired outside scope. Anchor owners: `docs/architecture/engineering-spec.md`
line 277 and `docs/audits/2026-07-07-independent-full-audit.md` line 122 refer to
`useCompanionData`; `docs/design-system/04-components.md` lines 257/414 refer to styles.
The separate pre-existing CR-047 mismatch is also left unchanged. Scope approval and
normal CI/tool execution are required before calling this slice ready for integration.

## Independent review (standard commands)

The orchestrator's reviewer reran the standard commands outside the sandbox. It also added
one in-scope guard to `onair.tsx`: when `ResizeObserver` is undefined (jsdom hosts),
the rundown keeps its single initial measurement. This makes the two out-of-scope test
setup patches unnecessary. WebView2 provides `ResizeObserver`, so production behaviour
is unchanged.

- Targeted Vitest on base source with the new tests: **23 failed / 18 passed** (RED).
  After the change: **41 passed / 2 files** (GREEN).
- `npx tsc --noEmit` exit 0; `npx eslint src` exit 0; `npx vitest run`
  **808 passed / 81 files**.
- `npx vite build` exit 0, as a sanity build only (not release/native acceptance).
- `node tools/doc-graph/ci-gate.mjs`: **PASS**.
- Reviewer note: stale GSI now uses the helper's `degraded` status (`!`) instead of
  `unknown`. Its text `ข้อมูลล้าสมัย` and the rule that only fresh, active GSI is ready
  are unchanged.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-09 | Wire conservative runtime evidence into Phase A rundown and record bounded tests, environment/scope blockers and open Phase B acceptance. |
| 0.1.1 | 2026-11-09 | Record independent standard-command verification and the jsdom ResizeObserver guard. |
