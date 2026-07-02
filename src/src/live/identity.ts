// Steam identity manager (account system, Phase A) — frontend side.
//
// Holds the player's canonical { steamid64, accountId }, resolved by the Rust
// `resolve_steam_id` command (handles raw id / SteamID64 / /profiles / /id vanity),
// and persists it via the Tauri store plugin (falls back to localStorage in a
// plain browser). This is what drives the OpenDota fetch — no manual account_id
// juggling in localStorage anymore.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SteamIdentity {
  steamid64: string;
  accountId: number;
}

const STORE_FILE = "identity.json";
const KEY = "steam";
const LS_KEY = "gmaiden.identity";

/** Fires whenever the stored identity changes so live consumers (the companion
 *  hook) can re-fetch without waiting for a remount/reload. */
export const IDENTITY_EVENT = "gmaiden:identity";
function notifyIdentityChanged() {
  try {
    window.dispatchEvent(new CustomEvent(IDENTITY_EVENT));
  } catch {
    /* no window */
  }
}

// Lazily hold the loaded Tauri Store; null when the plugin isn't available
// (browser dev) so we transparently fall back to localStorage.
type TauriStore = { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void>; delete: (k: string) => Promise<void>; save: () => Promise<void> };
let storePromise: Promise<TauriStore | null> | null = null;

async function getStore(): Promise<TauriStore | null> {
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const mod = await import("@tauri-apps/plugin-store");
        return (await mod.load(STORE_FILE)) as unknown as TauriStore;
      } catch {
        return null; // not under Tauri / plugin unavailable
      }
    })();
  }
  return storePromise;
}

function isIdentity(v: unknown): v is SteamIdentity {
  return !!v && typeof v === "object"
    && typeof (v as SteamIdentity).steamid64 === "string"
    && typeof (v as SteamIdentity).accountId === "number";
}

export async function loadIdentity(): Promise<SteamIdentity | null> {
  const store = await getStore();
  if (store) {
    const v = await store.get(KEY).catch(() => null);
    if (isIdentity(v)) return v;
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return isIdentity(v) ? v : null;
  } catch {
    return null;
  }
}

export async function saveIdentity(id: SteamIdentity): Promise<void> {
  const store = await getStore();
  if (store) {
    await store.set(KEY, id);
    await store.save();
    notifyIdentityChanged();
    return;
  }
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(id));
  } catch {
    /* no-op */
  }
  notifyIdentityChanged();
}

export async function clearIdentity(): Promise<void> {
  const store = await getStore();
  if (store) {
    await store.delete(KEY).catch(() => {});
    await store.save().catch(() => {});
    notifyIdentityChanged();
    return;
  }
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {
    /* no-op */
  }
  notifyIdentityChanged();
}

/** Resolve any Steam input to a canonical identity via the Rust command. */
export async function resolveSteamIdentity(input: string): Promise<SteamIdentity> {
  const raw = await invoke<{ steamid64: string; account_id: number }>("resolve_steam_id", { input });
  return { steamid64: raw.steamid64, accountId: raw.account_id };
}

/** Resolve + persist in one step. */
export async function resolveAndSave(input: string): Promise<SteamIdentity> {
  const id = await resolveSteamIdentity(input);
  await saveIdentity(id);
  return id;
}

export interface UseIdentity {
  identity: SteamIdentity | null;
  loading: boolean;
  resolving: boolean;
  error: string | null;
  /** Resolve `input` (id / SteamID64 / profile URL / vanity) and persist it. */
  linkSteam: (input: string) => Promise<void>;
  /** Adopt an already-known SteamID64 (e.g. auto-detected from GSI) and persist. */
  adoptSteamId64: (steamid64: string) => Promise<void>;
  clear: () => Promise<void>;
}

export function useIdentity(): UseIdentity {
  const [identity, setIdentity] = useState<SteamIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadIdentity().then((id) => {
      if (!cancelled) {
        setIdentity(id);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const linkSteam = useCallback(async (input: string) => {
    setResolving(true);
    setError(null);
    try {
      const id = await resolveAndSave(input);
      setIdentity(id);
    } catch (e) {
      setError(String((e as Error)?.message ?? e) || "could not resolve that Steam id");
    } finally {
      setResolving(false);
    }
  }, []);

  const adoptSteamId64 = useCallback(async (steamid64: string) => {
    // A 17-digit SteamID64 resolves offline through the same Rust path.
    await linkSteam(steamid64);
  }, [linkSteam]);

  const clear = useCallback(async () => {
    await clearIdentity();
    setIdentity(null);
  }, []);

  return { identity, loading, resolving, error, linkSteam, adoptSteamId64, clear };
}
