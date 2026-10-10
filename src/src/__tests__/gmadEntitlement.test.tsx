// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGmadDesktopEntitlement, type GmadDecision } from "../gmadEntitlement";
import GmadFirstRunGate from "../GmadFirstRunGate";
import GmadEntitlementPanel from "../GmadEntitlementPanel";

const { invokeMock, auth } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  auth: { session: { access_token: "synthetic-1" }, user: { id: "fixture" }, loading: false, busy: false,
    error: null, lastAuthEvent: "SIGNED_IN", signOutPhase: "idle", signOutWarning: null,
    signInWithGoogle: vi.fn(), signOut: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../updateChannel", () => ({
  checkChannelUpdate: vi.fn(async () => null),
  resolveUpdateChannel: () => ({ channel: "stable", source: "fixture" }),
}));
vi.mock("../auth", () => ({ useAuth: () => auth }));

const eligible: GmadDecision = { state: "eligible", gid: "G-FIXTURE", stale: false };
let root: ReturnType<typeof createRoot>;
let value: ReturnType<typeof useGmadDesktopEntitlement>;
let states: string[];
function Probe() { value = useGmadDesktopEntitlement(); states.push(value.state); return <p>{value.state}</p>; }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.session = { access_token: "synthetic-1" }; auth.user = { id: "fixture" };
  auth.lastAuthEvent = "SIGNED_IN"; auth.signOutPhase = "idle";
  states = [];
  invokeMock.mockReset().mockImplementation(async (cmd: string) => cmd === "verify_gmad_entitlement" ? eligible : undefined);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<Probe />)); }
async function rotate() {
  auth.session = { access_token: "synthetic-2" }; auth.lastAuthEvent = "TOKEN_REFRESHED";
  await render();
}

it("gates a background rejection after earlier eligibility and allows a successful retry", async () => {
  await render(); expect(value.state).toBe("eligible");
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "verify_gmad_entitlement") throw new Error("expired grace; native locked");
  });
  states = [];
  await rotate();
  expect(states).not.toContain("loading");
  expect(value.state).toBe("offline_or_unavailable");
  expect(value.decision).toBeNull();
  invokeMock.mockImplementation(async (cmd: string) => cmd === "verify_gmad_entitlement" ? eligible : undefined);
  await act(async () => { await value.refresh(); });
  expect(value.state).toBe("eligible");
});

it("keeps usable stale grace eligible without loading flicker or extra native lock", async () => {
  await render();
  invokeMock.mockClear().mockImplementation(async (cmd: string) => cmd === "verify_gmad_entitlement" ? { ...eligible, stale: true } : undefined);
  states = []; await rotate();
  expect(value.state).toBe("eligible"); expect(value.decision?.stale).toBe(true);
  expect(states).not.toContain("loading");
  expect(invokeMock.mock.calls.some(([cmd]) => cmd === "lock_gmad_runtime")).toBe(false);
});

it("preserves an explicit denial and never treats a later failure as an old grant", async () => {
  await render();
  invokeMock.mockResolvedValue({ state: "no_active_entitlement" });
  await rotate(); expect(value.state).toBe("no_active_entitlement");
  invokeMock.mockImplementation(async (cmd: string) => { if (cmd === "verify_gmad_entitlement") throw new Error("outage"); });
  await act(async () => { await value.refresh({ background: true }); });
  expect(value.state).toBe("offline_or_unavailable"); expect(value.decision).toBeNull();
});

it("ignores a late response after sign-out", async () => {
  await render();
  let resolve!: (decision: GmadDecision) => void;
  invokeMock.mockImplementation((cmd: string) => cmd === "verify_gmad_entitlement" ? new Promise((done) => { resolve = done; }) : Promise.resolve());
  await rotate();
  auth.signOutPhase = "cleaning"; await render();
  await act(async () => { resolve(eligible); });
  expect(value.state).toBe("signing_out"); expect(value.decision).toBeNull();
});

it("locks before verifying a different account and ignores its predecessor's response", async () => {
  await render();
  let resolve!: (decision: GmadDecision) => void;
  invokeMock.mockImplementation((cmd: string) => cmd === "verify_gmad_entitlement" ? new Promise((done) => { resolve = done; }) : Promise.resolve());
  await rotate();
  invokeMock.mockClear().mockImplementation(async (cmd: string) => cmd === "verify_gmad_entitlement" ? { ...eligible, gid: "G-NEW" } : undefined);
  auth.user = { id: "new-fixture" }; auth.session = { access_token: "new-account" }; auth.lastAuthEvent = "SIGNED_IN";
  await render();
  await act(async () => { resolve(eligible); });
  expect(invokeMock.mock.calls[0][0]).toBe("lock_gmad_runtime");
  expect(value.decision?.gid).toBe("G-NEW");
});

it("shows cold-start outage and reports a lock failure without claiming native is locked", async () => {
  invokeMock.mockRejectedValue(new Error("IPC unavailable"));
  await render();
  expect(value.state).toBe("offline_or_unavailable");
  expect(value.authError).toContain("ยังยืนยันการล็อก runtime ไม่ได้");
});

it("unmounts the actual ready deck when background verification rejects", async () => {
  const element = document.createElement("div");
  await act(async () => root.unmount());
  root = createRoot(element);
  function AppFixture() { return <GmadFirstRunGate><div>Fixture deck<GmadEntitlementPanel /></div></GmadFirstRunGate>; }
  await act(async () => root.render(<AppFixture />));
  const enter = [...element.querySelectorAll("button")].find((button) => button.textContent?.includes("Dashboard"));
  expect(enter).toBeDefined();
  const requestsBeforePanel = invokeMock.mock.calls.filter(([cmd]) => cmd === "verify_gmad_entitlement").length;
  await act(async () => { enter!.click(); });
  expect(element.textContent).toContain("Fixture deck");
  // The Account panel consumes the gate decision; it must not start a competing check.
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === "verify_gmad_entitlement")).toHaveLength(requestsBeforePanel);
  invokeMock.mockImplementation(async (cmd: string) => { if (cmd === "verify_gmad_entitlement") throw new Error("expired grace"); });
  auth.session = { access_token: "rotated" }; auth.lastAuthEvent = "TOKEN_REFRESHED";
  await act(async () => root.render(<AppFixture />));
  expect(element.textContent).not.toContain("Fixture deck");
  expect(element.textContent).toContain("ยังยืนยันสิทธิ์ไม่ได้");
});
