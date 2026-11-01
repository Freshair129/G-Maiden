// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GPartyPage from "../GPartyPage";
import { emptyPartyView } from "../partyModel";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));

const roomId = "3".repeat(32);
const selfId = "1".repeat(32);
const otherId = "2".repeat(32);
const invite = `GMP1.${roomId}.${"a".repeat(64)}`;
const connected = {
  status: "connected", roomId, selfId, ownerId: selfId, invite,
  expiresInMs: 120000, error: null,
  members: [{
    memberId: otherId, displayName: "เพื่อนเรา", isOwner: false,
    state: "live", ageMs: 100,
    sample: { hero: "npc_dota_hero_crystal_maiden", level: 14, hp: 612, maxHp: 1200, manaPercent: 41, alive: true, respawnSeconds: 0 },
  }],
};

let container: HTMLDivElement;
let root: Root;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function mount() {
  await act(async () => { root.render(<GPartyPage />); });
}

async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => { button.click(); });
}

async function fill(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`Missing input: ${name}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function consent() {
  const checkbox = container.querySelector<HTMLInputElement>('input[name="consent"]');
  if (!checkbox) throw new Error("Missing consent checkbox");
  await act(async () => { checkbox.click(); });
}

async function submit() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.invoke.mockReset();
  native.invoke.mockResolvedValue(emptyPartyView());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("G-Party consent and lifecycle", () => {
  it("only reads state on mount and requires consent before creating a room", async () => {
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    await mount();
    expect(native.invoke.mock.calls.every(([name]) => name === "party_get_state")).toBe(true);
    expect(container.querySelectorAll('[role="meter"]').length).toBe(0);
    await fill("relayUrl", "https://relay.example");
    await fill("displayName", "เมเดน");
    await submit();
    expect(native.invoke).not.toHaveBeenCalledWith("party_connect", expect.anything());
    await consent();
    native.invoke.mockImplementation(async (name) => name === "party_connect" ? connected : emptyPartyView());
    await submit();
    expect(native.invoke).toHaveBeenCalledWith("party_connect", {
      relayUrl: "https://relay.example", displayName: "เมเดน", invite: null, consent: true,
    });
    expect(storageSpy).not.toHaveBeenCalled();
    storageSpy.mockRestore();
  });

  it("joins only with a valid invite and a checked consent control", async () => {
    await mount();
    await click("เข้าร่วมปาร์ตี้");
    await fill("relayUrl", "http://127.0.0.1:8787");
    await fill("displayName", "เพื่อน");
    await fill("invite", invite);
    await consent();
    await submit();
    expect(native.invoke).toHaveBeenCalledWith("party_connect", {
      relayUrl: "http://127.0.0.1:8787", displayName: "เพื่อน", invite, consent: true,
    });
  });

  it("restores the retry form after native confirms that a failed connection has no membership", async () => {
    await mount();
    await fill("relayUrl", "https://relay.example");
    await fill("displayName", "เมเดน");
    await consent();
    native.invoke.mockImplementation((name) => name === "party_connect"
      ? Promise.reject("room_full")
      : Promise.resolve({ ...emptyPartyView("error"), error: "room_full" }));
    await submit();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(container.querySelector('input[name="relayUrl"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[name="consent"]')?.checked).toBe(false);
    expect(native.invoke).not.toHaveBeenCalledWith("party_leave");
  });

  it("ages the last response independently while another IPC request is stalled", async () => {
    const stalled = deferred<unknown>();
    native.invoke.mockResolvedValueOnce(connected).mockReturnValue(stalled.promise);
    await mount();
    expect(container.textContent).toContain("612 / 1200");
    await act(async () => { await vi.advanceTimersByTimeAsync(2001); });
    expect(container.textContent).not.toContain("612 / 1200");
    expect(container.textContent).toContain("ข้อมูลเก่า");
    expect(container.querySelectorAll('[role="meter"]').length).toBe(0);
    expect(native.invoke.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("counts IPC transit time before admitting a delayed native snapshot", async () => {
    const delayed = deferred<unknown>();
    native.invoke.mockReturnValue(delayed.promise);
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await act(async () => { delayed.resolve(connected); });
    expect(container.textContent).not.toContain("612 / 1200");
    expect(container.textContent).toContain("ข้อมูลเก่า");
  });

  it("expires health exactly after the freshness deadline between polling ticks", async () => {
    const stalled = deferred<unknown>();
    native.invoke.mockResolvedValueOnce({ ...connected, members: [{ ...connected.members[0], ageMs: 0 }] }).mockReturnValue(stalled.promise);
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(container.textContent).toContain("612 / 1200");
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(container.textContent).not.toContain("612 / 1200");
  });

  it("withholds the party snapshot when its room lifetime expires", async () => {
    const stalled = deferred<unknown>();
    native.invoke.mockResolvedValueOnce({ ...connected, expiresInMs: 700 }).mockReturnValue(stalled.promise);
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(container.textContent).not.toContain("612 / 1200");
    expect(container.textContent).toContain("ปาร์ตี้ปิดแล้ว");
  });

  it("withholds health for another match and reports unknown values", async () => {
    native.invoke.mockResolvedValue({ ...connected, members: [{ ...connected.members[0], state: "different_match", sample: null, ageMs: null }] });
    await mount();
    expect(container.textContent).toContain("คนละแมตช์หรือทีม");
    expect(container.textContent).not.toContain("612 / 1200");
    expect(container.textContent).toContain("ยังไม่ทราบ");
  });

  it("hides all health on IPC error without displaying raw native error details", async () => {
    native.invoke.mockResolvedValueOnce(connected).mockRejectedValue(new Error("memberToken=must-not-render"));
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(container.textContent).not.toContain("612 / 1200");
    expect(container.textContent).not.toContain("must-not-render");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="meter"]').length).toBe(0);
  });

  it("keeps stop available when the first state read fails and native membership is unknown", async () => {
    native.invoke.mockRejectedValue("unavailable");
    await mount();
    await click("ออกและหยุดแชร์");
    expect(native.invoke).toHaveBeenCalledWith("party_leave");
    expect(container.querySelectorAll('[role="meter"]').length).toBe(0);
  });

  it("rejects a malformed snapshot instead of displaying invalid health", async () => {
    native.invoke.mockResolvedValue({ ...connected, members: [{ ...connected.members[0], sample: { ...connected.members[0].sample, hp: 1201 } }] });
    await mount();
    expect(container.textContent).not.toContain("1201");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="meter"]').length).toBe(0);
  });

  it("clears immediately on leave and rejects a late pre-leave poll reply", async () => {
    const oldPoll = deferred<unknown>();
    const leaving = deferred<unknown>();
    native.invoke.mockImplementation((name) => {
      if (name === "party_leave") return leaving.promise;
      return native.invoke.mock.calls.filter(([command]) => command === "party_get_state").length === 1
        ? Promise.resolve(connected) : oldPoll.promise;
    });
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await click("ออกและหยุดแชร์");
    expect(container.textContent).not.toContain("612 / 1200");
    expect(container.textContent).not.toContain(invite);
    await act(async () => { oldPoll.resolve(connected); });
    expect(container.textContent).not.toContain("612 / 1200");
    await act(async () => { leaving.resolve(emptyPartyView()); });
    expect(container.querySelector<HTMLInputElement>('input[name="consent"]')?.checked).toBe(false);
    expect(native.invoke).toHaveBeenCalledWith("party_leave");
  });

  it("does not undo a newer connection when an older idle read resolves", async () => {
    const initialRead = deferred<unknown>();
    native.invoke.mockImplementation((name) => name === "party_connect" ? Promise.resolve(connected) : initialRead.promise);
    await mount();
    await fill("relayUrl", "https://relay.example");
    await fill("displayName", "เมเดน");
    await consent();
    await submit();
    expect(container.textContent).toContain("612 / 1200");
    await act(async () => { initialRead.resolve(emptyPartyView()); });
    expect(container.textContent).toContain("612 / 1200");
  });

  it("keeps leave retry available when native stop fails", async () => {
    native.invoke.mockImplementation((name) => name === "party_leave" ? Promise.reject("private-error") : Promise.resolve(connected));
    await mount();
    await click("ออกและหยุดแชร์");
    expect(container.textContent).not.toContain("612 / 1200");
    expect(container.textContent).toContain("ยังยืนยันการหยุดแชร์ไม่ได้");
    await click("ออกและหยุดแชร์");
    expect(native.invoke.mock.calls.filter(([name]) => name === "party_leave")).toHaveLength(2);
  });

  it("cannot revive a connection whose join completed after leave", async () => {
    const joining = deferred<unknown>();
    native.invoke.mockImplementation((name) => name === "party_connect" ? joining.promise : Promise.resolve(emptyPartyView()));
    await mount();
    await fill("relayUrl", "https://relay.example");
    await fill("displayName", "เมเดน");
    await consent();
    await submit();
    await click("ออกและหยุดแชร์");
    await act(async () => { joining.resolve(connected); });
    expect(container.textContent).not.toContain("612 / 1200");
    expect(container.querySelector<HTMLInputElement>('input[name="consent"]')?.checked).toBe(false);
  });

  it("provides host kick and invite rotation without exposing credentials", async () => {
    native.invoke.mockResolvedValue(connected);
    await mount();
    await click("นำออก");
    expect(native.invoke).toHaveBeenCalledWith("party_kick", { memberId: otherId });
    expect(container.textContent).toContain("เปลี่ยนรหัสเชิญ");
    await click("เปลี่ยนรหัสเชิญ");
    expect(native.invoke).toHaveBeenCalledWith("party_rotate_invite");
    expect(container.textContent).not.toContain("memberToken");
  });

  it("limits host controls to the owner and exposes readable, labelled meters", async () => {
    native.invoke.mockResolvedValue({ ...connected, selfId: otherId, invite: null });
    await mount();
    const buttons = [...container.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons).not.toContain("เปลี่ยนรหัสเชิญ");
    expect(buttons).not.toContain("นำออก");
    const meter = container.querySelector('[role="meter"][aria-label="HP ของ เพื่อนเรา"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("612");
    expect(meter?.getAttribute("aria-valuemax")).toBe("1200");
    expect(meter?.getAttribute("aria-valuetext")).toBe("612 / 1200");
  });

  it("stops frontend polling without leaving the native session when the tab unmounts", async () => {
    native.invoke.mockResolvedValue(connected);
    await mount();
    await act(async () => { root.unmount(); });
    const calls = native.invoke.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(native.invoke.mock.calls).toHaveLength(calls);
    expect(native.invoke).not.toHaveBeenCalledWith("party_leave");
  });
});
