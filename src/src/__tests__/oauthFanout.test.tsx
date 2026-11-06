// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  callbacks: new Set<(event: { payload: string }) => Promise<void> | void>(),
  exchange: vi.fn(), initial: vi.fn(), startOAuth: vi.fn(), native: vi.fn(), authEvents: new Set<(event: string, session: unknown) => void>(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: fixture.native }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name: string, callback: (event: { payload: string }) => void) => {
  if (name === "oauth-callback") fixture.callbacks.add(callback);
  return () => fixture.callbacks.delete(callback);
}) }));
vi.mock("../live/identity", () => ({ loadIdentity: vi.fn(async () => null) }));
vi.mock("../supabase", () => ({ cleanupLocalSession: vi.fn(), supabase: { auth: {
  getSession: fixture.initial,
  onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
    fixture.authEvents.add(callback);
    return { data: { subscription: { unsubscribe: () => fixture.authEvents.delete(callback) } } };
  }, exchangeCodeForSession: fixture.exchange, startAutoRefresh: vi.fn(), signInWithOAuth: fixture.startOAuth,
} } }));
let root: Root;
let auth: Array<ReturnType<typeof import("../auth").useAuth>>;
beforeEach(() => {
  vi.resetModules(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.callbacks.clear(); fixture.authEvents.clear();
  fixture.initial.mockReset().mockResolvedValue({ data: { session: null } });
  fixture.exchange.mockReset().mockResolvedValue({ data: {}, error: null });
  fixture.startOAuth.mockReset(); fixture.native.mockReset();
  auth = []; root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("exchanges one callback once across mounted auth hooks and after a consumer remount", async () => {
  const { useAuth } = await import("../auth");
  function Observer({ index }: { index: number }) { auth[index] = useAuth(); return null; }
  await act(async () => root.render(<><Observer index={0} /><Observer index={1} /><Observer index={2} /></>));
  await act(async () => { await Promise.all([...fixture.callbacks].map((callback) => callback({ payload: "one-code" }))); });
  expect(fixture.exchange).toHaveBeenCalledTimes(1);
  expect(auth.every((value) => value.error === null && !value.busy)).toBe(true);
  await act(async () => root.render(<Observer index={0} />));
  await act(async () => { await Promise.all([...fixture.callbacks].map((callback) => callback({ payload: "next-code" }))); });
  expect(fixture.exchange).toHaveBeenCalledTimes(2);
});

it("does not restore an initial session after a newer provider event", async () => {
  let resolve!: (value: unknown) => void;
  fixture.initial.mockReturnValue(new Promise((complete) => { resolve = complete; }));
  const { useAuth } = await import("../auth");
  function Observer() { auth[0] = useAuth(); return null; }
  await act(async () => root.render(<Observer />));
  await act(async () => fixture.authEvents.forEach((callback) => callback("SIGNED_OUT", null)));
  await act(async () => resolve({ data: { session: { user: { id: "old-A" } } } }));
  expect(auth[0].user).toBeNull();
});

it("does not arm or open a delayed Google authorization after sign-out begins", async () => {
  let resolve!: (value: unknown) => void;
  fixture.startOAuth.mockReturnValue(new Promise((complete) => { resolve = complete; }));
  const { useAuth } = await import("../auth");
  function Observer() { auth[0] = useAuth(); return null; }
  await act(async () => root.render(<Observer />));
  let signingIn!: Promise<void>;
  await act(async () => { signingIn = auth[0].signInWithGoogle(); });
  await act(async () => { await auth[0].signOut(); });
  await act(async () => {
    resolve({ data: { url: "https://example.invalid/authorize?state=synthetic-state-value" }, error: null });
    await signingIn;
  });
  expect(fixture.native).not.toHaveBeenCalled();
  expect(auth[0].user).toBeNull();
  expect(auth[0].busy).toBe(false);
});
