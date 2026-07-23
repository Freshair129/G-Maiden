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
