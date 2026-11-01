import {
  handleSocial,
  handleSocialRedeem,
  type SocialDependencies,
} from "./social.ts";
function assert(v: unknown) {
  if (!v) throw Error("assertion failed");
}
const deps: SocialDependencies = {
  authorize: async () => ({
    ok: true,
    context: { userId: "a", sessionId: "b", aal: "aal1", role: "user" },
  }),
  now: () => 1700000000000,
  config: null,
  repository: {
    action: async () => ({ ok: true }),
    redeem: async () => ({ error: "unavailable" }),
  },
};
function req(body: unknown) {
  return new Request("https://broker.test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
Deno.test("strict actions and missing configured relay fail closed", async () => {
  assert(
    (await handleSocial(req({ action: "heartbeat" }), deps)).status === 200,
  );
  assert(
    (await handleSocial(req({ action: "heartbeat", unexpected: true }), deps))
      .status === 400,
  );
  assert(
    (await handleSocial(
      req({
        action: "challenge",
        purpose: "link",
        recipientGid: null,
        bindingRevision: 0,
      }),
      deps,
    )).status === 503,
  );
  assert((await handleSocialRedeem(req({}), deps)).status === 503);
});
import { generateGid } from "./gid.ts";
import { resolveIamContext } from "./iam.ts";
import { hash, signProof, signRedeem } from "./social_crypto.ts";
const origin = "https://relay.example.test",
  key = "00".repeat(32),
  now = 1700000000000;
const gid = generateGid({
    generation: "P",
    registeredAt: Date.UTC(2026, 0, 1),
    cohortSeq: 1,
  }),
  id = "11111111-1111-4111-8111-111111111111";
Deno.test("every account mutation exact shape, unknown fields and consent", async () => {
  const bodies = [
    {
      action: "settings",
      presenceVisible: false,
      allowFriendRequests: true,
      allowInvites: true,
    },
    ...["request", "remove", "block", "unblock"].map((action) => ({
      action,
      gid,
    })),
    ...["request_accept", "request_decline", "request_cancel"].map(
      (action) => ({ action, requestId: id }),
    ),
    ...["invite_decline", "invite_revoke"].map((action) => ({
      action,
      inviteId: id,
    })),
    { action: "unlink" },
  ];
  for (const body of bodies) {
    const d = { ...deps, config: { origin, key } };
    assert((await handleSocial(req(body), d)).status === 200);
    assert(
      (await handleSocial(req({ ...body, unknown: 1 }), d)).status === 400,
    );
  }
  assert(
    (await handleSocial(
      req({ action: "invite_accept", inviteId: id, consent: false }),
      { ...deps, config: { origin, key } },
    )).status === 400,
  );
  assert(
    (await handleSocial(
      req({ action: "request", gid: gid.slice(0, -1) + "X" }),
      deps,
    )).status === 400,
  );
  assert(
    (await handleSocial(
      req({ action: "request_accept", requestId: "invalid" }),
      deps,
    )).status === 400,
  );
  assert(
    (await handleSocial(
      req({
        action: "challenge",
        purpose: "invite",
        recipientGid: null,
        bindingRevision: null,
      }),
      deps,
    )).status === 400,
  );
  assert(
    (await handleSocial(
      new Request("https://broker.test", {
        method: "POST",
        body: " ".repeat(8193),
      }),
      deps,
    )).status === 400,
  );
});
Deno.test("Google verification/live session required, explicit social.use permits AAL1 with no audit dependency", async () => {
  const token = "e30." +
    btoa(JSON.stringify({ sub: id, session_id: id, aal: "aal1" })) + ".fixture";
  let audits = 0;
  const base = {
    verifyUser: async () => ({ id, app_metadata: { provider: "google" } }),
    sessionExists: async () => true,
    loadRole: async () => "user" as const,
  };
  const accepted = await resolveIamContext(
    "Bearer " + token,
    "social.use",
    false,
    base,
  );
  assert(accepted.ok);
  assert(audits === 0);
  assert(
    !(await resolveIamContext("Bearer " + token, "social.use", false, {
      ...base,
      sessionExists: async () => false,
    })).ok,
  );
  assert(
    !(await resolveIamContext("Bearer " + token, "social.use", false, {
      ...base,
      verifyUser: async () => ({ id, app_metadata: { provider: "email" } }),
    })).ok,
  );
  const iam = await resolveIamContext(
    "Bearer " + token,
    "iam.security.read",
    true,
    {
      ...base,
      recordDecision: async () => {
        audits++;
      },
    },
  );
  assert(!iam.ok && iam.code === "step_up_required" && audits === 1);
});
Deno.test("proof verified before repository receives challenge hash; no second flow charge in body", async () => {
  let calls = 0;
  const payload = {
    v: 1,
    relayOrigin: origin,
    challenge: "11".repeat(32),
    roomId: "22".repeat(16),
    memberId: "33".repeat(16),
    ownerId: "33".repeat(16),
    generation: 1,
    memberIds: ["33".repeat(16)],
    issuedAtMs: now,
    expiresAtMs: now + 60000,
  };
  const proof = await signProof(payload, key);
  const d: SocialDependencies = {
    ...deps,
    config: { origin, key },
    repository: {
      ...deps.repository,
      action: async (_ctx, body, _origin, p, h) => {
        calls++;
        assert(
          body.action === "link" && p?.challenge === payload.challenge &&
            h === await hash(payload.challenge),
        );
        return { ok: true };
      },
    },
  };
  assert(
    (await handleSocial(
      req({ action: "link", proof, bindingRevision: 0, consent: true }),
      d,
    )).status === 200,
  );
  assert(calls === 1);
  assert(
    (await handleSocial(
      req({
        action: "link",
        proof: proof + "x",
        bindingRevision: 0,
        consent: true,
      }),
      d,
    )).status === 404,
  );
  assert(calls === 1);
});
Deno.test("challenge/ticket random secrets only appear in narrow DTO; repository receives SHA256 only", async () => {
  const seen: string[] = [];
  const d: SocialDependencies = {
    ...deps,
    config: { origin, key },
    repository: {
      ...deps.repository,
      action: async (_ctx, b, _o, _p, h) => {
        seen.push(h!);
        return b.action === "challenge" ? { expiresAtMs: now + 60000 } : {
          relayOrigin: origin,
          roomId: "2".repeat(32),
          expiresAtMs: now + 60000,
        };
      },
    },
  };
  const challenge = await (await handleSocial(
    req({
      action: "challenge",
      purpose: "link",
      recipientGid: null,
      bindingRevision: 0,
    }),
    d,
  )).json();
  assert(seen[0] === await hash(challenge.challenge));
  assert(challenge.relayOrigin === origin);
  const join = await (await handleSocial(
    req({ action: "invite_accept", inviteId: id, consent: true }),
    d,
  )).json();
  assert(seen[1] === await hash(join.ticket));
  assert(join.ticket !== challenge.challenge);
});
Deno.test("sanitized error envelopes, no-store and output allowlists reject leaked internal fields", async () => {
  for (
    const code of [
      "unavailable",
      "limit_reached",
      "conflict",
      "forbidden",
      "rate_limited",
    ]
  ) {
    const r = await handleSocial(req({ action: "heartbeat" }), {
      ...deps,
      repository: { ...deps.repository, action: async () => ({ error: code }) },
    });
    assert(r.headers.get("cache-control") === "no-store");
    assert((await r.json()).error === code);
  }
  const r = await handleSocial(req({ action: "heartbeat" }), {
    ...deps,
    repository: {
      ...deps.repository,
      action: async () => ({ ok: true, email: "private@test" }),
    },
  });
  assert(r.status === 503);
});
Deno.test("signed redemption strict raw body, nonce hash, timestamp and unknown fields", async () => {
  let calls = 0;
  const d: SocialDependencies = {
    ...deps,
    config: { origin, key },
    repository: {
      ...deps.repository,
      redeem: async (t, n, o) => {
        calls++;
        assert(
          t === await hash("1".repeat(64)) &&
            n === await hash("2".repeat(64)) && o === origin,
        );
        return {
          roomId: "3".repeat(32),
          ownerId: "4".repeat(32),
          generation: 1,
        };
      },
    },
  };
  const body = {
    ticket: "1".repeat(64),
    relayOrigin: origin,
    nonce: "2".repeat(64),
    issuedAtMs: now,
  };
  async function run(b: unknown, signature?: string) {
    const raw = JSON.stringify(b);
    return await handleSocialRedeem(
      new Request("https://broker.test", {
        method: "POST",
        headers: {
          "x-g-party-signature": signature ?? await signRedeem(raw, key),
        },
        body: raw,
      }),
      d,
    );
  }
  assert((await run(body)).status === 200);
  assert(calls === 1);
  assert((await run({ ...body, issuedAtMs: now - 60000 })).status === 404);
  assert((await run({ ...body, issuedAtMs: now + 5001 })).status === 404);
  assert((await run({ ...body, extra: true })).status === 400);
  assert(
    (await run({ ...body, relayOrigin: "https://evil.test" })).status === 400,
  );
  assert((await run(body, "0".repeat(64))).status === 403);
  assert(calls === 1);
});

Deno.test("redemption authenticates exact received bytes and rejects a prepended UTF8 BOM", async () => {
  let calls = 0;
  const d: SocialDependencies = {
    ...deps,
    config: { origin, key },
    repository: {
      ...deps.repository,
      redeem: async () => {
        calls++;
        return {
          roomId: "3".repeat(32),
          ownerId: "4".repeat(32),
          generation: 1,
        };
      },
    },
  };
  const raw = JSON.stringify({
    ticket: "1".repeat(64),
    relayOrigin: origin,
    nonce: "2".repeat(64),
    issuedAtMs: now,
  });
  const signature = await signRedeem(raw, key);
  const modified = await handleSocialRedeem(
    new Request("https://broker.test", {
      method: "POST",
      headers: { "x-g-party-signature": signature },
      body: "\ufeff" + raw,
    }),
    d,
  );
  assert(modified.status === 400 && calls === 0);
  const whitespace = await handleSocialRedeem(
    new Request("https://broker.test", {
      method: "POST",
      headers: { "x-g-party-signature": signature },
      body: " " + raw,
    }),
    d,
  );
  assert(whitespace.status === 403 && calls === 0);
  const unchanged = await handleSocialRedeem(
    new Request("https://broker.test", {
      method: "POST",
      headers: { "x-g-party-signature": signature },
      body: raw,
    }),
    d,
  );
  assert(unchanged.status === 200 && calls === 1);
});
