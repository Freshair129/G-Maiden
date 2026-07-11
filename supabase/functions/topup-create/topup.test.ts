// Doc: CR-003 §2.5 topup-create — tests for the pure logic in topup.ts.
// Run: deno test supabase/functions/topup-create/topup.test.ts
import { assertEquals } from "jsr:@std/assert";
import {
  buildOmiseChargeRequest,
  buildOrderInsert,
  isRateLimited,
  PENDING_ORDER_LIMIT_PER_HOUR,
  presentCharge,
  validateInput,
} from "./topup.ts";

Deno.test("validateInput accepts a well-formed body", () => {
  const r = validateInput({ package_id: "coins_m", provider: "promptpay" });
  assertEquals(r, { ok: true, package_id: "coins_m", provider: "promptpay" });
});

Deno.test("validateInput rejects missing package_id", () => {
  const r = validateInput({ provider: "promptpay" });
  assertEquals(r.ok, false);
});

Deno.test("validateInput rejects an unknown provider", () => {
  const r = validateInput({ package_id: "coins_m", provider: "bitcoin" });
  assertEquals(r.ok, false);
});

Deno.test("validateInput rejects a non-object body", () => {
  const r = validateInput("nope");
  assertEquals(r.ok, false);
});

Deno.test("isRateLimited is false at and below the limit", () => {
  assertEquals(isRateLimited(0), false);
  assertEquals(isRateLimited(PENDING_ORDER_LIMIT_PER_HOUR), false);
});

Deno.test("isRateLimited trips once strictly over the limit", () => {
  assertEquals(isRateLimited(PENDING_ORDER_LIMIT_PER_HOUR + 1), true);
});

const pkg = { id: "coins_m", coins: 1000, bonus_coins: 100, price_satang: 9900, active: true };

Deno.test("buildOmiseChargeRequest uses server-side price, not client input", () => {
  const req = buildOmiseChargeRequest(pkg, "promptpay");
  assertEquals(req.amount, 9900);
  assertEquals(req.currency, "thb");
  assertEquals(req.source, { type: "promptpay" });
});

Deno.test("buildOmiseChargeRequest attaches return_uri only for truemoney", () => {
  const promptpay = buildOmiseChargeRequest(pkg, "promptpay", "https://example.com/return");
  assertEquals(promptpay.return_uri, undefined);

  const truemoney = buildOmiseChargeRequest(pkg, "truemoney", "https://example.com/return");
  assertEquals(truemoney.return_uri, "https://example.com/return");
});

Deno.test("presentCharge extracts promptpay QR and falls back on expiry", () => {
  const now = new Date("2026-07-11T00:00:00Z");
  const charge = {
    id: "chrg_1",
    source: { scannable_code: { image: { download_uri: "https://qr.example/1.png" } } },
  };
  const p = presentCharge(charge, "promptpay", now);
  assertEquals(p.qr_image_uri, "https://qr.example/1.png");
  assertEquals(p.authorize_uri, null);
  assertEquals(p.expires_at, new Date(now.getTime() + 15 * 60 * 1000).toISOString());
});

Deno.test("presentCharge extracts truemoney authorize_uri and uses Omise expires_at when present", () => {
  const charge = { id: "chrg_2", authorize_uri: "https://truemoney.example/auth", expires_at: "2026-07-11T01:00:00Z" };
  const p = presentCharge(charge, "truemoney");
  assertEquals(p.authorize_uri, "https://truemoney.example/auth");
  assertEquals(p.qr_image_uri, null);
  assertEquals(p.expires_at, "2026-07-11T01:00:00Z");
});

Deno.test("buildOrderInsert snapshots coins as package coins + bonus_coins", () => {
  const charge = { id: "chrg_3" };
  const presentation = { qr_image_uri: "https://qr.example/3.png", authorize_uri: null, expires_at: "2026-07-11T00:15:00Z" };
  const row = buildOrderInsert("user-1", pkg, "promptpay", charge, presentation);
  assertEquals(row.coins, 1100);
  assertEquals(row.price_satang, 9900);
  assertEquals(row.status, "pending");
  assertEquals(row.provider_charge_id, "chrg_3");
});
