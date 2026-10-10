export type EntitlementState = "eligible" | "terms_required" | "no_active_entitlement" | "account_not_eligible";
export type FirstRunScreen = "loading" | "sign_in_required" | "signing_in" | EntitlementState | "offline_or_unavailable" | "signing_out" | "sign_out_required";

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
// This predicate decides whether the in-flight refresh can stay quiet, separate from
// `gmadEntitlement.ts`'s response handling, and is unit-testable the same way
// `decideFirstRunScreen` above is — see that file's `refresh()`.

/** May THIS re-verify run silently, without moving `state` away from
 *  "eligible" while it's in flight? Only a routine token rotation on a
 *  session that has ALREADY been shown eligible once qualifies — a real
 *  sign-in, a real sign-out, the first check of the session, and an
 *  explicit user-initiated re-check must all still gate exactly as before. */
export function isBackgroundEntitlementRefresh(authEvent: string | null, everEligible: boolean): boolean {
  return authEvent === "TOKEN_REFRESHED" && everEligible;
}
