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
