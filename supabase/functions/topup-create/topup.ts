// Doc: CR-003 §2.5 topup-create — pure decision/shape logic, separated from
// index.ts (IO/handler) so it is unit-testable without mocking Supabase or
// the Omise API. Mirrors the mint-gid/mint.ts split (ADR-14 convention).

export type Provider = "promptpay" | "truemoney";

interface RawInput {
  package_id?: unknown;
  provider?: unknown;
}

export type ValidatedInput =
  | { ok: true; package_id: string; provider: Provider }
  | { ok: false; error: string };

/** Validate + narrow the untyped request body. Pure. */
export function validateInput(body: unknown): ValidatedInput {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid body" };
  }
  const b = body as RawInput;
  if (typeof b.package_id !== "string" || b.package_id.length === 0) {
    return { ok: false, error: "package_id is required" };
  }
  if (b.provider !== "promptpay" && b.provider !== "truemoney") {
    return { ok: false, error: "provider must be 'promptpay' or 'truemoney'" };
  }
  return { ok: true, package_id: b.package_id, provider: b.provider };
}

// CR-003 §5.3 EF-07: ">5 pending orders/hour/user -> 429". Read literally:
// a user is blocked once they ALREADY have more than 5 pending orders in
// the trailing hour (i.e. the 7th create attempt while 6 are still pending
// is rejected). Adjust here (and only here) if product wants a stricter
// "no more than 5 total" reading instead.
export const PENDING_ORDER_LIMIT_PER_HOUR = 5;

/** Pure rate-limit decision given a pre-fetched pending-order count. */
export function isRateLimited(pendingCountLastHour: number): boolean {
  return pendingCountLastHour > PENDING_ORDER_LIMIT_PER_HOUR;
}

export interface CoinPackageRow {
  id: string;
  coins: number;
  bonus_coins: number;
  price_satang: number;
  active: boolean;
}

export interface OmiseChargeRequest {
  amount: number;
  currency: "thb";
  source: { type: Provider } & Record<string, unknown>;
  return_uri?: string;
}

/**
 * Build the Omise charge-creation payload for a package + provider.
 *
 * ASSUMPTION — sandbox-only, MUST be verified against Omise/Opn's live API
 * docs before this goes to production (CR-003 §7 lists Omise live mode as
 * an explicit unresolved risk):
 *   - Endpoint: `POST https://api.omise.co/charges`
 *   - Auth: HTTP Basic, secret key as username, empty password
 *   - Body: `amount` (satang), `currency: "thb"`, `source[type]` =
 *     "promptpay" | "truemoney"
 *   - TrueMoney may require additional `source` fields (redirect/return
 *     URI, or customer contact info) not modeled here — Omise rebranded
 *     to "Opn Payments" and the exact current field names/shape for a
 *     TrueMoney Wallet source are NOT confirmed in this implementation.
 */
export function buildOmiseChargeRequest(
  pkg: CoinPackageRow,
  provider: Provider,
  returnUri?: string,
): OmiseChargeRequest {
  const req: OmiseChargeRequest = {
    amount: pkg.price_satang,
    currency: "thb",
    source: { type: provider },
  };
  if (provider === "truemoney" && returnUri) {
    req.return_uri = returnUri;
  }
  return req;
}

export interface OmiseChargeResponse {
  id: string;
  status?: string;
  expires_at?: string | null;
  source?: {
    type?: string;
    scannable_code?: { image?: { download_uri?: string } };
  };
  authorize_uri?: string | null;
}

export interface TopupPresentation {
  qr_image_uri: string | null;
  authorize_uri: string | null;
  expires_at: string | null;
}

// CR-003 §3.2: "อายุ ~15 นาที" — used only as a fallback if Omise's charge
// response doesn't carry its own `expires_at` for a promptpay source.
const DEFAULT_PROMPTPAY_TTL_MS = 15 * 60 * 1000;

/**
 * Extract the provider-facing payload from an already-parsed Omise charge
 * response. Pure — the caller does the actual fetch.
 *
 * ASSUMPTION (verify before production): promptpay QR image URI lives at
 * `charge.source.scannable_code.image.download_uri` and TrueMoney's
 * redirect lives at `charge.authorize_uri` — this matches Omise's
 * generally documented charge shape but is NOT confirmed against a live
 * sandbox response in this change.
 */
export function presentCharge(
  charge: OmiseChargeResponse,
  provider: Provider,
  now: Date = new Date(),
): TopupPresentation {
  const expires_at = charge.expires_at ??
    (provider === "promptpay"
      ? new Date(now.getTime() + DEFAULT_PROMPTPAY_TTL_MS).toISOString()
      : null);
  return {
    qr_image_uri: provider === "promptpay"
      ? charge.source?.scannable_code?.image?.download_uri ?? null
      : null,
    authorize_uri: provider === "truemoney" ? charge.authorize_uri ?? null : null,
    expires_at,
  };
}

export interface TopupOrderInsert {
  user_id: string;
  package_id: string;
  coins: number;
  price_satang: number;
  provider: Provider;
  provider_charge_id: string;
  status: "pending";
  qr_image_uri: string | null;
  authorize_uri: string | null;
  expires_at: string | null;
}

/**
 * Build the `topup_orders` insert row (CR-003 §2.2 schema). Pure — no DB call.
 *
 * `coins` is the snapshot the RPC `credit_topup` later adds verbatim to
 * `wallet_balance` (see CR-003 §2.4), so it must be the TOTAL the user
 * receives — package `coins` + `bonus_coins` — not just the base amount.
 */
export function buildOrderInsert(
  userId: string,
  pkg: CoinPackageRow,
  provider: Provider,
  charge: OmiseChargeResponse,
  presentation: TopupPresentation,
): TopupOrderInsert {
  return {
    user_id: userId,
    package_id: pkg.id,
    coins: pkg.coins + pkg.bonus_coins,
    price_satang: pkg.price_satang,
    provider,
    provider_charge_id: charge.id,
    status: "pending",
    qr_image_uri: presentation.qr_image_uri,
    authorize_uri: presentation.authorize_uri,
    expires_at: presentation.expires_at,
  };
}
