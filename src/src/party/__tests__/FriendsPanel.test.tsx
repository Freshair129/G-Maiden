// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { generateGid } from "../../gid";
import { emptyPartyView } from "../partyModel";
import type { FriendsController } from "../useFriends";
import type { PartyController } from "../useParty";
import { FriendsPanel } from "../FriendsPanel";
const gid = generateGid({ generation: "P", registeredAt: Date.UTC(2026, 0, 1), cohortSeq: 2 });
const person = { gid, displayName: "Friend" };
const incoming = "11111111-1111-4111-8111-111111111111";
const outgoing = "22222222-2222-4222-8222-222222222222";
const request = (id: string, direction: "incoming" | "outgoing") => ({ id, person, direction, expiresAtMs: 300000 });
let friends: FriendsController; let party: PartyController; let container: HTMLDivElement; let root: Root;
async function click(text: string) { const b = [...container.querySelectorAll("button")].find((x) => x.textContent === text); if (!b) throw new Error(`missing ${text}`); await act(async () => { b.click(); }); }
async function render() { await act(async () => { root.render(<FriendsPanel friends={friends} party={party} />); }); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  friends = { nowMs: 1000, ready: true, signedIn: true, busy: false, error: null, linked: false, linkAvailable: true, roomAvailable: true, bindings: [], state: { self: person, settings: { presenceVisible: false, allowFriendRequests: true, allowInvites: true }, bindingRevision: 0, friends: [{ ...person, online: false, onlineForMs: 0 }], requests: [request(incoming, "incoming"), request(outgoing, "outgoing")], invites: [{ ...request(incoming, "incoming"), status: "pending" }, { ...request(outgoing, "outgoing"), status: "accepted" }], blocked: [person], serverNowMs: 1000, relayOrigin: "https://relay.example" }, mutate: vi.fn().mockResolvedValue(true), setPresence: vi.fn(), setSettings: vi.fn(), setLink: vi.fn(), invite: vi.fn(), acceptInvite: vi.fn().mockResolvedValue(false), refresh: vi.fn() };
  party = { view: emptyPartyView(), elapsedMs: 0, busy: null, error: null, canLeave: false, connect: vi.fn(), joinSocial: vi.fn(), leave: vi.fn(), kick: vi.fn(), rotateInvite: vi.fn() };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });
describe("Friends controls and fresh sharing consent", () => {
  it("starts presence and each invitation sharing consent unchecked", async () => {
    await render(); expect(container.querySelector<HTMLInputElement>('input[name="presenceVisible"]')?.checked).toBe(false);
    expect(container.querySelector<HTMLInputElement>('input[name="inviteConsent"]')?.checked).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"][data-join]')?.disabled).toBe(true);
  });
  it("submits exact relationship and invite actions", async () => {
    await render();
    for (const [text, body] of [
      ["รับคำขอ", { action: "request_accept", requestId: incoming }], ["ปฏิเสธคำขอ", { action: "request_decline", requestId: incoming }],
      ["ยกเลิกคำขอ", { action: "request_cancel", requestId: outgoing }], ["เลิกเป็นเพื่อน", { action: "remove", gid }], ["บล็อก", { action: "block", gid }], ["เลิกบล็อก", { action: "unblock", gid }],
      ["ปฏิเสธคำเชิญ", { action: "invite_decline", inviteId: incoming }], ["ยกเลิกคำเชิญ", { action: "invite_revoke", inviteId: outgoing }],
    ] as const) { await click(text); expect(friends.mutate).toHaveBeenLastCalledWith(body); }
  });
  it("resets invitation consent immediately after every attempt including a failed admission", async () => {
    await render();
    const name = container.querySelector<HTMLInputElement>('input[name="inviteDisplayName"]')!;
    const consent = container.querySelector<HTMLInputElement>('input[name="inviteConsent"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Guest"); name.dispatchEvent(new Event("input", { bubbles: true })); consent.click(); });
    await act(async () => { consent.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(friends.acceptInvite).toHaveBeenCalledWith(incoming, "Guest", true);
    expect(consent.checked).toBe(false);
  });
  it("requires explicit leave before accepting while in a room", async () => {
    party = { ...party, canLeave: true };
    await render();
    expect(container.textContent).toContain("กรุณาออกจากห้องปัจจุบันก่อน");
    expect(container.querySelector<HTMLButtonElement>('button[data-join]')?.disabled).toBe(true);
    expect(friends.acceptInvite).not.toHaveBeenCalled();
  });
  it("has internally bounded, keyboard accessible lists and no autofocus", async () => {
    friends.state!.friends = Array.from({ length: 200 }, (_, i) => ({ gid: generateGid({ generation: "P", registeredAt: Date.UTC(2026, 0, 1), cohortSeq: i + 3 }), displayName: "Synthetic friend", online: false, onlineForMs: 0 }));
    friends.state!.requests = Array.from({ length: 50 }, (_, i) => request(`request-${i}`, "incoming"));
    friends.state!.invites = Array.from({ length: 50 }, (_, i) => ({ ...request(`invite-${i}`, "outgoing"), status: "pending" }));
    friends.state!.blocked = Array.from({ length: 500 }, (_, i) => ({ ...person, gid: `${gid}-${i}` }));
    await render(); expect(container.querySelectorAll('.g-friends-list[tabindex="0"]')).toHaveLength(4);
    expect(container.querySelector("[autofocus]")).toBeNull();
  });
});

it("sends an exact full GID request and exposes owner invitation without automatic joining", async () => {
  await render(); const input = container.querySelector<HTMLInputElement>('input[name="friendGid"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, gid.toLowerCase()); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(friends.mutate).toHaveBeenCalledWith({ action: "request", gid });
  await click("เชิญเข้าห้อง"); expect(friends.invite).toHaveBeenCalledWith(gid); expect(party.joinSocial).not.toHaveBeenCalled();
});

it("discloses canonical relay and remaining invitation expiry, and resets consent when navigating away", async () => {
  await render(); await click("คำเชิญ 2");
  expect(container.textContent).toContain("https://relay.example"); expect(container.textContent).toContain("4:59");
  const consent = container.querySelector<HTMLInputElement>('input[name="inviteConsent"]')!;
  await act(async () => { consent.click(); }); expect(consent.checked).toBe(true);
  await click("เพื่อน 1"); await click("คำเชิญ 2");
  expect(container.querySelector<HTMLInputElement>('input[name="inviteConsent"]')?.checked).toBe(false);
});

it("submits explicit presence, receive controls, and profile link settings", async () => {
  await render(); await click("ความเป็นส่วนตัว");
  const toggle = async (name: string) => {
    const label = [...container.querySelectorAll("label")].find((x) => x.textContent?.includes(name))!;
    await act(async () => { label.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
  };
  await toggle("แสดงว่าฉันออนไลน์"); expect(friends.setPresence).toHaveBeenCalledWith(true);
  await toggle("รับคำขอเป็นเพื่อน"); expect(friends.setSettings).toHaveBeenCalledWith({ presenceVisible: false, allowFriendRequests: false, allowInvites: true });
  await toggle("รับคำเชิญเข้าห้อง"); expect(friends.setSettings).toHaveBeenCalledWith({ presenceVisible: false, allowFriendRequests: true, allowInvites: false });
  await toggle("เชื่อมโปรไฟล์ของฉัน"); expect(friends.setLink).toHaveBeenCalledWith(true);
});
