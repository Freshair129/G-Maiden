# CR-038 real social transaction tests

Use a local PostgreSQL administrator connection. The runner rejects missing
URLs, non-loopback hosts and connection query overrides. It creates a uniquely
named `cr038_social_test_*` child database and a matching ownership marker, then
performs all schema resets and truncations only inside that child. The caller
database and its pre-existing schema/data are untouched; a real sentinel
regression verifies this. The child database and its unique restricted LOGIN are
dropped in `finally` by default. It never contacts the hosted gstore project. PostgreSQL 16 with pgTAP, Node 22+ and
Deno 2.7 are required. Production deployment and real Google OAuth acceptance
are separate operator checks.

For Debian/Ubuntu, install `postgresql-16 postgresql-16-pgtap`. As a non-root user,
create a disposable trust-authenticated local cluster and run:

```sh
initdb -D /tmp/cr038-pg -A trust -U postgres
pg_ctl -D /tmp/cr038-pg -o '-h 127.0.0.1 -p 55438' -w start
export SOCIAL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/postgres
timeout 180 node tools/social-tests/run.mjs
pg_ctl -D /tmp/cr038-pg -m fast -w stop
```

This runner creates minimal Supabase-compatible `auth.users`, `auth.sessions`
and `public.profiles` fixture tables with the relevant real column contracts,
then applies the real IAM foundation/session migrations and the new social
migration. It reports PostgreSQL version and migration, fails on SQL errors or
pgTAP `not ok`, executes separate PostgreSQL connections with explicit lock
barriers, and finally launches the actual Edge handlers through a local HTTP
server with the real `socialRepository` adapter. The integration uses a separate
restricted LOGIN that inherits only `gmaiden_iam_runtime`; synthetic verified
Google sessions supply the authorization fixture. There are no service-role
credentials. The fixture is not a full Supabase Auth server or live OAuth test.

The SQL tests execute social operations under `SET ROLE gmaiden_iam_runtime`.
Admin fixture connections only seed/reset data and observe locks. Races wait for
`pg_blocking_pids`, not assumed sleep durations. Connections have 15-second
failure deadlines. The runner currently contains 68 pgTAP assertions, 29 race
assertions and twenty real HTTP/repository assertions. Counts can grow with added
regressions; inspect the emitted TAP/PASS lines for the exact run.

The HTTP subprocess uses `deno run --no-lock --node-modules-dir=none --allow-env
--allow-net=127.0.0.1,localhost tools/social-tests/integration.ts`. Deno downloads
pinned dependencies on first execution, with system TLS validation unchanged.
`--no-lock` avoids refreshing unrelated root npm workspace lock entries.
Every subprocess verifies the child database name and ownership marker before
any destructive fixture operation. The administrator needs CREATE DATABASE and
CREATE ROLE privileges for this isolated test cluster.

To require the portable native → relay → real broker → database boundary as
well, install the locked Rust toolchain/dependencies and run:

```sh
timeout 900 node tools/social-tests/run.mjs --native-boundary
```

This runs the explicitly selected ignored-by-default Rust boundary test inside
the same owned child database lifecycle. A missing tool, missing fixture or
failed native boundary exits nonzero and still cleans up the child. CI must use
this option; the ordinary 180-second command remains the SQL/Deno-only entry.

Run unit and IAM regression tests independently:

```sh
timeout 120 deno test --no-lock --node-modules-dir=none --allow-env \
  supabase/functions/_shared/social.test.ts \
  supabase/functions/_shared/social_crypto.test.ts \
  supabase/functions/_shared/iam.test.ts \
  supabase/functions/_shared/iam_security.test.ts
```

For joint native/relay tests, run `node tools/social-tests/run.mjs --keep-fixture`
to retain a marked child after successful tests. The runner prints its name and
password-free URL. Set `SOCIAL_TEST_DATABASE_URL` to that child URL, then launch
the test-only persistent HTTP fixture:

```sh
SOCIAL_BOUNDARY_RELAY_ORIGIN=http://127.0.0.1:RELAY_PORT \
  deno run --no-lock --node-modules-dir=none --allow-env \
  --allow-net=127.0.0.1,localhost tools/social-tests/integration.ts --serve
```

Its first stdout line is JSON with `brokerUrl`, `redeemUrl` and `inviteUrl`.
`challengeUrl` accepts POST `{}` and returns a friend-targeted challenge;
`acceptUrl` accepts POST `{proof}`, preserves the real broker denial status, and
returns a consented targeted ticket on success. Native tests obtain the proof
from the actual relay through the native client. Alternatively, POST
`{roomId,ownerId,generation}` to `inviteUrl` to create a targeted ticket using
the real account handlers and repository. The fixed fixture key is 32 zero
bytes, represented by 64 zero hexadecimal digits. The injected loopback origin
is test-only; production configuration parsing rejects loopback and requires a
canonical HTTPS origin. Do not run multiple fixtures against the same retained child concurrently. Stop
it after the native test, then drop that exact retained child database and its
`<database_name>_runtime` role through the administrator connection. Interrupted
runs may leave marked child databases; remove only their printed unique names. No real user/relay credentials enter
this fixture.

Operator-only `social_private.cleanup()` removes at most 1,000 expired rows per
expiry table and at most 1,000 expired limiter rows per call. Schedule it at least
daily and repeat until zero. `social_private.revoke_relay(text)` atomically
removes outstanding invites (cascading tickets), challenges and bindings for a
registered origin. Neither function is granted to the runtime. Disable social
admission before invoking revoke during key replacement, then change both keys,
verify configuration, and re-enable; changing the HMAC key alone does not revoke
opaque database tickets. Relationships are retained. See the canonical CR-038
operations runbook for deployment and rollback procedures.
