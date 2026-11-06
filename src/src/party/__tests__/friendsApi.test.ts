// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), blocked: false }));
vi.mock("../../supabase", () => ({ supabase: { auth: { getSession: auth.getSession } } }));
vi.mock("../../securitySession", () => ({ localAuthBlocked: () => auth.blocked }));
import * as api from "../friendsApi";
import { socialSessionKey } from "../friendsModel";
function session(user: string): Session { return { user: { id: user, app_metadata: { provider: "google" } }, access_token: `a.${btoa(JSON.stringify({ sub: user, session_id: "11111111-1111-4111-8111-111111111111" }))}.c` } as Session; }
beforeEach(() => { auth.blocked = false; auth.getSession.mockReset(); auth.getSession.mockResolvedValue({ data: { session: session("b") } }); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}'))); });
describe("account broker client", () => {
  it("rejects account-A intent before HTTP if provider switched to account B before React rendered", async () => {
    expect("sessionSocialRequest" in api).toBe(true);
    if (!("sessionSocialRequest" in api)) return;
    await expect(api.sessionSocialRequest({ action: "heartbeat" }, socialSessionKey(session("a"))!)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("denies locally blocked sessions before touching auth or network", async () => {
    auth.blocked = true; await expect(api.socialRequest({ action: "heartbeat" })).rejects.toThrow();
    expect(auth.getSession).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unknown response keys and forbids redirect following", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true,"email":"secret"}'));
    await expect(api.socialRequest({ action: "heartbeat" })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "error", cache: "no-store" }));
  });
});

it.each(["account", "provider session"])("rejects a late response after %s changes", async (kind) => {
  const first = session("a");
  const second = kind === "account" ? session("b") : { ...first, access_token: `a.${btoa(JSON.stringify({ sub: "a", session_id: "22222222-2222-4222-8222-222222222222" }))}.c` };
  auth.getSession.mockResolvedValueOnce({ data: { session: first } }).mockResolvedValueOnce({ data: { session: second } });
  await expect(api.socialRequest({ action: "heartbeat" })).rejects.toThrow("invalid_session");
});

it("enforces the streamed response byte bound even without Content-Length", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(" ".repeat(262145)));
  await expect(api.socialRequest({ action: "heartbeat" })).rejects.toThrow("social_unavailable");
});
