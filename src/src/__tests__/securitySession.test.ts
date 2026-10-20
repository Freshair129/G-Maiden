import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentSignOut, localAuthBlocked, prepareGoogleSignIn, signOutCurrent } from "../securitySession";

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
});
