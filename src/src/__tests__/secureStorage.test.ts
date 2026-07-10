import { describe, test, expect, vi, afterEach } from "vitest";

// Hoisted invoke mock so the module factory can reference it safely.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function fakeLocalStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    has: (k: string) => m.has(k),
  };
}

async function load(underTauri: boolean, ls: ReturnType<typeof fakeLocalStorage>) {
  vi.resetModules();
  invokeMock.mockReset();
  vi.stubGlobal("window", underTauri ? { __TAURI_INTERNALS__: {} } : {});
  vi.stubGlobal("localStorage", ls);
  return (await import("../secureStorage")).secureStorage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const KEY = "sb-wsseitulmcgnolgsrxgh-auth-token";

describe("secureStorage under Tauri", () => {
  test("getItem returns the stored value (Ok(Some)) without migrating", async () => {
    const ls = fakeLocalStorage();
    const s = await load(true, ls);
    invokeMock.mockResolvedValueOnce("TOKEN_VALUE"); // secret_get
    expect(await s.getItem(KEY)).toBe("TOKEN_VALUE");
    expect(invokeMock).toHaveBeenCalledWith("secret_get", { name: KEY });
    expect(invokeMock).toHaveBeenCalledTimes(1); // no secret_set migration
  });

  test("getItem migrates legacy plaintext on Ok(None), then scrubs localStorage", async () => {
    const ls = fakeLocalStorage({ [KEY]: "LEGACY_PLAINTEXT" });
    const s = await load(true, ls);
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "secret_get") return Promise.resolve(null); // Ok(None)
      if (cmd === "secret_set") return Promise.resolve();
      return Promise.resolve();
    });
    expect(await s.getItem(KEY)).toBe("LEGACY_PLAINTEXT");
    expect(invokeMock).toHaveBeenCalledWith("secret_set", { name: KEY, value: "LEGACY_PLAINTEXT" });
    expect(ls.has(KEY)).toBe(false); // plaintext scrubbed only after confirmed write
  });

  test("getItem on secret_get error returns null and KEEPS the plaintext (no silent loss)", async () => {
    const ls = fakeLocalStorage({ [KEY]: "PLAINTEXT" });
    const s = await load(true, ls);
    invokeMock.mockRejectedValueOnce(new Error("decrypt failed")); // secret_get Err
    expect(await s.getItem(KEY)).toBeNull();
    expect(ls.has(KEY)).toBe(true); // NOT deleted, NOT migrated
    expect(invokeMock).toHaveBeenCalledTimes(1); // never attempted secret_set
  });

  test("setItem fails closed — never writes plaintext to localStorage on backend error", async () => {
    const ls = fakeLocalStorage();
    const s = await load(true, ls);
    invokeMock.mockRejectedValueOnce(new Error("write failed")); // secret_set Err
    await s.setItem(KEY, "SECRET");
    expect(ls.has(KEY)).toBe(false);
  });

  test("removeItem deletes the secret and clears any legacy copy", async () => {
    const ls = fakeLocalStorage({ [KEY]: "old" });
    const s = await load(true, ls);
    invokeMock.mockResolvedValueOnce(undefined); // secret_delete
    await s.removeItem(KEY);
    expect(invokeMock).toHaveBeenCalledWith("secret_delete", { name: KEY });
    expect(ls.has(KEY)).toBe(false);
  });
});

describe("secureStorage outside Tauri (browser dev)", () => {
  test("uses localStorage and never calls invoke", async () => {
    const ls = fakeLocalStorage();
    const s = await load(false, ls);
    await s.setItem(KEY, "V");
    expect(await s.getItem(KEY)).toBe("V");
    await s.removeItem(KEY);
    expect(await s.getItem(KEY)).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
