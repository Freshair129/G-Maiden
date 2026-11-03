// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  listeners: new Map<string, Set<(event: { payload: unknown }) => Promise<void> | void>>(),
  authEvents: new Set<(event: string, session: unknown) => void>(),
  initial: vi.fn(), exchange: vi.fn(), startOAuth: vi.fn(), native: vi.fn(), cleanup: vi.fn(),
  attempt: 0, state: "",
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: fixture.native }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
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
  fixture.attempt = 0; fixture.state = "";
  fixture.initial.mockReset().mockResolvedValue({ data: { session: null } });
  fixture.exchange.mockReset().mockResolvedValue({ data: {}, error: null });
  fixture.startOAuth.mockReset().mockImplementation(async () => {
    fixture.attempt += 1;
    fixture.state = `synthetic-state-${fixture.attempt}-0123456789`;
    return { data: { url: `https://example.invalid/authorize?state=${fixture.state}` }, error: null };
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
  await act(async () => { await callback?.({ payload: { state: fixture.state, code: "late-callback-code" } }); });
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
  await act(async () => { await callback?.({ payload: { state: fixture.state, code: "on-time-callback-code" } }); });
  expect(fixture.exchange).toHaveBeenCalledTimes(1);
  expect(fixture.exchange).toHaveBeenCalledWith("on-time-callback-code");
  expect(auth.busy).toBe(false);

  await act(async () => { await vi.advanceTimersByTimeAsync(602_000); });
  expect(auth.error).toBeNull();
  expect(element.querySelector('[role="alert"]')).toBeNull();
});

it("clears the timeout when the native callback gate reports an error", async () => {
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  const callbackError = fixture.listeners.get("oauth-error")?.values().next().value;
  await act(async () => { await callbackError?.({ payload: { state: fixture.state, message: "callback expired" } }); });
  expect(auth.busy).toBe(false);
  expect(auth.error).toBe("callback expired");

  await act(async () => { await vi.advanceTimersByTimeAsync(602_000); });
  expect(auth.error).toBe("callback expired");
  expect(fixture.cleanup).not.toHaveBeenCalled();
});

it("bounds sign-in setup when the provider request never resolves", async () => {
  fixture.startOAuth.mockReturnValue(new Promise(() => {}));
  await mount();
  await act(async () => { void auth.signInWithGoogle(); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(auth.busy).toBe(false);
  expect(auth.error).toContain("timed out");
});

it("bounds a stalled code exchange and ignores its late local completion", async () => {
  let resolveExchange!: (result: unknown) => void;
  fixture.exchange.mockReturnValue(new Promise((resolve) => { resolveExchange = resolve; }));
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  const callback = fixture.listeners.get("oauth-callback")?.values().next().value;
  await act(async () => { void callback?.({ payload: { state: fixture.state, code: "stalled-code" } }); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(auth.busy).toBe(false);
  expect(auth.error).toContain("timed out");
  await act(async () => { resolveExchange({ data: {}, error: null }); await Promise.resolve(); });
  expect(auth.busy).toBe(false);
  expect(auth.error).toContain("timed out");
});

it("ignores a stale callback error after a new attempt starts", async () => {
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  const staleState = fixture.state;
  await act(async () => { await vi.advanceTimersByTimeAsync(602_000); });
  await act(async () => { await auth.signInWithGoogle(); });
  const currentState = fixture.state;
  expect(currentState).not.toBe(staleState);
  const callbackError = fixture.listeners.get("oauth-error")?.values().next().value;
  await act(async () => { await callbackError?.({ payload: { state: staleState, message: "expired prior callback" } }); });
  expect(auth.busy).toBe(true);
  await act(async () => { await callbackError?.({ payload: { state: currentState, message: "current callback error" } }); });
  expect(auth.busy).toBe(false);
  expect(auth.error).toBe("current callback error");
});

it("ignores an old callback for the previous state while a retry is pending", async () => {
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  const staleState = fixture.state;
  await act(async () => { await vi.advanceTimersByTimeAsync(602_000); });
  await act(async () => { await auth.signInWithGoogle(); });
  const currentState = fixture.state;
  const callback = fixture.listeners.get("oauth-callback")?.values().next().value;
  await act(async () => { await callback?.({ payload: { state: staleState, code: "old-code" } }); });
  expect(fixture.exchange).not.toHaveBeenCalled();
  expect(auth.busy).toBe(true);
  await act(async () => { await callback?.({ payload: { state: currentState, code: "retry-code" } }); });
  expect(fixture.exchange).toHaveBeenCalledTimes(1);
  expect(fixture.exchange).toHaveBeenCalledWith("retry-code");
});

it("invalidates a pending callback when the provider account changes", async () => {
  await mount();
  await act(async () => { fixture.authEvents.forEach((callback) => callback("INITIAL_SESSION", null)); });
  await act(async () => { await auth.signInWithGoogle(); });
  const callback = fixture.listeners.get("oauth-callback")?.values().next().value;
  await act(async () => { fixture.authEvents.forEach((change) => change("SIGNED_IN", { user: { id: "new-account" } })); });
  await act(async () => { await callback?.({ payload: { state: fixture.state, code: "old-attempt-code" } }); });
  expect(fixture.exchange).not.toHaveBeenCalled();
  expect(auth.busy).toBe(false);
});

it("does not report code-exchange success after the provider switches to another account", async () => {
  let resolveExchange!: (result: unknown) => void;
  fixture.exchange.mockReturnValue(new Promise((resolve) => { resolveExchange = resolve; }));
  await mount();
  await act(async () => { fixture.authEvents.forEach((callback) => callback("INITIAL_SESSION", null)); });
  await act(async () => { await auth.signInWithGoogle(); });
  const callback = fixture.listeners.get("oauth-callback")?.values().next().value;
  await act(async () => { void callback?.({ payload: { state: fixture.state, code: "code-for-old-account" } }); await Promise.resolve(); });
  await act(async () => {
    fixture.authEvents.forEach((change) => change("SIGNED_IN", { user: { id: "different-account" } }));
  });
  await act(async () => { resolveExchange({ data: { user: { id: "oauth-account" } }, error: null }); });
  expect(auth.user?.id).toBe("different-account");
  expect(auth.busy).toBe(false);
  expect(auth.error).toContain("account changed");
  expect(fixture.cleanup).not.toHaveBeenCalled();
});

it("invalidates a pending attempt when the first auth event is an account change", async () => {
  fixture.initial.mockReturnValue(new Promise(() => {}));
  await mount();
  await act(async () => { await auth.signInWithGoogle(); });
  const callback = fixture.listeners.get("oauth-callback")?.values().next().value;
  await act(async () => {
    fixture.authEvents.forEach((change) => change("SIGNED_IN", { user: { id: "new-account" } }));
  });
  await act(async () => {
    await callback?.({ payload: { state: fixture.state, code: "old-attempt-code" } });
  });
  expect(fixture.exchange).not.toHaveBeenCalled();
  expect(auth.user?.id).toBe("new-account");
  expect(auth.busy).toBe(false);
});
