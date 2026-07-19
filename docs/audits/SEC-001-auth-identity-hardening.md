---
title: "SEC-001: Auth & Identity Hardening — live gstore audit + fixes"
doc_id: "SEC-001-auth-identity-hardening"
status: "Part A + Part B + mint-gid APPLIED to live (2026-07-04) · F1 closed on prod · client release pending"
version: "1.0.0"
updated: "2026-07-04"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-14-gid-account-identity", "CR-003-account-phase1-wallet-billing"]
---

# SEC-001: Auth & Identity Hardening

Audit of the **live** Supabase project `gstore` (ref `wsseitulmcgnolgsrxgh`, ACTIVE_HEALTHY) +
the desktop auth path ([`auth.ts`](file:///g:/G-Maiden/src/src/auth.ts), [`supabase.ts`](file:///g:/G-Maiden/src/src/supabase.ts), [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts), [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs) callback).
Goal per Boss: **make login + auth + security solid before the [[CR-003-account-phase1-wallet-billing|CR-003]] economy is built on top.**
Findings below were confirmed by querying the live DB (pg_policy, role grants, function defs) and
by Supabase's own security advisor — not from the spec.

> **Status 2026-07-04 (MVP deploy):** **Part A + Part B + the `mint-gid` Edge Fn are APPLIED to live
> `gstore`.** F1 is **closed on prod** — verified: authenticated's UPDATE grant on `profiles` is now
> only `{display_name, steamid64, account_id}`; `forgeable_cols_remaining = 0` (generation/gid_code/
> cohort_seq/role/email/id are not client-writable); `role` column added, default `'user'`. F2/F3/F4/F7
> closed in Part A. **Gotcha:** functions grant EXECUTE to `PUBLIC` by default — had to `revoke … from
> public`, not just anon/authenticated.
>
> **Deferred to pre-public / pre-scale (Boss decision — no dev branch, cost):** the pgTAP
> `sec001_identity_lock.sql` run + a full `get_advisors(security)` pass on a dev branch. Re-run both
> **before opening real users / before scaling.**
>
> **Still pending for full MVP:** (1) the **client release** — [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts)/[`auth.ts`](file:///g:/G-Maiden/src/src/auth.ts) edits are in the
> working tree (branch `feat/voice-pack-inventory`) but not shipped; until an app release goes out, the
> currently-installed v0.8.0 has a self-healing window (new signups show a blank GID / Steam re-link
> silently no-ops — existing users unaffected; heals on update). (2) **F8** leaked-password toggle
> (dashboard, minor — Google-OAuth-only).

---

## 1. Findings (severity-ranked, all confirmed on live)

| ID | Sev | Finding | Evidence (live) | Exploit |
| --- | --- | --- | --- | --- |
| **F1** | 🔴 **High** | **Identity columns are self-writable → GID / Founder forgery; becomes privilege-escalation when [[CR-003-account-phase1-wallet-billing|CR-003]] adds `role`.** | `profiles.generation NOT NULL DEFAULT 'F'`, `gid_code`, `cohort_seq` are plain row columns; policy `own_profile_update` = `USING/CHECK (auth.uid()=id)` with **no column restriction**; `authenticated` holds table-wide `UPDATE`. | Any signed-in user: `PATCH /rest/v1/profiles?id=eq.<self> {"generation":"F","gid_code":"G-F…"}` → forges Founder. After [[CR-003-account-phase1-wallet-billing|CR-003]]: `{"role":"admin"}` → self-admin. Client guard in [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts) is bypassed by hitting PostgREST directly. |
| **F2** | 🟠 Med | **`alloc_cohort_seq(gen)` EXECUTE-able by `anon` + `authenticated`.** | Advisor `0028/0029`; `SECURITY DEFINER`, granted to anon+authenticated via `/rest/v1/rpc/alloc_cohort_seq`. | Anyone (no login) burns/inflates cohort counters, creates counter rows for arbitrary `gen` strings → corrupts the GID sequence space. Only the signup trigger should call it. |
| **F3** | 🟠 Med | **`handle_new_user()` exposed as RPC** to anon+authenticated. | Advisor `0028/0029`; trigger function reachable at `/rest/v1/rpc/handle_new_user`. | Unnecessary attack surface on the signup path; should be trigger-only. |
| **F4** | 🟠 Med | **`gid_counters`: full DML granted to anon+authenticated** (RLS on, 0 policies). | Grants show INSERT/UPDATE/DELETE/TRUNCATE for both roles; advisor `0008` (RLS enabled, no policy). | RLS default-denies today, so the grants are *dead* — but they're a landmine: flip RLS off by accident and the counter table is world-writable. Defense-in-depth: revoke. |
| **F5** | 🟡 Low | **Refresh token at rest in plaintext.** | [`supabase.ts`](file:///g:/G-Maiden/src/src/supabase.ts) `persistSession:true`; Tauri WebView2 stores the session in on-disk localStorage, unencrypted. | Local malware / disk exfil replays the refresh token. Move to an encrypted store (Tauri store + OS keychain adapter). |
| **F6** | 🟡 Low | **Loopback OAuth callback has no app-layer `state` binding.** | [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs) `/auth/callback` emits `oauth-callback` for any `?code=` from `127.0.0.1:3000` (bound to loopback — good). | PKCE already blocks code-injection (verifier required, held in webview). Residual login-CSRF surface; add `state` nonce echo + single-use as defense-in-depth. |
| **F7** | 🟡 Low | **`touch_updated_at` mutable `search_path`.** | Advisor `0011`; function has no `SET search_path`. | Low (SECURITY INVOKER), but standard hardening: pin `search_path=''`. |
| **F8** | 🟡 Low | **Leaked-password protection disabled.** | Advisor `auth_leaked_password_protection`. | Near-N/A (Google-OAuth-only, no passwords) but free to enable; do it so it's already on if email auth ever returns. |

**Also verified OK (no action):** `:3000` binds `127.0.0.1` not `0.0.0.0`; `profiles` has no DELETE
policy so row deletion is blocked; `own_profile_select/insert` correctly scope to `auth.uid()=id`;
`anon` writes to `profiles` are denied by the policy (auth.uid() is null). PKCE flow + loopback
query-string callback is the correct desktop pattern.

---

## 2. Fixes

### Phase A — safe, non-breaking (apply anytime)

Revokes + hygiene; nothing depends on these grants. File: `supabase/migrations/*_sec001_identity_hardening.sql` (Part A).

```sql
-- F2/F3: definer functions are not a public API
revoke execute on function public.alloc_cohort_seq(text) from anon, authenticated;
revoke execute on function public.handle_new_user()       from anon, authenticated;
-- F4: counter table is server-only (trigger runs as definer regardless)
revoke all on table public.gid_counters from anon, authenticated;
-- profiles: anon needs nothing (deck reads profile only when authenticated)
revoke all on table public.profiles from anon;
-- F7: pin search_path
alter function public.touch_updated_at() set search_path = '';
```
F8 is a dashboard/Auth-config toggle (Auth → Providers → Password → enable leaked-password check).

### Phase B — breaking, land WITH code + Edge Fn (the F1 fix)

The core fix for F1 is **column-level privileges**: clients may update only the columns they own,
and identity columns become server-authoritative. But GID minting currently runs client-side in
[`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts) — so we must **move minting server-side first**, otherwise column-lock breaks it.

**Ordering (all in one coordinated deploy):**

1. **Deploy Edge Fn `mint-gid`** — reuses the *same* [`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts) codec (Deno imports it) so the algorithm
   stays single-sourced (honors [[ADR-14-gid-account-identity|ADR-14]]'s "no plpgsql duplication"), runs as `service_role`, mints
   `gid_code` once (`where gid_code is null`). This resolves the [[ADR-14-gid-account-identity|ADR-14]] tension: server-authoritative
   *and* single TS source.
2. **Migration Part B:**
   ```sql
   -- F1: lock identity columns — clients may only touch these three
   revoke insert, update on public.profiles from authenticated;
   drop policy if exists own_profile_insert on public.profiles;   -- rows are created by the definer trigger only
   grant update (display_name, steamid64, account_id) on public.profiles to authenticated;
   -- CR-003 role column, born locked (no client grant, no client-updatable)
   alter table public.profiles add column if not exists role text not null default 'user'
     check (role in ('user','creator','admin'));
   ```
   Now `generation`, `gid_code`, `cohort_seq`, `email`, `id`, `role` are **not** in any client grant →
   unforgeable. `own_profile_update` policy still scopes the row; the column grant scopes the fields.
3. **Client changes (same PR):**
   - [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts) — delete the client-side `gid_code` UPDATE; read `gid_code` only (mint via `mint-gid`).
   - [`auth.ts`](file:///g:/G-Maiden/src/src/auth.ts) `linkProfile` — `.update({steamid64,account_id})` on the existing row (drop `.upsert`,
     drop `email`; the trigger already set `id`+`email`). Row always pre-exists (trigger fires in the
     auth.users insert txn).

### Phase C — desktop hardening (independent, non-breaking)

- **F5** secure session storage: custom Supabase `storage` adapter → Tauri encrypted store / OS keychain
  (Stronghold or `tauri-plugin-store` + DPAPI). Replaces plaintext localStorage.
- **F6** OAuth `state`: generate a nonce at `signInWithGoogle`, stash locally, and only accept the
  `oauth-callback` whose `state` echoes it; single-use (clear after exchange). [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs) forwards `state`.
- **open_url allowlist** ([`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)): only launch `https://` (+ the known Google/Supabase hosts); reject
  anything else so a crafted `data.url` can't shell out.

---

## 3. Verification (each fix = a runnable check → success meter)

| Fix | Verify (fails before, passes after) |
| --- | --- |
| F1 | As `authenticated`, `PATCH profiles {generation:'B'}` / `{role:'admin'}` → `403`/`42501`; `{display_name}` still `204`. pgTAP `sec001_identity_lock.sql`. |
| F2/F3 | `POST /rest/v1/rpc/alloc_cohort_seq` as anon → `404`/`permission denied`. |
| F4 | `select/insert on gid_counters` as authenticated → denied; signup still mints seq (trigger path). |
| F5 | Inspect WebView2 profile dir → no JWT/refresh token in plaintext localStorage. |
| F6 | Replay `/auth/callback?code=X` with a wrong/absent `state` → ignored, no session. |
| F7/F8 | Re-run `get_advisors(security)` → `0011` + leaked-password findings gone. |
| — | Full signup e2e still yields a wallet + immutable `G-F…` GID; existing users unaffected (backfill). |

**Regression guard:** `get_advisors(security)` in CI must return **zero WARN/ERROR** for the account
schema after each migration (ties into [[CR-003-account-phase1-wallet-billing|CR-003]] `guard--e2e-*` gates).

---

## 4. Sequencing vs [[CR-003-account-phase1-wallet-billing|CR-003]]

SEC-001 is a **hard predecessor** of the [[CR-003-account-phase1-wallet-billing|CR-003]] economy: F1's column-lock is what makes the [[CR-003-account-phase1-wallet-billing|CR-003]]
`role` column (admin/creator) trustworthy, and the server-only-writes principle (RLS read + SECURITY
DEFINER RPC) is proven here first. Execution atoms: `orchestration/gks/atoms.security.json` (compile →
`backlog.security.json`); its terminal atom is a dependency edge into [[CR-003-account-phase1-wallet-billing|CR-003]] Phase 1.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-07-04 | Live audit of gstore — 8 findings (1 High GID/role forgery), phased fixes (A safe / B breaking+code / C desktop), verification meters; NOT yet applied |
