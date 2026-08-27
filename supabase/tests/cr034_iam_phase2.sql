-- CR-034 Phase 2 session/device projection and own-activity contract.

begin;
select plan(26);

select ok(
  (select relrowsecurity from pg_class where oid = 'iam_private.device_registry'::regclass),
  'device registry enforces RLS'
);
select ok(not has_table_privilege('anon', 'iam_private.device_registry', 'SELECT'), 'anon cannot read devices');
select ok(not has_table_privilege('authenticated', 'iam_private.device_registry', 'SELECT'), 'authenticated cannot read devices');
select ok(not has_table_privilege('gmaiden_iam_runtime', 'iam_private.device_registry', 'SELECT'), 'runtime cannot read devices directly');
select ok(not has_table_privilege('gmaiden_iam_runtime', 'iam_private.device_registry', 'INSERT'), 'runtime cannot write devices directly');
select ok(has_function_privilege('gmaiden_iam_runtime', 'iam_private.record_device_seen(uuid,uuid,text,text,text)', 'EXECUTE'), 'runtime can call device observation projection');
select ok(has_function_privilege('gmaiden_iam_runtime', 'iam_private.device_projection(uuid)', 'EXECUTE'), 'runtime can call device projection');
select ok(has_function_privilege('gmaiden_iam_runtime', 'iam_private.security_events_for_user(uuid,timestamptz,integer,uuid)', 'EXECUTE'), 'runtime can call own activity projection');
select ok(not has_function_privilege('anon', 'iam_private.device_projection(uuid)', 'EXECUTE'), 'anon cannot call device projection');
select ok(not has_function_privilege('authenticated', 'iam_private.security_events_for_user(uuid,timestamptz,integer,uuid)', 'EXECUTE'), 'authenticated cannot call activity projection');
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'iam_private.record_device_seen(uuid,uuid,text,text,text)'::regprocedure),
  'device writer pins an empty search path'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'iam_private.security_events_for_user(uuid,timestamptz,integer,uuid)'::regprocedure),
  'activity projection pins an empty search path'
);
select ok(
  (select exists (select 1 from pg_constraint where conrelid = 'iam_private.device_registry'::regclass and contype = 'u')),
  'device registry prevents duplicate user/session observations'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000351', 'cr034-phase2-a@example.com'),
  ('00000000-0000-0000-0000-000000000352', 'cr034-phase2-b@example.com')
on conflict (id) do nothing;

grant gmaiden_iam_runtime to postgres;
set local role gmaiden_iam_runtime;
select throws_ok(
  $$ select iam_private.record_device_seen(
    '00000000-0000-0000-0000-000000000351',
    '00000000-0000-0000-0000-000000000353',
    'Work PC', 'windows', '0.13.2'
  ) $$,
  null,
  'session is not active',
  'device observation rejects a stale/nonexistent provider session'
);

select lives_ok($$
  insert into iam_private.security_events (
    request_id, actor_user_id, subject_user_id, event_type, outcome, source,
    session_id, context, retention_until
  ) values
    ('00000000-0000-0000-0000-000000000354', '00000000-0000-0000-0000-000000000351', '00000000-0000-0000-0000-000000000351', 'session_signout', 'success', 'iam-session-action', null, '{"scope":"current"}'::jsonb, now() + interval '365 days'),
    ('00000000-0000-0000-0000-000000000355', '00000000-0000-0000-0000-000000000352', '00000000-0000-0000-0000-000000000352', 'session_signout', 'success', 'iam-session-action', null, '{"scope":"others"}'::jsonb, now() + interval '365 days')
$$, 'runtime can append phase2 session events');
select is((select count(*)::integer from iam_private.security_events_for_user('00000000-0000-0000-0000-000000000351', null, 25)), 1, 'own activity projection excludes another user');
select is((select count(*)::integer from iam_private.security_events_for_user('00000000-0000-0000-0000-000000000352', null, 25)), 1, 'second user sees only own activity');
select is((select context->>'scope' from iam_private.security_events_for_user('00000000-0000-0000-0000-000000000351', null, 25) limit 1), 'current', 'own activity keeps only structured scope context');
select is((select count(*)::integer from iam_private.device_projection('00000000-0000-0000-0000-000000000351')), 0, 'device projection returns no unobserved provider sessions');
select ok(not has_table_privilege('gmaiden_iam_runtime', 'iam_private.device_registry', 'UPDATE'), 'runtime cannot rewrite device observations directly');
select ok(not has_table_privilege('gmaiden_iam_runtime', 'iam_private.device_registry', 'DELETE'), 'runtime cannot delete device observations directly');

select lives_ok($$
  insert into iam_private.security_events (
    id, request_id, actor_user_id, subject_user_id, event_type, outcome, source,
    session_id, context, occurred_at, retention_until
  ) values
    ('00000000-0000-0000-0000-000000000356', '00000000-0000-0000-0000-000000000359', '00000000-0000-0000-0000-000000000351', '00000000-0000-0000-0000-000000000351', 'session_signout', 'success', 'iam-session-action', null, '{"scope":"current"}'::jsonb, '2099-01-01T00:00:00Z', now() + interval '365 days'),
    ('00000000-0000-0000-0000-000000000357', '00000000-0000-0000-0000-000000000360', '00000000-0000-0000-0000-000000000351', '00000000-0000-0000-0000-000000000351', 'session_signout', 'success', 'iam-session-action', null, '{"scope":"current"}'::jsonb, '2099-01-01T00:00:00Z', now() + interval '365 days'),
    ('00000000-0000-0000-0000-000000000358', '00000000-0000-0000-0000-000000000361', '00000000-0000-0000-0000-000000000351', '00000000-0000-0000-0000-000000000351', 'session_signout', 'success', 'iam-session-action', null, '{"scope":"current"}'::jsonb, '2099-01-01T00:00:00Z', now() + interval '365 days')
$$, 'fixture creates tied activity timestamps for cursor regression');
select is((select count(*)::integer from iam_private.security_events_for_user('00000000-0000-0000-0000-000000000351', null, 2)), 2, 'activity page honors the requested limit at a tied timestamp');
select is((select id::text from iam_private.security_events_for_user('00000000-0000-0000-0000-000000000351', null, 2) order by occurred_at desc, id desc limit 1), '00000000-0000-0000-0000-000000000358', 'activity page has a stable id boundary');
select is((select count(*)::integer from iam_private.security_events_for_user('00000000-0000-0000-0000-000000000351', '2099-01-01T00:00:00Z', 1, '00000000-0000-0000-0000-000000000357')), 1, 'composite cursor returns the tied row after the boundary');
select is((select id::text from iam_private.security_events_for_user('00000000-0000-0000-0000-000000000351', '2099-01-01T00:00:00Z', 2, '00000000-0000-0000-0000-000000000357') limit 1), '00000000-0000-0000-0000-000000000356', 'composite cursor does not drop tied activity');
reset role;

select * from finish();
rollback;
