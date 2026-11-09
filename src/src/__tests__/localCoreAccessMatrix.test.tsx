// @vitest-environment jsdom
/**
 * MVP-004 source/unit access matrix (not native/release/live acceptance).
 * cold start / signed-out / cold offline, new device: A/B/C below.
 * network loss: D; mismatch / revoke / account switch: E plus
 * accountRequestIsolation.test.tsx (account caches) and
 * companionIdentityIsolation.test.tsx (Steam-derived data).
 * sign-out: authRemediation.test.tsx; current Terms changed/missing: F.
 * updater: useAppUpdate.test.tsx (native deferral response; release/channel pending).
 * App routing is real; the heavy deck/settings are fixtures so these tests only
 * establish that account recovery leaves the local-core render boundary mounted.
 */
import { act, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { useAuth } from "../auth";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "control" }) }));
vi.mock("../live/identity", () => ({ loadIdentity: vi.fn(async () => null) }));
vi.mock("../profile", () => ({ useProfile: () => ({ gidCode: "G-FIXTURE", generationName: "fixture" }) }));
vi.mock("../app/settings", () => ({
  StartupSettingsProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../CommandDeck", () => ({ default: LocalCoreFixture }));

const KEY = "sb-wsseitulmcgnolgsrxgh-auth-token";
const AUTH_URL = "https://wsseitulmcgnolgsrxgh.supabase.co/auth/v1/";
let useActualAuth: typeof useAuth;
let AccountPanel: ComponentType;
let auth: ReturnType<typeof useAuth>;
let cleanup = async () => {};
function LocalCoreFixture() {
  auth = useActualAuth();
  return <main data-local-core><AccountPanel /></main>;
}

afterEach(async () => {
  await cleanup();
  cleanup = async () => {};
  localStorage.clear();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function syntheticSession(expired = false): Session {
  return {
    access_token: "synthetic-access", refresh_token: "synthetic-refresh",
    token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600),
    user: { id: "synthetic-user", email: "fixture@example.invalid", aud: "authenticated",
      app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
}

async function settleUntil(done: () => boolean) {
  // Bounded virtual time, not an assertion about SDK retry counts/backoff.
  for (let elapsed = 0; !done() && elapsed < 120_000; elapsed += 1000) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  }
  expect(done(), "account recovery should settle within the virtual test budget").toBe(true);
}

async function mount(options: { session?: Session; offline?: boolean; initial?: "reject" | "error" | "pending" } = {}) {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  localStorage.clear();
  const secrets = new Map<string, string>();
  if (options.session) secrets.set(KEY, JSON.stringify(options.session));
  invokeMock.mockReset().mockImplementation(async (command: string, args?: { name?: string; value?: string }) => {
    const name = args?.name ?? "";
    if (command === "secret_get") return secrets.get(name) ?? null;
    if (command === "secret_set") secrets.set(name, args?.value ?? "");
    if (command === "secret_delete") secrets.delete(name);
  });
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(async () => new Response("{}", { status: 503 }));
  if (options.offline) fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  // The SDK logs expected synthetic transport failures; never send a real fetch.
  if (options.offline) vi.spyOn(console, "error").mockImplementation(() => {});
  const { supabase } = await import("../supabase");
  type ProviderCallback = Parameters<typeof supabase.auth.onAuthStateChange>[0];
  const providerCallbacks = new Set<ProviderCallback>();
  let rejectInitial!: (reason: Error) => void;
  if (options.initial) {
    // Isolate initial recovery before any provider event can arrive.
    vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((callback) => {
      providerCallbacks.add(callback);
      return { data: { subscription: { id: "synthetic-subscription", callback,
        unsubscribe: () => { providerCallbacks.delete(callback); } } } };
    });
    const recovery = vi.spyOn(supabase.auth, "getSession");
    if (options.initial === "reject") recovery.mockRejectedValue(new Error("synthetic unreadable session"));
    if (options.initial === "error") {
      const { AuthError } = await import("@supabase/supabase-js");
      // Even a malformed error result containing stale session data must fail closed.
      recovery.mockResolvedValue({ data: { session: syntheticSession() }, error: new AuthError("synthetic recovery error") } as unknown as
        Awaited<ReturnType<typeof supabase.auth.getSession>>);
    }
    if (options.initial === "pending") recovery.mockReturnValue(new Promise((_resolve, reject) => { rejectInitial = reject; }));
  }
  ({ useAuth: useActualAuth } = await import("../auth"));
  ({ default: AccountPanel } = await import("../AuthPanel"));
  const { App } = await import("../App");
  const element = document.createElement("div");
  const root = createRoot(element);
  cleanup = async () => {
    await act(async () => root.unmount());
    await supabase.auth.dispose();
  };
  await act(async () => { root.render(<App />); });
  return { element, secrets, fetchMock, supabase, root, App, rejectInitial,
    emitProvider: async (...args: Parameters<ProviderCallback>) => {
      await act(async () => { await Promise.all([...providerCallbacks].map((callback) => callback(...args))); });
    } };
}

function expectSignedOut(element: HTMLElement) {
  expect(auth.loading).toBe(false);
  expect(auth.user).toBeNull();
  expect(element.querySelector(".auth-google")?.textContent).toContain("Continue with Google");
  expect(element.textContent).not.toContain("checking account");
  expect(element.querySelector("main[data-local-core]")).not.toBeNull();
}

it("cold start / new device", async () => {
  const view = await mount();
  await settleUntil(() => !auth.loading);
  expectSignedOut(view.element);
  expect(view.secrets.has(KEY)).toBe(false);
  expect(localStorage.length).toBe(0);
  expect(view.fetchMock.mock.calls.filter(([input]) => String(input).startsWith(AUTH_URL))).toHaveLength(0);
});

it("cold offline / unreadable session", async () => {
  const view = await mount({ initial: "reject" });
  expectSignedOut(view.element);
  expect(view.secrets.has(KEY)).toBe(false);
});

it("cold offline / unreadable session: resolved error fails closed", async () => {
  const view = await mount({ initial: "error" });
  expectSignedOut(view.element);
});

it("cold offline / unreadable session: late rejection preserves the provider session", async () => {
  const view = await mount({ initial: "pending" });
  await view.emitProvider("SIGNED_IN", syntheticSession());
  expect(auth.user?.id).toBe("synthetic-user");
  await act(async () => { view.rejectInitial(new Error("synthetic late recovery failure")); });
  expect(auth.loading).toBe(false);
  expect(auth.user?.id).toBe("synthetic-user");
  expect(view.element.querySelector(".auth-sub")?.textContent).toBe("fixture@example.invalid");
});

it("cold offline with stored, expired session", async () => {
  const view = await mount({ session: syntheticSession(true), offline: true });
  await settleUntil(() => !auth.loading);
  expect(view.element.querySelector("main[data-local-core]")).not.toBeNull();
  expect(view.element.textContent).not.toContain("checking account");
  expect(view.fetchMock.mock.calls.some(([input]) => String(input).startsWith(`${AUTH_URL}token`))).toBe(true);
  expect(invokeMock.mock.calls.some(([command]) => command === "lock_gmad_runtime")).toBe(false);
});

it("network loss mid-session", async () => {
  const view = await mount({ session: syntheticSession() });
  await settleUntil(() => !auth.loading);
  expect(auth.user?.id).toBe("synthetic-user");
  const localCore = view.element.querySelector("main[data-local-core]");
  expect(localCore).not.toBeNull();
  view.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  let result: Awaited<ReturnType<typeof view.supabase.auth.refreshSession>> | undefined;
  const refresh = view.supabase.auth.refreshSession().then((value) => { result = value; });
  await settleUntil(() => result !== undefined);
  await refresh;
  expect(result?.error).toBeTruthy();
  expect(auth.loading).toBe(false);
  expect(view.element.querySelector("main[data-local-core]")).toBe(localCore);
  expect(invokeMock.mock.calls.some(([command]) => command === "lock_gmad_runtime")).toBe(false);
});

it("revoke", async () => {
  const session = syntheticSession();
  const view = await mount({ session });
  await settleUntil(() => !auth.loading);
  expect(auth.user?.id).toBe("synthetic-user");
  // Expire the access token so this is a required refresh, not proactive rotation.
  vi.setSystemTime((session.expires_at! + 1) * 1000);
  view.fetchMock.mockResolvedValue(new Response(JSON.stringify({
    error: "invalid_grant", error_code: "refresh_token_not_found",
  }), { status: 400, headers: { "Content-Type": "application/json" } }));
  await act(async () => {
    const result = await view.supabase.auth.refreshSession();
    expect(result.error).toBeTruthy();
  });
  expectSignedOut(view.element);
  expect(view.secrets.has(KEY)).toBe(false);
  expect(localStorage.getItem(KEY)).toBeNull();
  await act(async () => { view.root.render(null); });
  await act(async () => { view.root.render(<view.App />); });
  expectSignedOut(view.element);
  expect((await view.supabase.auth.getSession()).data.session).toBeNull();
  expect(view.secrets.has(KEY)).toBe(false);
});

it("Terms changed/missing + no entitlement on the startup path", async () => {
  // This browser TS project has no @types/node; keep the Node-only API local.
  const { readdirSync, readFileSync } = await vi.importActual<{
    readdirSync(path: URL): string[];
    readFileSync(path: URL, encoding: "utf8"): string;
  }>("node:fs");
  const { URL: NodeURL } = await vi.importActual<{ URL: typeof URL }>("node:url");
  const source = new NodeURL("../", import.meta.url);
  const settings = readdirSync(new NodeURL("app/", source))
    .filter((file) => /^settings.*\.tsx?$/.test(file) && !file.includes(".test."))
    .map((file) => `app/${file}`);
  expect(settings).toContain("app/settings.tsx");
  const forbiddenReference = /\b(?:gmadEntitlement|GmadEntitlement|gmadFirstRun|GmadFirstRunGate)\b|["'][^"'\n]*(?:terms[-_]receipt|entitlement)[^"'\n]*["']/i;
  // Remove full-line/block comments so decision explanations cannot trip the guard.
  const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const file of ["App.tsx", "main.tsx", "CommandDeck.tsx", ...settings]) {
    expect(withoutComments(readFileSync(new NodeURL(file, source), "utf8")), file).not.toMatch(forbiddenReference);
  }
  const native = withoutComments(readFileSync(new NodeURL("../../src-tauri/src/lib.rs", source), "utf8"));
  expect(native).not.toMatch(/\b(?:lock_gmad_runtime|\w*closed_beta\w*|\w*entitlement\w*)\b|["']closed-beta["']/i);
});
