---
title: "Gap Closure Product Owner Decisions and Execution DAG"
doc_id: "gap-closure-product-owner-decisions"
status: "active"
version: "0.1.0"
updated: "2026-10-01"
owner: "Product Owner Agent (Luna Max)"
attributes:
  doc_type: "decision-record"
  change_class: "C-3"
  risk: "HIGH"
  decision_authority: "Human-delegated product and local-scope decisions; no human signoff is implied"
  related_docs:
    - "docs/audits/gap-analysis-2026-09-12.md"
    - "docs/operations/EXEC-PLAN-CR-034-iam-remediation.md"
    - "docs/product/product-requirements.md"
    - "docs/product/software-requirements-specification.md"
    - "docs/releases/release-channel-architecture.md"
---

# Gap Closure Product Owner Decisions and Execution DAG

## 1. Authority, scope, and risk

The human user delegated product-owner choices to the Product Owner Agent and assigned the root
agent to orchestrate the work. The user also authorized read-only browser/computer use to inspect
needed values and specified Luna Max for all workers. This record makes product and technical
choices within that delegation. It does not claim a human, legal, provider, production, release, or
merge approval.

This is a C-3 / HIGH decision set because it affects account assurance, entitlement revocation,
developer-tool exposure, privacy boundaries, and future feature architecture. This change itself
adds documentation only. It does not change application code, provider settings, database state,
payments, release channels, or deployment state.

The executable scope now is evidence management, documentation/contract lanes, and review of the
DAG. A future code slice may proceed only after its feature contract is recorded and the Product
Owner Agent approves that bounded local scope. Root owns integration and generated documentation
artifacts. The root agent must keep each worker in a separate worktree and use Luna Max for every
worker.

The current audited sources are not all from one revision. The gap report is a 2026-09-12 source
snapshot. The selected decision-record worktree is based on `origin/main` at
`2d969ac643533b4b8e24494356da2e818eac874f`; root reports that UI remediation branch commit
`1b35252` is still represented by open Draft PR #50, not by that base. Conclusions below identify
their evidence revision or date where it matters.

## 2. Evidence state and limits

| Item | Evidence | Status and limit |
| --- | --- | --- |
| IAM and product gaps | [Gap analysis](../audits/gap-analysis-2026-09-12.md), compared with the PRD, SRS, CR-034 plan, feature specs, and source in this worktree | Source-grounded audit snapshot; its production observations are not current production proof. |
| Supabase project | Root's authenticated, read-only Chrome observation on 2026-10-01: `gstore` project `wsseitulmcgnolgsrxgh` displayed “Project gstore is paused” and a Resume project button | `BLOCKED_PROJECT_PAUSED` for current provider configuration, hosted IAM probes, and production UAT. Resume was not clicked. See the root evidence artifact at `.brain/execution/gap-closure-2026-10-01/browser-evidence.json`. |
| Documentation graph | Root's refreshed strict scan: base `origin/main` has 217 findings / 161 scanner blockers; the UI branch has 216 / 160. Fourteen severity-error entries are covered by the existing checklist and uncovered count is zero. | Existing wrapper acceptance is not a clean raw strict scan. Preserve the exact branch baseline and add no uncovered findings; do not describe the graph as violation-free. |
| Semantic Code-Doc check | Configured Mellum model was absent from Ollama's 34 installed models, per root's environment check | `INDETERMINATE`. Do not substitute another model or claim semantic alignment. |
| Current code facts | `isGoogleIdentity` checks `app_metadata.provider` or whether `app_metadata.providers` contains Google; `iam_runtime.ts` defaults `requireAal2` to true; five user-facing functions lack `requireIamContext`; Orchestra calls `server.listen(PORT)` and exposes `POST /api/cmd`; Motion is an off-map/heading heuristic; capture enters Lite mode when DXGI is unavailable | Static local-source evidence only. It does not establish current hosted deployment, live user sessions, device performance, or release behavior. |

The root's read-only browser evidence and the source audit are distinct evidence streams. Because the
project is paused, no current provider setting, live session method, revocation propagation, or
hosted function health is inferred from the older production snapshot.

## 3. Decisions D1–D4

These D1–D4 labels belong to this record. They do not silently update the separate `Boss`-owned
state table in EXEC-PLAN CR-034. Root must reconcile that table and its evidence fields explicitly;
until then, do not report CR-034 tasks as `DONE` merely because this delegated decision exists.

### D1 — Preserve AAL2 until enrollment is complete

**Decision: choose option B from EXEC-PLAN CR-034.** Keep AAL2 required for all privileged
admin/owner capabilities until TOTP enrollment and step-up are implemented and verified end to end.
Do not lower `gmad.batch.manage` to AAL1 and do not disable AAL2 globally. Admin operations may
remain unavailable while enrollment is missing; that is the accepted security tradeoff.

**Evidence:** `requireIamContext` defaults `requireAal2 = true` in
[`iam_runtime.ts`](../../supabase/functions/_shared/iam_runtime.ts). The gap analysis reports no
enrollment UI in `AccountSecurity.tsx`; EXEC-PLAN CR-034 records zero MFA factors and zero AAL2
sessions from its 2026-08-28 production read. That count is historical, and current live state is
unavailable while `gstore` is paused.

**Exit gate:** enrollment, step-up, recovery behavior in scope, normal-user rejection, session
revocation, and admin UAT must pass before privileged actions are declared usable. No blanket
bypass is approved.

### D2 — Google must authenticate the current session; exact proof mechanism is blocked on evidence

**Decision:** retain Google as the sole normal primary sign-in policy. A linked Google identity is
not proof that the current session was minted through Google. Do not select or implement a session
claim interpretation, auth hook, or fallback based on assumptions. First collect sanitized evidence
from an actual Google-authenticated session and inspect the current provider configuration when the
Supabase project is available. Until then, record the mechanism as
`BLOCKED_PROJECT_PAUSED` / `SESSION_METHOD_EVIDENCE_REQUIRED`.

**Evidence:** [`entitlement.ts`](../../supabase/functions/_shared/entitlement.ts) checks linked
`provider` / `providers` metadata. The gap analysis's synthetic case (`provider=email`,
`providers=[email,google]`) passes that predicate; it demonstrates that identity linkage alone is
insufficient, not that a live non-Google login currently works. The
[Supabase JWT field guide](https://supabase.com/docs/guides/auth/jwt-fields) describes `amr` as an
optional methods list; an `oauth` method identifies OAuth authentication, not which OAuth provider
was used. Therefore `amr.oauth` alone is not Google proof, and a missing `amr` must not fall back to
linked-identity acceptance. The existing CR-034 task T7 is a candidate, not an approved claim
contract; its proposed interpretation must be revised against verified JWTs and server-authoritative
provider/session evidence. The paused project prevents that probe now.

**Boundary:** provider disablement, signup-hook registration, and remediation of existing email or
password credentials are remote Auth configuration/account actions. This decision does not perform
or claim those actions. Do not silently fall back to linked identity when proof is missing.

### D3 — Apply live-session revocation to all five user identity/entitlement endpoints

**Decision: choose option C in EXEC-PLAN CR-034.** Require a live-session check before work in all
five user-authenticated functions: `mint-gid`, `check-gmad-queue`, `accept-closed-beta-terms`,
`get-gmad-desktop-entitlement`, and `request-gmad-download`. A revoked session must fail on its next
request to any of these functions. Fail closed when the live-session dependency is unavailable.
Provider-authenticated callbacks such as the payment webhook are outside this user-session policy.

**Evidence:** GAP-04 reports that the five functions use `getUser()`/ownership checks but not the
shared live-session query, while the admin and IAM functions use `requireIamContext`. The gap report
identifies a possible JWT lifetime of up to 3600 seconds and requires a per-endpoint decision. The
CR-034 plan notes that broader checks add Auth/database coupling on landing paths; that cost is
accepted because queue access, Terms receipts, GID minting, runtime entitlement, and download URLs
all depend on current account authority.

**Exit gate:** isolated tests must prove each endpoint rejects a revoked/reused token and handles
unavailable IAM dependencies fail-closed. Hosted UAT remains blocked by `gstore` being paused.

### D4 — Stop claiming `/ops` is a shipped operator UI

**Decision: choose option B in EXEC-PLAN CR-034.** Do not build `/ops` in this gap-closure wave.
Describe the current repository as having an admin Edge Function but no shipped operator UI. Treat
the route's current deployment state as unverified. Supersede or correct CR-018's active route
assertion and remove `/ops` as a current product capability claim. A future operator UI requires a
separate C-3 contract covering route/rewrite, authentication, AAL2, capability checks, and negative
tests.

**Evidence:** current [`landing/src`](../../landing/src/main.tsx) has no `OpsPage` route and
[`vercel.json`](../../landing/vercel.json) has no rewrite. The existing
[CR-018](../change%20request/CR-018-ops-route-spa-rewrite.md) still describes an `OpsPage` and has
a historical changelog entry asserting a production rewrite; current source does not substantiate
that claim. The `admin-gmad-controller` function is not a browser UI. The paused project also
prevents treating the historical deployment note as current route proof.

## 4. Additional product and technical decisions

### D5 — Keep G-Orchestra as a local developer tool

G-Orchestra is not part of the player runtime and will not expose remote management in this work.
The approved product boundary is explicit local developer launch only. Before changing its HTTP
server, a C-3 security contract must require an explicit loopback bind, a per-process unguessable
capability for mutating routes, and Origin/Host checks against browser-based cross-site requests.
Do not add remote authentication or public/network binding without a separate product decision and
threat model.

**Evidence:** [`server.mjs`](../../orchestration/server.mjs) registers mutating `POST /api/cmd`
actions and calls `server.listen(PORT)` without an explicit host or caller-authentication boundary.
Printing a localhost URL does not prove the listener binds only to loopback.

### D6 — Describe G-Motion as a heuristic risk indicator

Keep the current off-map-time and pre-vanish-heading heuristic as the shipped capability. User-facing
claims and feature contracts must not promise a heatmap, through-fog route prediction, or calibrated
location-specific probability. Until holdout calibration exists, describe the numeric output as a
heuristic risk score/proxy, not a statistically calibrated probability. Any learned route model is
a separate C-3/HIGH change requiring authorized data, holdout evaluation, and a privacy review.

**Evidence:** [`motion.rs`](../../src-tauri/src/motion.rs) implements default ramps, decay,
multi-hero boost, and heading adjustment; the gap analysis finds no full heatmap or learned path
model. `capture.rs` constructs `Motion::new()` with default parameters, so the offline fit harness
does not by itself establish that fitted values are used by the live pipeline.

### D7 — Sequence Memory, Voice, then Coach behind privacy contracts

Use this product order:

1. Reconcile the G-Memory contract first: local storage, provenance, retention, deletion, and
   retrieval rules. G-Memory and raw G-Log remain on-device; do not include their content or
   aggregates in cloud prompts under the current contract.
2. Specify G-Voice as explicit push-to-talk, with no continuous microphone capture, a cancel path,
   and G-Signal preemption. Build local capture/STT and local-model behavior only after that feature
   contract is approved. Cloud STT/LLM with live GSI or memory context stays blocked until a separate
   egress/consent contract resolves the SRS cloud-flow requirement against the local-only privacy
   requirement.
3. Schedule G-Coach after G-Log event provenance and timestamped golden fixtures are stable. Keep
   analysis post-match and local by default. Any cloud analysis requires a separate documented
   data-flow/consent decision; raw G-Log and G-Memory may not be sent.

**Evidence:** SRS §§3.7–3.9 set G-Voice and G-Memory to P0 and G-Coach to P1; SRS §3.8 says memory
stays local. FEAT-G-MEMORY says “local only” but later allows an aggregate summary into cloud prompts;
FEAT-G-VOICE assumes GSI and Memory context reaches a Cloud Brain; FEAT-G-COACH proposes aggregate
match stats to cloud. Those specifications conflict at the data boundary. This decision chooses the
stricter existing local-only constraint until the conflict is resolved through an explicit change
request; it does not claim the companion features are implemented.

### D8 — Preserve the documentation debt baseline and plan path-specific CI

Treat the existing checklist-covered strict graph findings as baseline debt, not as a clean scan.
Generated graph/index artifacts must be regenerated and committed by root with the document change.
The acceptance condition for this DAG is no newly uncovered strict finding, plus the existing
structural wrapper and link/frontmatter checks. The configured Code-Doc semantic check remains
`INDETERMINATE` until its required model is present; do not replace it silently.

Before CI workflows change, write a path-to-test contract that runs the relevant Deno, landing,
SQL/RLS, and Orchestra suites when their sources change. No workflow edit is authorized by this
decision record. A wrapper pass or source-level unit test is not hosted/runtime/production evidence.

**Evidence:** root's refreshed strict scans report different counts for `origin/main` and the UI
branch; the 14 severity-error entries are checklist-covered and uncovered count is zero on each
reported baseline. The older gap report separately records a wrapper pass alongside raw strict
findings and an indeterminate Code-Doc result.

### D9 — No version churn or release action during gap closure

Do not bump application versions, create/push tags, cut a candidate, or promote a channel for this
work. Accumulate small fixes through the normal PR path. A release begins only on an explicit
release request and after exact-commit CI and the applicable channel evidence gate pass.

**Evidence:** [`CLAUDE.md`](../../CLAUDE.md) release workflow requires manual channel promotion and
states that small fixes accumulate without tags; the release-channel architecture binds promotion to
the same signed artifact and requires owner-controlled production approval.

## 5. Executable DAG

The root agent owns integration, generated artifacts, worker assignment, and final handoff. Parallel
lanes must use separate worktrees. The first wave is documentation, evidence, and DAG review only;
feature implementation stays behind per-slice contracts.

```mermaid
flowchart TD
    E0[Evidence snapshot: branch, source, dashboard, scan baselines] --> P1[PO decisions D1-D9]
    P1 --> R1[Root integration, generated docs, structural gate]
    R1 --> IAM[CR-034 and account-contract reconciliation]
    R1 --> OPS[/ops claim reconciliation]
    R1 --> ORCH[G-Orchestra local-only security contract]
    R1 --> CAP[Motion and Lite capability-claim reconciliation]
    R1 --> COMP[Memory, Voice, Coach privacy/sequence contracts]
    R1 --> CI[Path-specific CI and evidence contract]
    IAM --> ICODE[Bounded local IAM implementation after contract review]
    ORCH --> OCODE[Local Orchestra hardening after threat-model review]
    CAP --> CCODE[Bounded capability/copy changes after contract review]
    COMP --> MCODE[Separate feature slices after contracts and local PO approval]
    ICODE -. hosted UAT .-> LIVE[BLOCKED_PROJECT_PAUSED]
    IAM -. session-method semantics .-> LIVE
    CI --> ACCEPT[Exact-commit acceptance evidence]
    ICODE --> ACCEPT
    OCODE --> ACCEPT
    CCODE --> ACCEPT
    MCODE --> ACCEPT
    ACCEPT --> RELEASE[Owner-controlled release gate; outside this wave]
```

| Node | Dependency | State | Scope and exit evidence |
| --- | --- | --- | --- |
| E0 — Evidence snapshot | — | DONE by root | Preserve branch/revision, UI PR state, paused-project browser evidence, strict graph counts, and model availability in the execution evidence directory. No provider or production mutation. |
| P1 — Product-owner decisions | E0 | DONE in this branch | This decision record; SHA-256 recorded at handoff. Decisions remain separate from CR-034's state table until root reconciles it. |
| R1 — Root integration and structural gate | P1 | READY / root-owned | Regenerate doc graph/index artifacts, check metadata/links/anchors and no-new-uncovered-findings against the correct branch baseline, then perform structural review. DAG is accepted only after root review and independent PO review. |
| IAM — Account contract reconciliation | R1 | DISPATCHABLE, docs only | Reconcile D1–D3 with CR-034, including explicit live-session scope and blocked live-evidence states. Do not edit Boss-owned state cells as DONE without root recording the delegation/evidence. Provider settings and live UAT remain blocked. |
| OPS — Operator-route claim reconciliation | R1 | DISPATCHABLE, docs only | Reconcile active product docs and CR-018 with D4 while preserving historical changelog facts. State current source facts separately from unknown deployed route status. |
| ORCH — Developer-tool security contract | R1 | DISPATCHABLE, design only | Produce a C-3 threat/security contract for D5 before touching server code or adding a caller boundary. |
| CAP — Capability claims | R1 | DISPATCHABLE, docs only | Align Motion/Lite claims to observed heuristic/capture behavior; do not modify prediction logic or introduce a model. |
| COMP — Companion privacy and sequence | R1 | DISPATCHABLE, docs only | Reconcile the conflicting Memory/Voice/Coach contracts from D7. Do not add microphone, STT, storage schema, prompt egress, or Coach implementation in this wave. |
| CI — Verification contract | R1 | DISPATCHABLE, planning only | Map source paths to existing suites and propose CI coverage; preserve strict scanner debt counts and make no workflow changes in this wave. |
| Local implementation slices | Matching contract accepted | BLOCKED pending contract and scoped dispatch | Root may dispatch one bounded local code slice per accepted contract. Each slice needs its own acceptance checks and evidence; no blanket approval for the entire roadmap is implied. |
| Hosted provider/UAT work | Local contract plus owner-controlled environment | BLOCKED_PROJECT_PAUSED | Recheck project health/config/session evidence after an authorized state change. Do not resume the project as part of this DAG. |
| Release | Exact-commit acceptance evidence | OUT OF SCOPE | No version bump, tag, candidate, promotion, or release approval in this wave. |

## 6. Decision and evidence handling

- Record local source facts with commit/path evidence; record external state with observation time,
  source, and whether an action was read-only.
- Use `BLOCKED_PROJECT_PAUSED` for hosted checks that require the paused `gstore` project and
  `SESSION_METHOD_EVIDENCE_REQUIRED` for the unverified Google session mechanism.
- Use `INDETERMINATE` for semantic Code-Doc status until the configured model is available. Do not
  replace the model without an explicit decision.
- The Product Owner Agent may resolve routine product/technical choices within an approved local
  contract. Root retains orchestration/integration. Human, legal, provider, production, payment,
  release, and merge authority are not implied by this record.
- No code change or bug fix was made here, so this record does not create a new RCA. Existing gap
  findings remain the evidence base for the future remediation lanes.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-01 | Recorded delegated product decisions D1-D9, current evidence boundaries, and the documentation-first gap-closure DAG. |
