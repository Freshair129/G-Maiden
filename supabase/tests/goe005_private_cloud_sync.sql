-- GOE-005 / G-AnnStudio private cloud sync RLS contract.
-- Run with the migration suite against a local Supabase database.

begin;
select plan(24);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'ann-owner-a@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'ann-owner-b@example.com');

insert into public.ann_projects (
  id, owner_id, title, event_id, schema_version, revision, project_json
) values
(
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  'Owner A kill',
  'kill',
  1,
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', '00000000-0000-0000-0000-0000000000b1',
    'title', 'Owner A kill',
    'eventId', 'kill',
    'artboard', jsonb_build_object('width', 1280, 'height', 720),
    'assets', '[]'::jsonb,
    'layers', '[]'::jsonb,
    'revision', 1
  )
),
(
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000a2',
  'Owner B kill',
  'kill',
  1,
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', '00000000-0000-0000-0000-0000000000b2',
    'title', 'Owner B kill',
    'eventId', 'kill',
    'artboard', jsonb_build_object('width', 1280, 'height', 720),
    'assets', '[]'::jsonb,
    'layers', '[]'::jsonb,
    'revision', 1
  )
);

insert into public.ann_project_assets (
  id, project_id, owner_id, name, kind, mime, byte_size, sha256
) values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  'banner.webp',
  'image',
  'image/webp',
  128,
  repeat('a', 64)
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ann_projects'::regclass),
  'ann_projects has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ann_project_assets'::regclass),
  'ann_project_assets has RLS enabled'
);
select ok(not has_table_privilege('anon', 'public.ann_projects', 'SELECT'), 'anon cannot read ann_projects');
select ok(not has_table_privilege('anon', 'public.ann_project_assets', 'SELECT'), 'anon cannot read ann_project_assets');
select ok(has_table_privilege('authenticated', 'public.ann_projects', 'SELECT'), 'authenticated can select own projects');
select ok(has_table_privilege('authenticated', 'public.ann_project_assets', 'SELECT'), 'authenticated can select own assets');
select ok(
  (select not public from storage.buckets where id = 'ann-project-assets'),
  'ann-project-assets bucket is private'
);
select is(
  (select file_size_limit::bigint from storage.buckets where id = 'ann-project-assets'),
  52428800::bigint,
  'ann-project-assets enforces the 50 MiB provider ceiling'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ann_project_assets_storage_select'
  ),
  'storage select policy exists'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ann_project_assets_storage_insert'
  ),
  'storage insert policy exists'
);
select ok(
  public.ann_project_document_safe(jsonb_build_object(
    'schemaVersion', 1, 'id', 'p', 'title', 't', 'eventId', 'kill',
    'artboard', jsonb_build_object(), 'assets', '[]'::jsonb,
    'layers', '[]'::jsonb, 'revision', 1
  )),
  'allowlisted manifest is accepted'
);
select ok(
  not public.ann_project_document_safe(jsonb_build_object(
    'schemaVersion', 1, 'id', 'p', 'title', 't', 'eventId', 'kill',
    'artboard', jsonb_build_object(), 'assets', '[]'::jsonb,
    'layers', jsonb_build_array(jsonb_build_object('content', jsonb_build_object('gsi', true))),
    'revision', 1
  )),
  'nested forbidden game key is rejected'
);
select is(
  (select object_path from public.ann_project_assets where id = '00000000-0000-0000-0000-0000000000c1'),
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1',
  'asset object path is generated from owner/project/asset UUIDs'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is((select count(*)::integer from public.ann_projects), 1, 'owner A sees only own active project');
select is((select count(*)::integer from public.ann_project_assets), 1, 'owner A sees only own active asset');
select throws_ok(
  $$ insert into public.ann_projects (id, owner_id, title, event_id, schema_version, revision, project_json)
     values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a2', 'spoof', 'kill', 1, 1,
       jsonb_build_object('schemaVersion', 1, 'id', '00000000-0000-0000-0000-0000000000b3', 'title', 'spoof', 'eventId', 'kill', 'artboard', jsonb_build_object(), 'assets', '[]'::jsonb, 'layers', '[]'::jsonb, 'revision', 1)) $$,
  '42501', null,
  'owner A cannot insert owner B project'
);
select throws_ok(
  $$ insert into public.ann_project_assets (id, project_id, owner_id, name, kind, mime, byte_size, sha256)
     values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 'spoof.webp', 'image', 'image/webp', 1, repeat('b', 64)) $$,
  '42501', null,
  'owner A cannot insert owner B asset'
);
select is(
  (select count(*)::integer from public.ann_projects where id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'owner A cannot read owner B project'
);
select is(
  (select count(*)::integer from public.ann_projects
   where id = '00000000-0000-0000-0000-0000000000b1'
     and revision = 1),
  1,
  'owner A sees the current revision before update'
);
update public.ann_projects
set revision = 2,
    project_json = jsonb_set(project_json, '{revision}', '2'::jsonb)
where id = '00000000-0000-0000-0000-0000000000b1'
  and revision = 1;
select is(
  (select revision from public.ann_projects where id = '00000000-0000-0000-0000-0000000000b1'),
  2::bigint,
  'owner A can advance a matching revision'
);
update public.ann_projects
set revision = 3,
    project_json = jsonb_set(project_json, '{revision}', '3'::jsonb)
where id = '00000000-0000-0000-0000-0000000000b1'
  and revision = 1;
select is(
  (select revision from public.ann_projects where id = '00000000-0000-0000-0000-0000000000b1'),
  2::bigint,
  'stale revision update changes no row'
);
select throws_ok(
  $$ delete from public.ann_projects where id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501', null,
  'authenticated client cannot hard-delete a project'
);
update public.ann_projects
set deleted_at = now()
where id = '00000000-0000-0000-0000-0000000000b1';
select is((select count(*)::integer from public.ann_projects), 0, 'tombstoned project is hidden from normal reads');

reset role;
select is((select revision from public.ann_projects where id = '00000000-0000-0000-0000-0000000000b1'), 2::bigint, 'database retains the last valid revision');

select * from finish();
rollback;
