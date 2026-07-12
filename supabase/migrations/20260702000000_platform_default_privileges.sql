-- Platform bootstrap default privileges — established by Supabase automatically when the
-- `gstore` project was created (2026-07-02T11:00:17Z), before any user migration ever ran.
-- Reconstructed 2026-07-12 via read-only introspection (pg_default_acl) against the live
-- gstore project, with the user's explicit permission for that read.
--
-- Why this needs to be a migration at all: a fresh local `supabase start` creates the
-- `postgres`/`supabase_admin`/`anon`/`authenticated`/`service_role` roles via its own internal
-- roles.sql seed, but does NOT itself set up ALTER DEFAULT PRIVILEGES for objects created by
-- `postgres`/`supabase_admin` in the `public` schema — that is Supabase-platform bootstrap,
-- not part of the open-source CLI's local seed. Without this, every table created by this
-- repo's migrations (profiles, wallets, ...) has no SELECT/INSERT/UPDATE/DELETE grant for
-- `anon`/`authenticated` at all, and pgTAP tests (and the app itself) fail with
-- "permission denied for table X" — not a bug in any migration's own SQL, a missing baseline.
--
-- This does not grant anything CR-003's or SEC-001's own migrations don't already assume:
-- both files were written expecting this baseline to exist (SEC-001 REVOKEs from it; CR-003's
-- RLS policies are the actual access-control layer sitting on top of it), matching how every
-- Supabase project actually behaves in production.

begin;

grant usage on schema public to postgres, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete, truncate, references, trigger on tables
  to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select, usage, update on sequences to postgres, anon, authenticated, service_role;

-- The live project also has an equivalent `for role supabase_admin` set (pg_default_acl showed
-- both), but this repo's migrations only ever run as `postgres` (confirmed: this file's own
-- `for role postgres` statements above are what unblocked the permission-denied errors), and a
-- local non-superuser `postgres` role isn't a member of `supabase_admin` so it can't declare
-- default privileges on that role's behalf (`ERROR: permission denied to change default
-- privileges`, 2026-07-12). Since nothing in this repo's migration history creates objects as
-- supabase_admin, the `for role postgres` grants above are sufficient here.

commit;
