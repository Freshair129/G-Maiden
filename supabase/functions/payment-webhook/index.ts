// Doc: CR-003 §2.5 payment-webhook — Omise calls this, not a user, so there
// is no JWT to check. Authenticity comes from re-fetching the charge from
// Omise's own API with the secret key (CR-003 §2.5 / §5.3 EF-03) — the
// posted payload is only ever used to find WHICH charge to re-fetch.
//
// `webhook_events` is inserted FIRST; its PK (provider, event_id) is the
// idempotency guard (CR-003 §2.2/§2.5) — a conflicting insert means this
// event was already recorded, so we just return 200 without reprocessing.
// We always return 200 once the event is durably recorded, because Omise
// retries on any non-2xx response (CR-003 §5.3 EF-04/EF-05).
//
// SANDBOX ONLY (CR-003 §7): see webhook.ts for the specific assumptions
// about the webhook payload shape and Omise charge status enum — none of
// this is verified against a live Omise/Opn account.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decideOrderOutcome, OMISE_PROVIDER, parseWebhookEvent } from "./webhook.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const OMISE_API_BASE = "https://api.omise.co";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const omiseSecretKey = Deno.env.get("OMISE_SECRET_KEY");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Nothing durable we can record from an unparseable body. Ack with 200
    // so Omise doesn't retry dead traffic forever; a real delivery bug will
    // still be visible in Omise's own dashboard/logs.
    return json(200, { ok: false, reason: "invalid JSON body" });
  }

  const parsed = parseWebhookEvent(body);
  if (!parsed.ok) {
    // Can't identify the charge — nothing to safely act on. Ack anyway.
    return json(200, { ok: false, reason: parsed.error });
  }
  const { event_id, charge_id } = parsed.event;

  // Privileged writes only — this endpoint has no user auth.
  const admin = createClient(url, service);

  // Idempotency guard FIRST (CR-003 §2.5): PK (provider, event_id).
  const { error: insErr } = await admin
    .from("webhook_events")
    .insert({ provider: OMISE_PROVIDER, event_id, payload: body });
  if (insErr) {
    // Postgres unique_violation = duplicate delivery, already durable — ack.
    if (insErr.code === "23505") {
      return json(200, { ok: true, note: "duplicate event, already recorded" });
    }
    // Any other insert failure means this event ISN'T durably recorded yet.
    // Return non-200 so Omise retries (CR-003 §5.3 EF-04/EF-05).
    return json(500, { error: insErr.message });
  }

  if (!omiseSecretKey) {
    // Event is durably recorded; we just can't act on it yet. Non-200 so
    // Omise retries once the secret is configured.
    return json(500, { error: "OMISE_SECRET_KEY not configured" });
  }

  // Re-fetch the charge from Omise directly — never trust the webhook body
  // for the actual payment status (CR-003 §2.5, §5.3 EF-03).
  const omiseAuth = "Basic " + btoa(`${omiseSecretKey}:`);
  let chargeRes: Response;
  try {
    chargeRes = await fetch(`${OMISE_API_BASE}/charges/${charge_id}`, {
      headers: { Authorization: omiseAuth },
    });
  } catch (e) {
    // Event already durable; failure to re-fetch just means we can't act
    // yet. Non-200 so Omise retries and we get another chance.
    return json(502, { error: `failed to reach Omise: ${String((e as Error)?.message ?? e)}` });
  }
  if (!chargeRes.ok) {
    return json(502, { error: "failed to re-fetch charge from Omise" });
  }
  const charge = await chargeRes.json() as { id: string; status: string };
  const outcome = decideOrderOutcome(charge.status);

  if (outcome === "paid" || outcome === "failed" || outcome === "expired") {
    const { data: orderRow, error: orderErr } = await admin
      .from("topup_orders")
      .select("id, status")
      .eq("provider_charge_id", charge_id)
      .maybeSingle();
    if (orderErr) return json(500, { error: orderErr.message });

    if (!orderRow) {
      // Event recorded durably above; no matching order to act on (e.g. a
      // charge created outside this flow). Ack — nothing more to do safely.
      return json(200, { ok: false, reason: "no matching topup_orders row" });
    }

    if (outcome === "paid") {
      // credit_topup() is itself idempotent (status guard: only
      // 'pending' -> 'paid'), so a duplicate call here is safe even if a
      // second delivery of a *different* event_id raced this one.
      const { error: rpcErr } = await admin.rpc("credit_topup", { p_order_id: orderRow.id });
      if (rpcErr) return json(500, { error: rpcErr.message });
    } else if (orderRow.status === "pending") {
      // Don't clobber an order that's already settled another way.
      const { error: updErr } = await admin
        .from("topup_orders")
        .update({ status: outcome, updated_at: new Date().toISOString() })
        .eq("id", orderRow.id);
      if (updErr) return json(500, { error: updErr.message });
    }
  }

  // Best-effort: mark the webhook_events row processed. Event is already
  // durable via the insert above, so a failure here doesn't need to fail
  // the whole response.
  await admin
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", OMISE_PROVIDER)
    .eq("event_id", event_id);

  return json(200, { ok: true });
});
