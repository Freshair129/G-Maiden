import { describe, expect, it, vi } from "vitest";
import { signOutWithRuntimeLock } from "../securitySession";

describe("signOutWithRuntimeLock", () => {
  it("locks native runtime before terminating the current provider session", async () => {
    const order: string[] = [];
    const result = await signOutWithRuntimeLock(
      "current",
      async () => { order.push("lock"); },
      async (scope) => { order.push(`signout:${scope}`); return { error: null }; },
    );
    expect(result).toEqual({ ok: true, scope: "current" });
    expect(order).toEqual(["lock", "signout:local"]);
  });

  it("requires AAL2 upstream for others but never locks the local runtime", async () => {
    const lock = vi.fn(async () => undefined);
    const signOut = vi.fn(async (scope: "local" | "others") => ({ error: null, scope }));
    const result = await signOutWithRuntimeLock("others", lock, signOut);
    expect(result).toEqual({ ok: true, scope: "others" });
    expect(lock).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith("others");
  });

  it("fails closed when the native lock cannot be confirmed", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const result = await signOutWithRuntimeLock(
      "current",
      async () => { throw new Error("native unavailable"); },
      signOut,
    );
    expect(result).toEqual({ ok: false, code: "runtime_lock_failed" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("completes local sign-out when current-session revoke fails", async () => {
    const order: string[] = [];
    const result = await signOutWithRuntimeLock(
      "current",
      async () => { order.push("lock"); },
      async (scope) => {
        order.push(`signout:${scope}`);
        return { error: null, serverRevokeFailed: true };
      },
    );
    expect(result).toEqual({ ok: true, scope: "current", serverRevokeFailed: true });
    expect(order).toEqual(["lock", "signout:local"]);
  });

  it("fails closed when signing out other sessions cannot be revoked", async () => {
    const lock = vi.fn(async () => undefined);
    const signOut = vi.fn(async () => ({ error: new Error("security service unavailable") }));
    const result = await signOutWithRuntimeLock("others", lock, signOut);
    expect(result).toEqual({ ok: false, code: "provider_signout_failed" });
    expect(lock).not.toHaveBeenCalled();
  });
});
