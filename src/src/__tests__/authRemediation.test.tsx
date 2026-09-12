// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { useAuth } from "../auth";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../live/identity", () => ({ loadIdentity: vi.fn(async () => null) }));
vi.mock("../profile", () => ({ useProfile: () => ({ gidCode: "G-FIXTURE", generationName: "fixture" }) }));

const KEY = "sb-wsseitulmcgnolgsrxgh-auth-token";
let cleanup = async () => {};
afterEach(async () => { await cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mount(status = 503, native = false) {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (native) Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  localStorage.clear();
  const seed = JSON.stringify({
    access_token: "synthetic-access", refresh_token: "synthetic-refresh",
    token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "synthetic-user", email: "fixture@example.invalid" },
  });
  const secrets = new Map([[KEY, seed], [`${KEY}-code-verifier`, JSON.stringify("verifier")], ["anthropic_api_key", "unrelated-fixture"]]);
  localStorage.setItem(KEY, seed);
  localStorage.setItem(`${KEY}-code-verifier`, JSON.stringify("verifier"));
  let deleteFails = false;
  invokeMock.mockReset().mockImplementation(async (cmd: string, args?: { name?: string }) => {
    const name = args?.name ?? "";
    if (cmd === "secret_get") return secrets.get(name) ?? null;
    if (cmd === "secret_delete") {
      if (deleteFails && name === KEY) throw new Error("access denied");
      secrets.delete(name);
    }
  });
  const fetchMock = vi.fn(async () => new Response("{}", { status }));
  vi.stubGlobal("fetch", fetchMock);
  const { useAuth: useActualAuth } = await import("../auth");
  const { supabase } = await import("../supabase");
  const { default: AuthPanel } = await import("../AuthPanel");
  let auth!: ReturnType<typeof useAuth>;
  function Observer() { auth = useActualAuth(); return <div>{auth.signOutWarning}</div>; }
  const element = document.createElement("div");
  const root = createRoot(element);
  cleanup = async () => {
    await act(async () => root.unmount()); await supabase.auth.dispose();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  };
  await act(async () => { root.render(<><Observer /><AuthPanel /></>); });
  expect(auth.user?.id).toBe("synthetic-user");
  return { get auth() { return auth; }, element, root, Observer, supabase, secrets, fetchMock,
    failDelete(value: boolean) { deleteFails = value; } };
}

it.each([200, 401, 403, 503])("cleans real SDK credentials after remote status %s and shares the outcome", async (status) => {
  const view = await mount(status);
  await act(async () => { await view.auth.signOut(); });
  expect(invokeMock).toHaveBeenCalledWith("lock_gmad_runtime");
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(localStorage.getItem(`${KEY}-code-verifier`)).toBeNull();
  expect((await view.supabase.auth.getSession()).data.session).toBeNull();
  expect(view.auth.user).toBeNull();
  expect(view.auth.signOutPhase).toBe("done");
  expect(view.auth.signOutWarning === null).toBe(status === 200);
  expect(view.fetchMock).toHaveBeenCalledTimes(1); // No second provider request to clean local storage.
  expect(view.element.textContent).not.toContain("เข้าสู่ระบบไม่สำเร็จ");
  await act(async () => { view.root.render(<view.Observer />); });
  if (status !== 200) expect(view.element.textContent).toContain("ยังยืนยันการยกเลิก session บนเซิร์ฟเวอร์ไม่ได้");
});

it("reports DPAPI failure, attempts other keys, and permits cleanup retry but not new login", async () => {
  const view = await mount(503, true);
  view.failDelete(true);
  await act(async () => { await view.auth.signOut(); });
  expect(view.auth.signOutPhase).toBe("failed");
  expect(view.secrets.has(KEY)).toBe(true);
  expect(view.secrets.has(`${KEY}-code-verifier`)).toBe(false);
  expect(view.secrets.has("anthropic_api_key")).toBe(true);
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(view.element.textContent).toContain("ล้างข้อมูลเข้าสู่ระบบในเครื่องไม่สำเร็จ");
  const calls = view.fetchMock.mock.calls.length;
  await act(async () => { await view.auth.signInWithGoogle(); });
  expect(view.fetchMock).toHaveBeenCalledTimes(calls);
  view.failDelete(false);
  await act(async () => { await view.auth.signOut(); });
  expect(view.auth.signOutPhase).toBe("done");
  expect(view.secrets.has(KEY)).toBe(false);
});

it("does not attempt remote or local cleanup if native lock fails", async () => {
  const view = await mount();
  invokeMock.mockRejectedValue(new Error("IPC unavailable"));
  await act(async () => { await view.auth.signOut(); });
  expect(view.fetchMock).not.toHaveBeenCalled();
  expect(localStorage.getItem(KEY)).not.toBeNull();
  expect(view.auth.error).toContain("Runtime could not be locked");
  expect(view.auth.user?.id).toBe("synthetic-user");
});

it("aborts a hanging security request at five seconds and still clears credentials", async () => {
  const view = await mount();
  let aborted = false;
  vi.stubGlobal("fetch", vi.fn((_input: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
  })));
  vi.useFakeTimers();
  await act(async () => {
    const signout = view.auth.signOut();
    await vi.advanceTimersByTimeAsync(5000);
    await signout;
  });
  expect(aborted).toBe(true);
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(view.auth.signOutPhase).toBe("done");
  expect(view.auth.signOutWarning).not.toBeNull();
});

it.each([200, 503])("keeps local auth and runtime untouched for others-session status %s", async (status) => {
  const view = await mount(status);
  const { requestSessionAction } = await import("../securityApi");
  if (status === 200) await requestSessionAction("others");
  else await expect(requestSessionAction("others")).rejects.toThrow();
  expect(invokeMock).not.toHaveBeenCalledWith("lock_gmad_runtime");
  expect(localStorage.getItem(KEY)).not.toBeNull();
  expect(view.auth.user?.id).toBe("synthetic-user");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("iam-session-action"), expect.objectContaining({ body: JSON.stringify({ scope: "others" }) }));
});

it("aborts an in-flight SDK refresh before local cleanup and does not restore its session", async () => {
  const view = await mount();
  let aborted = false;
  let started!: () => void;
  const refreshStarted = new Promise<void>((resolve) => { started = resolve; });
  vi.stubGlobal("fetch", vi.fn((input: string, init: RequestInit) => {
    if (String(input).includes("/auth/v1/token")) {
      started();
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
      });
    }
    return Promise.resolve(new Response("{}", { status: 503 }));
  }));
  // auth-js logs a failed refresh; fixture abort is expected and contains no real credentials.
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers();
  await act(async () => {
    const refresh = view.supabase.auth.refreshSession();
    await refreshStarted;
    await view.auth.signOut();
    // auth-js retries thrown transport errors locally for one 30s tick. The
    // blocked transport must reject every retry without sending another fetch.
    await vi.advanceTimersByTimeAsync(30000);
    await refresh;
  });
  expect(aborted).toBe(true);
  expect(view.auth.signOutPhase).toBe("done");
  expect(localStorage.getItem(KEY)).toBeNull();
  expect((await view.supabase.auth.getSession()).data.session).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2); // Refresh + remote revocation only.
  errors.mockRestore();
});
