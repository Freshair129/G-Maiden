---
title: "Gap-closure evidence contract"
doc_id: "gap-closure-evidence-contract"
status: active
version: "0.1.0"
updated: "2026-10-01"
owner: "RWANG"
---

# Gap-closure evidence contract

This contract gives the gap-closure execution DAG a consistent way to distinguish source facts,
local checks, controlled user acceptance, deployed configuration, and released behavior. It covers
the evidence and decisions needed to sequence the historical GAP-01–GAP-23 audit and CR-034. It
does not authorize application changes, provider changes, migrations, deployment, or release.

## 1. Evidence classes and status

Assign each claim one evidence class. A later class does not follow automatically from an earlier
one; for example, a passing local test does not prove a deployed function or a released updater.

| Class | What it establishes | Minimum record |
| --- | --- | --- |
| `SOURCE` | Predicate or contract present at a named repository SHA | File/symbol, SHA, and exact condition or absence |
| `LOCALTEST` | An isolated test/build/check ran against a named SHA | Exact command, exit/result, test count, environment, and skipped cases |
| `CONTROLLED_UAT` | A named flow worked or failed with approved non-personal fixtures against a specific target | Target alias, UTC time, artifact/build SHA, scenario, sanitized result, and cleanup result |
| `DEPLOYED` | Provider configuration, function, migration, grant, or route is present in a named environment | Dashboard/API evidence, target alias, deployment/version or migration IDs, and observation time |
| `RELEASED` | A signed artifact is published and selected by a release channel, with install/update behavior proven where claimed | Source SHA, artifact digest/signature presence, manifest/channel revision, workflow run, and install/update result |

Use these result states beside the class: `PASS`, `FAIL`, `NOT_RUN`, `NOT_VERIFIED`,
`BLOCKED_PROJECT_PAUSED`, or `INDETERMINATE`. `NOT_RUN` is not failure. `BLOCKED_PROJECT_PAUSED`
applies only to observations that require the paused project; independent source review and local
tests remain actionable. `INDETERMINATE` means the evidence mechanism could not produce a valid
verdict, not that the product passed or failed.

Every record must name the claim and repository SHA. Keep credentials out of evidence: never save
tokens, client secrets, service keys, OTPs, signed URLs, raw JWTs, emails, phone numbers, GIDs,
session/user IDs, or personal user rows. Store only secret presence/absence, sanitized host/path
parts, aggregate counts, and pass/fail outcomes. Do not retain a real token to prove a claim.

## 2. Baseline and freshness

The source baseline for this worker’s inspection is `2d969ac643533b4b8e24494356da2e818eac874f`
(`origin/main` in `F:\gm-gap-evidence`); it excludes the open Draft PR #50 UI changes. The
orchestrator’s fresh scan of this baseline is the DAG comparison point. Do not merge it with the
separate primary-worktree scan.

| Snapshot | Evidence and boundary |
| --- | --- |
| Fresh `origin/main` scan | 217 findings and 161 raw blockers; 14 severity-error findings are checklist-covered and 0 are uncovered. Checklist coverage does not mean the strict source scan is clean. |
| Primary worktree `1b35252` | 216 findings and 160 raw blockers. This is a different tree and must not replace the fresh baseline. |
| Primary-worktree test report | Orchestrator reported Rust 293 passed / 0 failed / 5 ignored, desktop Vitest 290 passed, and TypeScript, ESLint, and clippy passed. These results belong to that primary tree; they were not rerun here and do not attest to the `2d969ac` baseline. Draft PR #50 checks were reported successful while the PR remained open. |
| Live Supabase dashboard | Orchestrator observed the `gstore` main Production project as `PAUSED`; Auth, Database, and Storage controls were disabled and a Resume control was visible. No resume action was taken. Configuration behind the pause is `NOT_VERIFIED`. Canonical sanitized observation: `.brain/execution/gap-closure-2026-10-01/browser-evidence.json`. |
| Older CR-034 snapshot | Counts and provider/session observations dated 2026-08-28 are historical only. Do not present them as current production configuration or user/factor counts. |
| Code-Doc semantic alignment | `INDETERMINATE`: the configured Mellum model was absent from the available Ollama model set. No alternate model was installed or selected. |

This worker ran no tests, production probes, migrations, deployments, or provider operations. Current
source facts below are `SOURCE` observations at the worker baseline; deployed and released states
remain separate claims.

## 3. Source predicates that the DAG must preserve

### Desktop sign-out and entitlement gate

- [auth.ts](../../src/src/auth.ts#L131) delegates to [`signOutCurrent`](../../src/src/securitySession.ts#L29).
  The source order is native runtime lock, remote current-session revocation attempt, then local
  auth cleanup. Current-session remote revocation uses the captured token with a five-second abort
  boundary in [`supabase.ts`](../../src/src/supabase.ts#L90). A native lock failure stops the operation; remote failure does not skip local
  cleanup; local cleanup failure remains visible and retryable. A successful local cleanup with
  unconfirmed remote revocation carries a separate warning. This is source behavior, not proof that
  a provider session was revoked.
- [`cleanupLocalSession`](../../src/src/supabase.ts#L72) is the local cleanup path. Tests in
  `src/src/__tests__/authRemediation.test.tsx` and
  `src/src/__tests__/securitySession.test.ts` exercise local compositions; the primary tree also
  has a recorded release-WebView/native-storage smoke. Controlled real-session UAT remains
  `NOT_RUN`.
- [`verify_gmad_entitlement`](../../src-tauri/src/lib.rs#L160) accepts only the server decision
  satisfying `EntitlementDecision::unlocks_runtime()` in
  [gmad_entitlement.rs](../../src-tauri/src/gmad_entitlement.rs#L42): eligible state, non-empty GID,
  and current Terms. It records a fresh success for the process-local cache. On re-verification
  failure, [runtime.rs](../../src-tauri/src/runtime.rs#L225) can return that decision as stale for
  at most 24 hours; cold start has no cache. Expiry is checked on re-verification, not asserted as
  an independent timer-driven lock. A denial does not become a stale grant.
- [`gmadEntitlement.ts`](../../src/src/gmadEntitlement.ts#L35) clears/gates signed-out and failed
  decisions, rejects responses from an obsolete request generation or active sign-out, and only
  keeps refresh quiet for `TOKEN_REFRESHED` after an eligible result
  ([gmadFirstRun.ts](../../src/src/gmadFirstRun.ts#L32)). Unit predicates and native state tests do
  not replace the real WebView/IPC/session test.

These current predicates supersede the pre-fix GAP-01/02 source description in the historical
audit. CR-034 execution-plan tasks T10/T11 still record the controlled session/grace UAT as pending.

### Google identity, session-method proof, revocation, and admin AAL

- [`isGoogleIdentity`](../../supabase/functions/_shared/entitlement.ts#L27) returns true when
  `app_metadata.provider === "google"` **or** `app_metadata.providers` contains `"google"`.
  [`resolveIamContext`](../../supabase/functions/_shared/iam.ts#L97) uses this account-identity
  predicate; it does not establish which method authenticated the current session. A linked Google
  identity can therefore satisfy the current predicate after another method signs in.
- The resolver decodes `sub`, `session_id`, and `aal`; calls Supabase `auth.getUser(accessToken)`
  and matches the user ID; checks the live session projection; enforces the call’s AAL2 flag; then
  loads a server-owned role and applies the capability map. The production dependency calls
  `iam_private.session_is_active(user_id, session_id)` through the bounded IAM runtime connection
  ([iam_runtime.ts](../../supabase/functions/_shared/iam_runtime.ts#L177)); the SQL function checks
  the matching row in `auth.sessions`
  ([Phase 1 migration](../../supabase/migrations/20260823221844_cr034_iam_phase1_foundation.sql#L61)).
  The IAM role does not receive direct `auth.sessions` access.
- CR-034 IAM coverage is limited in source. `admin-gmad-controller`,
  `iam-security-state`, `iam-security-events`, and `iam-session-action` call the common IAM
  resolver. `check-gmad-queue`, `get-gmad-desktop-entitlement`, `request-gmad-download`,
  `accept-closed-beta-terms`, and `mint-gid` call `auth.getUser()` but do not call the common live
  session projection. Record revocation coverage per endpoint; do not describe all product routes
  as immediately revocable. A `getUser()` check alone is not evidence that a still-valid JWT is
  rejected immediately after session revocation.
- `admin-gmad-controller` calls `requireIamContext` without overriding its `requireAal2 = true`
  default ([admin entry](../../supabase/functions/admin-gmad-controller/index.ts#L36),
  [runtime default](../../supabase/functions/_shared/iam_runtime.ts#L199)). Thus an AAL1 caller is
  denied with `403 step_up_required` before role-authorized admin work. The current Account
  Security page displays factor state but has no TOTP enrollment/step-up flow; check the source
  before claiming an admin can reach AAL2. The historical plan’s suggested temporary AAL1 route
  is an owner decision, not permission to lower AAL2.
- The repo’s [`supabase/config.toml`](../../supabase/config.toml#L278) contains a Google-only
  before-user-created hook and sets local TOTP/phone enrollment and verification flags to false.
  This is committed local configuration, not current hosted Auth configuration. The paused project
  makes current provider/hook/MFA settings `NOT_VERIFIED`.

### Session-method Google proof contract

The [Supabase JWT claims reference](https://supabase.com/docs/guides/auth/jwt-fields) documents
`amr` as optional and describes `amr.method = "oauth"` as OAuth provider authentication; that
method value does not identify Google. Do not code or report `amr` containing `oauth` as proof of
Google specifically.

Before closing GAP-03/T7, establish a supported, server-verifiable signal bound to the current
session using current official Supabase behavior and controlled tests. The test set must distinguish
Google-only sign-in, email-only sign-in, an account with both identities signing in by email, and a
refreshed token for the same session. Verify signed claims and provider-authenticated session
evidence without saving any token or personal identifier. Record only sanitized method/provider
outcomes and whether the current session was accepted. If evidence does not distinguish the
sign-in method, leave the predicate unresolved; do not guess a claim name or value.

## 4. Execution-DAG evidence matrix

This matrix names the checks and their dependencies. Local work may proceed while live provider
evidence is paused. Production-facing nodes remain gated on current, read-only configuration
inventory and an explicit Product Owner decision where the contract requires one.

| DAG node | Gap coverage and source/check surface | Available checks and dependencies | Required closure evidence |
| --- | --- | --- | --- |
| **Desktop auth and gate** | GAP-01/02; `auth.ts`, `securitySession.ts`, `supabase.ts`, `gmadEntitlement.ts`, `GmadFirstRunGate.tsx`, Rust `lib.rs`/`runtime.rs` | Desktop auth/remediation/security/gate tests; Rust grace/request-generation tests. Primary-tree tests were reported passing, but no test was run in this worker. Real UAT needs a supported, active Supabase target, approved non-personal account with Terms/grant, exact release build, Windows native IPC and DPAPI fixture. Dota is not needed for IAM sign-out or first-run gate UAT. | Controlled current-session sign-out for native-lock failure, remote timeout/rejection with local cleanup, cleanup failure/retry, and confirmed provider revocation; controlled cold-start, within-grace, expired-grace re-verification, denial, account change and stale-response cases. Record native and UI results separately. Real-session UAT is `NOT_RUN`. |
| **Landing routes and account surface** | GAP-03/05/15; `landing/src/main.tsx`, `landing/vercel.json`, `landing/src/gmadAccess.ts`, `src/src/AccountSecurity.tsx` | `landing/src/gmadAccess.test.ts` plus landing build/test scripts are available. Source has no `OpsPage` route or `/ops` rewrite; the admin function does not create a UI. Landing client tests do not prove hosted direct-navigation/refresh behavior. | D4=B is recorded: correct shipped-UI claims and preserve historical CR-018 evidence; no new /ops UI is selected. Current deployed route status remains NOT_VERIFIED. If a future contract selects a route, test direct navigation, refresh and auth/role/AAL states without user rows. Provider-dependent checks remain BLOCKED_PROJECT_PAUSED. |
| **Deno IAM and endpoint policy** | GAP-03/04/05; `_shared/entitlement.ts`, `_shared/iam.ts`, `_shared/iam_runtime.ts`, and the eight endpoint entry points named above | Pure helper suites exist in `supabase/functions/_shared/*.test.ts`; plan command: `deno test --allow-env --allow-net supabase/functions/_shared/`. Endpoint behavior also needs Edge Function checks. Do not run against real sessions from this worker. | Local tests for linked-provider negative cases, missing/revoked session, AAL1/AAL2, server-role forgery, capability boundaries, and each selected endpoint. Then controlled deployed probes with disposable authorized fixtures and sanitized status/error codes. D3=C is recorded: all five user identity/entitlement endpoints require live-session checks; do not silently widen or narrow the selected scope. |
| **SQL / RLS / grants** | GAP-04/05; CR-034 Phase 1/2 migrations and `supabase/tests/cr034_iam_phase1.sql`, `cr034_iam_phase2.sql` | `supabase test db` and pgTAP suites are available for an isolated local Supabase/Postgres stack. Phase 1 checks private schema, direct access denial, bounded projections, signup hook and append-only audit; Phase 2 covers session/device projections and event privacy. They are not production-grant evidence. | Run only on isolated local DB after dependencies are available; retain plan counts and role-level boolean results. Production inventory requires read-only aggregate grants/RLS evidence after project access returns. Never run `db push`, apply a migration, or emit per-user rows as evidence. |
| **G-Orchestra HTTP boundary** | GAP-06; `orchestration/server.mjs`, `engine.mjs`, `providers.mjs`, config and orchestration specs | Existing unit suites are under `orchestration/gks/` and `orchestration/store/knowledge.test.mjs`. Repository search found no dedicated HTTP bind/caller-boundary test for `server.mjs`. Static source shows a listener at `server.mjs:139`; actual network reachability is not established by a printed localhost URL. | D5 selects local-only developer use. The security contract must define loopback binding, per-process mutation capability and Origin/Host checks before code. Then test actual bind and authorized/unauthorized requests in an isolated process. No dispatch, reset, or provider call is authorized by the gap audit. |
| **Docs and CI map** | GAP-07/08/20/21/23; CR-034, execution plan, audit, SRS/PRD, `CLAUDE.md`, `AGENTS.md`, `docs/` graph | Required repo gate is `node tools/doc-graph/ci-gate.mjs`; `.github/workflows/ci.yml` visibly includes doc graph, clippy, ESLint, Rust tests, desktop Vitest and Tauri smoke. It does not include the Deno, SQL, landing, orchestration or live perf checks listed above. Semantic Code-Doc is `INDETERMINATE` until the configured model is available and explicitly authorized. | Keep one canonical state/decision record; update source docs only after owner choices or fresh evidence. Run doc-graph at integration and commit its required generated artifacts then. Strict scan findings stay visible even when checklist-covered. This worker did not run generators or Code-Doc. |
| **Performance acceptance** | GAP-07/18; `tests/perf/README.md`, `latency_harness`, `latency_live`, `perf_p7`, `.github/workflows/perf-gate.yml` | Headless harness measures CV/motion/signal/interrupt hops 2–5; capture and first audible output are skipped and budgeted on CI. Workflow is manual/advisory and a prerequisite skip does not establish full acceptance. Local full run needs the model, active display content, audio device, and target Windows/Dota setup. | For release claim, attach exact source/artifact SHA, hardware, Dota display mode, model presence, capture/audio device and process scope. Measure end-to-end p50 ≤250ms, p99 and maximum; any observed latency above 300ms violates the hard constraint. Separately capture CPU/RAM and game FPS comparison. Mark skipped legs `NOT_RUN`, never `PASS`. |
| **Updater and release channel** | GAP-07/18; `update_channel.rs`, `check_channel_update`, `install_pending_update`, channel manifests, `candidate-release.yml`, `promote-release.yml` | Rust channel logic and `scripts/releases/channel-manifest.test.mjs` are available. Candidate workflow verifies/builds/signs and publishes a prerelease; channel manifest PR and protected promotion are separate events. Source or CI alone does not prove an artifact was promoted or installed. | Verify exact signed artifact digest, signature, channel manifest revision and owner-approved workflow run. Controlled Windows update must show source version, selected channel, offer, install/restart, and resulting version. Current released/update state is `NOT_VERIFIED` by this worker. |

The current repository CI does not automatically close every node in this table. For each DAG edge,
record the input evidence and the state transition it authorizes; a missing check in CI remains a
separate `NOT_RUN` result rather than a generic blocker on independent work.

## 5. Read-only dashboard inventory

The orchestrator owns browser access. The October 1 observation is that the Supabase production
project is paused, its Auth/Database/Storage views are unavailable, and no Resume control was
activated. Do not claim current provider, MFA, function, migration, grant, or release configuration
from the August 28 execution-plan snapshot or from `supabase/config.toml`.

When the authorized project view is available, record only the following sanitized facts. A disabled
view is `BLOCKED_PROJECT_PAUSED`; an unseen value is `NOT_VERIFIED`.

| Area | Required sanitized fields |
| --- | --- |
| Google OAuth and public config | Provider enabled yes/no; OAuth client ID and secret present yes/no (never values); configured origin/redirect host and path coverage after removing query/user data; public URL/key presence only. |
| Supabase Auth providers | Google, email/password, phone, and anonymous sign-in enabled yes/no; signup policy; before-user-created hook enabled yes/no and hook target name. |
| MFA | Plan capability visible yes/no; TOTP and phone enroll/verify enabled yes/no; enrolled factor count and AAL1/AAL2 session counts as aggregates only. Do not capture the factor list or session rows. |
| Edge Functions | Expected function name and deployed yes/no, version/revision and deploy time; configured dependency secret names with presence/absence only. Do not capture environment values or request/response bodies with identifiers. |
| Migrations | Applied migration identifiers and timestamps for the IAM foundation/session migrations and identity-lock migration; compare to repository migration filenames. |
| Database grants/RLS | Schema/table/function existence, RLS enabled flags, grants by role as boolean/aggregate results, and Security Advisor severity counts. No row data or user/role membership lists. |
| Release state | Current dev/closed-beta/stable manifest revision, candidate tag/workflow state, signature and artifact-digest presence, and promoted channel. Do not store signed URLs or credentials. |

If the Dashboard exposes no equivalent read-only aggregate, leave the field `NOT_VERIFIED` and name
the missing access path. Do not resume the project, change a provider/hook, deploy a function,
apply a migration, modify a grant, or promote a release as part of evidence collection.

## 6. Controlled UAT prerequisites

Before a deployed IAM or native UAT node starts, all of these must be true:

1. The project is active through an owner-controlled action, and current provider/function/migration
   state has been recorded read-only. This prerequisite is currently unmet because the project is
   paused.
2. There is an approved, disposable test account and test entitlement/Terms fixture. Do not use
   personal user rows as a test plan or include identifiers in artifacts.
3. The exact endpoint/build SHA, test case, expected status, rollback/cleanup step, and evidence
   redaction rule are recorded before the request. Pass tokens only in process memory or a protected
   ephemeral environment; never print or save them.
4. Revocation tests use independently controlled sessions and compare each endpoint’s documented
   live-session policy. Record response class and time-to-reject, not raw request/response data.
5. Admin AAL tests need a controlled owner/admin role, working TOTP enrollment and challenge path,
   and a normal-user negative case. Production MFA setup and enrollment counts are not verified.
6. Desktop tests use the actual release WebView/native IPC path and a safe DPAPI fixture. Test native
   lock, local cleanup, provider revocation, and rendered UI assertions as separate outcomes.
7. Google method tests use separate Google-only, email-only, and linked-provider fixtures plus a
   token refresh case. Verify provider method evidence against supported Supabase behavior; do not
   retain a JWT or infer Google from generic OAuth method data.

These prerequisites gate only the corresponding UAT. Source review, local Deno policy tests,
isolated SQL/RLS tests, documentation work, and orchestration source analysis do not wait on live
project access.

## 7. Owner decisions are separate from evidence gaps

The historical 2026-08-28 board had pending choices. Root reconciled D1–D4 as delegated decisions
in CR-034 execution plan version 0.7.0b on 2026-10-01. The decision record is
[gap-closure-product-owner-decisions.md](gap-closure-product-owner-decisions.md). Decisions establish
scope and intent; they do not prove deployment or controlled acceptance.

| Decision | Recorded choice | Evidence that remains separate |
| --- | --- | --- |
| D1 | B: preserve AAL2; prepare TOTP enrollment without T1(A) | Enrollment/security contract, AAL policy tests, enrollment/step-up UAT, deployed Auth state |
| D2 | Google-only primary policy; defer provider/hook and legacy identity actions | Current inventory and supported server-authoritative session-method proof; no generic OAuth or linked-identity fallback |
| D3 | C: live-session checks on all five user identity/entitlement endpoints | Per-endpoint local negative tests and controlled post-revocation probes |
| D4 | B: correct shipped /ops UI claim; no new route UI this wave | Source absence recorded; current deployed route remains unverified; historical CR-018 preserved |
| D5 | G-Orchestra local-only developer tool | Approved HTTP security contract, loopback/capability/Origin/Host tests |
| D6–D9 | Honest heuristic capabilities; Memory→Voice→Coach with local privacy contracts; CI matrix and no release churn | Feature-specific contracts and tests, privacy/performance evidence, separately authorized release claims |

Missing production evidence does not block independent local work. A pending Product Owner choice
blocks only the dependent design or implementation node; it is not a reason to label every DAG node
blocked.

## 8. Historical gap traceability

The audit’s identifiers remain stable references. This mapping preserves all 23 without treating
every product gap as approved implementation scope for the immediate IAM/evidence DAG.

| Audit IDs | Primary DAG node or follow-up | Boundary |
| --- | --- | --- |
| GAP-01–02 | Desktop auth and gate | Local sign-out/grace source was remediated; controlled session and native/WebView acceptance remains distinct. |
| GAP-03–05 | Landing, Deno IAM, SQL/RLS, dashboard inventory | D1–D3 and method/revocation/MFA evidence; no guessed claim semantics or global AAL bypass. |
| GAP-06 | G-Orchestra HTTP boundary | Exposure model is a Product Owner decision; current listener source does not prove network reachability. |
| GAP-07–08 | Docs/CI, performance, updater | Exact artifact evidence and path-specific checks; a green desktop CI result is not full repository or release acceptance. |
| GAP-09–11 | Voice, Memory, Coach feature follow-up | Requires separate feature scope/acceptance; these gaps do not block IAM evidence work. |
| GAP-12–14 | Motion, observed enemy economy, G-Log feedback | Resolve capability/model/training policy before claiming SRS parity; local logs remain private. |
| GAP-15 | Landing `/ops` route | D4 plus published-route evidence if selected. |
| GAP-16–18 | Cloud scope, persona, mode/assets/performance | Separate product and packaging evidence; Gemini/provider or model gaps are not assumed defects. |
| GAP-19 | Economy/payment go-live | Separate approved economics and provider sandbox/owner gate. |
| GAP-20–21 | Docs/ledger and data-flow wording | Reconcile authoritative source and consent/privacy boundaries; no raw data in evidence. |
| GAP-22–23 | Stream masking and reference maintenance | Separate feature/maintenance decisions; no automatic model installation. |

Historical audit: [gap-analysis-2026-09-12.md](../audits/gap-analysis-2026-09-12.md). CR-034 task authority:
[EXEC-PLAN-CR-034-iam-remediation.md](EXEC-PLAN-CR-034-iam-remediation.md). Parent/peer requirements:
[CR-034](../change%20request/CR-034-gid-iam-production-completion.md),
[CR-022](../change%20request/CR-022-gmad-desktop-first-run-entitlement-account-handoff.md),
[SRS](../product/software-requirements-specification.md), and
[PRD](../product/product-requirements.md).

## Changelog

| Version | Date | Change | Owner |
| --- | --- | --- | --- |
| 0.1.0 | 2026-10-01 | Added evidence classes, current source predicates, per-node checks, sanitized dashboard inventory, and UAT prerequisites for the gap-closure DAG. | RWANG |
