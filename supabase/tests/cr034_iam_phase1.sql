-- CR-034 Phase 1 private-schema, privilege, hook and append-only audit contract.
-- Run: supabase test db

begin;
select plan(25);

select has_schema('iam_private', 'IAM private schema exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'iam_private.security_events'::regclass),
  'security events enforce RLS'
);
select ok(not has_schema_privilege('anon', 'iam_private', 'USAGE'), 'anon cannot use IAM schema');
select ok(not has_schema_privilege('authenticated', 'iam_private', 'USAGE'), 'authenticated cannot use IAM schema');
select ok(not has_table_privilege('anon', 'iam_private.security_events', 'INSERT'), 'anon cannot insert security events');
select ok(not has_table_privilege('authenticated', 'iam_private.security_events', 'SELECT'), 'authenticated cannot read security events');
select ok(has_schema_privilege('gmaiden_iam_runtime', 'iam_private', 'USAGE'), 'IAM runtime can use private schema');
select ok(not has_table_privilege('gmaiden_iam_runtime', 'auth.sessions', 'SELECT'), 'IAM runtime cannot read auth sessions directly');
select ok(not has_column_privilege('gmaiden_iam_runtime', 'public.profiles', 'id', 'SELECT'), 'IAM runtime cannot read profile id directly');
select ok(not has_column_privilege('gmaiden_iam_runtime', 'public.profiles', 'role', 'SELECT'), 'IAM runtime cannot read server role directly');
select ok(
  has_function_privilege('gmaiden_iam_runtime', 'iam_private.session_is_active(uuid,uuid)', 'EXECUTE'),
  'IAM runtime can call the bounded live-session projection'
);
select ok(
  has_function_privilege('gmaiden_iam_runtime', 'iam_private.role_for_user(uuid)', 'EXECUTE'),
  'IAM runtime can call the bounded role projection'
);
select ok(has_table_privilege('gmaiden_iam_runtime', 'iam_private.security_events', 'INSERT'), 'IAM runtime can append security events');
select ok(not has_table_privilege('gmaiden_iam_runtime', 'iam_private.security_events', 'SELECT'), 'IAM runtime cannot read security events');
select ok(not has_table_privilege('gmaiden_iam_runtime', 'iam_private.security_events', 'UPDATE'), 'IAM runtime cannot update security events');
select ok(not has_table_privilege('gmaiden_iam_runtime', 'iam_private.security_events', 'DELETE'), 'IAM runtime cannot delete security events');
select ok(not (select rolcanlogin from pg_roles where rolname = 'gmaiden_iam_runtime'), 'migration never provisions a login password');

select is(
  iam_private.hook_restrict_signup_to_google(
    '{"user":{"app_metadata":{"provider":"google","providers":["google"]}}}'::jsonb
  ),
  '{}'::jsonb,
  'signup hook permits Google identity creation'
);
select is(
  iam_private.hook_restrict_signup_to_google(
    '{"user":{"app_metadata":{"provider":"email","providers":["email"]}}}'::jsonb
  )->'error'->>'http_code',
  '403',
  'signup hook rejects non-Google identity creation'
);
select ok(
  has_function_privilege('supabase_auth_admin', 'iam_private.hook_restrict_signup_to_google(jsonb)', 'EXECUTE'),
  'Auth service can invoke the signup hook'
);
select ok(
  not has_function_privilege('anon', 'iam_private.hook_restrict_signup_to_google(jsonb)', 'EXECUTE'),
  'anon cannot invoke the signup hook'
);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000341', 'cr034-audit@example.com')
on conflict (id) do nothing;
grant gmaiden_iam_runtime to postgres;
set local role gmaiden_iam_runtime;
select is(
  iam_private.session_is_active(
    '00000000-0000-0000-0000-000000000341',
    '00000000-0000-0000-0000-000000000343'
  ),
  false,
  'bounded projection rejects an absent user session'
);
select is(
  iam_private.role_for_user('00000000-0000-0000-0000-000000000341'),
  null,
  'bounded projection returns no role for an absent profile'
);
select lives_ok(
  $$
    insert into iam_private.security_events (
      request_id, actor_user_id, subject_user_id, event_type, outcome,
      source, session_id, context, retention_until
    ) values (
      '00000000-0000-0000-0000-000000000342',
      '00000000-0000-0000-0000-000000000341',
      '00000000-0000-0000-0000-000000000341',
      'authorization_granted', 'success', 'admin-gmad-controller', null,
      '{"action":"list"}'::jsonb, now() + interval '365 days'
    )
  $$,
  'IAM runtime can append an allow-listed event'
);
select throws_ok(
  $$ update iam_private.security_events set outcome = 'failure' $$,
  '42501', null, 'IAM runtime cannot rewrite audit history'
);
reset role;

select * from finish();
rollback;
