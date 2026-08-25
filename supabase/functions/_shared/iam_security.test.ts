import { assertEquals } from "jsr:@std/assert@1";
import {
  maskSessionReference,
  parseSecurityActivityCursor,
  parseSessionScope,
  projectDevice,
  projectSecurityEvent,
  providerSignOutScope,
  securityStateProjection,
} from "./iam_security.ts";

Deno.test("IAM session scope accepts only the documented current/others values", () => {
  assertEquals(parseSessionScope("current"), "current");
  assertEquals(parseSessionScope("others"), "others");
  assertEquals(parseSessionScope("global"), null);
  assertEquals(parseSessionScope({ scope: "current" }), null);
  assertEquals(providerSignOutScope("current"), "local");
  assertEquals(providerSignOutScope("others"), "others");
});

Deno.test("IAM activity cursors require both stable ordering fields", () => {
  assertEquals(parseSecurityActivityCursor(null, null), { ok: true, cursor: null });
  assertEquals(parseSecurityActivityCursor("2026-08-24T01:00:00Z", null), { ok: false });
  assertEquals(parseSecurityActivityCursor("not-a-date", "10000000-0000-0000-0000-000000000001"), { ok: false });
  assertEquals(parseSecurityActivityCursor("2026-08-24T01:00:00Z", "10000000-0000-0000-0000-000000000001"), {
    ok: true,
    cursor: {
      before: "2026-08-24T01:00:00.000Z",
      beforeId: "10000000-0000-0000-0000-000000000001",
    },
  });
});

Deno.test("IAM security projections redact identities, contacts and provider session ids", () => {
  assertEquals(maskSessionReference("10000000-0000-0000-0000-000000000001"), "10000000…0001");
  assertEquals(projectDevice({
    id: "device-1",
    provider_session_id: "10000000-0000-0000-0000-000000000001",
    user_label: "Work PC",
    platform: "windows",
    app_version: "0.13.2",
    first_seen_at: "2026-08-24T00:00:00.000Z",
    last_seen_at: "2026-08-24T01:00:00.000Z",
    revoked_at: null,
  }), {
    id: "device-1",
    label: "Work PC",
    platform: "windows",
    app_version: "0.13.2",
    first_seen_at: "2026-08-24T00:00:00.000Z",
    last_seen_at: "2026-08-24T01:00:00.000Z",
    revoked_at: null,
    source: "app_observed",
    session_ref: "10000000…0001",
  });
  assertEquals(projectSecurityEvent({
    id: "event-1",
    event_type: "session_signout",
    outcome: "success",
    source: "iam-session-action",
    session_id: "10000000-0000-0000-0000-000000000001",
    context: { scope: "current", email: "secret@example.com", token: "secret" },
    occurred_at: "2026-08-24T01:00:00.000Z",
  }), {
    id: "event-1",
    event_type: "session_signout",
    outcome: "success",
    source: "iam-session-action",
    session_ref: "10000000…0001",
    context: { scope: "current" },
    occurred_at: "2026-08-24T01:00:00.000Z",
  });
  assertEquals(projectSecurityEvent({
    id: "event-2",
    event_type: "session_signout",
    outcome: "success",
    source: "iam-session-action",
    session_id: null,
    context: ["not-an-object"],
    occurred_at: "2026-08-24T01:01:00.000Z",
  }).context, {});
});

Deno.test("IAM security state labels devices as informational and keeps factors provider-shaped", () => {
  assertEquals(securityStateProjection({
    sessionId: "10000000-0000-0000-0000-000000000001",
    aal: "aal1",
    factors: [{ factor_type: "totp", status: "verified" }],
    devices: [],
  }), {
    current_session: {
      session_ref: "10000000…0001",
      aal: "aal1",
      authoritative: true,
    },
    factors: [{ type: "totp", status: "verified" }],
    contacts: [],
    devices: [],
  });
});
