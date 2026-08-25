-- CR-034 Phase 1: private IAM audit foundation, least-privilege runtime role,
-- and a provider-boundary hook that permits new Google identities only.

create schema if not exists iam_private;

revoke all on schema iam_private from public, anon, authenticated;
revoke all on all tables in schema iam_private from public, anon, authenticated;
revoke all on all routines in schema iam_private from public, anon, authenticated;
revoke all on all sequences in schema iam_private from public, anon, authenticated;

alter default privileges for role postgres in schema iam_private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema iam_private
  revoke all on routines from public, anon, authenticated;
alter default privileges for role postgres in schema iam_private
  revoke all on sequences from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gmaiden_iam_runtime') then
    create role gmaiden_iam_runtime nologin noinherit;
  end if;
end
$$;

create table iam_private.security_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  actor_ref_hash bytea,
  subject_ref_hash bytea,
  event_type text not null check (event_type <> '' and length(event_type) <= 80),
  outcome text not null check (outcome in ('success', 'denied', 'failure')),
  source text not null check (source <> '' and length(source) <= 80),
  session_id uuid,
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  occurred_at timestamptz not null default now(),
  retention_until timestamptz not null,
  legal_hold boolean not null default false
);

create index security_events_subject_time_idx
  on iam_private.security_events (subject_user_id, occurred_at desc);
create index security_events_actor_time_idx
  on iam_private.security_events (actor_user_id, occurred_at desc);
create index security_events_type_time_idx
  on iam_private.security_events (event_type, occurred_at desc);
create index security_events_retention_idx
  on iam_private.security_events (retention_until)
  where not legal_hold;

alter table iam_private.security_events enable row level security;

create policy security_events_runtime_insert
  on iam_private.security_events
  for insert
  to gmaiden_iam_runtime
  with check (true);

create or replace function iam_private.session_is_active(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions
    where id = p_session_id
      and user_id = p_user_id
  );
$$;

create or replace function iam_private.role_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when role in ('user', 'creator', 'admin', 'owner') then role
    else null
  end
  from public.profiles
  where id = p_user_id
  limit 1;
$$;

revoke execute on function iam_private.session_is_active(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function iam_private.role_for_user(uuid)
  from public, anon, authenticated;

grant usage on schema iam_private to gmaiden_iam_runtime;
grant execute on function iam_private.session_is_active(uuid, uuid)
  to gmaiden_iam_runtime;
grant execute on function iam_private.role_for_user(uuid)
  to gmaiden_iam_runtime;
grant insert on table iam_private.security_events to gmaiden_iam_runtime;

create or replace function iam_private.hook_restrict_signup_to_google(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  provider text := event->'user'->'app_metadata'->>'provider';
  providers jsonb := event->'user'->'app_metadata'->'providers';
begin
  if provider = 'google' or (jsonb_typeof(providers) = 'array' and providers ? 'google') then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Google sign-in is required.'
    )
  );
end;
$$;

revoke execute on function iam_private.hook_restrict_signup_to_google(jsonb)
  from public, anon, authenticated;
grant usage on schema iam_private to supabase_auth_admin;
grant execute on function iam_private.hook_restrict_signup_to_google(jsonb)
  to supabase_auth_admin;

comment on schema iam_private is
  'CR-034 private IAM state; not exposed through the Data API.';
comment on table iam_private.security_events is
  'Append-only application audit: runtime can INSERT only; retention purge remains an operator action.';
comment on function iam_private.session_is_active(uuid, uuid) is
  'Least-privilege live-session projection; runtime has no direct auth.sessions access.';
comment on function iam_private.role_for_user(uuid) is
  'Least-privilege server-role projection; runtime has no direct profiles access.';
comment on role gmaiden_iam_runtime is
  'NOLOGIN migration role. Provision LOGIN credentials out-of-band and store only in IAM_DATABASE_URL.';
