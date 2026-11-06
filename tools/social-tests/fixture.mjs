import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
export function localUrl(value) {
  if (!value) throw Error("SOCIAL_TEST_DATABASE_URL admin connection required");
  const u = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) || u.search ||
    u.hash
  ) {
    throw Error(
      "Only direct loopback PostgreSQL URLs without query overrides accepted",
    );
  }
  return u;
}
export function sqlAt(url, input) {
  const r = spawnSync("psql", [url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input,
    encoding: "utf8",
  });
  if (r.status !== 0) throw Error(r.stderr || "SQL failed");
  return r.stdout.trim();
}
export function createFixture(adminUrl) {
  const u = localUrl(adminUrl);
  const name = `cr038_social_test_${process.pid}_${
    randomBytes(6).toString("hex")
  }`;
  sqlAt(u.href, `create database "${name}" template template0;`);
  const child = new URL(u);
  child.pathname = "/" + name;
  try {
    sqlAt(
      child.href,
      `create schema cr038_fixture;revoke all on schema cr038_fixture from public;create table cr038_fixture.guard(name text primary key);insert into cr038_fixture.guard values('${name}');`,
    );
  } catch (e) {
    sqlAt(u.href, `drop database "${name}" with(force);`);
    throw e;
  }
  return {
    url: child.href,
    name,
    cleanup() {
      sqlAt(
        u.href,
        `drop database "${name}" with(force);drop role if exists "${name}_runtime";`,
      );
    },
  };
}
export function requireFixture(url) {
  const u = localUrl(url);
  const name = decodeURIComponent(u.pathname.slice(1));
  if (!/^cr038_social_test_[0-9]+_[0-9a-f]{12}$/.test(name)) {
    throw Error("Refusing unowned fixture database");
  }
  if (sqlAt(u.href, "select name from cr038_fixture.guard;") !== name) {
    throw Error("Fixture ownership marker mismatch");
  }
  return u;
}
export function safetyChecks(adminUrl) {
  for (
    const bad of [
      "postgresql://postgres@db.example.test/postgres",
      "postgresql://postgres@127.0.0.1/postgres?host=db.example.test",
    ]
  ) {
    let rejected = false;
    try {
      localUrl(bad);
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error("remote override accepted");
  }
  let rejected = false;
  try {
    requireFixture(adminUrl);
  } catch {
    rejected = true;
  }
  if (!rejected) throw Error("unmarked caller database accepted as fixture");
  const sentinel = createFixture(adminUrl);
  let child;
  try {
    sqlAt(
      sentinel.url,
      "create schema unrelated_application;create table unrelated_application.important_data(value text);insert into unrelated_application.important_data values('keep me');create schema auth;create table auth.users(value text);insert into auth.users values('real dev account');",
    );
    child = createFixture(sentinel.url);
    requireFixture(child.url);
    sqlAt(
      child.url,
      "create schema auth;create table auth.users(value text);truncate auth.users cascade;drop schema auth cascade;",
    );
    if (
      sqlAt(
        sentinel.url,
        "select value from unrelated_application.important_data union all select value from auth.users order by value;",
      ) !== "keep me\nreal dev account"
    ) throw Error("caller data changed");
    console.log(
      "PASS fixture guard rejects remote/unmarked databases and preserves pre-existing caller schema/data",
    );
  } finally {
    child?.cleanup();
    sentinel.cleanup();
  }
}
