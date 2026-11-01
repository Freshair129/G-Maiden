// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { generateGid } from "../../gid";
import { emptyPartyView } from "../partyModel";
import type { SocialState } from "../friendsModel";
import type { PartyController } from "../useParty";
const api = vi.hoisted(() => ({ request: vi.fn(), blocked: false, invoke: vi.fn() }));
vi.mock("../friendsApi", () => ({ socialRequest: api.request, sessionSocialRequest: api.request }));
vi.mock("../../securitySession", () => ({ localAuthBlocked: () => api.blocked }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
const module = await import("../useFriends").catch(() => null);
const gid = generateGid({ generation: "P", registeredAt: Date.UTC(2026, 0, 1), cohortSeq: 1 });
const otherGid = generateGid({ generation: "P", registeredAt: Date.UTC(2026, 0, 1), cohortSeq: 2 });
export const fixtureState = { self: { gid, displayName: "Self" }, settings: { presenceVisible: false, allowFriendRequests: true, allowInvites: true }, bindingRevision: 0, friends: [{ gid: otherGid, displayName: "Friend", online: true, onlineForMs: 3000 }], requests: [], invites: [], blocked: [], serverNowMs: 1000, relayOrigin: "https://relay.example" };
function session(id = "a", sid = "11111111-1111-4111-8111-111111111111"): Session {
  return { user: { id, app_metadata: { provider: "google" } }, access_token: `a.${btoa(JSON.stringify({ sub: id, session_id: sid }))}.c` } as Session;
}
function defer<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
let root: Root; let container: HTMLDivElement;
let current: ReturnType<NonNullable<typeof module>["useFriends"]>;
let party: PartyController;
let serverState: SocialState;
function Harness({ account = session(), visible = true }: { account?: Session | null; visible?: boolean }) {
  if (!module) return null;
  current = module.useFriends({ session: account, party, panelVisible: visible });
  return <span>{current.ready ? "ready" : "unavailable"}:{current.state?.friends[0]?.online ? "online" : "offline"}</span>;
}
async function render(account: Session | null = session(), visible = true) { await act(async () => { root.render(<Harness account={account} visible={visible} />); }); }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.blocked = false; api.request.mockReset(); api.invoke.mockReset();
  serverState = structuredClone(fixtureState);
  let revision = 0;
  api.request.mockImplementation(async (v) => {
    if (v.action === "settings") serverState.settings = { presenceVisible: v.presenceVisible, allowFriendRequests: v.allowFriendRequests, allowInvites: v.allowInvites };
    if (v.action === "unlink") serverState.bindingRevision = ++revision;
    if (v.action === "challenge") return { challenge: "a".repeat(64), expiresAtMs: 60000, relayOrigin: "https://relay.example" };
    return v.action === "state" ? structuredClone(serverState) : { ok: true };
  });
  party = { view: emptyPartyView(), elapsedMs: 0, busy: null, error: null, canLeave: false, connect: vi.fn(), leave: vi.fn().mockResolvedValue(true), kick: vi.fn(), rotateInvite: vi.fn(), joinSocial: vi.fn().mockResolvedValue(false) };
  api.invoke.mockResolvedValue({ proof: "eA.YQ" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("CommandDeck Friends lifecycle", () => {
  it("implements the persistent social controller", () => { expect(module?.useFriends).toBeTypeOf("function"); });
  it("does not heartbeat by default; explicit presence survives hiding the panel", async () => {
    expect(module).not.toBeNull(); if (!module) return;
    await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(api.request.mock.calls.filter(([a]) => a.action === "heartbeat")).toHaveLength(0);
    await act(async () => { await current.setPresence(true); });
    await render(session(), false);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(api.request.mock.calls.filter(([a]) => a.action === "heartbeat")).toHaveLength(2);
  });
  it("subtracts full RTT and expires online independently of stalled polling", async () => {
    expect(module).not.toBeNull(); if (!module) return;
    await render();
    const delayed = defer<unknown>(); api.request.mockReturnValueOnce(delayed.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); delayed.resolve(fixtureState); });
    expect(container.textContent).toContain("online");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(container.textContent).toContain("offline");
  });
  it("polls every 15 seconds with one state request in flight", async () => {
    expect(module).not.toBeNull(); if (!module) return;
    const stalled = defer<unknown>(); api.request.mockReturnValue(stalled.promise);
    await render(); await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(api.request.mock.calls.filter(([a]) => a.action === "state")).toHaveLength(1);
  });
  it("fences a late account response and blocks local signed-out controls", async () => {
    expect(module).not.toBeNull(); if (!module) return;
    const old = defer<unknown>(); api.request.mockReturnValueOnce(old.promise);
    await render(); await render(session("b"));
    await act(async () => { old.resolve({ ...fixtureState, self: { gid, displayName: "OLD ACCOUNT" } }); });
    expect(current.state?.self.displayName).not.toBe("OLD ACCOUNT");
    api.blocked = true; await render(session("b"));
    await act(async () => { await current.mutate({ action: "request", gid: otherGid }); });
    expect(current.ready).toBe(false);
    expect(api.request.mock.calls.filter(([a]) => a.action === "request")).toHaveLength(0);
    expect(party.leave).not.toHaveBeenCalled();
  });
});

const room = (roomId = "1".repeat(32), roomGeneration = 1) => ({ ...emptyPartyView("connected"), relayUrl: "https://relay.example/", roomGeneration, roomId, selfId: "2".repeat(32), ownerId: "2".repeat(32), expiresInMs: 600000, members: [{ memberId: "2".repeat(32), displayName: "Self", isOwner: true, state: "waiting" as const, ageMs: null, sample: null }] });
const inviteId = "33333333-3333-4333-8333-333333333333";
function withIncomingInvite() {
  serverState.invites = [{ id: inviteId, person: { gid: otherGid, displayName: "Friend" }, direction: "incoming", status: "pending", expiresAtMs: 301000 }];
  const base = api.request.getMockImplementation()!;
  api.request.mockImplementation(async (...args) => args[0].action === "invite_accept" ? { ticket: "a".repeat(64), relayOrigin: "https://relay.example", roomId: "1".repeat(32), expiresAtMs: 61000 } : base(...args));
}
describe("profile binding revision and consent fences", () => {
  it("links only after explicit consent and renews with consent false across navigation", async () => {
    party = { ...party, view: room(), canLeave: true }; await render();
    expect(current.linked).toBe(false); expect(current.linkAvailable).toBe(true);
    expect(api.request.mock.calls.filter(([a]) => a.action === "link")).toHaveLength(0);
    await act(async () => { expect(await current.setLink(true)).toBe(true); });
    expect(api.request).toHaveBeenCalledWith({ action: "challenge", purpose: "link", recipientGid: null, bindingRevision: 1 }, expect.any(String), expect.any(AbortSignal));
    expect(api.request.mock.calls.find(([a]) => a.action === "link")?.[0]).toEqual({ action: "link", proof: "eA.YQ", bindingRevision: 1, consent: true });
    await render(session(), false);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(api.request.mock.calls.filter(([a]) => a.action === "link").slice(-1)[0]?.[0].consent).toBe(false);
  });
  it("does not send a delayed initial room-A link after unlink and fresh room-B consent", async () => {
    party = { ...party, view: room(), canLeave: true }; await render();
    const mint = defer<unknown>(); const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((...args) => args[0].action === "challenge" && args[0].purpose === "link" ? mint.promise : base(...args));
    let old!: Promise<boolean>; await act(async () => { old = current.setLink(true); });
    await act(async () => { await current.setLink(false); });
    party = { ...party, view: room("4".repeat(32)) }; await render();
    api.request.mockImplementation(base);
    await act(async () => { expect(await current.setLink(true)).toBe(true); });
    const revision = serverState.bindingRevision;
    await act(async () => { mint.resolve({ challenge: "a".repeat(64), expiresAtMs: 60000, relayOrigin: "https://relay.example" }); expect(await old).toBe(false); });
    const links = api.request.mock.calls.filter(([a]) => a.action === "link");
    expect(links).toHaveLength(1); expect(links[0][0].bindingRevision).toBe(revision); expect(current.linked).toBe(true);
  });
  it("rejects late initial-link completion and requires revision reconciliation after generation change", async () => {
    party = { ...party, view: room(), canLeave: true }; await render();
    const link = defer<unknown>(); const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((...args) => args[0].action === "link" ? link.promise : base(...args));
    let old!: Promise<boolean>; await act(async () => { old = current.setLink(true); });
    api.request.mockImplementation((...args) => args[0].action === "unlink" ? Promise.reject(new Error("offline")) : base(...args));
    party = { ...party, view: room("1".repeat(32), 2) }; await render();
    expect(current.linkAvailable).toBe(false); expect(current.linked).toBe(false);
    await act(async () => { expect(await current.setLink(true)).toBe(false); link.resolve({ ok: true }); expect(await old).toBe(false); });
    api.request.mockImplementation(base);
    await act(async () => { await current.setLink(false); });
    expect(current.linkAvailable).toBe(true); expect(current.linked).toBe(false);
    await act(async () => { expect(await current.setLink(true)).toBe(true); });
    expect(api.request.mock.calls.filter(([a]) => a.action === "link").slice(-1)[0]?.[0].bindingRevision).toBe(serverState.bindingRevision);
  });
  it("does not renew account A into account B after a delayed challenge", async () => {
    party = { ...party, view: room(), canLeave: true }; await render();
    await act(async () => { await current.setLink(true); });
    const mint = defer<unknown>(); const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((...args) => args[0].action === "challenge" ? mint.promise : base(...args));
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    await render(session("b"));
    api.request.mockImplementation(base);
    await act(async () => { mint.resolve({ challenge: "a".repeat(64), expiresAtMs: 60000, relayOrigin: "https://relay.example" }); });
    expect(current.linked).toBe(false);
    expect(api.request.mock.calls.filter(([a]) => a.action === "link")).toHaveLength(1);
    // A foreign member binding rejection is surfaced without claiming a link.
    api.request.mockImplementation((...args) => args[0].action === "link" ? Promise.reject(new Error("conflict")) : base(...args));
    await act(async () => { expect(await current.setLink(true)).toBe(false); });
    expect(current.linked).toBe(false);
  });
});

describe("invitation admission and account cancellation", () => {
  it("requires prior leave and never treats a broker ticket or failed native admission as joined", async () => {
    withIncomingInvite(); party = { ...party, view: room(), canLeave: true }; await render();
    await act(async () => { expect(await current.acceptInvite(inviteId, "Guest", true)).toBe(false); });
    expect(api.request.mock.calls.filter(([a]) => a.action === "invite_accept")).toHaveLength(0);
    party = { ...party, view: emptyPartyView(), canLeave: false }; await render();
    await act(async () => { expect(await current.acceptInvite(inviteId, "Guest", false)).toBe(false); });
    await act(async () => { expect(await current.acceptInvite(inviteId, "Guest", true)).toBe(false); });
    expect(party.joinSocial).toHaveBeenCalledWith({ ticket: "a".repeat(64), relayUrl: "https://relay.example", roomId: "1".repeat(32), displayName: "Guest", consent: true });
    expect(current.error).toContain("คุณยังไม่ได้เข้าห้อง");
  });
  it("cancels an account-A native join before account-B actions can start", async () => {
    withIncomingInvite(); await render(); const joining = defer<boolean>(); const leaving = defer<boolean>();
    vi.mocked(party.joinSocial).mockReturnValue(joining.promise); vi.mocked(party.leave).mockReturnValue(leaving.promise);
    let admission!: Promise<boolean>; await act(async () => { admission = current.acceptInvite(inviteId, "Guest", true); });
    await render(session("b"));
    expect(party.leave).toHaveBeenCalledTimes(1); expect(current.ready).toBe(false);
    await act(async () => { expect(await current.mutate({ action: "request", gid: otherGid })).toBe(false); });
    await act(async () => { leaving.resolve(true); });
    expect(current.ready).toBe(true);
    await act(async () => { joining.resolve(true); expect(await admission).toBe(false); });
    expect(current.error ?? "").not.toContain("เข้าร่วมห้องแล้ว");
  });
  it("keeps account controls blocked when native pending-join cancellation fails", async () => {
    withIncomingInvite(); await render(); const joining = defer<boolean>(); vi.mocked(party.joinSocial).mockReturnValue(joining.promise); vi.mocked(party.leave).mockResolvedValue(false);
    await act(async () => { void current.acceptInvite(inviteId, "Guest", true); });
    await render(session("b")); expect(current.ready).toBe(false);
    await act(async () => { joining.resolve(true); }); expect(current.ready).toBe(false);
  });
  it("expires and removes an invitation even with all subsequent state polling stalled", async () => {
    withIncomingInvite(); serverState.invites[0].expiresAtMs = 2000; await render();
    expect(current.state?.invites).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(current.state?.invites).toHaveLength(0);
    await act(async () => { expect(await current.acceptInvite(inviteId, "Guest", true)).toBe(false); });
  });
});

it("keeps fresh linking disabled if acknowledged unlink reload does not advance its known revision", async () => {
  party = { ...party, view: room(), canLeave: true }; await render();
  const base = api.request.getMockImplementation()!;
  api.request.mockImplementation((...args) => args[0].action === "unlink" ? Promise.resolve({ ok: true }) : base(...args));
  await act(async () => { await current.setLink(false); });
  expect(current.linkAvailable).toBe(false);
});

it("rejects an already-expired returned ticket before invoking native admission", async () => {
  withIncomingInvite(); const base = api.request.getMockImplementation()!;
  api.request.mockImplementation((...args) => args[0].action === "invite_accept" ? Promise.resolve({ ticket: "a".repeat(64), relayOrigin: "https://relay.example", roomId: "1".repeat(32), expiresAtMs: 999 }) : base(...args));
  await render(); await act(async () => { expect(await current.acceptInvite(inviteId, "Guest", true)).toBe(false); });
  expect(party.joinSocial).not.toHaveBeenCalled();
});

it("intersects verified roster bindings with native membership, generation and monotonic lease", async () => {
  party = { ...party, view: room(), canLeave: true };
  const base = api.request.getMockImplementation()!;
  api.request.mockImplementation((...args) => args[0].action === "roster" ? Promise.resolve({ roomId: "1".repeat(32), generation: 1, serverNowMs: 1000, bindings: [
    { memberId: "2".repeat(32), person: { gid, displayName: "Self" }, expiresAtMs: 2000 },
    { memberId: "3".repeat(32), person: { gid: otherGid, displayName: "Absent" }, expiresAtMs: 61000 },
  ] }) : base(...args));
  await render(); expect(current.bindings.map((b) => b.memberId)).toEqual(["2".repeat(32)]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(current.bindings).toHaveLength(0);
  party = { ...party, view: room("1".repeat(32), 2) }; await render(); expect(current.bindings).toHaveLength(0);
});

it("keeps custom guest relays free of social room controls and preserves guest membership on signout", async () => {
  party = { ...party, view: { ...room(), relayUrl: "https://custom.example/" }, canLeave: true };
  await render(); expect(current.roomAvailable).toBe(false); expect(current.linkAvailable).toBe(false);
  await render(null); expect(party.leave).not.toHaveBeenCalled(); expect(current.ready).toBe(false);
});

it("retries a failed native cancellation before restoring new-account controls", async () => {
  withIncomingInvite(); await render(); const joining = defer<boolean>();
  vi.mocked(party.joinSocial).mockReturnValue(joining.promise); vi.mocked(party.leave).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await act(async () => { void current.acceptInvite(inviteId, "Guest", true); }); await render(session("b")); expect(current.ready).toBe(false);
  await act(async () => { await current.refresh(); }); expect(current.ready).toBe(true); expect(party.leave).toHaveBeenCalledTimes(2);
  await act(async () => { joining.resolve(true); });
});

it("keeps one state read in flight and no hidden heartbeat during a StrictMode effect restart", async () => {
  const { StrictMode } = await import("react");
  const deferred = defer<unknown>(); api.request.mockImplementation(async (v) => v.action === "state" ? deferred.promise : { ok: true });
  await act(async () => { root.render(<StrictMode><Harness /></StrictMode>); });
  expect(api.request.mock.calls.filter(([v]) => v.action === "state")).toHaveLength(1);
  expect(api.request.mock.calls.filter(([v]) => v.action === "heartbeat")).toHaveLength(0);
  await act(async () => { deferred.resolve(fixtureState); });
});

it("refuses initial profile linking when the current native member already has another live account binding", async () => {
  party = { ...party, view: room(), canLeave: true }; const base = api.request.getMockImplementation()!;
  api.request.mockImplementation((...args) => args[0].action === "roster" ? Promise.resolve({ roomId: "1".repeat(32), generation: 1, serverNowMs: 1000, bindings: [{ memberId: "2".repeat(32), person: { gid: otherGid, displayName: "Other account" }, expiresAtMs: 61000 }] }) : base(...args));
  await render(); expect(current.linkAvailable).toBe(false);
  await act(async () => { expect(await current.setLink(true)).toBe(false); });
  expect(api.request.mock.calls.filter(([a]) => a.action === "link")).toHaveLength(0);
});
