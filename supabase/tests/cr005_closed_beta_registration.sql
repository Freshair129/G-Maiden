begin;
select plan(8);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1', 'beta-one@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'beta-two@example.com');

select is(
  (select generation from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  'B',
  'new signup receives Closed Beta generation B'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.closed_beta_enrollments'::regclass),
  'closed_beta_enrollments has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.closed_beta_enrollments', 'SELECT'),
  'anon cannot read beta enrollments'
);

select ok(
  not has_table_privilege('authenticated', 'public.closed_beta_enrollments', 'UPDATE'),
  'authenticated users cannot change enrollment status'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select lives_ok(
  $$ insert into public.closed_beta_enrollments (user_id, source)
     values ('00000000-0000-0000-0000-0000000000b1', 'landing') $$,
  'user can register their own profile'
);

select throws_ok(
  $$ insert into public.closed_beta_enrollments (user_id, source)
     values ('00000000-0000-0000-0000-0000000000b2', 'landing') $$,
  '42501', null,
  'user cannot register another profile'
);

select is(
  (select count(*)::integer from public.closed_beta_enrollments),
  1,
  'RLS select exposes only the current user enrollment'
);

select throws_ok(
  $$ update public.closed_beta_enrollments set status = 'invited'
     where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501', null,
  'user cannot self-approve an invitation'
);

reset role;
select * from finish();
rollback;
