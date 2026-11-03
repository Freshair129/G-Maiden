// G-Maiden account (GID) auth — Google sign-in, additive (the deck works
// signed-out). Signing in loads/creates a Supabase auth user (= GID); on
// sign-in we upsert the `profiles` row and link the current Steam identity.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { supabase, cleanupLocalSession } from "./supabase";
import { loadIdentity } from "./live/identity";
import { oauthStateFromAuthorizationUrl } from "./oauthTransaction";
import { requestSessionAction } from "./securityApi";
import { getCurrentSignOut, subscribeCurrentSignOut, localAuthBlocked, prepareGoogleSignIn, signOutCurrent } from "./securitySession";

// Fixed loopback redirect served by the GSI axum server (/auth/callback). Must
// be in Supabase → Auth → URL Configuration → Redirect URLs.
const OAUTH_REDIRECT = "http://127.0.0.1:3000/auth/callback";

function msg(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e);
}

/** Link the stored Steam identity onto the GID's profile row (best-effort).
 *  The row + email are created server-side by the signup trigger, and identity
 *  columns are column-locked (SEC-001 §2 Phase B), so the client only updates
 *  the Steam link fields it is granted — never id/email/generation/gid_code. */
async function linkProfile(userId: string): Promise<void> {
  const identity = await loadIdentity();
  if (!identity || localAuthBlocked()) return; // nothing to link yet
  const { data } = await supabase.auth.getSession();
  if (localAuthBlocked() || data.session?.user.id !== userId) return;
  await supabase
    .from("profiles")
    .update({ steamid64: identity.steamid64, account_id: identity.accountId })
    .eq("id", userId);
}

type OAuthStatus = { busy: boolean; error: string | null };
type OAuthPhase = "starting" | "callback" | "exchange";
type OAuthCallbackPayload = { state: string; code: string };
type OAuthErrorPayload = { state: string; message: string };
const oauthConsumers = new Set<(status: OAuthStatus) => void>();
let oauthStatus: OAuthStatus = { busy: false, error: null };
let oauthStop: (() => void) | null = null;
let oauthRequest = 0;
let lastOAuthCode: string | null = null;
const OAUTH_STARTUP_TIMEOUT_MS = 60_000;
const OAUTH_CALLBACK_TIMEOUT_MS = 602_000;
const OAUTH_EXCHANGE_TIMEOUT_MS = 60_000;
let activeOAuthRequest: number | null = null;
let activeOAuthState: string | null = null;
let activeOAuthPhase: OAuthPhase | null = null;
let oauthPhaseTimeout: ReturnType<typeof setTimeout> | null = null;
let authSessionObserved = false;
let observedAuthUserId: string | null = null;
function publishOAuth(status: OAuthStatus) {
  oauthStatus = status;
  oauthConsumers.forEach((consumer) => consumer(status));
}
function clearOAuthAttempt(request?: number) {
  if (request !== undefined && activeOAuthRequest !== request) return;
  if (oauthPhaseTimeout !== null) {
    clearTimeout(oauthPhaseTimeout);
    oauthPhaseTimeout = null;
  }
  activeOAuthRequest = null;
  activeOAuthState = null;
  activeOAuthPhase = null;
}
function armOAuthPhaseTimeout(request: number, phase: OAuthPhase, durationMs: number, error: string) {
  if (activeOAuthRequest !== request) return;
  if (oauthPhaseTimeout !== null) clearTimeout(oauthPhaseTimeout);
  activeOAuthPhase = phase;
  oauthPhaseTimeout = setTimeout(() => {
    if (activeOAuthRequest !== request || oauthRequest !== request || activeOAuthPhase !== phase) return;
    activeOAuthRequest = null;
    activeOAuthState = null;
    activeOAuthPhase = null;
    oauthPhaseTimeout = null;
    oauthRequest++;
    publishOAuth({ busy: false, error });
  }, durationMs);
}
function oauthCallbackFrom(value: unknown): OAuthCallbackPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.state !== "string" || candidate.state.length < 16 || candidate.state.length > 4096 ||
    typeof candidate.code !== "string" || candidate.code.length === 0 || candidate.code.length > 8192
  ) return null;
  return { state: candidate.state, code: candidate.code };
}
function oauthErrorFrom(value: unknown): OAuthErrorPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.state !== "string" || candidate.state.length < 16 || candidate.state.length > 4096 ||
    typeof candidate.message !== "string" || candidate.message.length === 0 || candidate.message.length > 1024
  ) return null;
  return { state: candidate.state, message: candidate.message };
}
function invalidatePendingOAuthForAccountChange() {
  if (activeOAuthRequest === null || activeOAuthPhase === "exchange") return;
  const request = activeOAuthRequest;
  clearOAuthAttempt(request);
  oauthRequest++;
  publishOAuth({
    busy: false,
    error: "Google sign-in was interrupted because the account changed. Please try again.",
  });
}
function observeAuthUser(userId: string | null, event?: AuthChangeEvent) {
  if (!authSessionObserved) {
    authSessionObserved = true;
    observedAuthUserId = userId;
    if (event !== undefined && event !== "INITIAL_SESSION") {
      invalidatePendingOAuthForAccountChange();
    }
    return;
  }
  if (observedAuthUserId === userId) return;
  observedAuthUserId = userId;
  invalidatePendingOAuthForAccountChange();
}
function subscribeOAuth(consumer: (status: OAuthStatus) => void) {
  oauthConsumers.add(consumer);
  consumer(oauthStatus);
  if (!oauthStop) {
    let stopped = false;
    const unsubs: Array<() => void> = [];
    const register = async <T,>(name: string, callback: (event: { payload: T }) => void) => {
      try {
        const unsub = await listen<T>(name, callback);
        if (stopped) unsub(); else unsubs.push(unsub);
      } catch { /* plain browser: Google callback unavailable */ }
    };
    oauthStop = () => { stopped = true; unsubs.forEach((unsub) => unsub()); };
    void register<unknown>("oauth-callback", async ({ payload: rawPayload }) => {
      const payload = oauthCallbackFrom(rawPayload);
      const request = activeOAuthRequest;
      if (
        stopped || localAuthBlocked() || getCurrentSignOut().phase !== "idle" || !payload ||
        request === null || request !== oauthRequest || activeOAuthPhase !== "callback" ||
        payload.state !== activeOAuthState || payload.code === lastOAuthCode
      ) return;
      if (oauthPhaseTimeout !== null) clearTimeout(oauthPhaseTimeout);
      oauthPhaseTimeout = null;
      activeOAuthState = null;
      armOAuthPhaseTimeout(
        request,
        "exchange",
        OAUTH_EXCHANGE_TIMEOUT_MS,
        "Google sign-in response timed out. Please try again.",
      );
      lastOAuthCode = payload.code;
      const current = () => request === oauthRequest && activeOAuthRequest === request &&
        activeOAuthPhase === "exchange" && !localAuthBlocked();
      publishOAuth({ busy: true, error: null });
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(payload.code);
        if (!current()) return;
        if (error) throw error;
        if (data.user && oauthConsumers.size > 0 && authSessionObserved && observedAuthUserId !== data.user.id) {
          clearOAuthAttempt(request);
          oauthRequest++;
          publishOAuth({
            busy: false,
            error: "Google sign-in was interrupted because the account changed. Please try again.",
          });
          return;
        }
        clearOAuthAttempt(request);
        oauthRequest++;
        publishOAuth({ busy: false, error: null });
        if (data.user) void linkProfile(data.user.id).catch(() => {});
      } catch (error) {
        if (current()) {
          clearOAuthAttempt(request);
          oauthRequest++;
          publishOAuth({ busy: false, error: msg(error) });
        }
      }
    });
    void register<unknown>("oauth-error", ({ payload: rawPayload }) => {
      const payload = oauthErrorFrom(rawPayload);
      const request = activeOAuthRequest;
      if (
        stopped || localAuthBlocked() || !payload || request === null || request !== oauthRequest ||
        activeOAuthPhase !== "callback" || payload.state !== activeOAuthState
      ) return;
      clearOAuthAttempt(request);
      oauthRequest++;
      publishOAuth({ busy: false, error: payload.message });
    });
  }
  return () => {
    oauthConsumers.delete(consumer);
    if (oauthConsumers.size === 0) { oauthStop?.(); oauthStop = null; }
  };
}

export function useAuth() {
  const signOutState = useSyncExternalStore(subscribeCurrentSignOut, getCurrentSignOut);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauth, setOAuth] = useState(oauthStatus);
  // Keep the provider event so account surfaces can distinguish a real sign-in
  // from routine token rotation without making local-core rendering depend on it.
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthChangeEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    let providerChanged = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        if (!providerChanged) {
          observeAuthUser(data.session?.user.id ?? null);
          setSession(localAuthBlocked() ? null : data.session);
        }
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      providerChanged = true;
      observeAuthUser(s?.user.id ?? null, event);
      setSession(localAuthBlocked() ? null : s);
      setLastAuthEvent(localAuthBlocked() ? "SIGNED_OUT" : event);
    });

    const unsubscribeOAuth = subscribeOAuth((status) => { setOAuth(status); setBusy(false); });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      unsubscribeOAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (activeOAuthRequest !== null || !prepareGoogleSignIn()) return;
    const request = ++oauthRequest;
    activeOAuthRequest = request;
    activeOAuthState = null;
    const current = () => request === oauthRequest && activeOAuthRequest === request && !localAuthBlocked();
    armOAuthPhaseTimeout(
      request,
      "starting",
      OAUTH_STARTUP_TIMEOUT_MS,
      "Google sign-in setup timed out. Please try again.",
    );
    publishOAuth({ busy: true, error: null });
    setBusy(true);
    setError(null);
    try {
      await supabase.auth.startAutoRefresh();
      if (!current()) return;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
      });
      if (!current()) return;
      if (error) throw error;
      if (data?.url) {
        const state = oauthStateFromAuthorizationUrl(data.url);
        if (!state) throw new Error("Google sign-in could not start securely. Please try again.");
        activeOAuthState = state;
        // CR-008 WP-3: arm the callback gate so :3000/auth/callback only accepts
        // a code and state for this app-initiated sign-in, then open the system browser.
        await invoke("oauth_begin", { state });
        if (!current()) return;
        armOAuthPhaseTimeout(
          request,
          "callback",
          OAUTH_CALLBACK_TIMEOUT_MS,
          "Google sign-in timed out. Please try again.",
        );
        await invoke("open_url", { url: data.url });
      } else {
        throw new Error("Google sign-in could not start. Please try again.");
      }
      // The session arrives asynchronously via the oauth-callback listener.
    } catch (e) {
      if (current()) {
        clearOAuthAttempt(request);
        oauthRequest++;
        publishOAuth({ busy: false, error: msg(e) });
        setError(msg(e));
        setBusy(false);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    clearOAuthAttempt();
    oauthRequest++;
    publishOAuth({ busy: false, error: null });
    setBusy(false);
    setError(null);
    const accessToken = session?.access_token;
    await signOutCurrent(
      async () => {
        if (!accessToken) throw new Error("No current session to revoke");
        await requestSessionAction("current", accessToken);
      },
      cleanupLocalSession,
    );
    if (localAuthBlocked()) setSession(null);
  }, [session]);

  return { session: localAuthBlocked() ? null : session, user: localAuthBlocked() ? null : session?.user ?? null, loading,
    busy: busy || oauth.busy || signOutState.phase === "cleaning", error: signOutState.error ?? oauth.error ?? error,
    signOutPhase: signOutState.phase, signOutWarning: signOutState.warning, lastAuthEvent, signInWithGoogle, signOut };
}
