// Doc: CR-003 §2.5 payment-webhook — pure event-shape + status-mapping
// logic, separated from index.ts (IO/handler) so it is unit-testable
// without mocking Omise/DB/HTTP. Mirrors the mint-gid/mint.ts split.

export interface ParsedWebhookEvent {
  event_id: string;
  charge_id: string;
}

export type ParseResult =
  | { ok: true; event: ParsedWebhookEvent }
  | { ok: false; error: string };

/**
 * Parse the (untrusted) webhook body just enough to know WHICH charge to
 * re-fetch from Omise. This is NEVER used to decide payment success/failure
 * by itself — CR-003 §2.5 / §5.3 EF-03 requires re-fetching the charge from
 * Omise's own API with the secret key before trusting anything the webhook
 * body claims.
 *
 * ASSUMPTION — sandbox-only, MUST be verified before production (CR-003
 * §7): Omise/Opn webhooks are assumed to POST the Event object itself,
 * shaped `{ id: "evnt_...", key: "charge.complete", data: { object:
 * "charge", id: "chrg_...", ... } }`. The exact envelope (event id field
 * name, whether events can arrive batched, etc.) is NOT confirmed against
 * live Omise/Opn webhook docs in this implementation.
 */
export function parseWebhookEvent(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid body" };
  }
  const b = body as Record<string, unknown>;
  const event_id = b.id;
  const data = b.data as Record<string, unknown> | undefined;
  const charge_id = data?.id;
  if (typeof event_id !== "string" || event_id.length === 0) {
    return { ok: false, error: "missing event id" };
  }
  if (typeof charge_id !== "string" || charge_id.length === 0) {
    return { ok: false, error: "missing charge id in event data" };
  }
  return { ok: true, event: { event_id, charge_id } };
}

// `webhook_events.provider` value for this gateway (CR-003 §2.2 PK is
// `(provider, event_id)`).
export const OMISE_PROVIDER = "omise";

export type OrderOutcome = "paid" | "failed" | "expired" | "unresolved";

/**
 * Map a re-fetched Omise charge's authoritative status to our order
 * outcome. Pure — the caller already performed the network re-fetch.
 *
 * ASSUMPTION (verify before production): Omise charge `status` is
 * documented with values 'pending' | 'reversed' | 'successful' | 'failed'
 * | 'expired'. This mapping treats only 'successful' as payable and both
 * 'failed'/'expired' as terminal-negative; anything else (including
 * 'pending' and 'reversed') is left `unresolved` — CR-003 phase 1 has no
 * refund/reversal flow (see §7 "Refund dispute": manual admin adjust).
 */
export function decideOrderOutcome(chargeStatus: string): OrderOutcome {
  switch (chargeStatus) {
    case "successful":
      return "paid";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    default:
      return "unresolved";
  }
}
