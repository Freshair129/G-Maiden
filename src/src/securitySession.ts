export type SecuritySessionScope = "current" | "others";
export type ProviderSignOutScope = "local" | "others";

type SignOutPhase = "idle" | "locking" | "cleaning" | "failed" | "done";
type CurrentSignOutState = { phase: SignOutPhase; error: string | null; warning: string | null };
let currentSignOut: CurrentSignOutState = { phase: "idle", error: null, warning: null };
let authBlocked = false;
const listeners = new Set<() => void>();
export const getCurrentSignOut = () => currentSignOut;
export function subscribeCurrentSignOut(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(state: CurrentSignOutState) {
  currentSignOut = state;
  listeners.forEach((listener) => listener());
}
export function localAuthBlocked() {
  return authBlocked;
}
export function prepareGoogleSignIn(): boolean {
  if (!["idle", "done"].includes(currentSignOut.phase)) return false;
  authBlocked = false;
  publish({ phase: "idle", error: null, warning: null });
  return true;
}

// Shared by every auth hook so a gate unmount cannot lose a cleanup failure.
export async function signOutCurrent(
  lockRuntime: () => Promise<void>,
  revokeRemote: () => Promise<void>,
  cleanupLocal: () => Promise<void>,
) {
  if (["locking", "cleaning"].includes(currentSignOut.phase)) return;
  publish({ phase: "locking", error: null, warning: null });
  try {
    await lockRuntime();
  } catch {
    publish({ phase: authBlocked ? "failed" : "idle", error: "Runtime could not be locked; sign-out was stopped.", warning: null });
    return;
  }
  authBlocked = true;
  publish({ phase: "cleaning", error: null, warning: null });
  let remoteConfirmed = false;
  try { await revokeRemote(); remoteConfirmed = true; } catch { /* local cleanup must still run */ }
  try {
    await cleanupLocal();
    publish({ phase: "done", error: null, warning: remoteConfirmed ? null : "ออกจากระบบในเครื่องแล้ว แต่ยังยืนยันการยกเลิก session บนเซิร์ฟเวอร์ไม่ได้" });
  } catch {
    publish({ phase: "failed", error: "ล้างข้อมูลเข้าสู่ระบบในเครื่องไม่สำเร็จ กรุณาลองอีกครั้ง", warning: null });
  }
}

export type SignOutResult =
  | { ok: true; scope: SecuritySessionScope }
  | { ok: false; code: "runtime_lock_failed" | "provider_signout_failed" };

export async function signOutWithRuntimeLock(
  scope: SecuritySessionScope,
  lockRuntime: () => Promise<void>,
  signOut: (scope: ProviderSignOutScope) => Promise<{ error: unknown }>,
): Promise<SignOutResult> {
  if (scope === "current") {
    try {
      await lockRuntime();
    } catch {
      return { ok: false, code: "runtime_lock_failed" };
    }
  }
  try {
    const result = await signOut(scope === "current" ? "local" : "others");
    return result.error
      ? { ok: false, code: "provider_signout_failed" }
      : { ok: true, scope };
  } catch {
    return { ok: false, code: "provider_signout_failed" };
  }
}
