import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentSignOut, localAuthBlocked, prepareGoogleSignIn, signOutCurrent, subscribeCurrentSignOut } from "../securitySession";

describe("signOutCurrent", () => {
  beforeEach(() => { prepareGoogleSignIn(); });

  it("revokes account access and clears local credentials without locking the local runtime", async () => {
    const order: string[] = [];
    const revokeRemote = vi.fn(async () => { order.push("revoke"); });
    const cleanupLocal = vi.fn(async () => { order.push("cleanup"); });

    await signOutCurrent(revokeRemote, cleanupLocal);

    expect(order).toEqual(["revoke", "cleanup"]);
    expect(getCurrentSignOut()).toEqual({ phase: "done", error: null, warning: null });
    expect(localAuthBlocked()).toBe(true);
  });

  it("still clears local credentials when server revocation is unavailable", async () => {
    const cleanupLocal = vi.fn(async () => undefined);

    await signOutCurrent(async () => { throw new Error("offline"); }, cleanupLocal);

    expect(cleanupLocal).toHaveBeenCalledOnce();
    expect(getCurrentSignOut()).toEqual({
      phase: "done",
      error: null,
      warning: "ออกจากระบบในเครื่องแล้ว แต่ยังยืนยันการยกเลิก session บนเซิร์ฟเวอร์ไม่ได้",
    });
  });

  it("ignores concurrent sign-out while cleaning and publishes done only once", async () => {
    let finishCleanup!: () => void;
    const pendingCleanup = new Promise<void>((resolve) => { finishCleanup = resolve; });
    const revokeRemote = vi.fn(async () => undefined);
    const cleanupLocal = vi.fn(() => pendingCleanup);
    const phases: string[] = [];
    const unsubscribe = subscribeCurrentSignOut(() => { phases.push(getCurrentSignOut().phase); });
    try {
      const first = signOutCurrent(revokeRemote, cleanupLocal);
      expect(getCurrentSignOut().phase).toBe("cleaning");
      await vi.waitFor(() => expect(cleanupLocal).toHaveBeenCalledOnce());
      expect(getCurrentSignOut().phase).toBe("cleaning");

      await signOutCurrent(revokeRemote, cleanupLocal);
      expect(revokeRemote).toHaveBeenCalledOnce();
      expect(cleanupLocal).toHaveBeenCalledOnce();
      expect(phases).toEqual(["cleaning"]);

      finishCleanup();
      await first;
      expect(phases).toEqual(["cleaning", "done"]);
      expect(getCurrentSignOut()).toEqual({ phase: "done", error: null, warning: null });
    } finally {
      finishCleanup();
      unsubscribe();
    }
  });

  it("blocks Google sign-in during cleaning and failure, then clears the warning after done", async () => {
    let rejectCleanup!: (error: Error) => void;
    const cleanup = new Promise<void>((_resolve, reject) => { rejectCleanup = reject; });
    const signingOut = signOutCurrent(async () => undefined, () => cleanup);
    expect(getCurrentSignOut().phase).toBe("cleaning");
    expect(prepareGoogleSignIn()).toBe(false);
    expect(localAuthBlocked()).toBe(true);

    rejectCleanup(new Error("synthetic-cleanup-failure"));
    await signingOut;
    expect(getCurrentSignOut().phase).toBe("failed");
    expect(prepareGoogleSignIn()).toBe(false);
    expect(localAuthBlocked()).toBe(true);

    await signOutCurrent(async () => { throw new Error("synthetic-offline"); }, async () => undefined);
    expect(getCurrentSignOut().phase).toBe("done");
    expect(getCurrentSignOut().warning).not.toBeNull();
    expect(localAuthBlocked()).toBe(true);
    expect(prepareGoogleSignIn()).toBe(true);
    expect(getCurrentSignOut()).toEqual({ phase: "idle", error: null, warning: null });
    expect(localAuthBlocked()).toBe(false);
  });

  it("retries failed local cleanup and keeps auth blocked until explicit Google sign-in", async () => {
    const cleanupLocal = vi.fn()
      .mockRejectedValueOnce(new Error("synthetic-cleanup-failure"))
      .mockResolvedValueOnce(undefined);
    const revokeRemote = vi.fn(async () => undefined);

    await signOutCurrent(revokeRemote, cleanupLocal);
    expect(getCurrentSignOut().phase).toBe("failed");
    expect(getCurrentSignOut().error).not.toBeNull();
    expect(localAuthBlocked()).toBe(true);

    const retry = signOutCurrent(revokeRemote, cleanupLocal);
    expect(getCurrentSignOut().phase).toBe("cleaning");
    expect(localAuthBlocked()).toBe(true);
    await retry;
    expect(cleanupLocal).toHaveBeenCalledTimes(2);
    expect(getCurrentSignOut()).toEqual({ phase: "done", error: null, warning: null });
    expect(localAuthBlocked()).toBe(true);

    expect(prepareGoogleSignIn()).toBe(true);
    expect(localAuthBlocked()).toBe(false);
  });
});
