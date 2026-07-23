import { describe, expect, it } from "vitest";
import { decideFirstRunScreen } from "../gmadFirstRun";

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
