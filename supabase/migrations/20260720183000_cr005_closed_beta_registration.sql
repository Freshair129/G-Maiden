-- CR-005 W1A: public landing registration backed by the existing GID identity.
-- Existing F/P profiles are immutable; only users created after this migration
-- receive the Closed Beta generation B.

begin;

create table if not exists public.closed_beta_enrollments (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'registered'
    check (status in ('registered', 'invited', 'revoked')),
  source text not null default 'landing'
    check (source = 'landing'),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.closed_beta_enrollments is
  'CR-005 Closed Beta opt-in. Contains identity enrollment only; no match, CV, or G-Log data.';

alter table public.closed_beta_enrollments enable row level security;

revoke all on table public.closed_beta_enrollments from public, anon, authenticated;
grant select, insert on table public.closed_beta_enrollments to authenticated;

drop policy if exists beta_enrollment_own_select on public.closed_beta_enrollments;
create policy beta_enrollment_own_select
  on public.closed_beta_enrollments
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists beta_enrollment_own_insert on public.closed_beta_enrollments;
create policy beta_enrollment_own_insert
  on public.closed_beta_enrollments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'registered'
    and source = 'landing'
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare gen text := 'B';
begin
  insert into public.profiles (id, email, generation, cohort_seq)
  values (new.id, new.email, gen, public.alloc_cohort_seq(gen))
  on conflict (id) do nothing;
  return new;
end
$function$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
