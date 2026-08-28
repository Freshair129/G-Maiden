export type SecuritySessionScope = "current" | "others";
export type ProviderSignOutScope = "local" | "others";

export type SignOutResult =
  | { ok: true; scope: SecuritySessionScope; serverRevokeFailed?: boolean }
  | { ok: false; code: "runtime_lock_failed" | "provider_signout_failed" };

type ProviderSignOutResult = { error: unknown; serverRevokeFailed?: boolean };

export async function signOutWithRuntimeLock(
  scope: SecuritySessionScope,
  lockRuntime: () => Promise<void>,
  signOut: (scope: ProviderSignOutScope) => Promise<ProviderSignOutResult>,
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
      : { ok: true, scope, ...(result.serverRevokeFailed ? { serverRevokeFailed: true } : {}) };
  } catch {
    return { ok: false, code: "provider_signout_failed" };
  }
}
