// CR-008 WP-2 — encrypted storage adapter for supabase-js (`auth.storage`).
//
// Supabase persists the session (access + refresh token) and the PKCE
// code-verifier through this adapter. On the packaged Windows app every value
// is routed to the Rust DPAPI secret store (per-user encrypted, `secret.rs`)
// instead of WebView2 localStorage, so a stolen leveldb file no longer yields a
// refresh token. Outside Tauri (browser `pnpm dev`, vitest) it falls back to
// localStorage so the deck still renders signed-out/offline (CLAUDE.md).
//
// Threat-model boundary is DPAPI's: protects file-copy / other-user / cloud-sync
// exfiltration, not malware already running as the same Windows user.

import { invoke } from "@tauri-apps/api/core";

// Detect the Tauri runtime ONCE (gate NIT: not per-invoke-catch). When absent we
// are in a plain browser and use localStorage; a rejected `invoke` under Tauri is
// therefore always a genuine backend error, never "no runtime."
const UNDER_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// GoTrue storage keys (`sb-<ref>-auth-token`, `…-code-verifier`) are already
// lowercase alnum + hyphen, which the Rust `validate_name` accepts verbatim, so
// this maps identity for them. The defensive replace only guards against an
// unexpected key shape and never runs on the real GoTrue keys.
function secretName(key: string): string {
  return key.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const secureStorage: AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!UNDER_TAURI) return localStorage.getItem(key);
    const name = secretName(key);
    try {
      const value = await invoke<string | null>("secret_get", { name });
      // Ok(Some) → stored value.
      if (value != null) return value;
      // Ok(None) → nothing in the secure store yet. One-time migration: if a
      // legacy plaintext value is still in localStorage, move it into the store
      // and scrub it (only after a confirmed write — no silent loss).
      const legacy = localStorage.getItem(key);
      if (legacy != null) {
        try {
          await invoke("secret_set", { name, value: legacy });
          localStorage.removeItem(key);
        } catch {
          /* write failed — keep the plaintext, retry next read */
        }
        return legacy;
      }
      return null;
    } catch {
      // secret_get REJECTED = a real read/decrypt error (transient). Do not
      // migrate and do not delete the localStorage fallback; return null so the
      // session simply appears absent this launch and recovers once the store is
      // readable again. Never destroy a recoverable credential on a blip.
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!UNDER_TAURI) {
      localStorage.setItem(key, value);
      return;
    }
    const name = secretName(key);
    try {
      await invoke("secret_set", { name, value });
    } catch {
      // Fail closed: do NOT fall back to writing the token to localStorage in
      // plaintext. GoTrue re-persists on the next refresh; the atomic temp-rename
      // in secret.rs makes a torn write unlikely.
    }
  },

  async removeItem(key: string): Promise<void> {
    if (!UNDER_TAURI) {
      localStorage.removeItem(key);
      return;
    }
    const name = secretName(key);
    try {
      await invoke("secret_delete", { name });
    } catch {
      /* ignore — deleting an absent secret is not an error backend-side */
    }
    // Also clear any legacy plaintext copy that a prior version may have left.
    try {
      localStorage.removeItem(key);
    } catch {
      /* no localStorage (unlikely under Tauri) */
    }
  },
};
