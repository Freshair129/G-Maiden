-- CR-034 Phase 2: session/device projections and own security activity.
-- This migration is local/reviewable only. It does not change a remote project.

create table iam_private.device_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_session_id uuid not null,
  user_label text check (user_label is null or length(user_label) between 1 and 64),
  platform text not null check (length(platform) between 1 and 32),
  app_version text not null check (length(app_version) between 1 and 32),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, provider_session_id)
);

create index device_registry_user_seen_idx
  on iam_private.device_registry (user_id, last_seen_at desc);

alter table iam_private.device_registry enable row level security;

revoke all on table iam_private.device_registry
  from public, anon, authenticated, gmaiden_iam_runtime;

create or replace function iam_private.record_device_seen(
  p_user_id uuid,
  p_provider_session_id uuid,
  p_user_label text,
  p_platform text,
  p_app_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from auth.sessions
    where id = p_provider_session_id
      and user_id = p_user_id
  ) then
    raise exception 'session is not active';
  end if;

  insert into iam_private.device_registry (
    user_id, provider_session_id, user_label, platform, app_version
  ) values (
    p_user_id,
    p_provider_session_id,
    nullif(left(trim(p_user_label), 64), ''),
    left(trim(p_platform), 32),
    left(trim(p_app_version), 32)
  )
  on conflict (user_id, provider_session_id) do update
    set user_label = excluded.user_label,
        platform = excluded.platform,
        app_version = excluded.app_version,
        last_seen_at = now(),
        revoked_at = null;
end;
$$;

create or replace function iam_private.device_projection(p_user_id uuid)
returns table (
  id uuid,
  provider_session_id uuid,
  user_label text,
  platform text,
  app_version text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.provider_session_id, d.user_label, d.platform, d.app_version,
         d.first_seen_at, d.last_seen_at, d.revoked_at
  from iam_private.device_registry d
  where d.user_id = p_user_id
  order by d.last_seen_at desc
  limit 100;
$$;

create or replace function iam_private.security_events_for_user(
  p_user_id uuid,
  p_before timestamptz default null,
  p_limit integer default 25,
  p_before_id uuid default null
)
returns table (
  id uuid,
  event_type text,
  outcome text,
  source text,
  session_id uuid,
  context jsonb,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.event_type, e.outcome, e.source, e.session_id,
         e.context, e.occurred_at
  from iam_private.security_events e
  where (e.subject_user_id = p_user_id or e.actor_user_id = p_user_id)
    and (
      p_before is null
      or e.occurred_at < p_before
      or (p_before_id is not null and e.occurred_at = p_before and e.id < p_before_id)
    )
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke execute on function iam_private.record_device_seen(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function iam_private.device_projection(uuid)
  from public, anon, authenticated;
revoke execute on function iam_private.security_events_for_user(uuid, timestamptz, integer, uuid)
  from public, anon, authenticated;

grant execute on function iam_private.record_device_seen(uuid, uuid, text, text, text)
  to gmaiden_iam_runtime;
grant execute on function iam_private.device_projection(uuid)
  to gmaiden_iam_runtime;
grant execute on function iam_private.security_events_for_user(uuid, timestamptz, integer, uuid)
  to gmaiden_iam_runtime;

comment on table iam_private.device_registry is
  'App-observed device projection only; provider session and server authorization remain authoritative.';
comment on function iam_private.record_device_seen(uuid, uuid, text, text, text) is
  'Runtime-only device observation; requires a live matching Auth session.';
comment on function iam_private.device_projection(uuid) is
  'Own device projection for the IAM Edge Function; provider state is never inferred from it.';
comment on function iam_private.security_events_for_user(uuid, timestamptz, integer, uuid) is
  'Own redacted-activity source; actor/subject ids and HMAC references are not returned.';
