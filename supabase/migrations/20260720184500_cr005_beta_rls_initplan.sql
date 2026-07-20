-- CR-005 follow-up: evaluate auth.uid() once per statement instead of once per
-- row. This clears Supabase advisor 0003 for the beta enrollment policies.

begin;

alter policy beta_enrollment_own_select
  on public.closed_beta_enrollments
  using ((select auth.uid()) = user_id);

alter policy beta_enrollment_own_insert
  on public.closed_beta_enrollments
  with check (
    (select auth.uid()) = user_id
    and status = 'registered'
    and source = 'landing'
  );

commit;
