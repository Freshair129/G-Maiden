import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "./auth";
import { decideFirstRunScreen, isBackgroundEntitlementRefresh, shouldSurfaceRefreshFailure, type EntitlementState, type FirstRunScreen } from "./gmadFirstRun";
import type { ReleaseChannel } from "./updateChannel";

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
  const { session, user, loading, busy, error: authError, lastAuthEvent, signInWithGoogle, signOut: authSignOut } = useAuth();
  const [state, setState] = useState<GmadDesktopState>("loading");
  const [decision, setDecision] = useState<GmadDecision | null>(null);
  // Sticky once true: the deck has already been shown as eligible THIS
  // session. Gates a re-verify against un-gating the UI on a routine
  // background token refresh — see `refresh` below.
  const everEligible = useRef(false);

  const refresh = useCallback(async (opts: { background?: boolean } = {}) => {
    if (!user || !session) {
      everEligible.current = false;
      await invoke("lock_gmad_runtime").catch(() => {});
      setState(busy ? "signing_in" : "sign_in_required");
      setDecision(null);
      return;
    }
    // A background re-verify (routine token rotation, an already-eligible
    // session) must not blank the screen the player is looking at — only the
    // very first check, or a check the user explicitly asked for, gates.
    if (!opts.background) setState("loading");
    try {
      const data = await invoke<GmadDecision>("verify_gmad_entitlement", { accessToken: session.access_token });
      const next = decideFirstRunScreen({ authLoading: false, authBusy: false, userPresent: true, entitlement: data, requestFailed: false });
      setDecision(data);
      setState(next);
      if (next === "eligible") everEligible.current = true;
    } catch {
      // The Rust command already tried its own grace-window cache before
      // returning an error at all (see `lib.rs::verify_gmad_entitlement`) —
      // an Err here means EITHER there was nothing to fall back to (cold
      // start, or the grace window lapsed) OR this was a foreground check
      // the user is actively waiting on. Either way that's a real "can't
      // confirm your access" state and must gate.
      //
      // A BACKGROUND check failing on an already-eligible session, by
      // contrast, means the backend already kept gameplay armed via its
      // cache (or genuinely has nothing new to say) — un-gating the whole UI
      // for that would recreate exactly the bug this exists to fix, just
      // moved one layer up. Leave `state`/`decision` untouched and try again
      // on the next natural trigger.
      if (!shouldSurfaceRefreshFailure(opts.background ?? false, everEligible.current)) return;
      setDecision(null);
      setState("offline_or_unavailable");
    }
  }, [busy, session, user]);

  useEffect(() => {
    if (loading) return;
    const backgroundOnly = isBackgroundEntitlementRefresh(lastAuthEvent, everEligible.current);
    void refresh({ background: backgroundOnly });
    // lastAuthEvent is intentionally in the deps: a token refresh must
    // re-trigger this effect (to send the freshly-rotated access_token on
    // the next verify) even though `session`'s identity change alone already
    // does that via `refresh`'s own dependency array — the event is what lets
    // this effect tell that refresh apart from a real sign-in/out.
  }, [loading, refresh, lastAuthEvent]);

  const signOut = useCallback(async () => {
    everEligible.current = false;
    await authSignOut();
  }, [authSignOut]);
  return { state, decision, refresh, signInWithGoogle, signOut, authError };
}
