-- CR-016: GMAD (G-Maiden) gated beta distribution.
-- All operational reads/writes are through service-role Edge Functions. Player RLS
-- is intentionally not widened: a GID is a display handle, never an access token.

begin;

-- The bucket is private. Only the service-role Edge Function mints short-lived signed URLs;
-- no browser-facing Storage policy is created for GMAD release artifacts.
insert into storage.buckets (id, name, public)
values ('gmad-releases', 'gmad-releases', false)
on conflict (id) do update set public = false;

create table public.gmad_download_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 120),
  release_id text not null check (char_length(release_id) between 1 and 120),
  artifact_path text not null check (artifact_path !~ '^/' and artifact_path !~ '(^|/)\.\.(/|$)'),
  gid_start text not null,
  gid_end text not null,
  generation text not null check (generation in ('F', 'B', 'P')),
  cohort_seq_start integer not null check (cohort_seq_start > 0),
  cohort_seq_end integer not null check (cohort_seq_end >= cohort_seq_start),
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'closed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.gmad_download_grants (
  batch_id uuid not null references public.gmad_download_batches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (batch_id, user_id)
);

create table public.gmad_download_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('batch_created', 'batch_published', 'batch_status_changed', 'queue_checked', 'download_issued')),
  batch_id uuid references public.gmad_download_batches(id) on delete set null,
  subject_id uuid references public.profiles(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index gmad_download_batches_status_idx on public.gmad_download_batches (status, generation, cohort_seq_start, cohort_seq_end);
create index gmad_download_grants_user_idx on public.gmad_download_grants (user_id, batch_id);
create index gmad_download_audit_created_idx on public.gmad_download_audit (created_at desc);

alter table public.gmad_download_batches enable row level security;
alter table public.gmad_download_grants enable row level security;
alter table public.gmad_download_audit enable row level security;

revoke all on table public.gmad_download_batches, public.gmad_download_grants, public.gmad_download_audit from public, anon, authenticated;

commit;
