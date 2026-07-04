-- Doc: SEC-001-auth-identity-hardening §3 (eval--pgtap-identity-lock)
-- Proves F1 is closed: a signed-in user may update only display_name/steam links
-- on their own profile — never generation/gid_code/cohort_seq/role.
-- RED before Part B (authenticated has table-wide UPDATE), GREEN after.
-- Run: supabase test db

begin;
select plan(6);

-- Seed a profile we will act as. (Runs as the migration/owner role.)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'locktest@example.com')
  on conflict (id) do nothing;
-- The signup trigger creates public.profiles; ensure it exists for older rows.
insert into public.profiles (id, email, generation, cohort_seq)
  values ('00000000-0000-0000-0000-0000000000aa', 'locktest@example.com', 'F', 999999)
  on conflict (id) do nothing;

-- Act as that authenticated user.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';

-- ALLOWED: display_name on own row.
select lives_ok(
  $$ update public.profiles set display_name = 'ok name' where id = '00000000-0000-0000-0000-0000000000aa' $$,
  'display_name update on own row is allowed');

-- DENIED: generation (Founder forgery).
select throws_ok(
  $$ update public.profiles set generation = 'B' where id = '00000000-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'generation update is denied (no column grant)');

-- DENIED: gid_code (GID forgery).
select throws_ok(
  $$ update public.profiles set gid_code = 'G-FFAKE' where id = '00000000-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'gid_code update is denied');

-- DENIED: cohort_seq.
select throws_ok(
  $$ update public.profiles set cohort_seq = 1 where id = '00000000-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'cohort_seq update is denied');

-- DENIED: role escalation (column exists only after Part B).
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000aa' $$,
  '42501', null, 'role self-elevation is denied');

-- DENIED: touching another user's row (RLS row scope still holds).
select is_empty(
  $$ update public.profiles set display_name = 'x' where id <> '00000000-0000-0000-0000-0000000000aa' returning id $$,
  'cannot update another user''s row');

reset role;
select * from finish();
rollback;
