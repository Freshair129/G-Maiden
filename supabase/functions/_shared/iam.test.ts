import { assertEquals } from "jsr:@std/assert@1";
import {
  type IamDependencies,
  type IamRole,
  resolveIamContext,
  sanitizeAuditContext,
} from "./iam.ts";
import { adminCapabilityForAction } from "./gmad_admin.ts";

function bearer(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  return `Bearer ${encode({ alg: "RS256", typ: "JWT" })}.${
    encode(payload)
  }.signature`;
}

function dependencies(
  overrides: Partial<IamDependencies> = {},
): IamDependencies {
  return {
    verifyUser: () =>
      Promise.resolve({
        id: "00000000-0000-0000-0000-000000000001",
        app_metadata: { provider: "google", providers: ["google"] },
      }),
    sessionExists: () => Promise.resolve(true),
    loadRole: () => Promise.resolve("admin" as IamRole),
    ...overrides,
  };
}

const validBearer = bearer({
  sub: "00000000-0000-0000-0000-000000000001",
  session_id: "10000000-0000-0000-0000-000000000001",
  aal: "aal2",
});

Deno.test("IAM rejects a missing or malformed bearer before dependency calls", async () => {
  let called = false;
  const deps = dependencies({
    verifyUser: () => {
      called = true;
      return Promise.resolve(null);
    },
  });

  assertEquals(await resolveIamContext("", "gmad.batch.manage", true, deps), {
    ok: false,
    status: 401,
    code: "invalid_session",
  });
  assertEquals(
    await resolveIamContext("Bearer broken", "gmad.batch.manage", true, deps),
    {
      ok: false,
      status: 401,
      code: "invalid_session",
    },
  );
  assertEquals(called, false);
});

Deno.test("IAM accepts only a verified Google identity whose subject matches the JWT", async () => {
  const emailOnly = dependencies({
    verifyUser: () =>
      Promise.resolve({
        id: "00000000-0000-0000-0000-000000000001",
        app_metadata: { provider: "email", providers: ["email"] },
      }),
  });
  assertEquals(
    await resolveIamContext(validBearer, "gmad.batch.manage", true, emailOnly),
    {
      ok: false,
      status: 401,
      code: "invalid_session",
    },
  );

  const wrongSubject = dependencies({
    verifyUser: () =>
      Promise.resolve({
        id: "00000000-0000-0000-0000-000000000099",
        app_metadata: { provider: "google", providers: ["google"] },
      }),
  });
  assertEquals(
    await resolveIamContext(
      validBearer,
      "gmad.batch.manage",
      true,
      wrongSubject,
    ),
    {
      ok: false,
      status: 401,
      code: "invalid_session",
    },
  );
});

Deno.test("IAM rejects a JWT without a live matching session", async () => {
  const missingSessionClaim = bearer({
    sub: "00000000-0000-0000-0000-000000000001",
    aal: "aal2",
  });
  assertEquals(
    await resolveIamContext(
      missingSessionClaim,
      "gmad.batch.manage",
      true,
      dependencies(),
    ),
    {
      ok: false,
      status: 401,
      code: "invalid_session",
    },
  );

  assertEquals(
    await resolveIamContext(
      validBearer,
      "gmad.batch.manage",
      true,
      dependencies({ sessionExists: () => Promise.resolve(false) }),
    ),
    {
      ok: false,
      status: 401,
      code: "invalid_session",
    },
  );
});

Deno.test("IAM requires AAL2 before loading role for a privileged capability", async () => {
  let roleLoaded = false;
  const aal1 = bearer({
    sub: "00000000-0000-0000-0000-000000000001",
    session_id: "10000000-0000-0000-0000-000000000001",
    aal: "aal1",
  });
  const deps = dependencies({
    loadRole: () => {
      roleLoaded = true;
      return Promise.resolve("owner");
    },
  });

  assertEquals(await resolveIamContext(aal1, "gmad.batch.manage", true, deps), {
    ok: false,
    status: 403,
    code: "step_up_required",
  });
  assertEquals(roleLoaded, false);
});

Deno.test("IAM own security reads accept AAL1 while session actions remain capability-gated", async () => {
  const aal1 = bearer({
    sub: "00000000-0000-0000-0000-000000000001",
    session_id: "10000000-0000-0000-0000-000000000001",
    aal: "aal1",
  });
  assertEquals(
    await resolveIamContext(aal1, "iam.security.read", false, dependencies({ loadRole: () => Promise.resolve("user") })),
    {
      ok: true,
      context: {
        userId: "00000000-0000-0000-0000-000000000001",
        sessionId: "10000000-0000-0000-0000-000000000001",
        aal: "aal1",
        role: "user",
      },
    },
  );
  assertEquals(
    await resolveIamContext(aal1, "iam.session.revoke", true, dependencies({ loadRole: () => Promise.resolve("user") })),
    { ok: false, status: 403, code: "step_up_required" },
  );
});

Deno.test("IAM capabilities derive from the server role and ignore metadata role claims", async () => {
  const metadataOwner = dependencies({
    verifyUser: () =>
      Promise.resolve({
        id: "00000000-0000-0000-0000-000000000001",
        app_metadata: {
          provider: "google",
          providers: ["google"],
          role: "owner",
        },
      }),
    loadRole: () => Promise.resolve("user"),
  });
  assertEquals(
    await resolveIamContext(
      validBearer,
      "iam.role.delegate",
      true,
      metadataOwner,
    ),
    {
      ok: false,
      status: 403,
      code: "capability_denied",
    },
  );

  const owner = dependencies({ loadRole: () => Promise.resolve("owner") });
  assertEquals(
    await resolveIamContext(validBearer, "iam.role.delegate", true, owner),
    {
      ok: true,
      context: {
        userId: "00000000-0000-0000-0000-000000000001",
        sessionId: "10000000-0000-0000-0000-000000000001",
        aal: "aal2",
        role: "owner",
      },
    },
  );
});

Deno.test("IAM dependency failures fail closed without provider details", async () => {
  assertEquals(
    await resolveIamContext(
      validBearer,
      "gmad.batch.manage",
      true,
      dependencies({
        sessionExists: () =>
          Promise.reject(new Error("database password leaked here")),
      }),
    ),
    {
      ok: false,
      status: 503,
      code: "security_dependency_unavailable",
    },
  );
});

Deno.test("IAM audit context keeps only allow-listed non-secret values", () => {
  assertEquals(
    sanitizeAuditContext({
      action: "change_role",
      target_gid: "G-F234567",
      result: "denied",
      token: "secret",
      email: "private@example.com",
      phone: "+66123456789",
      nested: { refresh_token: "secret" },
    }),
    {
      action: "change_role",
      target_gid: "G-F234567",
      result: "denied",
    },
  );
});

Deno.test("IAM emits a redacted authorization decision when the caller is known", async () => {
  const events: unknown[] = [];
  const deps = dependencies({
    loadRole: () => Promise.resolve("user"),
    recordDecision: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  });

  await resolveIamContext(validBearer, "iam.role.delegate", true, deps);
  assertEquals(events, [{
    userId: "00000000-0000-0000-0000-000000000001",
    sessionId: "10000000-0000-0000-0000-000000000001",
    aal: "aal2",
    role: "user",
    capability: "iam.role.delegate",
    outcome: "denied",
    reasonCode: "capability_denied",
  }]);
});

Deno.test("GMAD admin actions map to the narrow server capability", () => {
  assertEquals(adminCapabilityForAction("change_role"), "iam.role.delegate");
  for (const action of ["list", "create_draft", "publish", "set_status"]) {
    assertEquals(adminCapabilityForAction(action), "gmad.batch.manage");
  }
  assertEquals(adminCapabilityForAction("unknown"), null);
  assertEquals(adminCapabilityForAction(null), null);
});
