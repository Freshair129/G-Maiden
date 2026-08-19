export type EntitlementState = "eligible" | "terms_required" | "no_active_entitlement" | "account_not_eligible";
export type FirstRunScreen = "loading" | "sign_in_required" | "signing_in" | EntitlementState | "offline_or_unavailable";

export function decideFirstRunScreen(input: {
  authLoading: boolean;
  authBusy: boolean;
  userPresent: boolean;
  entitlement: { state: EntitlementState } | null;
  requestFailed: boolean;
}): FirstRunScreen {
  if (input.authLoading) return "loading";
  if (input.authBusy) return "signing_in";
  if (!input.userPresent) return "sign_in_required";
  if (input.requestFailed || !input.entitlement) return input.requestFailed ? "offline_or_unavailable" : "loading";
  return input.entitlement.state;
}

// Audit B1/B2: a Supabase access-token rotation (~hourly) mints a NEW session
// object with no real identity change, but the entitlement gate used to
// re-verify from scratch on every session change — including that one — and
// flipped state to "loading" (un-gating the deck) for the round trip, then to
// "offline_or_unavailable" (fully re-gating it) on any transient failure.
// These two predicates are the gate's actual decision, pulled out of
// `gmadEntitlement.ts`'s hook plumbing so they're unit-testable the same way
// `decideFirstRunScreen` above is — see that file's `refresh()`.

/** May THIS re-verify run silently, without moving `state` away from
 *  "eligible" while it's in flight? Only a routine token rotation on a
 *  session that has ALREADY been shown eligible once qualifies — a real
 *  sign-in, a real sign-out, the first check of the session, and an
 *  explicit user-initiated re-check must all still gate exactly as before. */
export function isBackgroundEntitlementRefresh(authEvent: string | null, everEligible: boolean): boolean {
  return authEvent === "TOKEN_REFRESHED" && everEligible;
}

/** Should a FAILED re-verify be surfaced as "offline_or_unavailable" (gating
 *  the whole app) — or swallowed, leaving `state`/`decision` untouched?
 *
 *  The Rust command already tried its own grace-window cache before ever
 *  returning an error (see `lib.rs::verify_gmad_entitlement`), so an error
 *  here means there was genuinely nothing to fall back to — UNLESS this was
 *  a background check on an already-eligible session, in which case the
 *  backend kept gameplay armed regardless, and re-gating the UI on top of
 *  that would just move the same bug up one layer. */
export function shouldSurfaceRefreshFailure(background: boolean, everEligible: boolean): boolean {
  return !(background && everEligible);
}
