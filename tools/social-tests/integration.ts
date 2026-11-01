// Local disposable fixture only. Production handlers and repository are imported unchanged.
import { Client } from "jsr:@db/postgres@0.19.5";
import { socialRepository } from "../../supabase/functions/_shared/social_runtime.ts";
import {
  handleSocial,
  handleSocialRedeem,
  type SocialDependencies,
} from "../../supabase/functions/_shared/social.ts";
import { resolveIamContext } from "../../supabase/functions/_shared/iam.ts";
import {
  randomToken,
  signProof,
  signRedeem,
} from "../../supabase/functions/_shared/social_crypto.ts";
import { generateGid } from "../../supabase/functions/_shared/gid.ts";
const target = Deno.env.get("SOCIAL_TEST_DATABASE_URL");
if (!target) throw Error("Marked disposable fixture URL required");
const fixtureUrl = new URL(target),
  fixtureName = decodeURIComponent(fixtureUrl.pathname.slice(1));
if (
  !["postgres:", "postgresql:"].includes(fixtureUrl.protocol) ||
  !["127.0.0.1", "localhost", "[::1]"].includes(fixtureUrl.hostname) ||
  fixtureUrl.search || fixtureUrl.hash ||
  !/^cr038_social_test_[0-9]+_[0-9a-f]{12}$/.test(fixtureName)
) throw Error("Refusing unowned fixture database");
const admin = new Client(target);
await admin.connect();
if (
  (await admin.queryObject<{ name: string }>(
    "select name from cr038_fixture.guard",
  )).rows[0]?.name !== fixtureName
) throw Error("Fixture ownership marker mismatch");
const runtimeName = fixtureName + "_runtime";
await admin.queryArray(
  `do $$ begin if not exists(select from pg_roles where rolname='${runtimeName}') then create role "${runtimeName}" login; end if; end $$;grant gmaiden_iam_runtime to "${runtimeName}";truncate auth.users cascade;truncate social_private.rate_limits,social_private.redeem_nonces;create table if not exists iam_private.security_events(id uuid primary key default gen_random_uuid());`,
);
const users = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ],
  sessions = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ];
const gids = users.map((_, i) =>
  generateGid({
    generation: "P",
    registeredAt: Date.UTC(2026, 0, 1),
    cohortSeq: i + 1,
  })
);
for (let i = 0; i < 2; i++) {
  await admin.queryArray("insert into auth.users(id) values($1)", [users[i]]);
  await admin.queryArray(
    "insert into auth.sessions(id,user_id) values($1,$2)",
    [sessions[i], users[i]],
  );
  await admin.queryArray(
    "insert into public.profiles(id,gid_code,display_name) values($1,$2,$3)",
    [users[i], gids[i], `Player ${i + 1}`],
  );
}
const runtimeUrl = new URL(target);
runtimeUrl.username = runtimeName;
runtimeUrl.password = "";
Deno.env.set("IAM_DATABASE_URL", runtimeUrl.href);
const restricted = new Client(runtimeUrl.href);
await restricted.connect();
const key = "00".repeat(32),
  origin = Deno.env.get("SOCIAL_BOUNDARY_RELAY_ORIGIN") ??
    "https://relay.example.test";
const token = (i: number) =>
  "e30." +
  btoa(
    JSON.stringify({ sub: users[i], session_id: sessions[i], aal: "aal1" }),
  ) + ".fixture";
const deps: SocialDependencies = {
  config: { origin, key },
  now: Date.now,
  repository: socialRepository(),
  authorize: (header) =>
    resolveIamContext(header, "social.use", false, {
      verifyUser: async (accessToken) => {
        const n = [token(0), token(1)].indexOf(accessToken);
        return n < 0
          ? null
          : { id: users[n], app_metadata: { provider: "google" } };
      },
      sessionExists: async (u, s) =>
        (await restricted.queryObject<{ active: boolean }>(
          "select iam_private.session_is_active($1,$2) active",
          [u, s],
        )).rows[0].active,
      loadRole: async () => "user",
    }),
};
function assert(v: unknown, message: string) {
  if (!v) throw Error(message);
  console.log("PASS " + message);
}
let base = "";
async function api(i: number, body: unknown) {
  const r = await fetch(base + "/social", {
    method: "POST",
    headers: { authorization: "Bearer " + token(i) },
    body: JSON.stringify(body),
  });
  const value = await r.json();
  if (!r.ok) throw Error(`HTTP ${r.status}: ${JSON.stringify(value)}`);
  return value;
}
async function challenge() {
  await api(0, { action: "request", gid: gids[1] });
  const state = await api(1, { action: "state" });
  if (state.requests.length) {
    await api(1, { action: "request_accept", requestId: state.requests[0].id });
  }
  return await api(0, {
    action: "challenge",
    purpose: "invite",
    recipientGid: gids[1],
    bindingRevision: null,
  });
}
async function mint(roomId: string, ownerId: string, generation: number) {
  const minted = await challenge();
  const now = Date.now();
  const payload = {
    v: 1,
    relayOrigin: origin,
    challenge: minted.challenge,
    roomId,
    memberId: ownerId,
    ownerId,
    generation,
    memberIds: [ownerId],
    issuedAtMs: now,
    expiresAtMs: now + 60000,
  };
  if (!Deno.args.includes("--serve")) {
    for (
      const [invalid, label] of [[
        await signProof(payload, "01".repeat(32)),
        "wrong signing key",
      ], [
        await signProof({
          ...payload,
          relayOrigin: "https://other.example.test",
        }, key),
        "wrong signed origin",
      ]]
    ) {
      const denied = await fetch(base + "/social", {
        method: "POST",
        headers: { authorization: "Bearer " + token(0) },
        body: JSON.stringify({ action: "invite", proof: invalid }),
      });
      assert(
        denied.status === 404,
        "real broker rejects " + label + " before challenge consumption",
      );
      await denied.body?.cancel();
    }
  }
  const proof = await signProof(payload, key);
  await api(0, { action: "invite", proof });
  return await accept();
}
async function accept() {
  const state = await api(1, { action: "state" });
  return await api(1, {
    action: "invite_accept",
    inviteId: state.invites[0].id,
    consent: true,
  });
}
const server = Deno.serve({
  hostname: "127.0.0.1",
  port: 0,
  onListen: () => {},
}, async (request) => {
  const path = new URL(request.url).pathname;
  if (path === "/social") return await handleSocial(request, deps);
  if (path === "/redeem") return await handleSocialRedeem(request, deps);
  if (path === "/fixture/challenge" && Deno.args.includes("--serve")) {
    return Response.json(await challenge());
  }
  if (path === "/fixture/accept" && Deno.args.includes("--serve")) {
    const { proof } = await request.json();
    const result = await handleSocial(
      new Request(base + "/social", {
        method: "POST",
        headers: { authorization: "Bearer " + token(0) },
        body: JSON.stringify({ action: "invite", proof }),
      }),
      deps,
    );
    if (!result.ok) return result;
    await result.body?.cancel();
    return Response.json(await accept());
  }
  if (path === "/fixture/invite" && Deno.args.includes("--serve")) {
    try {
      const p = await request.json();
      return Response.json(await mint(p.roomId, p.ownerId, p.generation));
    } catch {
      return Response.json({ error: "fixture_failed" }, { status: 500 });
    }
  }
  return new Response(null, { status: 404 });
});
base = `http://127.0.0.1:${server.addr.port}`;
if (Deno.args.includes("--serve")) {
  console.log(
    JSON.stringify({
      brokerUrl: base,
      redeemUrl: base + "/redeem",
      inviteUrl: base + "/fixture/invite",
      challengeUrl: base + "/fixture/challenge",
      acceptUrl: base + "/fixture/accept",
    }),
  );
  await server.finished;
} else {
  try {
    const before = (await admin.queryObject<{ n: string }>(
      "select count(*)::text n from iam_private.security_events",
    )).rows[0].n;
    await api(0, {
      action: "settings",
      presenceVisible: true,
      allowFriendRequests: true,
      allowInvites: true,
    });
    await api(0, { action: "heartbeat" });
    const state = await api(0, { action: "state" });
    assert(
      state.self.gid === gids[0] &&
        Object.keys(state.self).join(",") === "gid,displayName",
      "real HTTP actor→restricted repository→bounded DTO",
    );
    const after = (await admin.queryObject<{ n: string }>(
      "select count(*)::text n from iam_private.security_events",
    )).rows[0].n;
    assert(
      before === after,
      "state and heartbeat insert no IAM security audit",
    );
    const ecmaWhitespace =
      "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
    const nameCases: Array<[string | null, string, string]> = [
      ["\u00a0Alice\u00a0", "Alice", "NBSP trim"],
      [
        ecmaWhitespace + "Alice" + ecmaWhitespace,
        "Alice",
        "ECMAScript whitespace trim",
      ],
      [ecmaWhitespace, gids[0], "empty after Unicode trim fallback"],
      ["", gids[0], "empty name fallback"],
      ["A\u0085lice", gids[0], "C1 control fallback"],
      ["\u0001Alice", gids[0], "C0 control fallback"],
      ["😀".repeat(32), "😀".repeat(32), "32 valid non-BMP scalars"],
      ["😀".repeat(33), gids[0], "33 scalars fallback"],
      [null, gids[0], "null name fallback"],
    ];
    for (const [name, expected, label] of nameCases) {
      await admin.queryArray(
        "update public.profiles set display_name=$1 where id=$2",
        [name, users[0]],
      );
      const projected = await api(0, { action: "state" });
      assert(
        projected.self.displayName === expected,
        "real SQL→broker Unicode name: " + label,
      );
    }
    await admin.queryArray(
      "update public.profiles set display_name=$1 where id=$2",
      ["\u00a0Peer😀\u00a0", users[1]],
    );
    const join = await mint("2".repeat(32), "3".repeat(32), 1);
    const related = await api(0, { action: "state" });
    assert(
      related.friends[0].displayName === "Peer😀" &&
        related.invites[0].person.displayName === "Peer😀",
      "related Unicode friend and invite remain available",
    );
    const nonce = randomToken();
    const raw = JSON.stringify({
      ticket: join.ticket,
      relayOrigin: origin,
      nonce,
      issuedAtMs: Date.now(),
    });
    async function redeem(body: string) {
      return await fetch(base + "/redeem", {
        method: "POST",
        headers: { "x-g-party-signature": await signRedeem(body, key) },
        body,
      });
    }
    let r = await redeem(raw);
    assert(
      r.status === 200 && (await r.json()).roomId === "2".repeat(32),
      "signed HTTP redemption consumes real SQL ticket",
    );
    r = await redeem(raw);
    assert(r.status === 404, "HTTP nonce replay denied");
    await r.body?.cancel();
    const again = JSON.stringify({
      ticket: join.ticket,
      relayOrigin: origin,
      nonce: randomToken(),
      issuedAtMs: Date.now(),
    });
    r = await redeem(again);
    assert(r.status === 404, "HTTP ticket replay denied with fresh nonce");
    await r.body?.cancel();
    assert(
      (await admin.queryObject<{ n: string }>(
        "select count(*)::text n from social_private.join_tickets",
      )).rows[0].n === "0",
      "one-use ticket deleted in repository",
    );
    await api(0, { action: "block", gid: gids[1] });
    const blockedState = await api(0, { action: "state" });
    assert(
      blockedState.blocked[0].displayName === "Peer😀",
      "blocked Unicode person cannot poison state",
    );
    await admin.queryArray("delete from auth.sessions where id=$1", [
      sessions[0],
    ]);
    r = await fetch(base + "/social", {
      method: "POST",
      headers: { authorization: "Bearer " + token(0) },
      body: '{"action":"state"}',
    });
    assert(
      r.status === 401,
      "revoked provider session denied at HTTP boundary",
    );
    await r.body?.cancel();
    console.log("PASS real HTTP/repository integration");
  } finally {
    await server.shutdown();
    await restricted.end();
    await admin.end();
  }
  Deno.exit(0);
}
