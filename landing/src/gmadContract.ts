export type QueueState = "signed_out" | "not_registered" | "checking" | "waiting" | "available" | "paused" | "revoked" | "error";

export function canInvokeAuthenticatedQueue(accessToken: unknown): boolean {
  return typeof accessToken === "string" && accessToken.length > 0;
}

export function normaliseQueueState(value: unknown): QueueState {
  return value === "signed_out" || value === "not_registered" || value === "checking" || value === "waiting" || value === "available" ||
    value === "paused" || value === "revoked" ? value : "error";
}

export function canRequestDownload(input: { signedIn: boolean; serverState: QueueState; termsAccepted: boolean; ageConfirmed: boolean }): boolean {
  return input.signedIn && input.serverState === "available" && input.termsAccepted && input.ageConfirmed;
}
