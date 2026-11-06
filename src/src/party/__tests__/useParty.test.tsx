// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useParty, type PartyController } from "../useParty";
import { emptyPartyView } from "../partyModel";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
let current: PartyController; let root: Root; let container: HTMLDivElement;
function Harness() { current = useParty(); return <span>{current.view.roomId}</span>; }
const roomId = "1".repeat(32);
const input = { ticket: "a".repeat(64), relayUrl: "https://relay.example", roomId, displayName: "Guest", consent: true };
const connected = { ...emptyPartyView("connected"), roomId, roomGeneration: 1, relayUrl: "https://relay.example/", selfId: "2".repeat(32), ownerId: "3".repeat(32), expiresInMs: 60000 };
function defer<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); native.invoke.mockReset();
  native.invoke.mockResolvedValue(emptyPartyView()); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(<Harness />); });
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("truthful social relay admission", () => {
  it("returns true only for authoritative connected requested room and exact bounded IPC fields", async () => {
    native.invoke.mockResolvedValue(connected);
    await act(async () => { expect(await current.joinSocial(input)).toBe(true); });
    expect(native.invoke).toHaveBeenCalledWith("party_join_social", input);
  });
  it.each([emptyPartyView(), { ...connected, error: "room_full" }, { ...connected, roomId: "4".repeat(32) }, { ...connected, relayUrl: "https://another.example" }, { ...connected, rawToken: "private" }])("refuses to display a failed or unexpected admission %o", async (response) => {
    native.invoke.mockResolvedValue(response);
    await act(async () => { expect(await current.joinSocial(input)).toBe(false); });
    expect(current.view.status).not.toBe("connected");
  });
  it("requires consent and an idle room; it never leaves a preexisting room automatically", async () => {
    await act(async () => { expect(await current.joinSocial({ ...input, consent: false })).toBe(false); });
    expect(native.invoke.mock.calls.filter(([name]) => name === "party_join_social")).toHaveLength(0);
    native.invoke.mockResolvedValue(connected);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await act(async () => { expect(await current.joinSocial(input)).toBe(false); });
    expect(native.invoke).not.toHaveBeenCalledWith("party_leave");
  });
  it("rejects a late successful join after explicit native cancellation", async () => {
    const joining = defer<unknown>(); native.invoke.mockImplementation((name) => name === "party_join_social" ? joining.promise : Promise.resolve(emptyPartyView()));
    let result!: Promise<boolean>; await act(async () => { result = current.joinSocial(input); });
    await act(async () => { expect(await current.leave()).toBe(true); });
    await act(async () => { joining.resolve(connected); expect(await result).toBe(false); });
    expect(current.view.status).toBe("idle");
  });
});
