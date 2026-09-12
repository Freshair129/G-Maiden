import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "./auth";
import { getCurrentSignOut } from "./securitySession";
import { decideFirstRunScreen, isBackgroundEntitlementRefresh, type EntitlementState, type FirstRunScreen } from "./gmadFirstRun";
import type { ReleaseChannel } from "./updateChannel";

export const GmadEntitlementContext = createContext<ReturnType<typeof useGmadDesktopEntitlement> | null>(null);

export type GmadDesktopState = FirstRunScreen;
export type GmadDecision = {
  state: EntitlementState;
  gid?: string;
  checked_at?: string;
  update_channel?: ReleaseChannel;
  terms?: { document_id?: string; version?: string; effective_at?: string };
  // Audit B1/B2: true when the Rust backend served this decision from its
  // grace-window cache after a RE-verify's network call failed, rather than
  // a server just confirming it. The runtime stays armed either way — this
  // is purely so the UI can say so honestly (Design Principle 3) instead of
  // silently presenting a stale grant as a fresh one.
  stale?: boolean;
};

export function useGmadDesktopEntitlement() {
  const { session, user, loading, busy, error: authError, lastAuthEvent, signOutPhase, signOutWarning, signInWithGoogle, signOut: authSignOut } = useAuth();
  const [state, setState] = useState<GmadDesktopState>("loading");
  const [decision, setDecision] = useState<GmadDecision | null>(null);
  // Keep routine token rotation quiet only while the last result is eligible.
  const everEligible = useRef(false);
  const requestGeneration = useRef(0);
  const verifiedUser = useRef<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const refresh = useCallback(async (opts: { background?: boolean } = {}) => {
    const generation = ++requestGeneration.current;
    const current = () => generation === requestGeneration.current && getCurrentSignOut().phase === "idle";
    setRuntimeError(null);
    if (signOutPhase !== "idle") {
      verifiedUser.current = null;
      everEligible.current = false;
      setDecision(null);
      setState(signOutPhase === "done" ? "sign_in_required" : signOutPhase === "failed" ? "sign_out_required" : "signing_out");
      return;
    }
    if (!user || !session) {
      verifiedUser.current = null;
      everEligible.current = false;
      setState(busy ? "signing_in" : "sign_in_required");
      setDecision(null);
      try { await invoke("lock_gmad_runtime"); }
      catch { if (current()) setRuntimeError("ยังยืนยันการล็อก runtime ไม่ได้ กรุณาลองอีกครั้ง"); }
      return;
    }
    if (!opts.background) {
      everEligible.current = false;
      setState("loading");
      setDecision(null);
    }
    try {
      // A new account must never inherit a previous account's grace cache.
      if (verifiedUser.current !== user.id) {
        await invoke("lock_gmad_runtime");
        if (!current()) return;
        verifiedUser.current = user.id;
      }
      if (!current()) return;
      const data = await invoke<GmadDecision>("verify_gmad_entitlement", { accessToken: session.access_token });
      if (!current()) return;
      const next = decideFirstRunScreen({ authLoading: false, authBusy: false, userPresent: true, entitlement: data, requestFailed: false });
      setDecision(data);
      setState(next);
      everEligible.current = next === "eligible";
    } catch {
      if (!current()) return;
      everEligible.current = false;
      setDecision(null);
      setState("offline_or_unavailable");
      // A command rejection and an IPC transport failure share this path.
      try { await invoke("lock_gmad_runtime"); }
      catch { if (current()) setRuntimeError("ยังยืนยันการล็อก runtime ไม่ได้ กรุณาลองอีกครั้ง"); }
    }
  }, [busy, session, user, signOutPhase]);

  useEffect(() => {
    if (loading) return;
    const backgroundOnly = isBackgroundEntitlementRefresh(lastAuthEvent, everEligible.current);
    void refresh({ background: backgroundOnly });
    return () => { requestGeneration.current += 1; };
    // lastAuthEvent is intentionally in the deps: a token refresh must
    // re-trigger this effect (to send the freshly-rotated access_token on
    // the next verify) even though `session`'s identity change alone already
    // does that via `refresh`'s own dependency array — the event is what lets
    // this effect tell that refresh apart from a real sign-in/out.
  }, [loading, refresh, lastAuthEvent]);

  const signOut = useCallback(async () => {
    everEligible.current = false;
    requestGeneration.current += 1;
    await authSignOut();
  }, [authSignOut]);
  return { state, decision, refresh, signInWithGoogle, signOut, authError: runtimeError ?? authError, signOutWarning };
}
