import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  createFixture,
  localUrl,
  requireFixture,
  safetyChecks,
} from "./fixture.mjs";
const adminTarget = process.env.SOCIAL_TEST_DATABASE_URL;
localUrl(adminTarget);
safetyChecks(adminTarget);
const fixture = createFixture(adminTarget);
const target = fixture.url;
process.env.SOCIAL_TEST_DATABASE_URL = target;
requireFixture(target);
try {
  function sql(input) {
    const r = spawnSync(
      "psql",
      [target, "-X", "-v", "ON_ERROR_STOP=1", "-At"],
      {
        input,
        encoding: "utf8",
      },
    );
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
    if (r.status !== 0) throw Error("SQL failed");
    if (/not ok|Looks like you failed/.test(r.stdout)) {
      throw Error("pgTAP assertions failed");
    }
  }
  sql(
    `select version(); drop schema if exists social_private cascade; drop schema if exists iam_private cascade; create extension if not exists pgtap; create schema if not exists auth; create schema if not exists iam_private;
do $$ begin if not exists(select from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin; end if; if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select from pg_roles where rolname='gmaiden_iam_runtime') then create role gmaiden_iam_runtime; end if; end $$;
create table if not exists auth.users(id uuid primary key,raw_app_meta_data jsonb default '{"provider":"google"}');
create table if not exists auth.sessions(id uuid primary key,user_id uuid not null references auth.users on delete cascade);
create table if not exists public.profiles(id uuid primary key references auth.users on delete cascade,gid_code text unique not null,display_name text,role text default 'user',email text,phone text,steamid64 text);
truncate auth.users cascade;`,
  );
  for (
    const foundation of [
      "20260823221844_cr034_iam_phase1_foundation.sql",
      "20260824024920_cr034_iam_phase2_sessions.sql",
    ]
  ) sql(readFileSync("supabase/migrations/" + foundation, "utf8"));
  const migration =
    "supabase/migrations/20261101090000_cr038_party_friends.sql";
  if (existsSync(migration)) {
    console.log("Applying " + migration);
    sql(readFileSync(migration, "utf8"));
  }
  sql(readFileSync("supabase/tests/cr038_party_friends.sql", "utf8"));
  if (existsSync("tools/social-tests/concurrency.mjs")) {
    const r = spawnSync(
      process.execPath,
      ["tools/social-tests/concurrency.mjs"],
      { env: process.env, stdio: "inherit" },
    );
    if (r.status !== 0) throw Error("Concurrency suite failed");
  }
  const integration = spawnSync("deno", [
    "run",
    "--no-lock",
    "--node-modules-dir=none",
    "--allow-env",
    "--allow-net=127.0.0.1,localhost",
    "tools/social-tests/integration.ts",
  ], { env: process.env, stdio: "inherit" });
  if (integration.status !== 0) throw Error("HTTP integration failed");
  if (process.argv.includes("--native-boundary")) {
    const native = spawnSync("cargo", [
      "test",
      "--manifest-path",
      "src-tauri/g-party/Cargo.toml",
      "--locked",
      "production_native_social_boundary_uses_real_relay_broker_and_database",
      "--",
      "--ignored",
      "--nocapture",
    ], { env: process.env, stdio: "inherit" });
    if (native.status !== 0) {
      throw Error("Native/relay/broker/database boundary failed");
    }
  }
  console.log("PASS CR-038 SQL, concurrency and real HTTP/repository suites");
} finally {
  if (process.argv.includes("--keep-fixture")) {
    const safe = new URL(target);
    safe.password = "";
    console.log("Retained marked fixture: " + safe.href);
    console.log("Fixture database: " + fixture.name);
  } else fixture.cleanup();
}
