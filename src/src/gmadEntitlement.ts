import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "./auth";
import { decideFirstRunScreen, type EntitlementState, type FirstRunScreen } from "./gmadFirstRun";

export type GmadDesktopState = FirstRunScreen;
export type GmadDecision = { state: EntitlementState; gid?: string; checked_at?: string; terms?: { document_id?: string; version?: string; effective_at?: string } };

export function useGmadDesktopEntitlement() {
  const { session, user, loading, busy, error: authError, signInWithGoogle, signOut: authSignOut } = useAuth();
  const [state, setState] = useState<GmadDesktopState>("loading");
  const [decision, setDecision] = useState<GmadDecision | null>(null);
  const refresh = useCallback(async () => {
    if (!user || !session) {
      await invoke("lock_gmad_runtime").catch(() => {});
      setState(busy ? "signing_in" : "sign_in_required");
      setDecision(null);
      return;
    }
    setState("loading");
    try {
      const data = await invoke<GmadDecision>("verify_gmad_entitlement", { accessToken: session.access_token });
      const next = decideFirstRunScreen({ authLoading: false, authBusy: false, userPresent: true, entitlement: data, requestFailed: false });
      setDecision(data); setState(next);
    } catch {
      setDecision(null); setState("offline_or_unavailable");
    }
  }, [busy, session, user]);
  useEffect(() => { if (!loading) void refresh(); }, [loading, refresh]);
  const signOut = useCallback(async () => {
    await invoke("lock_gmad_runtime").catch(() => {});
    await authSignOut();
  }, [authSignOut]);
  return { state, decision, refresh, signInWithGoogle, signOut, authError };
}
