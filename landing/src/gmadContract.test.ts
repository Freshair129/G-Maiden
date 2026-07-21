import { describe, expect, it } from "vitest";
import { canInvokeAuthenticatedQueue, canRequestDownload, normaliseQueueState } from "./gmadContract";

describe("GMAD landing contract", () => {
  it("never treats a typed GID as entitlement evidence", () => {
    expect(canRequestDownload({ signedIn: true, serverState: "available", termsAccepted: true, ageConfirmed: true })).toBe(true);
    expect(canRequestDownload({ signedIn: false, serverState: "available", termsAccepted: true, ageConfirmed: true })).toBe(false);
  });

  it("requires explicit Terms and age confirmations independently of optional consent", () => {
    expect(canRequestDownload({ signedIn: true, serverState: "available", termsAccepted: false, ageConfirmed: true })).toBe(false);
    expect(canRequestDownload({ signedIn: true, serverState: "available", termsAccepted: true, ageConfirmed: false })).toBe(false);
  });

  it("fails unknown server states closed", () => {
    expect(normaliseQueueState("available")).toBe("available");
    expect(normaliseQueueState("attacker-controlled")).toBe("error");
  });

  it("does not call the protected queue endpoint without a session access token", () => {
    expect(canInvokeAuthenticatedQueue(undefined)).toBe(false);
    expect(canInvokeAuthenticatedQueue("")).toBe(false);
    expect(canInvokeAuthenticatedQueue("issuer-access-token")).toBe(true);
  });
});
