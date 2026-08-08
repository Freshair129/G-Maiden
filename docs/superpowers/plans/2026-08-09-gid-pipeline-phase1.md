# GID-Central Pipeline — Phase 1 (gstore auto-grant + landing 4-state) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deltas #1–#4 of `docs/superpowers/specs/2026-08-09-gid-central-pipeline-design.md` — the Open Beta auto-grant policy switch in gstore, the landing 4-state access panel with the GitHub-Release download channel, and the desktop Account copy.

**Architecture:** A single-row `gmad_distribution_policy` table gates auto-grant: when enabled, `accept-closed-beta-terms` also upserts a grant on the designated batch (grant records always exist, so `get-gmad-desktop-entitlement` and pause/revoke are untouched). `check-gmad-queue` gains backward-compatible `terms` / `channel` / `download_url` fields; the landing derives one of 4 UI states from that response. All decision logic lives in pure functions in `supabase/functions/_shared/entitlement.ts` (Deno-tested) and `landing/src/gmadAccess.ts` (vitest-tested).

**Tech Stack:** Supabase (Postgres migration + pgTAP, Deno Edge Functions), React/Vite landing (vitest), Tauri React deck (tsc).

## Global Constraints

- GID is never a credential: no typed GID, Steam ID, installer, or signed URL unlocks anything (ADR-14, CR-022 AC-02). None of these tasks add a GID input field.
- Auto-grant still writes a `gmad_download_grants` row for every user — desktop entitlement, pause/revoke, and CR-022 UAT-04 must work unchanged.
- `check-gmad-queue` response: existing fields (`state`, `batch_label`, `release_id`) keep exact names, values, and semantics. Only ADD fields.
- `open_beta_enabled` defaults to `false`. Nothing in this plan flips it; flipping is an owner-only ops action.
- No match state, CV, or G-Log data appears in any request, response, or audit row.
- Production migration apply, Edge Function deploy, and Vercel deploy are ops steps (final checklist) — NOT part of coding tasks. Local verification only.
- Desktop `GmadFirstRunGate` / `get-gmad-desktop-entitlement` / `request-gmad-download` are NOT modified by this plan.
- Commit messages: conventional commits, no version bump, no tag (release batching policy).

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260809120000_gid_pipeline_distribution_policy.sql` (create) | Policy table + audit action extension |
| `supabase/tests/gid_pipeline_distribution_policy.sql` (create) | pgTAP: RLS, privileges, seed row, constraint |
| `supabase/functions/_shared/entitlement.ts` (modify) | Pure helpers: `shouldAutoGrant`, `resolveDownloadChannel`, `deriveTermsState` |
| `supabase/functions/_shared/entitlement.test.ts` (modify) | Deno tests for the 3 new helpers |
| `supabase/functions/accept-closed-beta-terms/index.ts` (modify) | Enrollment upsert + auto-grant wiring |
| `supabase/functions/check-gmad-queue/index.ts` (modify) | Add `terms`, `channel`, `download_url` fields |
| `landing/src/gmadAccess.ts` (create) | `deriveLandingState` pure mapper + `useGmadAccess` hook |
| `landing/src/gmadAccess.test.ts` (create) | vitest for `deriveLandingState` |
| `landing/src/BetaAccessPanel.tsx` (create) | 4-state UI panel |
| `landing/src/App.tsx` (modify) | Mount panel in the registered-GID section |
| `src/src/AccountPage.tsx` (modify) | GID-as-hub copy |

---

### Task 1: Distribution-policy migration + pgTAP

**Files:**
- Create: `supabase/migrations/20260809120000_gid_pipeline_distribution_policy.sql`
- Test: `supabase/tests/gid_pipeline_distribution_policy.sql`

**Interfaces:**
- Produces: table `public.gmad_distribution_policy` (columns `id=1`, `open_beta_enabled boolean default false`, `open_beta_batch_id uuid null`, `github_release_url text null`) and audit action value `'grant_auto_issued'`. Tasks 3–4 read this table via service role.

- [ ] **Step 1: Write the pgTAP test**

Create `supabase/tests/gid_pipeline_distribution_policy.sql` (style matches `supabase/tests/cr016_gmad_download_access.sql`):

```sql
begin;
select plan(6);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.gmad_distribution_policy'::regclass),
  'gmad_distribution_policy has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.gmad_distribution_policy', 'SELECT'),
  'anon cannot read distribution policy'
);

select ok(
  not has_table_privilege('authenticated', 'public.gmad_distribution_policy', 'SELECT'),
  'authenticated cannot read distribution policy'
);

select is(
  (select count(*)::integer from public.gmad_distribution_policy),
  1,
  'policy table is seeded with exactly one row'
);

select is(
  (select open_beta_enabled from public.gmad_distribution_policy where id = 1),
  false,
  'open beta defaults to disabled'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'gmad_download_audit_action_check'
      and pg_get_constraintdef(oid) like '%grant_auto_issued%'
  ),
  'audit action check includes grant_auto_issued'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run pgTAP to verify it fails**

Requires the local stack (see `C:\Users\freshair\.claude\projects\G--G-Maiden\memory\supabase-local-testing.md`: Docker on `G:\Docker\`, db-only `-x` start workaround if health-check flakes):

Run from repo root: `npx supabase test db`
Expected: the new file FAILS (`gmad_distribution_policy` does not exist).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260809120000_gid_pipeline_distribution_policy.sql`:

```sql
-- GID-central pipeline Phase 1 (SPEC-2026-08-09): Open Beta distribution policy.
-- Single-row switch: when open_beta_enabled, accepting current Terms auto-issues
-- a grant on the designated batch. Grant records still exist for every user, so
-- desktop entitlement and pause/revoke behave unchanged. Service-role only.

begin;

create table public.gmad_distribution_policy (
  id smallint primary key default 1 check (id = 1),
  open_beta_enabled boolean not null default false,
  open_beta_batch_id uuid references public.gmad_download_batches(id),
  github_release_url text check (
    github_release_url is null
    or github_release_url ~ '^https://github\.com/Freshair129/G-Maiden/releases/'
  ),
  updated_at timestamptz not null default now()
);

comment on table public.gmad_distribution_policy is
  'Single-row Open Beta switch (SPEC-2026-08-09). Read/written by service-role Edge Functions only.';

insert into public.gmad_distribution_policy (id) values (1);

alter table public.gmad_distribution_policy enable row level security;
revoke all on table public.gmad_distribution_policy from public, anon, authenticated;

alter table public.gmad_download_audit
  drop constraint gmad_download_audit_action_check;
alter table public.gmad_download_audit
  add constraint gmad_download_audit_action_check check (action in (
    'batch_created', 'batch_published', 'batch_status_changed', 'queue_checked',
    'download_issued', 'role_changed', 'owner_bootstrapped',
    'terms_accepted', 'desktop_entitlement_checked', 'grant_auto_issued'
  ));

commit;
```

(The action list = the CR-021 list in `supabase/migrations/20260721184500_cr021_terms_receipt_audit.sql` + `'grant_auto_issued'`.)

- [ ] **Step 4: Run pgTAP to verify it passes**

Run: `npx supabase db reset` then `npx supabase test db`
Expected: ALL test files PASS (new file 6/6; existing cr005/cr016/cr021 suites stay green).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260809120000_gid_pipeline_distribution_policy.sql supabase/tests/gid_pipeline_distribution_policy.sql
git commit -m "feat(gstore): add gmad_distribution_policy table and grant_auto_issued audit action"
```

---

### Task 2: Pure decision helpers in `_shared/entitlement.ts`

**Files:**
- Modify: `supabase/functions/_shared/entitlement.ts`
- Test: `supabase/functions/_shared/entitlement.test.ts`

**Interfaces:**
- Consumes: existing types `CurrentTerms`, `TermsReceipt` in the same file.
- Produces (used by Tasks 3–4):
  - `type DistributionPolicy = { open_beta_enabled: boolean; open_beta_batch_id: string | null; github_release_url: string | null }`
  - `shouldAutoGrant(policy: DistributionPolicy | null, batchStatus: string | null): boolean`
  - `type DownloadChannel = { channel: "github"; download_url: string } | { channel: "gated" }`
  - `resolveDownloadChannel(policy: DistributionPolicy | null, grantBatchId: string | null): DownloadChannel`
  - `type TermsState = "accepted" | "required" | "outdated" | "unavailable"`
  - `deriveTermsState(current: CurrentTerms | null, latestReceipt: TermsReceipt | null): TermsState`

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/_shared/entitlement.test.ts` (reuse the assert import already at the top of that file — do not add a second import):

```ts
Deno.test("shouldAutoGrant: only when enabled + batch id set + batch published", () => {
  const on = { open_beta_enabled: true, open_beta_batch_id: "b1", github_release_url: null };
  assertEquals(shouldAutoGrant(on, "published"), true);
  assertEquals(shouldAutoGrant(on, "paused"), false);
  assertEquals(shouldAutoGrant(on, null), false);
  assertEquals(shouldAutoGrant({ ...on, open_beta_batch_id: null }, "published"), false);
  assertEquals(shouldAutoGrant({ ...on, open_beta_enabled: false }, "published"), false);
  assertEquals(shouldAutoGrant(null, "published"), false);
});

Deno.test("resolveDownloadChannel: github only for the open-beta batch with a URL", () => {
  const url = "https://github.com/Freshair129/G-Maiden/releases/latest";
  const policy = { open_beta_enabled: true, open_beta_batch_id: "b1", github_release_url: url };
  assertEquals(resolveDownloadChannel(policy, "b1"), { channel: "github", download_url: url });
  assertEquals(resolveDownloadChannel(policy, "b2"), { channel: "gated" });
  assertEquals(resolveDownloadChannel({ ...policy, github_release_url: null }, "b1"), { channel: "gated" });
  assertEquals(resolveDownloadChannel({ ...policy, open_beta_enabled: false }, "b1"), { channel: "gated" });
  assertEquals(resolveDownloadChannel(null, "b1"), { channel: "gated" });
});

Deno.test("deriveTermsState: accepted / required / outdated / unavailable", () => {
  const current = { document_id: "t", version: "1.0.0", document_sha256: "a".repeat(64), effective_at: "2026-01-01T00:00:00Z" };
  const match = { document_id: "t", document_version: "1.0.0", document_sha256: "a".repeat(64) };
  assertEquals(deriveTermsState(current, match), "accepted");
  assertEquals(deriveTermsState(current, null), "required");
  assertEquals(deriveTermsState(current, { ...match, document_version: "0.9.0" }), "outdated");
  assertEquals(deriveTermsState(current, { ...match, document_sha256: "b".repeat(64) }), "outdated");
  assertEquals(deriveTermsState(null, match), "unavailable");
});
```

Add `shouldAutoGrant, resolveDownloadChannel, deriveTermsState` and their types to the existing import-from-`./entitlement.ts` line in the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/entitlement.test.ts`
Expected: FAIL — the three symbols are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `supabase/functions/_shared/entitlement.ts`:

```ts
export type DistributionPolicy = {
  open_beta_enabled: boolean;
  open_beta_batch_id: string | null;
  github_release_url: string | null;
};

export function shouldAutoGrant(
  policy: DistributionPolicy | null,
  batchStatus: string | null,
): boolean {
  return policy?.open_beta_enabled === true &&
    typeof policy.open_beta_batch_id === "string" &&
    batchStatus === "published";
}

export type DownloadChannel =
  | { channel: "github"; download_url: string }
  | { channel: "gated" };

export function resolveDownloadChannel(
  policy: DistributionPolicy | null,
  grantBatchId: string | null,
): DownloadChannel {
  if (
    policy?.open_beta_enabled === true &&
    typeof policy.github_release_url === "string" &&
    grantBatchId !== null &&
    grantBatchId === policy.open_beta_batch_id
  ) {
    return { channel: "github", download_url: policy.github_release_url };
  }
  return { channel: "gated" };
}

export type TermsState = "accepted" | "required" | "outdated" | "unavailable";

export function deriveTermsState(
  current: CurrentTerms | null,
  latestReceipt: TermsReceipt | null,
): TermsState {
  if (!current) return "unavailable";
  if (!latestReceipt) return "required";
  const matches = latestReceipt.document_id === current.document_id &&
    latestReceipt.document_version === current.version &&
    latestReceipt.document_sha256 === current.document_sha256;
  return matches ? "accepted" : "outdated";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/entitlement.test.ts`
Expected: PASS (existing `decideGmadEntitlement` tests + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/entitlement.ts supabase/functions/_shared/entitlement.test.ts
git commit -m "feat(gstore): pure helpers for auto-grant, download channel, terms state"
```

---

### Task 3: Auto-grant wiring in `accept-closed-beta-terms`

**Files:**
- Modify: `supabase/functions/accept-closed-beta-terms/index.ts`

**Interfaces:**
- Consumes: `shouldAutoGrant`, `DistributionPolicy` from `../_shared/entitlement.ts` (Task 2); `gmad_distribution_policy` table (Task 1).
- Produces: on terms acceptance — an enrollment row exists (unless previously revoked), and when the policy switch is on, a `gmad_download_grants` row + `grant_auto_issued` audit row. Response body unchanged.

- [ ] **Step 1: Extend the import**

In `supabase/functions/accept-closed-beta-terms/index.ts` line 3, change:

```ts
import { isGoogleIdentity } from "../_shared/entitlement.ts";
```

to:

```ts
import { isGoogleIdentity, shouldAutoGrant } from "../_shared/entitlement.ts";
```

- [ ] **Step 2: Insert enrollment + auto-grant block**

Immediately after the existing `terms_accepted` audit insert (the `await admin.from("gmad_download_audit").insert({ ... action: "terms_accepted" ... })` line) and before the final `return json(200, ...)`, insert:

```ts
  // SPEC-2026-08-09 Phase 1: accepting Terms makes the "queued" state real
  // (enrollment row) and, when the Open Beta switch is on, auto-issues the
  // grant on the designated batch. A previously revoked enrollment is never
  // resurrected and never auto-granted.
  const { data: enrollment } = await admin.from("closed_beta_enrollments")
    .select("status").eq("user_id", user.id).maybeSingle();
  if (!enrollment) {
    await admin.from("closed_beta_enrollments").insert({ user_id: user.id, source: "landing" });
  }
  if (enrollment?.status !== "revoked") {
    const { data: policy } = await admin.from("gmad_distribution_policy")
      .select("open_beta_enabled,open_beta_batch_id,github_release_url")
      .eq("id", 1).maybeSingle();
    if (policy?.open_beta_enabled && policy.open_beta_batch_id) {
      const { data: openBatch } = await admin.from("gmad_download_batches")
        .select("id,status").eq("id", policy.open_beta_batch_id).maybeSingle();
      if (shouldAutoGrant(policy, openBatch?.status ?? null)) {
        const { error: grantError } = await admin.from("gmad_download_grants").upsert(
          { batch_id: policy.open_beta_batch_id, user_id: user.id },
          { onConflict: "batch_id,user_id", ignoreDuplicates: true },
        );
        if (!grantError) {
          await admin.from("gmad_download_audit").insert({
            actor_id: user.id, subject_id: user.id, batch_id: policy.open_beta_batch_id,
            action: "grant_auto_issued", detail: { source: "accept-closed-beta-terms" },
          });
        }
      }
    }
  }
```

- [ ] **Step 3: Type-check the function**

Run: `deno check supabase/functions/accept-closed-beta-terms/index.ts`
Expected: no errors.

- [ ] **Step 4: Local contract check (manual, requires local stack + `npx supabase functions serve`)**

With the local stack running and a signed-in test JWT (jwt.claims trick per the supabase-local-testing memory): POST to `accept-closed-beta-terms` with `{"required_terms_accepted":true,"age_requirement_confirmed":true}`.
Expected: 200 with `receipt_id`; with `open_beta_enabled=false` (default) NO row appears in `gmad_download_grants`. Then `update gmad_distribution_policy set open_beta_enabled=true, open_beta_batch_id='<a published test batch id>' where id=1;`, POST again → a grant row + one `grant_auto_issued` audit row; a third POST adds NO duplicate grant.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/accept-closed-beta-terms/index.ts
git commit -m "feat(gstore): auto-grant on terms acceptance when open-beta policy is enabled"
```

---

### Task 4: `check-gmad-queue` gains `terms` / `channel` / `download_url`

**Files:**
- Modify: `supabase/functions/check-gmad-queue/index.ts`

**Interfaces:**
- Consumes: `deriveTermsState`, `resolveDownloadChannel`, types `CurrentTerms`, `TermsReceipt`, `DistributionPolicy` (Task 2); policy table (Task 1).
- Produces (Task 5 consumes): existing fields unchanged, plus:
  - `terms: { state: "accepted"|"required"|"outdated"|"unavailable"; document_id: string|null; version: string|null; effective_at: string|null }`
  - `channel: "github" | "gated"` and `download_url: string | null` (URL non-null only when `channel === "github"` and `state === "available"`).

- [ ] **Step 1: Extend the import**

In `supabase/functions/check-gmad-queue/index.ts` line 3, change:

```ts
import { isGoogleIdentity } from "../_shared/entitlement.ts";
```

to:

```ts
import { deriveTermsState, isGoogleIdentity, resolveDownloadChannel, type TermsReceipt } from "../_shared/entitlement.ts";
```

- [ ] **Step 2: Load terms + policy and extend the response**

After the existing `profile` check (`if (!profile?.gid_code) ...` line) insert the terms lookup (same query shape as `request-gmad-download/index.ts` but WITHOUT the version/sha filters, so an outdated receipt is still found):

```ts
  const { data: required } = await admin.from("closed_beta_legal_documents")
    .select("document_id,version,document_sha256,effective_at").eq("required_for_gmad", true).maybeSingle();
  const { data: latestReceipt } = required
    ? await admin.from("closed_beta_terms_receipts")
      .select("document_id,document_version,document_sha256").eq("user_id", user.id)
      .eq("document_id", required.document_id).eq("required_terms_accepted", true)
      .eq("age_requirement_confirmed", true)
      .order("accepted_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const termsState = deriveTermsState(required ?? null, (latestReceipt as TermsReceipt | null) ?? null);
  const { data: policy } = await admin.from("gmad_distribution_policy")
    .select("open_beta_enabled,open_beta_batch_id,github_release_url").eq("id", 1).maybeSingle();
```

Then replace the final `return json(200, { state, batch_label: ..., release_id: ... });` with:

```ts
  const download = state === "available"
    ? resolveDownloadChannel(policy ?? null, grant?.batch_id ?? null)
    : { channel: "gated" as const };
  return json(200, {
    state,
    batch_label: state === "available" || state === "paused" ? batch?.label : null,
    release_id: state === "available" ? batch?.release_id : null,
    terms: {
      state: termsState,
      document_id: required?.document_id ?? null,
      version: required?.version ?? null,
      effective_at: required?.effective_at ?? null,
    },
    channel: download.channel,
    download_url: download.channel === "github" ? download.download_url : null,
  });
```

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/check-gmad-queue/index.ts`
Expected: no errors.

- [ ] **Step 4: Local contract check (manual)**

With the local stack: POST as a user with no receipt → `terms.state === "required"`, `channel === "gated"`. Accept terms, grant via a published batch, set policy `open_beta_enabled=true, open_beta_batch_id=<that batch>, github_release_url='https://github.com/Freshair129/G-Maiden/releases/latest'` → response has `state:"available"`, `channel:"github"`, `download_url` set. Reset policy to defaults afterwards.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/check-gmad-queue/index.ts
git commit -m "feat(gstore): expose terms state and download channel in check-gmad-queue"
```

---

### Task 5: Landing pure state mapper + `useGmadAccess` hook

**Files:**
- Create: `landing/src/gmadAccess.ts`
- Test: `landing/src/gmadAccess.test.ts`

**Interfaces:**
- Consumes: `landingSupabase` from `./beta` (existing export); the Task 4 response shape.
- Produces (Task 6 consumes):
  - `type LandingAccessState` (7 kinds below)
  - `deriveLandingState(q: QueueResponse): LandingAccessState`
  - `useGmadAccess(enabled: boolean): { access: LandingAccessState | null; busy: boolean; error: string; refresh(): Promise<void>; acceptTerms(o: TermsOptIns): Promise<void>; requestDownload(): Promise<void> }`

- [ ] **Step 1: Write the failing vitest**

Create `landing/src/gmadAccess.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveLandingState, type QueueResponse } from './gmadAccess'

const base: QueueResponse = {
  state: 'waiting',
  terms: { state: 'accepted', document_id: 't', version: '1.0.0', effective_at: null },
  channel: 'gated',
  download_url: null,
  batch_label: null,
  release_id: null,
}

describe('deriveLandingState', () => {
  it('terms required wins over everything', () => {
    expect(deriveLandingState({ ...base, state: 'available', terms: { ...base.terms!, state: 'required' } }))
      .toEqual({ kind: 'signed_in_no_terms', termsVersion: '1.0.0' })
  })
  it('terms outdated blocks download even when a grant is available', () => {
    expect(deriveLandingState({ ...base, state: 'available', terms: { ...base.terms!, state: 'outdated' } }))
      .toEqual({ kind: 'terms_outdated', termsVersion: '1.0.0' })
  })
  it('accepted terms + waiting = queued', () => {
    expect(deriveLandingState(base)).toEqual({ kind: 'queued' })
  })
  it('available maps to granted with the gated channel by default', () => {
    expect(deriveLandingState({ ...base, state: 'available', release_id: 'v0.13.2' }))
      .toEqual({ kind: 'granted', channel: 'gated', downloadUrl: null, releaseId: 'v0.13.2' })
  })
  it('available with github channel carries the release URL', () => {
    const url = 'https://github.com/Freshair129/G-Maiden/releases/latest'
    expect(deriveLandingState({ ...base, state: 'available', channel: 'github', download_url: url }))
      .toEqual({ kind: 'granted', channel: 'github', downloadUrl: url, releaseId: null })
  })
  it('paused and revoked map through', () => {
    expect(deriveLandingState({ ...base, state: 'paused' })).toEqual({ kind: 'paused' })
    expect(deriveLandingState({ ...base, state: 'revoked' })).toEqual({ kind: 'revoked' })
  })
  it('unknown/unavailable states fall back to unavailable', () => {
    expect(deriveLandingState({ ...base, state: 'not_registered' })).toEqual({ kind: 'unavailable' })
    expect(deriveLandingState({ ...base, terms: { ...base.terms!, state: 'unavailable' } }))
      .toEqual({ kind: 'unavailable' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C landing test`
Expected: FAIL — `./gmadAccess` does not exist. (`HeroMedia25D.test.ts` / `scrollNarrative.test.ts` stay green.)

- [ ] **Step 3: Implement `gmadAccess.ts`**

Create `landing/src/gmadAccess.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { landingSupabase } from './beta'

export type QueueResponse = {
  state: 'waiting' | 'available' | 'paused' | 'revoked' | 'not_registered' | 'signed_out'
  terms?: {
    state: 'accepted' | 'required' | 'outdated' | 'unavailable'
    document_id: string | null
    version: string | null
    effective_at: string | null
  }
  channel?: 'github' | 'gated'
  download_url?: string | null
  batch_label?: string | null
  release_id?: string | null
}

export type LandingAccessState =
  | { kind: 'signed_in_no_terms'; termsVersion: string | null }
  | { kind: 'terms_outdated'; termsVersion: string | null }
  | { kind: 'queued' }
  | { kind: 'granted'; channel: 'github' | 'gated'; downloadUrl: string | null; releaseId: string | null }
  | { kind: 'paused' }
  | { kind: 'revoked' }
  | { kind: 'unavailable' }

export type TermsOptIns = {
  diagnostics_opt_in?: boolean
  marketing_opt_in?: boolean
  post_match_opt_in?: boolean
}

export function deriveLandingState(q: QueueResponse): LandingAccessState {
  if (q.terms?.state === 'required') return { kind: 'signed_in_no_terms', termsVersion: q.terms.version ?? null }
  if (q.terms?.state === 'outdated') return { kind: 'terms_outdated', termsVersion: q.terms.version ?? null }
  if (q.terms?.state === 'unavailable') return { kind: 'unavailable' }
  if (q.state === 'available') {
    return {
      kind: 'granted',
      channel: q.channel ?? 'gated',
      downloadUrl: q.download_url ?? null,
      releaseId: q.release_id ?? null,
    }
  }
  if (q.state === 'paused') return { kind: 'paused' }
  if (q.state === 'revoked') return { kind: 'revoked' }
  if (q.state === 'waiting') return { kind: 'queued' }
  return { kind: 'unavailable' }
}

function toMessage(error: unknown): string {
  return (error as { message?: string })?.message || 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง'
}

export function useGmadAccess(enabled: boolean) {
  const [access, setAccess] = useState<LandingAccessState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const { data, error: fnError } = await landingSupabase.functions.invoke<QueueResponse>(
        'check-gmad-queue',
        { body: {} },
      )
      if (fnError) throw fnError
      if (!data) throw new Error('empty response')
      setAccess(deriveLandingState(data))
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) void refresh()
    else setAccess(null)
  }, [enabled, refresh])

  const acceptTerms = useCallback(async (optIns: TermsOptIns) => {
    setBusy(true)
    setError('')
    try {
      const { error: fnError } = await landingSupabase.functions.invoke('accept-closed-beta-terms', {
        body: { required_terms_accepted: true, age_requirement_confirmed: true, ...optIns },
      })
      if (fnError) throw fnError
      await refresh()
    } catch (caught) {
      setError(toMessage(caught))
      setBusy(false)
    }
  }, [refresh])

  const requestDownload = useCallback(async () => {
    if (access?.kind !== 'granted') return
    if (access.channel === 'github' && access.downloadUrl) {
      window.open(access.downloadUrl, '_blank', 'noopener')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data, error: fnError } = await landingSupabase.functions.invoke<{ url?: string }>(
        'request-gmad-download',
        { body: {} },
      )
      if (fnError) throw fnError
      if (!data?.url) throw new Error('download URL was not issued')
      window.open(data.url, '_blank', 'noopener')
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [access])

  return { access, busy, error, refresh, acceptTerms, requestDownload }
}
```

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `pnpm -C landing test` then `pnpm -C landing typecheck`
Expected: all vitest files PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add landing/src/gmadAccess.ts landing/src/gmadAccess.test.ts
git commit -m "feat(landing): gmad access state mapper and hook (4-state pipeline)"
```

---

### Task 6: `BetaAccessPanel` + mount in App.tsx

**Files:**
- Create: `landing/src/BetaAccessPanel.tsx`
- Modify: `landing/src/App.tsx`

**Interfaces:**
- Consumes: `useGmadAccess`, `LandingAccessState`, `TermsOptIns` (Task 5).
- Produces: `<BetaAccessPanel signedIn={boolean} />` — self-contained; no props other than `signedIn`.

- [ ] **Step 1: Create the panel**

Create `landing/src/BetaAccessPanel.tsx`:

```tsx
// SPEC-2026-08-09 Phase 1: the 4-state access panel under the GID card.
// Terms link targets the canonical legal documents; the served copy moves to a
// hosted legal route when the retired landing mirrors return.
import { useState } from 'react'
import { useGmadAccess, type TermsOptIns } from './gmadAccess'

const TERMS_URL =
  'https://github.com/Freshair129/G-Maiden/blob/main/docs/product/closed-beta-terms-of-use-draft.md'
const PRIVACY_URL =
  'https://github.com/Freshair129/G-Maiden/blob/main/docs/product/closed-beta-privacy-notice-draft.md'

function TermsForm({ version, busy, onAccept }: {
  version: string | null
  busy: boolean
  onAccept: (optIns: TermsOptIns) => void
}) {
  const [terms, setTerms] = useState(false)
  const [age, setAge] = useState(false)
  const [diagnostics, setDiagnostics] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm opacity-80">
        อ่าน{' '}
        <a className="underline" href={TERMS_URL} target="_blank" rel="noreferrer">เงื่อนไขการใช้งาน</a>
        {' '}และ{' '}
        <a className="underline" href={PRIVACY_URL} target="_blank" rel="noreferrer">ประกาศความเป็นส่วนตัว</a>
        {version ? ` (ฉบับ ${version})` : ''} ก่อนยืนยัน
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>ยอมรับเงื่อนไขการใช้งาน Closed Beta ฉบับปัจจุบัน</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
        <span>ยืนยันว่ามีอายุถึงเกณฑ์ที่เงื่อนไขกำหนด</span>
      </label>
      <label className="flex items-start gap-2 text-sm opacity-80">
        <input type="checkbox" checked={diagnostics} onChange={(e) => setDiagnostics(e.target.checked)} />
        <span>ยินยอมแชร์ข้อมูลวิเคราะห์ปัญหา (ไม่บังคับ)</span>
      </label>
      <button
        type="button"
        className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        disabled={!terms || !age || busy}
        onClick={() => onAccept({ diagnostics_opt_in: diagnostics })}
      >
        {busy ? 'กำลังบันทึก…' : 'ยอมรับและไปต่อ'}
      </button>
    </div>
  )
}

export default function BetaAccessPanel({ signedIn }: { signedIn: boolean }) {
  const { access, busy, error, refresh, acceptTerms, requestDownload } = useGmadAccess(signedIn)
  if (!signedIn || !access) return null
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      {access.kind === 'signed_in_no_terms' ? (
        <TermsForm version={access.termsVersion} busy={busy} onAccept={(o) => void acceptTerms(o)} />
      ) : access.kind === 'terms_outdated' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">เงื่อนไขการใช้งานมีฉบับใหม่{access.termsVersion ? ` (${access.termsVersion})` : ''} — ต้องยอมรับก่อนดาวน์โหลดหรือใช้งานต่อ</p>
          <TermsForm version={access.termsVersion} busy={busy} onAccept={(o) => void acceptTerms(o)} />
        </div>
      ) : access.kind === 'queued' ? (
        <p className="text-sm opacity-90">อยู่ในคิว Closed Beta — เราจะแจ้งเตือนเมื่อสิทธิ์ดาวน์โหลดของ GID นี้เปิด</p>
      ) : access.kind === 'granted' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm opacity-90">สิทธิ์ดาวน์โหลดพร้อมแล้ว{access.releaseId ? ` — รุ่น ${access.releaseId}` : ''}</p>
          <button
            type="button"
            className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            disabled={busy}
            onClick={() => void requestDownload()}
          >
            {busy ? 'กำลังเตรียมลิงก์…' : 'ดาวน์โหลด G-Maiden'}
          </button>
          <p className="text-xs opacity-60">ตัวติดตั้งไม่ใช่สิทธิ์การใช้งาน — สิทธิ์จริงตรวจตอนล็อกอิน Google ในแอป</p>
        </div>
      ) : access.kind === 'paused' ? (
        <p className="text-sm opacity-90">รอบแจกจ่ายถูกพักชั่วคราว — กลับมาเช็คอีกครั้งภายหลัง</p>
      ) : access.kind === 'revoked' ? (
        <p className="text-sm opacity-90">บัญชีนี้ไม่มีสิทธิ์ Closed Beta ที่ใช้งานได้</p>
      ) : (
        <button type="button" className="text-sm underline" onClick={() => void refresh()}>
          โหลดสถานะไม่สำเร็จ — ลองอีกครั้ง
        </button>
      )}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  )
}
```

- [ ] **Step 2: Mount it in App.tsx**

Find the registered-GID render block: `grep -n "beta.gid\|beta.status" landing/src/App.tsx`. Add the import at the top of `landing/src/App.tsx`:

```tsx
import BetaAccessPanel from './BetaAccessPanel'
```

and immediately AFTER the JSX element that displays `beta.gid` (inside the `beta.status === 'registered'` branch), add:

```tsx
<BetaAccessPanel signedIn={beta.status === 'registered'} />
```

- [ ] **Step 3: Typecheck + test + build**

Run: `pnpm -C landing typecheck && pnpm -C landing test && pnpm -C landing build`
Expected: all PASS/clean (prebuild legal-mirror script prints "retired, skipping" — that is normal).

- [ ] **Step 4: Visual smoke**

Run the landing dev server via the Browser pane (launch config or `pnpm -C landing dev` through preview tooling), open the page, verify: signed-out → no panel; signed-in flows require live Supabase so only confirm the panel renders without console errors in the signed-out state.

- [ ] **Step 5: Commit**

```bash
git add landing/src/BetaAccessPanel.tsx landing/src/App.tsx
git commit -m "feat(landing): 4-state beta access panel (terms, queue, download, outdated)"
```

---

### Task 7: Desktop Account copy (GID-as-hub)

**Files:**
- Modify: `src/src/AccountPage.tsx:63-66`

**Interfaces:**
- Consumes/Produces: none — copy only.

- [ ] **Step 1: Update the lead paragraph**

In `src/src/AccountPage.tsx` replace:

```tsx
      <p className="account-lead">
        Sign in to a G-Maiden account (GID) — one identity across the G-series — link your
        Steam, and set up your profile. The deck works without an account; this adds sync and linking.
      </p>
```

with:

```tsx
      <p className="account-lead">
        Sign in to a G-Maiden account (GID) — one identity across the G-series: this deck, the
        G-Maiden landing site, and creator tools like G-AnnStudio all resolve the same Google
        sign-in to the same GID. The deck works without an account; this adds sync and linking.
      </p>
```

- [ ] **Step 2: Typecheck**

Run from `src/`: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/src/AccountPage.tsx
git commit -m "docs(deck): explain GID as the cross-G-series identity on the Account page"
```

---

## Ops checklist (owner-gated — NOT part of coding tasks)

1. Verify migration locally (`npx supabase db reset` + full pgTAP) before `npx supabase db push` to gstore production (migration-history discipline per CR-017).
2. Deploy `accept-closed-beta-terms` and `check-gmad-queue` Edge Functions; production smoke: `OPTIONS` preflight 200 from the landing origin (mint-gid CORS RCA lesson).
3. Deploy landing via Vercel CLI.
4. `open_beta_enabled` stays `false` until Boss explicitly flips it (with `open_beta_batch_id` pointing at a published batch and `github_release_url` set).
5. Phase 2 (separate plan, G-Suite repo): AnnStudio Google sign-in + `author` manifest stamp + `voice_api.rs` optional read (spec deltas #5–#6).
