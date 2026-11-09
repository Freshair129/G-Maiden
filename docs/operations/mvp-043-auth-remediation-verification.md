---
title: "MVP-043 Auth Remediation Verification"
doc_id: "mvp-043-auth-remediation-verification"
status: "active"
version: "0.1.0"
updated: "2026-11-09"
owner: "Boss"
attributes:
  doc_type: "account-security-verification"
  domain: "account-identity-security"
  change_class: "C-3"
  risk: "HIGH"
---

# MVP-043 Auth Remediation Verification

## Scope and provenance

Source/unit verification of [MVP-043](../product/mvp-backlog.md) against the
[sign-out contract](auth-failure-remediation-proposal.md) and
[MVP-004](../product/mvp-decisions.md). **This is source/unit evidence only.** It is
not native/WebView release-build, live Supabase, gameplay, acoustic, or
resource-budget acceptance.

- Branch: `wf/mvp-043`. Test writer: Codex. Independent reviewer/integrator: Claude.
- Exact origin/main base SHA: `472de123f797fcfd136f8ebfadea482636cc44b6`.
- PR head SHA: the commit that adds this revision of the document. The draft PR
  records the exact head. Re-run the commands below on that head before crediting them.
- No production source, dependency, or application-version change. No tag, release
  or merge.
- `auth.ts` and the OAuth callbacks belong to the separately assigned
  `wip/core-login-timeout` writer. MVP-044, MFA/SMS/recovery/public profiles,
  Supabase/edge/RLS changes, and backlog status changes are excluded.

Environment: Node `v24.20.0`, pnpm `9.0.0` (via `corepack`), Vitest `1.6.1`,
installed Supabase JS/auth-js `2.110.0`, Windows `10.0.26300` (not one of the
accepted native target builds 19045/26100).

## Test boundaries and additions

Tests use the existing jsdom mount harness with synthetic credentials and user IDs,
`example.invalid` emails, in-memory secret fixtures, and stubbed fetch and Tauri
invoke. No real credential, account or network is used.

The mounted tests keep the real production `useAuth`, `securitySession`,
`secureStorage`, `securityApi` and `supabase` modules, and the installed auth-js client.
The existing profile/identity and Tauri mocks stay in place. A3 injects a `SIGNED_IN`
message at the browser `BroadcastChannel` boundary, which exercises the SDK's own
event listener. It also adds a public `onAuthStateChange` subscriber, so the test
proves the SDK did see the event and the blocked-event assertion is not vacuous.
It calls no private SDK method.

The task adds seven executable cases (S1, S2, S3, A1, A2, and A3 for both user A and
user B) and one A4 `it.todo`.

| ID | File::test name | Added assertions | AC |
| --- | --- | --- | --- |
| S1 | `src/src/__tests__/securitySession.test.ts::ignores concurrent sign-out while cleaning and publishes done only once` | Local cleanup is deferred. A second call returns without another revoke or cleanup. The phases are exactly `cleaning` then `done`. | PASS |
| S2 | `src/src/__tests__/securitySession.test.ts::blocks Google sign-in during cleaning and failure, then clears the warning after done` | Sign-in preparation is rejected in `cleaning` and `failed` and allowed after `done`. That resets the warning and the blocked flag. | PASS |
| S3 | `src/src/__tests__/securitySession.test.ts::retries failed local cleanup and keeps auth blocked until explicit Google sign-in` | The phase goes `failed` → `cleaning` → `done`. A successful retry clears the error but does not unblock auth early. | PASS |
| A1 | `src/src/__tests__/authRemediation.test.tsx::clears local credentials and reports unconfirmed revocation after a transport TypeError` | `iam-session-action` fails at the transport layer. Session, token and verifier are cleared, and the phase is `done` with a separate remote warning. | PASS |
| A2 | `src/src/__tests__/authRemediation.test.tsx::uses only secret commands during native-mode sign-out and preserves unrelated local data` | In native mode, invokes are limited to `secret_get`/`secret_set`/`secret_delete`. The settings fixture and the unrelated `anthropic_api_key` secret survive. | PASS |
| A3 | `src/src/__tests__/authRemediation.test.tsx::rejects a late SDK sign-in event for %s after sign-out` (synthetic-user, synthetic-user-b) | The SDK receives `SIGNED_IN`, but the hook keeps a null user and session and `SIGNED_OUT`. The phase stays `done` and the blocked flag and warning are kept. No extra fetch is made. | PASS (2 cases) |
| A4 | `src/src/__tests__/authRemediation.test.tsx::switches from user A to B after Google OAuth starts and clears the old warning (A4: OAuth state prerequisite)` | TODO: the real SDK authorization URL fails the current `state` prerequisite (see the open finding below). | NOT_RUN (todo) |

## MVP-043 case matrix

NOT_APPLICABLE-in-source classifies the source at the pinned SHA. It is not native
acceptance. Every row stays subject to its GATE.

| MVP-043 case | Evidence classification and exact test | AC / remaining gate |
| --- | --- | --- |
| Local sign-out while remote is down: HTTP 401 | covered-by-test: `src/src/__tests__/authRemediation.test.tsx::cleans real SDK credentials after remote status %s and shares the outcome` (401) | PASS (unit); GATE: native/live |
| Local sign-out while remote is down: HTTP 403 | covered-by-test: same test (403) | PASS (unit); GATE: native/live |
| Local sign-out while remote is down: HTTP 503 | covered-by-test: same test (503) | PASS (unit); GATE: native/live |
| Local sign-out while remote is down: transport throw | covered-by-test: A1 | PASS (unit); GATE: native/live |
| Local sign-out while remote is down: 5 s hang | covered-by-test: `src/src/__tests__/authRemediation.test.tsx::aborts a hanging security request at five seconds and still clears credentials` | PASS (unit); GATE: native/live |
| Expired grace (historical RCA Case B) | NOT_APPLICABLE-in-source: the searched source has no native account grace or entitlement gate, and MVP-004 sets account_gate_required=false. The remaining invariant is covered by A2 and the others-scope test below. | PASS (source classification); GATE: native continuity |
| Account switch | covered-by-test (partial): A3 for user B; `src/src/__tests__/accountRequestIsolation.test.tsx::clears a loaded old account immediately while the new account waits`. The A4 end-to-end case is TODO. | PARTIAL; A4 blocked by the OAuth `state` finding; GATE: real Google A → B |
| Delayed native entitlement response (historical RCA Case C) | NOT_APPLICABLE-in-source: there is no production native entitlement verifier or lock to race. Delayed account-scoped responses map to the isolation tests below. | PASS (source + unit); GATE: native continuity |
| Native lock during sign-out | NOT_APPLICABLE-in-source: no production `lock_gmad`/`gmad_entitled`/`entitlement` match. covered-by-test replacement: A2 and `src/src/__tests__/authRemediation.test.tsx::keeps local auth and runtime untouched for others-session status %s` (200, 503). | PASS (unit, mocked native boundary); GATE: release-mode runtime keeps running |
| Local credential cleanup and remote revoke reported as different outcomes | covered-by-test: A1; the HTTP 200/401/403/503 tests above; `src/src/__tests__/securitySession.test.ts::still clears local credentials when server revocation is unavailable`; `src/src/__tests__/authRemediation.test.tsx::reports DPAPI failure, attempts other keys, and permits cleanup retry but not new login` | PASS (unit); GATE: native credential store and live revoke |

Delayed account-scoped responses map to these existing, unchanged tests in
`src/src/__tests__/accountRequestIsolation.test.tsx`. All of them pass.

- `rejects delayed A profile, wallet and inventory after changing to %s` (null, B)
- `does not mint a GID for a delayed old profile or publish an old save`
- `clears a loaded old account immediately while the new account waits`
- `does not return an old ledger or topup result to the switched account`
- `does not refresh old ownership or show old purchase success after switching accounts`

Refresh-race coverage stays in
`src/src/__tests__/authRemediation.test.tsx::aborts an in-flight SDK refresh before local cleanup and does not restore its session`.

## Pinned-source entitlement search

Command (exit 0):

```sh
git grep -nIiE "lock_gmad|gmad_entitled|entitlement" 472de123f797fcfd136f8ebfadea482636cc44b6 -- src/src src-tauri/src
```

Output:

```text
472de123f797fcfd136f8ebfadea482636cc44b6:src/src/__tests__/authRemediation.test.tsx:62:  expect(invokeMock).not.toHaveBeenCalledWith("lock_gmad_runtime");
472de123f797fcfd136f8ebfadea482636cc44b6:src/src/__tests__/authRemediation.test.tsx:117:  expect(invokeMock).not.toHaveBeenCalledWith("lock_gmad_runtime");
```

Both matches are negative test assertions, not production commands. No match exists
in production source under `src/src` or `src-tauri/src`, so there is no native grace
or lock that could regress. [Historical RCA Cases A/B/C](../../.brain/rca/2026-09-12-auth-failure-state-gaps.md)
describe an older runtime gate. MVP-004 now sets `account_gate_required=false` and
`account_surface_exposed=true`. The remaining invariant is that **sign-out never
locks the local runtime**. A2 asserts this only at the mocked native command
boundary.

## Open finding: A4 Google OAuth start prerequisite

At the pinned base, the real `signInWithOAuth` in the installed auth-js 2.110.0
builds a PKCE `/authorize` URL that has no `state` parameter.
`auth.ts::signInWithGoogle` (lines 142-143) rejects that URL through
`oauthStateFromAuthorizationUrl` with the error
`Google sign-in could not start securely. Please try again.`. The rejection happens
before `oauth_begin` or `open_url` runs, so stubbing those invokes cannot make the
start succeed.

A network-free SDK/helper probe confirmed the mismatch. The authorization URL
carried only `provider`, `redirect_to`, `code_challenge` and
`code_challenge_method`. `oauthStateFromAuthorizationUrl` returned `null`, and the
probe made `fetchCalls: 0`.

Fixing this requires a change to `src/src/auth.ts` or the OAuth code, which is out of
scope for MVP-043. **No production fix was made.** A4 stays `it.todo` with its reason
next to it. The live impact, including whether a packaged app can start Google
sign-in at all, is not established here and needs native verification.

Owner/resume: coordinate with the `wip/core-login-timeout` writer. Once the OAuth
fix is integrated, replace the A4 TODO with a real-client test of the sequence
A → sign-out (503) → Google start → B, on the resulting exact SHA.

## Reviewer fix

S1 first failed when the orchestrator ran it. Its assertion came after a single
`await Promise.resolve()`, but `signOutCurrent` awaits the async `revokeRemote`
before it calls `cleanupLocal`, so one microtask was not enough. The reviewer
replaced that wait with `await vi.waitFor(() => expect(cleanupLocal).toHaveBeenCalledOnce())`.
This was a defect in the test's timing, not a production regression. The guard
at `src/src/securitySession.ts:33` was already in place.

## Commands and results

Commands were run by the independent reviewer in the branch worktree. Frontend
commands ran in `src`.

| Command | Exit | Result |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | PASS |
| `npx eslint src` | 0 | PASS |
| `npx vitest run src/__tests__/securitySession.test.ts src/__tests__/authRemediation.test.tsx src/__tests__/accountRequestIsolation.test.tsx` | 0 | PASS: 3 files, 24 passed, 1 todo |
| `npx vitest run` (full frontend suite, includes `oauthTransaction`/`oauthFanout`) | 0 | PASS: 81 files, 792 passed, 1 todo |
| `node tools/doc-graph/ci-gate.mjs` | 0 | PASS |
| `git grep ... entitlement` (above) | 0 | Only the 2 negative test assertions |

The Codex sandbox could not start Vite/esbuild or doc-graph child processes
(`spawn EPERM`). Those BLOCKED results are superseded by the reviewer runs above.
The doc-graph scan reports one older `version-changelog-mismatch` on
`docs/change request/CR-047-pro-tier-entitlement-contract.md`. It is out of scope
and was not edited.

Test-file SHA-256 at review:

```text
20cd28e861284fefa2ca4cfb890d0e04fbf686f5ed61e1661587d298aa16ba90  src/src/__tests__/securitySession.test.ts
dc677e60872ea966263f5d5b2a15590b332c03730f8e542b2bd60bc12ac07201  src/src/__tests__/authRemediation.test.tsx
```

## Acceptance

| Acceptance check | AC |
| --- | --- |
| New tests pass, and the authRemediation/securitySession/accountRequestIsolation/oauth tests pass | PASS (A4 todo) |
| Full frontend suite green | PASS |
| TypeScript / ESLint | PASS |
| No production source change | PASS |
| Synthetic fixtures only | PASS |
| Doc-graph gate | PASS |
| Native/live acceptance | NOT_RUN |

## Remaining gates (NOT verified)

- A Native/WebView release-build sign-out on Windows with the real DPAPI secret
  store. It must cover credential deletion, the failure retry, and confirmation that
  GSI, capture and overlay keep running after sign-out (owner-run).
- A Live Supabase `iam-session-action` revoke confirmation for both current and
  others scope. Any production probe needs explicit owner approval.
- An A → B account switch through real Google OAuth in the packaged app, with no
  cross-account profile, ledger or ownership residue. This depends on the A4 OAuth
  `state` finding.
- Owner acceptance to move MVP-043 to DONE. MVP-044 stays separate.
- Any regression that needs a change to `src/src/auth.ts` or the OAuth code, which
  must be coordinated with `wip/core-login-timeout`.
- Live Dota, GSI, capture, overlay and audio continuity, and CPU/RAM/latency
  acceptance. This task implies no change to G-Signal.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-09 | Pin the MVP-043 source/test matrix, add regression coverage, and record the reviewer-verified results, the OAuth finding and the native/live gates without claiming acceptance. |
