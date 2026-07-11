// Doc: CR-003 §2.5 payment-webhook — tests for the pure logic in webhook.ts.
// Run: deno test supabase/functions/payment-webhook/webhook.test.ts
import { assertEquals } from "jsr:@std/assert";
import { decideOrderOutcome, OMISE_PROVIDER, parseWebhookEvent } from "./webhook.ts";

Deno.test("OMISE_PROVIDER is the fixed provider tag for webhook_events", () => {
  assertEquals(OMISE_PROVIDER, "omise");
});

Deno.test("parseWebhookEvent extracts event id + charge id from an event envelope", () => {
  const body = { id: "evnt_1", key: "charge.complete", data: { object: "charge", id: "chrg_1" } };
  const r = parseWebhookEvent(body);
  assertEquals(r, { ok: true, event: { event_id: "evnt_1", charge_id: "chrg_1" } });
});

Deno.test("parseWebhookEvent rejects a non-object body", () => {
  const r = parseWebhookEvent(null);
  assertEquals(r.ok, false);
});

Deno.test("parseWebhookEvent rejects a body missing the event id", () => {
  const r = parseWebhookEvent({ data: { id: "chrg_1" } });
  assertEquals(r.ok, false);
});

Deno.test("parseWebhookEvent rejects a body missing the charge id", () => {
  const r = parseWebhookEvent({ id: "evnt_1", data: {} });
  assertEquals(r.ok, false);
});

Deno.test("decideOrderOutcome maps successful -> paid", () => {
  assertEquals(decideOrderOutcome("successful"), "paid");
});

Deno.test("decideOrderOutcome maps failed and expired to themselves", () => {
  assertEquals(decideOrderOutcome("failed"), "failed");
  assertEquals(decideOrderOutcome("expired"), "expired");
});

Deno.test("decideOrderOutcome leaves pending/unknown statuses unresolved", () => {
  assertEquals(decideOrderOutcome("pending"), "unresolved");
  assertEquals(decideOrderOutcome("reversed"), "unresolved");
  assertEquals(decideOrderOutcome("something-new"), "unresolved");
});
