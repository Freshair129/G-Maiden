// G-Maiden account (GID) auth — Google sign-in, additive (the deck works
// signed-out). Signing in loads/creates a Supabase auth user (= GID); on
// sign-in we upsert the `profiles` row and link the current Steam identity.

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { loadIdentity } from "./live/identity";

// Fixed loopback redirect served by the GSI axum server (/auth/callback). Must
// be in Supabase → Auth → URL Configuration → Redirect URLs.
const OAUTH_REDIRECT = "http://127.0.0.1:3000/auth/callback";

function msg(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e) ?? "something went wrong";
}

/** Link the stored Steam identity onto the GID's profile row (best-effort).
 *  The row + email are created server-side by the signup trigger, and identity
 *  columns are column-locked (SEC-001 §2 Phase B), so the client only updates
 *  the Steam link fields it is granted — never id/email/generation/gid_code. */
async function linkProfile(userId: string): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) return; // nothing to link yet
  await supabase
    .from("profiles")
    .update({ steamid64: identity.steamid64, account_id: identity.accountId })
    .eq("id", userId);
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));

    // Google OAuth: the browser lands on the GSI /auth/callback route which
    // emits `oauth-callback` with the PKCE code; complete the exchange here.
    (async () => {
      try {
        const u1 = await listen<string>("oauth-callback", async (e) => {
          setBusy(true);
          setError(null);
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(e.payload);
            if (error) throw error;
            if (data.user) await linkProfile(data.user.id).catch(() => {});
          } catch (err) {
            setError(msg(err));
          } finally {
            setBusy(false);
          }
        });
        const u2 = await listen<string>("oauth-error", (e) => {
          setBusy(false);
          setError(e.payload || "sign-in was cancelled");
        });
        if (cancelled) { u1(); u2(); } else { unsubs.push(u1, u2); }
      } catch {
        /* not under Tauri — Google sign-in unavailable */
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      unsubs.forEach((f) => f());
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (data?.url) {
        // CR-008 WP-3: arm the callback gate so :3000/auth/callback only accepts
        // a code for this app-initiated sign-in (login-CSRF guard), then open the
        // system browser.
        await invoke("oauth_begin");
        await invoke("open_url", { url: data.url });
      }
      // The session arrives asynchronously via the oauth-callback listener.
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setError(null);
  }, []);

  return { session, user: session?.user ?? null, loading, busy, error, signInWithGoogle, signOut };
}
