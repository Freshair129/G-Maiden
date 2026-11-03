// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  listeners: new Map<string, Set<(event: { payload: string }) => Promise<void> | void>>(),
  authEvents: new Set<(event: string, session: unknown) => void>(),
  initial: vi.fn(), exchange: vi.fn(), startOAuth: vi.fn(), native: vi.fn(), cleanup: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: fixture.native }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name: string, callback: (event: { payload: string }) => void) => {
  const consumers = fixture.listeners.get(name) ?? new Set();
  consumers.add(callback);
  fixture.listeners.set(name, consumers);
  return () => consumers.delete(callback);
}) }));
vi.mock("../live/identity", () => ({ loadIdentity: vi.fn(async () => null) }));
vi.mock("../profile", () => ({ useProfile: () => ({ gidCode: "G-TEST", generationName: "" }) }));
vi.mock("../supabase", () => ({ cleanupLocalSession: fixture.cleanup, supabase: { auth: {
  getSession: fixture.initial,
  onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
    fixture.authEvents.add(callback);
    return { data: { subscription: { unsubscribe: () => fixture.authEvents.delete(callback) } } };
  },
  exchangeCodeForSession: fixture.exchange,
  startAutoRefresh: vi.fn(),
  signInWithOAuth: fixture.startOAuth,
} } }));

let root: Root;
let element: HTMLDivElement;
let auth: ReturnType<typeof import("../auth").useAuth>;
let AuthPanel: (props: Record<string, never>) => JSX.Element;

function Account() {
  const { useAuth } = requireAuth;
  auth = useAuth();
  return <AuthPanel />;
}

let requireAuth: typeof import("../auth");

async function mount() {
  requireAuth = await import("../auth");
  ({ default: AuthPanel } = await import("../AuthPanel"));
  element = document.createElement("div");
  root = createRoot(element);
  await act(async () => { root.render(<Account />); });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  fixture.listeners.clear(); fixture.authEvents.clear();
  fixture.initial.mockReset().mockResolvedValue({ data: { session: null } });
  fixture.exchange.mockReset().mockResolvedValue({ data: {}, error: null });
  fixture.startOAuth.mockReset().mockResolvedValue({
    data: { url: "https://example.invalid/authorize?state=synthetic-state-value" }, error: null,
  });
  fixture.native.mockReset().mockResolvedValue(undefined);
  fixture.cleanup.mockReset();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it("ends the waiting state after the callback deadline and ignores a late callback", async () => {
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  expect(auth.busy).toBe(true);

  await act(async () => { await vi.advanceTimersByTimeAsync(602_000); });

  expect(auth.busy).toBe(false);
  expect(auth.user).toBeNull();
  expect(fixture.cleanup).not.toHaveBeenCalled();
  expect(element.querySelector('[role="alert"]')?.textContent).toContain("timed out");
  expect(element.querySelector<HTMLButtonElement>(".auth-google")?.disabled).toBe(false);
  const callback = fixture.listeners.get("oauth-callback")?.values().next().value;
  await act(async () => { await callback?.({ payload: "late-callback-code" }); });
  expect(fixture.exchange).not.toHaveBeenCalled();
  expect(element.querySelector('[role="alert"]')?.textContent).toContain("timed out");
});

it("shows a waiting label while the system browser is pending", async () => {
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  expect(auth.busy).toBe(true);
  expect(element.querySelector(".auth-google")?.textContent).toContain("Opening…");
  expect(element.querySelector<HTMLButtonElement>(".auth-google")?.disabled).toBe(true);
});

it("clears the timeout when the OAuth callback completes before the deadline", async () => {
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  const callback = fixture.listeners.get("oauth-callback")?.values().next().value;
  await act(async () => { await callback?.({ payload: "on-time-callback-code" }); });
  expect(fixture.exchange).toHaveBeenCalledTimes(1);
  expect(auth.busy).toBe(false);

  await act(async () => { await vi.advanceTimersByTimeAsync(602_000); });
  expect(auth.error).toBeNull();
  expect(element.querySelector('[role="alert"]')).toBeNull();
});

it("clears the timeout when the native callback gate reports an error", async () => {
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  const callbackError = fixture.listeners.get("oauth-error")?.values().next().value;
  await act(async () => { await callbackError?.({ payload: "callback expired" }); });
  expect(auth.busy).toBe(false);
  expect(auth.error).toBe("callback expired");

  await act(async () => { await vi.advanceTimersByTimeAsync(602_000); });
  expect(auth.error).toBe("callback expired");
  expect(fixture.cleanup).not.toHaveBeenCalled();
});
