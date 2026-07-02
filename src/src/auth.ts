// G-Maiden account (GID) auth — email OTP, additive (the deck works signed-out).
// Sign in creates/loads a Supabase auth user (= GID); on verify we upsert the
// `profiles` row and link the current Steam identity. Phone OTP comes later.

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { loadIdentity } from "./live/identity";

// Fixed loopback redirect served by the GSI axum server (/auth/callback). Must
// be in Supabase → Auth → URL Configuration → Redirect URLs.
const OAUTH_REDIRECT = "http://127.0.0.1:3000/auth/callback";

export type AuthStep = "email" | "code" | "signedin";

function msg(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e) ?? "something went wrong";
}

/** Upsert the GID's profile row and link the stored Steam identity (best-effort). */
async function linkProfile(userId: string, email: string | null): Promise<void> {
  const identity = await loadIdentity();
  const row: { id: string; email: string | null; steamid64?: string; account_id?: number } = { id: userId, email };
  if (identity) {
    row.steamid64 = identity.steamid64;
    row.account_id = identity.accountId;
  }
  await supabase.from("profiles").upsert(row, { onConflict: "id" });
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

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
            if (data.user) await linkProfile(data.user.id, data.user.email ?? null).catch(() => {});
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
        /* not under Tauri — Google sign-in unavailable, email OTP still works */
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
      if (data?.url) await invoke("open_url", { url: data.url });
      // The session arrives asynchronously via the oauth-callback listener.
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  }, []);

  const sendCode = useCallback(async (email: string) => {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setPendingEmail(email);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyCode = useCallback(async (token: string) => {
    if (!pendingEmail) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token,
        type: "email",
      });
      if (error) throw error;
      setSession(data.session);
      const email = data.user?.email ?? pendingEmail;
      setPendingEmail(null);
      if (data.user) await linkProfile(data.user.id, email).catch(() => {});
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }, [pendingEmail]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPendingEmail(null);
    setError(null);
  }, []);

  const resetFlow = useCallback(() => {
    setPendingEmail(null);
    setError(null);
  }, []);

  const step: AuthStep = session ? "signedin" : pendingEmail ? "code" : "email";

  return { session, user: session?.user ?? null, loading, busy, error, step, pendingEmail, sendCode, verifyCode, signInWithGoogle, signOut, resetFlow };
}
