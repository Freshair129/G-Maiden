-- Doc: SEC-001-auth-identity-hardening §2 (atoms.security block)
-- Auth & identity hardening for gstore. Split into Part A (safe, non-breaking) and
-- Part B (breaking — apply ONLY together with the mint-gid Edge Fn + client changes).
-- Verified against live gstore 2026-07-04. Do NOT apply Part B without Part B's code deploy.

begin;

-- =====================================================================
-- PART A — safe, non-breaking. Revokes dead/over-broad grants + hygiene.
-- =====================================================================

-- F2/F3: SECURITY DEFINER functions are internal, not a public REST API.
-- NOTE: functions grant EXECUTE to PUBLIC by default, so we must revoke from
-- PUBLIC (not just anon/authenticated) to actually close the RPC. Signup is
-- unaffected: handle_new_user runs via the trigger system (no EXECUTE check)
-- and calls alloc_cohort_seq as its SECURITY DEFINER owner.
revoke execute on function public.alloc_cohort_seq(text) from public, anon, authenticated;
revoke execute on function public.handle_new_user()       from public, anon, authenticated;

-- F4: gid_counters is written only by the definer trigger. Strip client grants
-- (RLS already denies, this removes the landmine if RLS is ever toggled off).
revoke all on table public.gid_counters from anon, authenticated;

-- anon needs no access to profiles at all (the deck reads a profile only when
-- authenticated; public enrichment comes from OpenDota, not this table).
revoke all on table public.profiles from anon;

-- F7: pin search_path so the function can't be hijacked via a mutable path.
alter function public.touch_updated_at() set search_path = '';

commit;

-- F8 (leaked-password protection) is an Auth config toggle, not SQL:
--   Dashboard → Auth → Providers → Password → "Check against HaveIBeenPwned".

-- =====================================================================
-- PART B — BREAKING. APPLIED to live 2026-07-04 alongside the mint-gid Edge Fn
-- (deployed) + client changes (profile.ts stops writing gid_code; auth.ts
-- linkProfile uses .update on {steamid64,account_id}, not upsert+email).
-- =====================================================================
begin;

-- F1: identity columns become server-authoritative. Clients may update ONLY
-- these three fields on their own row; generation/gid_code/cohort_seq/email/id/role
-- are no longer in any client grant → GID / Founder / role forgery impossible.
revoke insert, update on public.profiles from authenticated;
drop policy if exists own_profile_insert on public.profiles;  -- rows created by the definer trigger only
grant update (display_name, steamid64, account_id) on public.profiles to authenticated;

-- CR-003 role column, born locked: default 'user', not in the client UPDATE grant,
-- so it can never be self-elevated. Admin/creator are set by service_role only.
alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user','creator','admin'));

-- own_profile_update stays as-is (scopes the ROW); the column grant scopes the FIELDS.
-- Together: a user can update only their own row, and only display_name/steam links.
commit;
