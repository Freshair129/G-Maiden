import { describe, expect, it } from "vitest";
import { resolveUpdateChannel } from "./updateChannel";

describe("resolveUpdateChannel", () => {
  it("uses a server-authoritative eligible channel", () => {
    expect(resolveUpdateChannel({ state: "eligible", update_channel: "closed-beta" })).toEqual({
      channel: "closed-beta",
      source: "account-entitlement",
    });
  });

  it("falls back to stable for unauthenticated and error states", () => {
    for (const state of [undefined, "terms_required", "no_active_entitlement", "offline_or_unavailable"]) {
      expect(resolveUpdateChannel({ state, update_channel: "dev" })).toEqual({
        channel: "stable",
        source: "stable-fallback",
      });
    }
  });

  it("rejects malformed or unknown channel values", () => {
    expect(resolveUpdateChannel({ state: "eligible", update_channel: "nightly" })).toEqual({
      channel: "stable",
      source: "stable-fallback",
    });
  });

  it("never infers a restricted channel when entitlement is absent", () => {
    expect(resolveUpdateChannel(null).channel).toBe("stable");
    expect(resolveUpdateChannel(undefined).channel).toBe("stable");
  });
});
