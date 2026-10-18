export type SecuritySessionScope = "current" | "others";
export type ProviderSignOutScope = "local" | "others";

type SignOutPhase = "idle" | "cleaning" | "failed" | "done";
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

// Shared by every auth hook so an unmount cannot lose a cleanup failure.
export async function signOutCurrent(
  revokeRemote: () => Promise<void>,
  cleanupLocal: () => Promise<void>,
) {
  if (currentSignOut.phase === "cleaning") return;
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
