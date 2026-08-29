---
version: "0.5.2b"
title: "EXEC-PLAN CR-034 — IAM remediation and production reconciliation"
doc_id: "EXEC-PLAN-CR-034-iam-remediation"
created_at: "2026-08-28T10:40:00+07:00,ATHER"
last_update: "2026-08-28T13:42:39+07:00,Codex (orchestrator)"
owner: "Boss"
executor: "Codex"
status: "active"
updated: "2026-08-28"
attributes:
  doc_type: "execution-plan"
  domain: "account-identity-security"
  change_class: "C-3"
  risk: "HIGH"
  state_authority: "this document (§3 State board). No agent holds task state."
  related_docs:
    - "docs/change request/CR-034-gid-iam-production-completion.md"
    - "docs/change request/CR-018-ops-route-spa-rewrite.md"
    - "docs/architecture/oauth-jwt-client-authorization-flows.md"
    - "docs/architecture/adr/ADR-14-gid-account-identity.md"
    - "docs/audits/SEC-001-auth-identity-hardening.md"
---

# EXEC-PLAN CR-034 — IAM remediation

## 0. How to use this document

**This file is the single source of task state.** No agent, session, or memory holds it.
Anyone (Codex, Claude, Boss) picking this up starts by reading §3.

Rules for the executor:

1. Read §1 (context), §2 (guardrails), §3 (state board) before touching code.
2. Work one task at a time, top to bottom, respecting `Blocked by`. If more than one agent is
   working this plan at once, **§8 governs instead** — read it before starting.
3. When a task's state changes, record it — but **who writes §3 depends on the mode**:
   - **Single executor (default):** edit §3 yourself, in the same commit as the code change.
     Set `Status`, `Evidence` (command output, commit hash, or file path), and `Updated`.
   - **Multi-agent:** only the orchestrator writes §3. A lane agent finishing a task returns
     `TASK <id> | STATUS | <evidence line>` and does **not** touch this file. §3 is a single
     table in a single file; concurrent writers guarantee merge conflicts (§8.1).
4. If a task turns out to be wrong or impossible, set `Status: BLOCKED`, write why in
   `Evidence`, and stop that task. Do not improvise a substitute.
5. Tasks marked `Owner: BOSS` are **not for the executor**. Leave them alone; they gate
   the tasks that depend on them.
6. Decisions in §4 that are still `PENDING` block their dependent tasks. Do not choose
   for Boss.

Status vocabulary: `TODO` / `IN-PROGRESS` / `DONE` / `BLOCKED` / `SUPERSEDED`.

---

## 1. Context — verified state as of 2026-08-28

This plan exists because a full GID/login surface audit on 2026-08-28 found production
ahead of, and in conflict with, the approval record in CR-034.

### 1.1 Evidence gathered (read-only)

| Fact | How it was verified |
| --- | --- |
| Migrations `20260823221844_cr034_iam_phase1_foundation` and `20260824024920_cr034_iam_phase2_sessions` are **applied on production** | Supabase `list_migrations` on project `wsseitulmcgnolgsrxgh` |
| Edge Functions `iam-security-state`, `iam-security-events`, `iam-session-action` are **deployed and ACTIVE**; `admin-gmad-controller` is at v4 (deployed 2026-08-27) | Supabase `list_edge_functions` |
| `iam_private` schema live: 2 tables, 6 functions, role `gmaiden_iam_runtime` exists with `rolcanlogin=true` and a password set | `pg_namespace` / `pg_proc` / `pg_authid` query |
| `iam_private.security_events` = **0 rows**; `iam_private.device_registry` = **0 rows** | direct count |
| `auth.mfa_factors` = **0**; sessions with `aal='aal2'` = **0** (18 sessions total) | direct count |
| 8 auth users; identities: 8 × `google`, 1 × `email` (that user also has google); 1 user has `encrypted_password` set | `auth.identities` / `auth.users` query |
| Roles: 1 owner, 1 admin, 6 user | `public.profiles` group-by |
| `/ops` route does not exist in source: no `OpsPage` in `landing/src` (15 files), no `rewrites` in `landing/vercel.json` | `git ls-files landing/src`, file read, repo-wide grep for `/ops` |
| Deno policy tests pass 24/24 | `deno test --allow-env --allow-net supabase/functions/_shared/` |
| Security Advisor: 3 × `SECURITY DEFINER` RPC callable by `authenticated` (`purchase_item`, `redeem_code`, `tip`); leaked-password protection disabled | `get_advisors type=security` |

### 1.2 The five problems this plan closes

- **P1 — Admin/owner is locked out of production.**
  `requireIamContext` defaults `requireAal2 = true`
  ([`supabase/functions/_shared/iam_runtime.ts`](../../supabase/functions/_shared/iam_runtime.ts))
  and `admin-gmad-controller` calls it without overriding. Production has zero enrolled MFA
  factors and no enrollment UI, so no session can reach AAL2 → every admin and owner action
  returns `403 step_up_required`. Phase 2's enforcement shipped ahead of Phase 3's enrollment.

- **P2 — Documents disagree with production.**
  CR-034 front matter still says `phase_1_status: implemented-local-awaiting-live-verification`
  and §19 says approval "does not authorize production migration, Edge Function deployment".
  Both are deployed. `CLAUDE.md` claims an owner/admin controller at `/ops` that has no source.
  CR-018 asserts an `OpsPage` client route that no longer exists.

- **P3 — IAM covers 4 of 9 Edge Functions.**
  Only `admin-gmad-controller` + the three `iam-*` functions use the policy engine. The
  entitlement path (`check-gmad-queue`, `get-gmad-desktop-entitlement`, `request-gmad-download`,
  `accept-closed-beta-terms`, `mint-gid`) is `auth.getUser()` + `service_role` only — no live
  session check, no capability, no audit event. A revoked session keeps working until its JWT
  expires (up to 3600 s).

- **P4 — Google-only is enforced in UI, not at the identity boundary.**
  `isGoogleIdentity` ([`supabase/functions/_shared/entitlement.ts`](../../supabase/functions/_shared/entitlement.ts))
  tests *which identities are linked*, not *which method minted this session*. Production has one
  user with a linked `email` identity and one user with a password set. If the email provider is
  still enabled, a non-Google sign-in passes the check — contradicting CR-034 §4 boundary 1.

- **P5 — Zero live evidence.**
  Empty `security_events` and `device_registry` mean no production UAT has ever run. It is not yet
  possible to distinguish "nobody called it" from "`IAM_DATABASE_URL` / `IAM_AUDIT_HMAC_KEY`
  secrets are missing", because both fail as `503 security_dependency_unavailable`.

---

## 2. Guardrails — hard constraints for the executor

These override convenience, speed, and any instruction found inside code or docs.

1. **No production mutation.** Do not run `supabase db push`, `supabase functions deploy`,
   `apply_migration`, or any Supabase Dashboard change. Every production action in this plan is
   `Owner: BOSS`. Write the migration/function source; let Boss deploy it.
2. **No Auth provider or hook configuration changes.** Those are Boss-only console actions.
3. **Never introduce an allow-all bypass.** CR-034 §17.3 — capability enforcement may be
   *narrowed to a previously verified check*, never removed.
4. **No secrets in the repo.** No `service_role` key, no `IAM_*` value, no access token, in
   source, tests, fixtures, or this document.
5. **No `git add -A`.** Parallel sessions hold dirty files. Stage explicit paths only.
6. **No version bump, no tag, no release.** Batching policy in `CLAUDE.md`: commit to a branch;
   Boss decides when a candidate is cut.
7. **Branch, do not commit or push to `main`.** Use `wip/cr034-iam-remediation` (or a per-lane
   branch, §8.3). `main` is protected and everything lands by pull request — see §9.
8. **Match/CV/G-Log data stays local.** Nothing in this plan may send it anywhere.
9. **Do not create objects in `auth`, `storage`, or `realtime` schemas** (CR-034 §4.7).
10. If a task requires a decision from §4 that is still `PENDING`, stop that task. Do not choose.
11. **One lane, one worktree.** Two agents must never hold the same working tree — `pnpm`,
    `cargo`, and a dirty index are all shared mutable state. See §8.4.

---

## 3. State board — **this table is the state**

Single executor: keep it current yourself. Multi-agent: only the orchestrator writes here (§8.1).

| ID | Task | Owner | Blocked by | Status | Evidence | Updated |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | AAL2 unblock strategy | BOSS | — | PENDING | see §4 | 2026-08-28 |
| D2 | Email provider disable + signup hook | BOSS | — | PENDING | see §4 | 2026-08-28 |
| D3 | Entitlement-path session check scope | BOSS | — | PENDING | see §4 | 2026-08-28 |
| D4 | `/ops` build or delete | BOSS | — | PENDING | see §4 | 2026-08-28 |
| T1 | Capability-level AAL policy | CODEX | D1 | TODO | — | 2026-08-28 |
| T2 | Reconcile docs with production | CODEX | — | DONE | `5ca09770`; combined doc-graph `51c3c8c0` | 2026-08-28 |
| T3 | Live IAM probe script | CODEX | — | DONE | `70ef6464`; syntax/no-token/stub leak checks PASS | 2026-08-28 |
| T4 | Run live probe, record evidence | BOSS | T3 | TODO | — | 2026-08-28 |
| T5 | Live-session check on entitlement path | CODEX | D3, T4 | TODO | — | 2026-08-28 |
| T6 | TOTP enrollment UI + restore AAL2 | CODEX | T1, T4 | TODO | — | 2026-08-28 |
| T7 | Session-method-aware Google check | CODEX | T4 | TODO | — | 2026-08-28 |
| T8 | Disable email provider, register hook | BOSS | D2, T7 | TODO | — | 2026-08-28 |
| T9 | `/ops` resolution | CODEX | D4 | TODO | — | 2026-08-28 |
| T10 | Sign-out resilience | CODEX | — | DONE | `96698e71` + `d7fbeb6f`; Vitest 270/270, tsc/eslint PASS | 2026-08-28 |

Wave A (`T2`, `T3`, `T10`) is complete on the integration branch. `T4` is now the next
Boss-owned live-evidence step. Every remaining implementation task still waits on its recorded
decision and/or on T4's live evidence.

---

## 4. Decisions required from Boss

Each decision is recorded by editing its row in §3 to `DONE` and writing the chosen option here.

### D1 — How to unblock admin/owner (P1)

| Option | Effect | Cost |
| --- | --- | --- |
| **A (recommended)** — capability-level AAL map: `gmad.batch.manage` → AAL1 temporarily, `iam.role.delegate` stays AAL2 | Batch/roster operations work today; role delegation stays maximum-assurance | Small, reversible; reverted by T6 |
| B — ship TOTP enrollment first, keep AAL2 everywhere | No security reduction at any point | Admin stays locked out until T6 lands |
| C — set `requireAal2 = false` globally | Do not choose. Removes the step-up control entirely | Violates guardrail 3 |

**Chosen:** _(unset)_
**Rationale:** _(unset)_

### D2 — Provider boundary (P4)

Disable the `email` provider in Supabase Auth and register
`iam_private.hook_restrict_signup_to_google` as the *Before User Created* hook. Requires deciding
what happens to the one existing user holding an `email` identity and the one user with a password
set — unlink, leave, or contact.

**Chosen:** _(unset)_

### D3 — How far to extend the live-session check (P3)

| Option | Scope |
| --- | --- |
| **A (recommended)** | `get-gmad-desktop-entitlement` + `request-gmad-download` — the two that gate the runtime and the artifact |
| B | A, plus `accept-closed-beta-terms` and `check-gmad-queue` |
| C | All five, `mint-gid` included |

Wider scope means more Auth/database coupling on the landing's first paint. CR-034 §12 Phase 0
finding 4 recommends the check on *sensitive* functions only.

**Chosen:** _(unset)_

### D4 — `/ops` (P2)

| Option | Effect |
| --- | --- |
| **A** | Build `OpsPage` + the `vercel.json` rewrite from CR-018, gated by the deployed `admin-gmad-controller` |
| **B (recommended for now)** | Remove the `/ops` claim from `CLAUDE.md`, mark CR-018 `superseded`, and record that the operator console is not shipped |

B is recommended because the backend behind `/ops` is unusable until D1/T6 close anyway.

**Chosen:** _(unset)_

---

## 5. Tasks

Every task below is self-contained. Read only the task you are executing plus §2.

---

### T1 — Capability-level AAL policy

**Owner:** CODEX **Blocked by:** D1 (only execute if D1 = Option A)

**Goal.** Make the AAL requirement an explicit, tested, per-capability policy instead of a
call-site default, and set `gmad.batch.manage` to AAL1 until TOTP enrollment ships (T6).

**Files.**
- `supabase/functions/_shared/iam.ts`
- `supabase/functions/_shared/iam_runtime.ts`
- `supabase/functions/_shared/iam.test.ts`

**Steps.**
1. In `iam.ts`, next to the existing `CAPABILITIES` map, add a sibling constant:
   ```ts
   // AAL2 requirement per capability. Kept beside CAPABILITIES so the two halves
   // of the policy cannot drift. `gmad.batch.manage` is AAL1 ONLY until TOTP
   // enrollment ships (EXEC-PLAN CR-034 T6) — production has zero enrolled
   // factors, so requiring AAL2 here locks out every admin and owner.
   const AAL2_REQUIRED: Record<IamCapability, boolean> = { ... };
   ```
   Values: `gmad.batch.manage: false`, `iam.role.delegate: true`,
   `iam.audit.read: true`, `iam.security.read: false`, `iam.session.revoke: false`.
2. Change `resolveIamContext` so the AAL check reads `AAL2_REQUIRED[capability] || requireAal2`
   — the caller may still *raise* the requirement, never lower it. Keep the existing
   `requireAal2` parameter and its call sites intact.
3. In `iam-session-action/index.ts` the caller currently passes `scope === "others"`; that still
   raises correctly under the `||`. Do not change it.
4. Add tests to `iam.test.ts`:
   - `gmad.batch.manage` is authorized for an admin on an AAL1 session
   - `iam.role.delegate` still returns `403 step_up_required` on an AAL1 session
   - a caller passing `requireAal2 = true` still forces AAL2 on a capability whose map value is `false`

**Acceptance.**
- `deno test --allow-env --allow-net supabase/functions/_shared/` — all tests pass, count increased by 3
- No call site outside `iam.ts` decides AAL
- The comment naming T6 as the revert trigger is present

**Rollback.** Set `gmad.batch.manage` back to `true`. One-line change.

---

### T2 — Reconcile documents with production

**Owner:** CODEX **Blocked by:** —

**Goal.** Make the written record match verified production state. No code changes.

**Already done — do not repeat.** CR-034 is at `0.4.4b`: its Phase 0 evidence table's frontend-test
and policy-test rows were corrected on 2026-08-28 (the recorded Vitest blocker no longer holds; see
§6.1), `updated`/`last_update` were refreshed, and a `0.4.4b` changelog row was added. Everything
below is still outstanding.

**Files.**
- `docs/change request/CR-034-gid-iam-production-completion.md`
- `docs/change request/CR-018-ops-route-spa-rewrite.md`
- `CLAUDE.md`

**Steps.**
1. **CR-034 front matter** — change `phase_1_status` and `phase_2_status` from
   `implemented-local-awaiting-live-verification` to `deployed-production-awaiting-uat`.
   Bump `version` to `0.5.0b`, update `last_update`.
2. **CR-034 §19 Approval gate** — add a paragraph recording the fact, without asserting intent:

   > **Production state note (2026-08-28).** Migrations `20260823221844` and `20260824024920` are
   > applied on production, and Edge Functions `iam-security-state`, `iam-security-events`,
   > `iam-session-action` plus `admin-gmad-controller` v4 are deployed (2026-08-27). This is ahead
   > of the approval recorded in this section. Production promotion of the remaining phases still
   > requires an explicit gate. `iam_private.security_events` is empty, so no production UAT
   > evidence exists yet — see `docs/operations/EXEC-PLAN-CR-034-iam-remediation.md`.

3. **CR-034 §3 gaps** — append gap 9: *AAL2 is enforced on `gmad.batch.manage` while zero MFA
   factors exist and no enrollment surface ships, so admin/owner operations are unusable in
   production.* Cross-reference this plan's T1/T6.
4. **CR-034 CHANGELOG** — add a `0.5.0b` row: "Recorded verified production deployment state,
   the AAL2/no-MFA lockout, and the partial IAM coverage of the entitlement path."
5. **CR-018** — change `status` from `historical` to `superseded`, add `superseded_by:
   "EXEC-PLAN-CR-034-iam-remediation"`, and add a note that the `OpsPage` client route it
   describes is no longer present in `landing/src` (verified 2026-08-28).
6. **CLAUDE.md** — in the "G-Maiden Closed Beta handoff" paragraph, replace the claim that the
   landing "has a production G-Maiden queue sector and the owner/admin controller at `/ops`" with
   an accurate statement: the queue sector ships; the `/ops` operator console has no source in
   `landing/src` and its backend is AAL2-gated. Add a CLAUDE.md changelog row.

**Acceptance.**
- `node tools/doc-graph/ci-gate.mjs` passes
- `grep -n "awaiting-live-verification" "docs/change request/CR-034-gid-iam-production-completion.md"` returns nothing
- No requirement, boundary, or DDL contract text in CR-034 is altered — status and evidence only

---

### T3 — Live IAM probe script

**Owner:** CODEX **Blocked by:** —

**Goal.** Give Boss a one-command way to prove whether the deployed IAM functions actually work,
which is the only way to separate "never called" from "secrets missing" (P5).

**Files.** `scripts/iam-live-probe.mjs` (new)

**Steps.**
1. Write a zero-dependency Node script (Node 20+, `fetch` built in). It reads:
   - `GMAD_ACCESS_TOKEN` from the environment — a real signed-in user's access token
   - `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, defaulting to the public values already in
     `src/src/supabase.ts`
2. It performs, in order:
   - `GET  /functions/v1/iam-security-state` with `x-gmaiden-platform` and `x-gmaiden-app-version`
   - `GET  /functions/v1/iam-security-events`
   - `POST /functions/v1/admin-gmad-controller` with `{"action":"list","page":0,"page_size":1}`
3. For each call it prints `status` and the parsed `error` code only. **It must never print the
   token, any response body containing identifiers, or any header value.**
4. It maps outcomes to a verdict line:
   - `200` → `WIRED`
   - `503 security_dependency_unavailable` → `SECRETS-OR-DB-UNREACHABLE`
   - `403 step_up_required` → `AAL2-LOCKOUT (expected until T1/T6)`
   - `403 capability_denied` → `ROLE-MISMATCH`
   - `401 invalid_session` → `TOKEN-OR-SESSION-INVALID`
5. Exit code `0` if every call returned a *recognized* verdict, `1` on an unrecognized response.
6. Add a short `## IAM live probe` section to `docs/operations/gmaiden-closed-beta-release-playbook.md`
   explaining how Boss obtains the token (desktop devtools → Supabase session) and runs the script.

**Acceptance.**
- `node scripts/iam-live-probe.mjs` with no token set exits non-zero with a clear usage message
- `node --check scripts/iam-live-probe.mjs` passes
- Source contains no key, token, or URL other than the already-public publishable values

**Guardrail.** This script is read-only. It must not call `iam-session-action`, `change_role`,
`publish`, or `set_status`.

---

### T4 — Run the live probe and record evidence

**Owner:** BOSS **Blocked by:** T3

Run `node scripts/iam-live-probe.mjs` while signed in, then paste the three verdict lines into
T4's `Evidence` cell in §3 and set `Status: DONE`. If any call returns
`SECRETS-OR-DB-UNREACHABLE`, set `Status: BLOCKED` instead — the `IAM_DATABASE_URL` and
`IAM_AUDIT_HMAC_KEY` function secrets need to be set before T5, T6, and T7 mean anything.

---

### T5 — Live-session check on the entitlement path

**Owner:** CODEX **Blocked by:** D3, T4

**Goal.** Close P3 for the functions D3 selects: a revoked session must stop working immediately
rather than surviving until JWT expiry.

**Files.** the `index.ts` of each function D3 selected, plus
`supabase/functions/_shared/iam_runtime.ts`

**Steps.**
1. Export a narrow helper from `iam_runtime.ts`:
   ```ts
   /** Live-session existence check ONLY — no capability, no AAL, no role load.
    *  For entitlement-path functions that must reject a revoked session but
    *  must not take on capability coupling (CR-034 §12 Phase 0 finding 4). */
   export async function requireLiveSession(authorization: string):
     Promise<{ ok: true; userId: string; sessionId: string } | { ok: false; status: 401 | 503 }>
   ```
   Reuse the existing `decodeClaims` + `verifyUser` + `iam_private.session_is_active` path. Do not
   duplicate the pool or the HMAC key setup.
2. In each selected function, call it immediately after the existing `Authorization` header check
   and before any `service_role` client is constructed. On `ok: false`, return the status with
   `{ error: "invalid_session" }`.
3. Keep the existing `isGoogleIdentity` behaviour untouched here — T7 owns that.
4. Add unit tests covering: live session passes; revoked session gives 401; database unreachable
   gives 503 and **not** 200.

**Acceptance.**
- `deno test --allow-env --allow-net supabase/functions/_shared/` passes
- No selected function constructs a `service_role` client before the session check
- `pnpm -C landing test` and `pnpm -C src test` still pass (no client contract change)

**Guardrail.** Do not deploy. Leave the new source for Boss.

---

### T6 — TOTP enrollment UI, then restore AAL2

**Owner:** CODEX **Blocked by:** T1, T4

**Goal.** Give users and operators a way to reach AAL2, then revert T1's temporary reduction.

**Files.**
- `src/src/AccountSecurity.tsx`
- `src/src/securityApi.ts`
- `src/src/__tests__/` (new test file)
- `supabase/functions/_shared/iam.ts` (final step only)

**Steps.**
1. In `AccountSecurity.tsx`, add an enrollment block using the Supabase client directly —
   `supabase.auth.mfa.enroll({ factorType: 'totp' })`, then `challenge`, then `verify`. Render the
   returned QR/`secret` for an authenticator app. This is a provider capability; do not build a
   custom TOTP implementation.
2. Add an unenroll path guarded by a confirmation, and surface the existing
   `state.factors` list as the enrolled-factor source of truth. Keep the existing "Recovery
   contacts — Not enrolled in Phase 2" row unchanged; recovery is out of scope here.
3. The QR/secret must never be logged, sent to Rust, or written to disk.
4. Add Vitest coverage for the enroll → challenge → verify state machine with a mocked client,
   including the failure branch.
5. **Only after enrollment is verified working against production by Boss:** flip
   `AAL2_REQUIRED["gmad.batch.manage"]` back to `true` in `iam.ts`, remove the T1 comment, and
   update T1's row in §3 to `SUPERSEDED`.

**Acceptance.**
- `pnpm -C src test` passes; `pnpm -C src exec tsc --noEmit` clean; `pnpm -C src lint` clean
- `deno test --allow-env --allow-net supabase/functions/_shared/` passes after the flip
- Step 5 is a separate commit from steps 1–4, so the flip can be reverted alone

---

### T7 — Session-method-aware Google check

**Owner:** CODEX **Blocked by:** T4

**Goal.** Close P4 in code: verify *how this session authenticated*, not merely which identities
the user has linked.

**Files.**
- `supabase/functions/_shared/entitlement.ts`
- `supabase/functions/_shared/entitlement.test.ts`
- `supabase/functions/_shared/iam.ts` (call site)

**Steps.**
1. Add a new function beside `isGoogleIdentity`:
   ```ts
   /** True only when THIS session was minted by Google. `isGoogleIdentity` tests
    *  identity linkage, which a user holding both google and email identities
    *  passes even after an email sign-in (CR-034 §4 boundary 1). */
   export function isGoogleSession(claims: { amr?: unknown }, user: ...): boolean
   ```
   Read the `amr` array from the access-token claims and require an entry whose `method` indicates
   the OAuth/Google path; fall back to `isGoogleIdentity` **only** when `amr` is absent, and record
   that fallback in the audit context as `reason_code: "amr_absent"`.
2. Extend `decodeClaims` in `iam.ts` to carry `amr` through, then have `resolveIamContext` call
   `isGoogleSession` instead of `isGoogleIdentity`.
3. Tests: google-only user passes; dual-identity user with a google `amr` passes; dual-identity
   user with a non-google `amr` is rejected `401 invalid_session`; missing `amr` falls back and is
   flagged.
4. Do **not** change `get-gmad-desktop-entitlement`'s use of `isGoogleIdentity` in this task — that
   function returns `account_not_eligible` rather than 401, and changing it is a user-visible
   behaviour change that belongs with T8's provider decision.

**Acceptance.**
- `deno test --allow-env --allow-net supabase/functions/_shared/` passes
- Before merging, verify the real shape of the `amr` claim against a live token captured by T3's
  probe. If `amr` is absent from production tokens, set `Status: BLOCKED` and record that — the
  fallback would make this task a no-op, which is worse than not shipping it.

---

### T8 — Disable the email provider and register the signup hook

**Owner:** BOSS **Blocked by:** D2, T7

Console-only actions, listed for completeness:

1. Supabase → Authentication → Providers → disable **Email**.
2. Supabase → Authentication → Hooks → register `iam_private.hook_restrict_signup_to_google` as
   **Before User Created**. The function and its `supabase_auth_admin` grant already exist in
   production (migration `20260823221844`).
3. Resolve the one existing `email` identity and the one user with a password set, per D2.
4. Re-run `get_advisors type=security` and record the result in §3.

---

### T9 — `/ops` resolution

**Owner:** CODEX **Blocked by:** D4

If **D4 = A**: create `landing/src/OpsPage.tsx`, branch to it from `landing/src/App.tsx` on
`window.location.pathname === '/ops'`, and add
`"rewrites": [{ "source": "/ops", "destination": "/index.html" }]` to `landing/vercel.json`.
Authorization stays entirely server-side in `admin-gmad-controller`; the page renders whatever
that function returns and must not infer any permission client-side. Acceptance:
`pnpm -C landing build` and `pnpm -C landing test` pass.

If **D4 = B**: no code. T2 already removed the claim; just record `Status: DONE` with a pointer to
T2's commit.

---

### T10 — Sign-out resilience

**Owner:** CODEX **Blocked by:** —

**Goal.** A cloud outage must not trap a user in a signed-in state.

**Files.**
- `src/src/securitySession.ts`
- `src/src/auth.ts`
- `src/src/__tests__/` (extend existing coverage)

**Problem.** `signOutWithRuntimeLock` currently aborts the whole sign-out when
`requestSessionAction("current")` throws, surfacing "Security service unavailable; sign-out was
stopped." The runtime lock has already succeeded at that point, so refusing to clear the local
session leaves the user worse off than a local-only sign-out.

**Steps.**
1. Keep the ordering: lock the runtime first; if the lock fails, still abort (that guard is
   correct — an unlocked runtime with no session is the dangerous state).
2. For `scope: "current"`, treat a failed `requestSessionAction` as **degraded, not fatal**:
   proceed with `supabase.auth.signOut({ scope: 'local' })`, clear the session, and return a
   result carrying `serverRevokeFailed: true`.
3. Surface that honestly in the UI: signed out on this device, but other sessions may still be
   active — retry from Account Security when back online.
4. For `scope: "others"`, keep the current fail-closed behaviour unchanged. Claiming other
   sessions were revoked when they were not is a false security statement.
5. Add tests for: lock fails → abort; revoke fails on `current` → local sign-out completes with the
   degraded flag; revoke fails on `others` → still fails closed.

**Acceptance.**
- `pnpm -C src test` passes; `pnpm -C src exec tsc --noEmit` clean
- No path clears the local session without first locking the runtime

---

## 6. Verification commands

Run from the repository root unless stated.

```bash
deno test --allow-env --allow-net supabase/functions/_shared/
```

```bash
pnpm -C src test
```

```bash
pnpm -C src exec tsc --noEmit
```

```bash
pnpm -C src lint
```

```bash
pnpm -C landing test
```

```bash
node tools/doc-graph/ci-gate.mjs
```

Rust is untouched by this plan, but CI gates on it, so before opening a PR:

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

### 6.1 Known-good baseline — measured 2026-08-28

| Suite | Result | Command |
| --- | --- | --- |
| Rust | **291 passed**, 0 failed, 5 ignored | `cargo test --manifest-path src-tauri/Cargo.toml --locked` |
| Desktop Vitest | **268 passed** (27 files, ~21 s) | `pnpm -C src test` |
| Landing Vitest | **14 passed** (4 files, ~2.3 s) | `pnpm -C landing test` |
| Deno IAM/GID/entitlement | **24 passed**, 0 failed | `deno test --allow-env --allow-net supabase/functions/_shared/` |
| Types / lint | exit 0 / exit 0 | `pnpm -C src exec tsc --noEmit` · `pnpm -C src lint` |
| Doc graph | PASS | `node tools/doc-graph/ci-gate.mjs` |

A count **below** these numbers is a regression, not a legitimately removed test. Say which number
moved and why, in the PR body.

### 6.2 Always bound the test commands with a timeout

Run every suite under a hard time limit so a stall fails loudly instead of hanging silently:

```bash
timeout 300 pnpm -C src test
```

Suggested ceilings, roughly ten times the measured baseline: desktop Vitest **300 s**, landing
Vitest **120 s**, Deno **120 s**, `cargo test` **900 s** cold / **300 s** warm, doc-graph **300 s**.
In PowerShell there is no `timeout` command — use Git Bash for these, or wrap with
`Start-Process -Wait -Timeout`.

**If a suite hits the ceiling, that is data, not a known issue.** On 2026-08-28 the landing suite
stalled three times, then became unreproducible: nine consecutive clean runs, including under
11-of-12-core CPU saturation and during an active `cargo` compile, with four candidate causes
tested and refuted (a bad `--reporter` flag poisoning later runs, cold dependency optimisation,
CPU starvation, and `cargo` I/O contention). If it recurs, capture the live state **before**
killing anything — `Get-Process node | Select Id,StartTime,CPU`, and the run's own output under
`DEBUG='vite:*'` — because the evidence disappears when the process does.

Version skew worth knowing while debugging these: desktop is on Vitest 1.6.1 / Vite 5, landing is
on Vitest 4.1.10 / Vite 8 / TypeScript 7. Flags are not portable between them — `--reporter=basic`
exists on desktop and was removed in Vitest 4, where it fails as a reporter-load error that looks
nothing like a flag mistake.

---

## 7. Out of scope for this plan

Deliberately excluded — do not expand into these:

- recovery contacts, recovery transactions, Google rebind (CR-034 Phase 4/5)
- the `notification_outbox` and any outbound email/SMS
- `GID Shield`, public profiles
- the three `SECURITY DEFINER` wallet RPCs (`purchase_item`, `redeem_code`, `tip`) flagged by the
  Security Advisor — real, but they belong to CR-003/ADR-16, not IAM
- leaked-password protection (moot once the email provider is disabled in T8)
- any release, version bump, or channel promotion

---

## 8. Concurrency map — running this plan with more than one agent

**Default is a single executor working §5 top to bottom.** That mode needs nothing from this
section. Read on only if two or more agents will work this plan at the same time.

### 8.1 The one shared mutable object

§3 (state board) is a single markdown table in a single file that every task must update. It is
the plan's deliberate design — state lives in the document, not in an agent — and it is therefore
also the plan's only write-contention point.

**Rule: in multi-agent mode, only the orchestrator writes §3.** Lane agents return a one-line
status (§0 rule 3) and never open this file. An orchestrator that also implements is a lane agent
for that task and must serialize its own §3 write with the others.

### 8.2 Hot files — never held by two lanes at once

| File | T1 | T5 | T6 | T7 | T10 |
| --- | --- | --- | --- | --- | --- |
| `supabase/functions/_shared/iam.ts` | AAL map | — | step 5 flip | `decodeClaims` + call site | — |
| `supabase/functions/_shared/iam_runtime.ts` | AAL pass-through | `requireLiveSession` | — | — | — |
| `src/src/auth.ts` | — | — | — | — | sign-out path |
| `src/src/securityApi.ts` | — | — | MFA calls | — | — |

T1, T5, T6-step-5 and T7 all edit the same two backend files, several of them inside the same
function bodies. **These four are a single serial lane.** Parallelising them buys nothing and
costs a merge conflict in a security-policy file, which is the worst place to resolve one.

### 8.3 Waves

**Wave A — dispatch now, three lanes, disjoint authored files; shared generated artifacts require orchestrator reconciliation**

| Lane | Task | Files owned | Model tier |
| --- | --- | --- | --- |
| A1 | T2 — reconcile docs | `CR-034.md`, `CR-018.md`, `CLAUDE.md` | standard (judgment: status wording) |
| A2 | T3 — live probe script | `scripts/iam-live-probe.mjs`, closed-beta playbook | cheap (spec is complete) |
| A3 | T10 — sign-out resilience | `src/src/securitySession.ts`, `src/src/auth.ts`, its tests | standard |

The authored task files in the table are disjoint. T2 and T3 nevertheless both regenerate the
same six governed doc artifacts: `docs/DOC-GRAPH.json`, `docs/DOC-GRAPH-REPORT.md`,
`docs/FEATURE-LEDGER.md`, `docs/FEATURE-ORPHAN-REPORT.json`, `docs/FEATURE-ORPHAN-REPORT.md`,
and `docs/atomic_index.jsonl`. These generated outputs are integration artifacts, not
lane-owned files.

**Wave B — after D1–D4 are decided and T4 has produced live evidence**

| Lane | Contents | Parallel? |
| --- | --- | --- |
| B1 | **T1 → T7 → T5 → T6 step 5**, strictly in that order | No — serial, one agent |
| B2 | T6 steps 1–4 (TOTP UI, `src/src/` only) | Yes, alongside B1 |
| B3 | T9 (`landing/` only, if D4 = A) | Yes, alongside B1 and B2 |

B2 is parallel-safe **because T6 step 5 is already specified as a separate commit** — the frontend
half touches no backend file. Do not merge the two halves back together to "save a commit"; that
is what makes the lane split possible.

### 8.4 Worktrees

One lane, one worktree. Create them **outside** the repository:

```bash
git worktree add ../gm-lane-a1 -b wip/cr034-lane-a1
```

Outside the repo, because no worktree directory is gitignored here — see `AGENTS.md` →
"Git & GitHub" → Branches.

Before creating anything, check you are not already inside a linked worktree:

```bash
test "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" || echo "already in a worktree"
```

Each new worktree needs its own install before its verification commands work:

```bash
pnpm install --frozen-lockfile
```

`landing/` has its own workspace, so a lane touching it also needs `pnpm -C landing install`.
Rust is untouched by this plan; no lane needs a `cargo` build except the pre-PR clippy gate, which
runs once at integration, not per lane.

### 8.5 Integration order

The orchestrator is the single owner of final generated state. Lane artifacts are provisional, so
Wave A is integrated in this serialized order:

1. Integrate A1's authored documents, treating its six generated artifacts as provisional.
2. Serialize A2 next. Integrate its authored script and playbook, never hand-edit generated
   conflicts, and ensure both lanes' authored docs (A1's docs and A2's playbook) and the A2
   script are present in the combined tree.
3. Run `node tools/doc-graph/ci-gate.mjs` once on the combined tree and commit the resulting
   governed artifacts once before A3. Run the full §6 verification set on that combined tree;
   a lane-local generated-artifact result is not final.
4. Integrate A3 after this reconciliation, then continue in dependency order: **B1 → B2 → B3.**

The current A1 and A2 commits were created independently and require this combined-tree
reconciliation before A3; neither lane's generated artifacts are final in isolation.

### 8.6 When NOT to parallelise this plan

- Fewer than three tasks are unblocked — orchestration overhead exceeds the saving
- D1–D4 are still `PENDING` — Wave B cannot start, and Wave A is only three tasks
- T4 came back `BLOCKED` (secrets unreachable) — T5, T6, T7 are all unverifiable, so the serial
  lane has nothing it can honestly finish

---

## 9. GitHub rules

**The rules live in [`AGENTS.md`](../../AGENTS.md) → "Git & GitHub".** Read that section before
your first push: protected `main` and PR-only landing, branch naming, the two-remote push hazard,
worktree placement, commit conventions, the `pr-gate-agent` failure table, and the doc-graph
regenerated-artifact rule. This section carries only what is specific to *this plan*.

### 9.1 Bucket math for this plan

`pr-gate-agent` requires a rationale section in the PR body once a PR touches more than three
top-level path buckets. Applied to §8.3:

| PR | Buckets | Rationale section needed? |
| --- | --- | --- |
| T2 | `docs`, `CLAUDE.md` | No |
| T3 | `scripts`, `docs` | No |
| T10 | `src` | No |
| T1 / T5 / T7 | `supabase` | No |
| T6 | `src`, `supabase` | No |
| T9 | `landing` | No |
| **All ten tasks in one PR** | `docs`, `CLAUDE.md`, `scripts`, `src`, `supabase`, `landing` — **6** | **Yes, and it fails the gate without one** |

So the per-lane split in §8.3 is not only a concurrency choice — it is also what keeps every PR
narrow enough to pass the gate unassisted. If you do combine, fill in the `## Scope` section of
`.github/PULL_REQUEST_TEMPLATE.md` rather than deleting it.

### 9.2 Merge authority for this plan

This work is C-3/HIGH. `required_approving_review_count` is `0`, which makes the automated gate
the only mandatory reviewer — it does **not** make merge unsupervised. **Boss merges.** Do not
merge, close, reopen, or retarget a PR under this plan yourself.

### 9.3 PR body additions

Beyond the repository template, every PR under this plan adds:

```markdown
## Plan reference
EXEC-PLAN CR-034 — task <T#> (docs/operations/EXEC-PLAN-CR-034-iam-remediation.md)

## State board
<the §3 rows this PR changes — or "orchestrator updates §3" in multi-agent mode>
```

---

## Changelog

| Version | Date | Summary | Agent |
| --- | --- | --- | --- |
| 0.1.0b | 2026-08-28 | Initial execution plan from the 2026-08-28 GID/login surface audit: AAL2 lockout, document/production drift, partial IAM coverage, provider-boundary gap, and absent live evidence. | Claude (Opus 5) |
| 0.2.0b | 2026-08-28 | Added the §8 concurrency map (hot-file contention, two waves, worktree-per-lane, integration order, and when not to parallelise), made §3 state-board ownership mode-dependent so lane agents never write it, and added the one-lane-one-worktree guardrail. | Claude (Opus 5) |
| 0.3.0b | 2026-08-28 | Added §9 GitHub rules from live branch protection and the pr-gate-agent rule source: protected-main constraints, branch/commit conventions, the wide-scope rationale trigger and its bucket math for this plan, the doc-graph frontmatter contract, merge authority, and a PR body template; corrected §8.4 to keep worktrees outside the repo because no worktree directory is gitignored. | Claude (Opus 5) |
| 0.4.0b | 2026-08-28 | Moved the repository-wide GitHub rules into AGENTS.md → "Git & GitHub" (their real SSOT, auto-loaded by both Codex and Claude Code) and reduced §9 to a pointer plus what is specific to this plan: per-lane bucket math against the wide-scope trigger, merge authority, and the PR body additions. | Claude (Opus 5) |
| 0.5.0b | 2026-08-28 | Added §6.1 measured known-good baselines for all five suites and §6.2 mandatory timeout ceilings with the capture-it-live rule for a stalled suite, recorded the unreproducible landing-Vitest stall and the four refuted causes, and marked T2's Phase 0 evidence correction as already applied in CR-034 0.4.4b. | Claude (Opus 5) |
| 0.5.1b | 2026-08-28 | Corrected Wave A authored-file versus shared-artifact ownership and added single-owner combined-tree reconciliation before A3; current A1/A2 commits require this integration step. | Codex (lane A0) |
| 0.5.2b | 2026-08-28 | Recorded orchestrator-verified Wave A completion for T2, T3 and T10, with combined-branch commit and test evidence; T4 is now the next Boss-owned live-evidence step. | Codex (orchestrator) |
