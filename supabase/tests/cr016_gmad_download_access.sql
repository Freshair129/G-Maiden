begin;
select plan(9);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000d1', 'gmad-admin@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'gmad-player@example.com');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.closed_beta_enrollments (user_id, source)
values ('00000000-0000-0000-0000-0000000000d2', 'landing');

insert into public.gmad_download_batches (
  id, label, release_id, artifact_path, gid_start, gid_end, generation,
  cohort_seq_start, cohort_seq_end, created_by
) values (
  '00000000-0000-0000-0000-0000000000e1', 'test batch', 'gmad-test', 'test/gmad.exe',
  'G-B234567Z', 'G-B234567Z', 'B', 1, 1, '00000000-0000-0000-0000-0000000000d1'
);

insert into public.gmad_download_grants (batch_id, user_id)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2');

select ok((select relrowsecurity from pg_class where oid = 'public.gmad_download_batches'::regclass), 'batches enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.gmad_download_grants'::regclass), 'grants enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.gmad_download_audit'::regclass), 'audit enforces RLS');
select ok(not has_table_privilege('anon', 'public.gmad_download_batches', 'SELECT'), 'anon cannot read batches');
select ok(not has_table_privilege('authenticated', 'public.gmad_download_batches', 'SELECT'), 'players cannot read batches directly');
select ok(not has_table_privilege('authenticated', 'public.gmad_download_grants', 'SELECT'), 'players cannot read grants directly');
select ok(not has_table_privilege('authenticated', 'public.gmad_download_audit', 'SELECT'), 'players cannot read audit directly');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select is((select count(*)::integer from public.gmad_download_batches), 0, 'RLS denies direct batch roster read');
select throws_ok(
  $$ insert into public.gmad_download_grants (batch_id, user_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2') $$,
  '42501', null, 'player cannot self-grant GMAD download'
);
reset role;

select * from finish();
rollback;
