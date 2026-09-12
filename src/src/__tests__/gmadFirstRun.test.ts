import { describe, expect, it } from "vitest";
import { decideFirstRunScreen, isBackgroundEntitlementRefresh } from "../gmadFirstRun";

describe("decideFirstRunScreen", () => {
  it("requires Google sign-in before any dashboard access", () => {
    expect(decideFirstRunScreen({ authLoading: false, authBusy: false, userPresent: false, entitlement: null, requestFailed: false })).toBe("sign_in_required");
  });

  it("shows signing-in while the PKCE transaction is pending", () => {
    expect(decideFirstRunScreen({ authLoading: false, authBusy: true, userPresent: false, entitlement: null, requestFailed: false })).toBe("signing_in");
  });

  it("keeps first launch fail-closed when Supabase is unavailable", () => {
    expect(decideFirstRunScreen({ authLoading: false, authBusy: false, userPresent: true, entitlement: null, requestFailed: true })).toBe("offline_or_unavailable");
  });

  it.each(["terms_required", "no_active_entitlement", "account_not_eligible"] as const)("preserves blocked state %s", (state) => {
    expect(decideFirstRunScreen({ authLoading: false, authBusy: false, userPresent: true, entitlement: { state }, requestFailed: false })).toBe(state);
  });

  it("unlocks only an eligible server decision", () => {
    expect(decideFirstRunScreen({ authLoading: false, authBusy: false, userPresent: true, entitlement: { state: "eligible" }, requestFailed: false })).toBe("eligible");
  });
});

// Audit B1/B2: a Supabase access-token rotation (~hourly) used to be
// indistinguishable from a real sign-in/out, so the entitlement gate
// re-verified from scratch every time — un-gating the deck to a full-screen
// "checking access" loading state, and re-gating it entirely on any
// transient network failure, purely because a token silently rotated.
describe("isBackgroundEntitlementRefresh", () => {
  it("is background ONLY for a token refresh on an already-eligible session", () => {
    expect(isBackgroundEntitlementRefresh("TOKEN_REFRESHED", true)).toBe(true);
  });

  it("still gates a token refresh before the session was ever shown eligible", () => {
    // Covers a persisted session that Supabase refreshes before the FIRST
    // verify of this launch completes — the deck has never been shown yet,
    // so the normal loading -> eligible walk must still happen.
    expect(isBackgroundEntitlementRefresh("TOKEN_REFRESHED", false)).toBe(false);
  });

  it.each(["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "INITIAL_SESSION", null] as const)(
    "still gates a real identity event even on an already-eligible session (%s)",
    (event) => {
      expect(isBackgroundEntitlementRefresh(event, true)).toBe(false);
    }
  );
});
