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
