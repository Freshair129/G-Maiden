-- Doc: ADR-14-gid-account-identity — GID account foundation (profiles, gid_counters,
-- signup trigger, cohort-sequence allocator).
--
-- This migration did not previously exist in this repo: it was created directly against
-- the live `gstore` project (via the Supabase dashboard/SQL editor) before this repo's
-- supabase/migrations/ folder existed, so a fresh local `supabase start` had no way to
-- reach the schema state that 20260704120000_sec001_identity_hardening.sql assumes
-- (that migration revokes/tightens grants on objects this file creates, and fails outright
-- on a clean database with `function public.alloc_cohort_seq(text) does not exist`).
--
-- Reconstructed 2026-07-12 via read-only introspection (pg_get_functiondef/pg_constraintdef/
-- pg_policies/list_tables) against the live gstore project, with the user's explicit
-- permission for that read. This is a best-effort backfill of pre-existing production state,
-- not a new design decision — every object here matches what is already running live.
-- Known gap acknowledged rather than guessed at: the ORIGINAL `own_profile_insert` RLS
-- policy's exact definition is not reconstructed here, because 20260704120000's Part B
-- already unconditionally drops it (`drop policy if exists own_profile_insert on
-- public.profiles`) before any INSERT policy is needed again — profiles rows are created
-- exclusively by the handle_new_user() trigger (SECURITY DEFINER, bypasses RLS) both before
-- and after that drop, so omitting it does not change any behavior.

begin;

create table public.gid_counters (
  generation text primary key,
  next_seq   bigint not null default 1
);
alter table public.gid_counters enable row level security;
-- no policies: RLS-enabled-with-zero-policies denies all client access by design (only the
-- SECURITY DEFINER alloc_cohort_seq() touches this table) — matches live gstore exactly.

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  phone        text,
  steamid64    text,
  account_id   bigint,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  gid_code     text unique,
  generation   text not null default 'F',
  cohort_seq   bigint
);
alter table public.profiles enable row level security;

create policy own_profile_select on public.profiles
  for select using (auth.uid() = id);
create policy own_profile_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Allocates the next per-generation cohort sequence number, atomically (upsert + returning).
create or replace function public.alloc_cohort_seq(gen text)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare s bigint;
begin
  insert into public.gid_counters(generation, next_seq) values (gen, 2)
  on conflict (generation) do update set next_seq = gid_counters.next_seq + 1
  returning next_seq into s;
  return s - 1;  -- allocated value (insert path returns 2 -> 1; update returns old+1 -> old)
end $function$;

-- Creates the profiles row for a freshly signed-up auth.users row (GID minting itself is a
-- separate, later step — the mint-gid Edge Function, SEC-001 §2 Phase B).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare gen text := 'F';  -- current ecosystem phase (Founder). Change on beta/public open.
begin
  insert into public.profiles (id, email, generation, cohort_seq)
  values (new.id, new.email, gen, public.alloc_cohort_seq(gen))
  on conflict (id) do nothing;
  return new;
end $function$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Present on live gstore; not currently wired to a trigger there (kept as-is for fidelity —
-- not this migration's place to add behavior that doesn't exist in production).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin new.updated_at = now(); return new; end;
$function$;

commit;
