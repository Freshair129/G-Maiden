-- GOE-005 / G-AnnStudio private cloud sync.
-- Contract: G-Suite/packages/ann-studio/docs/gann-cloud-threat-model.md
-- Authoring manifests and assets only. No GSI, match, CV, G-Log, Steam,
-- recovery, entitlement, or Google-account security data is accepted.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ann-project-assets',
  'ann-project-assets',
  false,
  52428800,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'video/mp4',
    'video/webm'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.ann_project_document_safe(doc jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
with recursive nodes(value) as (
  select doc
  union all
  select child.value
  from nodes
  cross join lateral (
    select pair.value
    from jsonb_each(
      case when jsonb_typeof(nodes.value) = 'object' then nodes.value else '{}'::jsonb end
    ) as pair(key, value)
    union all
    select item.value
    from jsonb_array_elements(
      case when jsonb_typeof(nodes.value) = 'array' then nodes.value else '[]'::jsonb end
    ) as item(value)
  ) as child
),
keys as (
  select lower(pair.key) as key
  from nodes
  cross join lateral jsonb_each(
    case when jsonb_typeof(nodes.value) = 'object' then nodes.value else '{}'::jsonb end
  ) as pair(key, value)
)
select jsonb_typeof(doc) = 'object'
  and doc ?& array['schemaVersion', 'id', 'title', 'eventId', 'artboard', 'assets', 'layers', 'revision']
  and jsonb_typeof(doc -> 'assets') = 'array'
  and jsonb_typeof(doc -> 'layers') = 'array'
  and not exists (
    select 1
    from keys
    where key = any (array[
      'gsi', 'match', 'cv', 'glog', 'game', 'telemetry',
      'steam', 'steamid64', 'recovery', 'email', 'phone', 'auth',
      'gid', 'gid_code', 'source', 'sourcepath', 'wavpath'
    ])
  );
$function$;

revoke execute on function public.ann_project_document_safe(jsonb) from public, anon;
grant execute on function public.ann_project_document_safe(jsonb) to authenticated, service_role;

create table public.ann_projects (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 120),
  event_id       text not null check (char_length(event_id) between 1 and 80),
  schema_version integer not null default 1 check (schema_version = 1),
  revision       bigint not null default 1 check (revision > 0),
  project_json   jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint ann_projects_owner_key unique (id, owner_id),
  constraint ann_projects_manifest_check check (
    octet_length(project_json::text) <= 2097152
    and public.ann_project_document_safe(project_json)
    and project_json ->> 'id' = id::text
    and project_json ->> 'schemaVersion' = '1'
    and project_json ->> 'revision' = revision::text
  )
);

comment on table public.ann_projects is
  'GOE-005 private G-AnnStudio BannerProject manifests; owner-only and never runtime/game data.';

create table public.ann_project_assets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,
  owner_id    uuid not null,
  name        text not null check (char_length(name) between 1 and 160),
  kind        text not null check (kind in ('image', 'svg', 'video')),
  mime        text not null check (mime in (
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'video/mp4', 'video/webm'
  )),
  byte_size   bigint not null check (byte_size between 0 and 52428800),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  object_path text generated always as (owner_id::text || '/' || project_id::text || '/' || id::text) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint ann_project_assets_project_owner_fk
    foreign key (project_id, owner_id)
    references public.ann_projects (id, owner_id)
    on delete cascade,
  constraint ann_project_assets_object_path_key unique (object_path)
);

comment on table public.ann_project_assets is
  'GOE-005 private authoring asset metadata; object bytes live only in ann-project-assets.';

create index ann_projects_owner_updated_idx
  on public.ann_projects (owner_id, updated_at desc)
  where deleted_at is null;
create index ann_project_assets_project_idx
  on public.ann_project_assets (project_id, owner_id)
  where deleted_at is null;

create trigger ann_projects_touch_updated_at
  before update on public.ann_projects
  for each row execute function public.touch_updated_at();
create trigger ann_project_assets_touch_updated_at
  before update on public.ann_project_assets
  for each row execute function public.touch_updated_at();

alter table public.ann_projects enable row level security;
alter table public.ann_project_assets enable row level security;

revoke all on table public.ann_projects, public.ann_project_assets from public, anon, authenticated;
grant select on table public.ann_projects, public.ann_project_assets to authenticated;
grant insert (id, owner_id, title, event_id, schema_version, revision, project_json)
  on public.ann_projects to authenticated;
grant update (title, event_id, schema_version, revision, project_json, deleted_at)
  on public.ann_projects to authenticated;
grant insert (id, project_id, owner_id, name, kind, mime, byte_size, sha256)
  on public.ann_project_assets to authenticated;
grant update (name, kind, mime, byte_size, sha256, deleted_at)
  on public.ann_project_assets to authenticated;

create policy ann_projects_owner_select
  on public.ann_projects
  for select to authenticated
  using ((select auth.uid()) = owner_id and deleted_at is null);

create policy ann_projects_owner_insert
  on public.ann_projects
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy ann_projects_owner_update
  on public.ann_projects
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy ann_project_assets_owner_select
  on public.ann_project_assets
  for select to authenticated
  using (
    (select auth.uid()) = owner_id
    and deleted_at is null
    and exists (
      select 1
      from public.ann_projects p
      where p.id = project_id
        and p.owner_id = (select auth.uid())
        and p.deleted_at is null
    )
  );

create policy ann_project_assets_owner_insert
  on public.ann_project_assets
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and deleted_at is null
    and exists (
      select 1
      from public.ann_projects p
      where p.id = project_id
        and p.owner_id = (select auth.uid())
        and p.deleted_at is null
    )
  );

create policy ann_project_assets_owner_update
  on public.ann_project_assets
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.ann_projects p
      where p.id = project_id
        and p.owner_id = (select auth.uid())
        and p.deleted_at is null
    )
  );

-- Storage policies intentionally join on generated object_path rather than trusting a path prefix.
create policy ann_project_assets_storage_select
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ann-project-assets'
    and exists (
      select 1
      from public.ann_project_assets a
      where a.object_path = name
        and a.owner_id = (select auth.uid())
        and a.deleted_at is null
    )
  );

create policy ann_project_assets_storage_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ann-project-assets'
    and exists (
      select 1
      from public.ann_project_assets a
      where a.object_path = name
        and a.owner_id = (select auth.uid())
        and a.deleted_at is null
    )
  );

create policy ann_project_assets_storage_update
  on storage.objects
  for update to authenticated
  using (
    bucket_id = 'ann-project-assets'
    and exists (
      select 1
      from public.ann_project_assets a
      where a.object_path = name
        and a.owner_id = (select auth.uid())
        and a.deleted_at is null
    )
  )
  with check (
    bucket_id = 'ann-project-assets'
    and exists (
      select 1
      from public.ann_project_assets a
      where a.object_path = name
        and a.owner_id = (select auth.uid())
        and a.deleted_at is null
    )
  );

create policy ann_project_assets_storage_delete
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ann-project-assets'
    and exists (
      select 1
      from public.ann_project_assets a
      where a.object_path = name
        and a.owner_id = (select auth.uid())
        and a.deleted_at is null
    )
  );

commit;
