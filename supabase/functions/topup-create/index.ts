// Doc: CR-003 §2.5 topup-create — user JWT -> reads the real package price
// server-side -> creates an Omise charge -> inserts a pending topup_orders
// row. Auth pattern (user-scoped client to identify caller + service-role
// client for privileged writes) mirrors mint-gid/index.ts.
//
// SANDBOX ONLY (CR-003 §7): the Omise charge-creation shape used below is
// built against Omise's generally documented REST API and is NOT verified
// against a live account. See topup.ts for the specific assumptions —
// confirm all of them before this is used with a real OMISE_SECRET_KEY.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildOmiseChargeRequest,
  buildOrderInsert,
  isRateLimited,
  presentCharge,
  validateInput,
  type CoinPackageRow,
  type OmiseChargeRequest,
  type OmiseChargeResponse,
} from "./topup.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const OMISE_API_BASE = "https://api.omise.co";

/**
 * ASSUMPTION (verify before production, CR-003 §7): Omise's REST API is
 * documented as accepting `application/x-www-form-urlencoded` with
 * bracketed keys for nested objects (e.g. `source[type]=promptpay`).
 * Confirm this encoding against Omise/Opn's live API docs — some of their
 * newer endpoints may prefer JSON instead.
 */
function chargeRequestToForm(req: OmiseChargeRequest): URLSearchParams {
  const form = new URLSearchParams();
  form.set("amount", String(req.amount));
  form.set("currency", req.currency);
  for (const [k, v] of Object.entries(req.source)) {
    form.set(`source[${k}]`, String(v));
  }
  if (req.return_uri) form.set("return_uri", req.return_uri);
  return form;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing authorization" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const omiseSecretKey = Deno.env.get("OMISE_SECRET_KEY");

  // Identify the caller from their JWT (user-scoped client).
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "invalid token" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  const parsed = validateInput(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const { package_id, provider } = parsed;

  if (!omiseSecretKey) return json(500, { error: "OMISE_SECRET_KEY not configured" });

  // Privileged read+write (service_role).
  const admin = createClient(url, service);

  // Price is read server-side ONLY (CR-003 D3) — client-supplied prices are
  // never trusted; `package_id` is the only thing we take from the client.
  const { data: pkg, error: pkgErr } = await admin
    .from("coin_packages")
    .select("id, coins, bonus_coins, price_satang, active")
    .eq("id", package_id)
    .maybeSingle();
  if (pkgErr) return json(500, { error: pkgErr.message });
  if (!pkg || !(pkg as CoinPackageRow).active) {
    return json(400, { error: "package not available" });
  }

  // CR-003 §5.3 EF-07: >5 pending orders/hour/user -> 429.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await admin
    .from("topup_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gte("created_at", oneHourAgo);
  if (countErr) return json(500, { error: countErr.message });
  if (isRateLimited(count ?? 0)) {
    return json(429, { error: "too many pending top-up orders — try again later" });
  }

  const chargeReq = buildOmiseChargeRequest(pkg as CoinPackageRow, provider);

  // Omise/Opn REST auth: HTTP Basic, secret key as username, empty password.
  const omiseAuth = "Basic " + btoa(`${omiseSecretKey}:`);
  let chargeRes: Response;
  try {
    chargeRes = await fetch(`${OMISE_API_BASE}/charges`, {
      method: "POST",
      headers: {
        Authorization: omiseAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: chargeRequestToForm(chargeReq),
    });
  } catch (e) {
    return json(502, { error: `failed to reach Omise: ${String((e as Error)?.message ?? e)}` });
  }
  if (!chargeRes.ok) {
    const detail = await chargeRes.text().catch(() => "");
    return json(502, { error: "Omise charge creation failed", detail });
  }
  const charge = await chargeRes.json() as OmiseChargeResponse;
  const presentation = presentCharge(charge, provider);

  const orderInsert = buildOrderInsert(user.id, pkg as CoinPackageRow, provider, charge, presentation);
  const { data: order, error: insErr } = await admin
    .from("topup_orders")
    .insert(orderInsert)
    .select("id")
    .single();
  if (insErr) return json(500, { error: insErr.message });

  return json(200, {
    order_id: order.id,
    qr_image_uri: presentation.qr_image_uri,
    authorize_uri: presentation.authorize_uri,
    expires_at: presentation.expires_at,
  });
});
