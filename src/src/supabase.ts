// Supabase client (account system, Phase B). The publishable/anon key is safe to
// ship client-side — Row Level Security on `profiles` is what protects data.
import { createClient } from "@supabase/supabase-js";
import { secureStorage } from "./secureStorage";
import { localAuthBlocked } from "./securitySession";

const SUPABASE_URL = "https://wsseitulmcgnolgsrxgh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ";
const AUTH_STORAGE_KEY = "sb-wsseitulmcgnolgsrxgh-auth-token";
const authRequests = new Map<AbortController, Promise<Response>>();
const storageOperations = new Set<Promise<unknown>>();

async function storageOperation<T>(operation: Promise<T>): Promise<T> {
  storageOperations.add(operation);
  try { return await operation; } finally { storageOperations.delete(operation); }
}

const authStorage = {
  async getItem(key: string) {
    if (localAuthBlocked()) return null;
    const value = await storageOperation(secureStorage.getItem(key));
    return localAuthBlocked() ? null : value;
  },
  async setItem(key: string, value: string) {
    if (localAuthBlocked()) throw new Error("Local session is being removed");
    await storageOperation(secureStorage.setItem(key, value));
  },
  removeItem: (key: string) => secureStorage.removeItem(key),
};

async function accountFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!url.href.startsWith(`${SUPABASE_URL}/auth/v1/`)) return fetch(input, init);
  if (localAuthBlocked()) throw new DOMException("Local session is being removed", "AbortError");
  const controller = new AbortController();
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  // Keep the request cancellable through body consumption, not only headers.
  const request = (async () => {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const body = await response.text();
    return new Response(response.status === 204 ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  })();
  authRequests.set(controller, request);
  try { return await request; } finally {
    authRequests.delete(controller);
    signal?.removeEventListener("abort", abort);
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: accountFetch },
  auth: {
    // CR-008 WP-2: persist the session (refresh token) + PKCE code-verifier
    // through the DPAPI secret store, not plaintext WebView2 localStorage.
    storage: authStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // desktop: we handle the callback ourselves
    // PKCE returns the auth `?code=` in the QUERY string (reaches our loopback
    // server) instead of implicit `#access_token=` in the fragment (which the
    // browser never sends to the server).
    flowType: "pkce",
  },
});

export async function cleanupLocalSession(): Promise<void> {
  await supabase.auth.stopAutoRefresh();
  const pendingRequests = [...authRequests.values()];
  authRequests.forEach((_, controller) => controller.abort());
  await Promise.allSettled(pendingRequests);
  await Promise.allSettled([...storageOperations]);
  const deletions = await Promise.allSettled(
    [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`, `${AUTH_STORAGE_KEY}-user`]
      .map((key) => secureStorage.removeItem(key)),
  );
  // Pinned auth-js 2.110 reads the now-empty storage, removes its session epoch
  // and notifies all subscribers without a provider request. No private SDK API.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error || deletions.some((result) => result.status === "rejected")) {
    throw new Error("Local session cleanup failed");
  }
}

export async function revokeCurrentSession(accessToken: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    // Use the captured session: FunctionsClient's auth wrapper can otherwise
    // wait behind a stuck SDK refresh lock before its fetch timeout takes effect.
    const response = await fetch(`${SUPABASE_URL}/functions/v1/iam-session-action`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "current" }), signal: controller.signal,
    });
    await response.arrayBuffer();
    if (!response.ok) throw new Error("Current session revocation unconfirmed");
  } finally { clearTimeout(timeout); }
}
