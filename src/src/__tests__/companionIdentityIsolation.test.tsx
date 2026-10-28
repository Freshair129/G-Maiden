// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OpenDotaProfile } from "../live/opendota";

const fixture = vi.hoisted(() => ({ identity: vi.fn(), profile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onFocusChanged: vi.fn() }) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../live/identity", () => ({ loadIdentity: fixture.identity, saveIdentity: vi.fn(), IDENTITY_EVENT: "identity-isolation" }));
vi.mock("../live/opendota", () => ({ fetchOpenDotaProfile: fixture.profile }));
let root: Root;
let data: import("../companion").CompanionData;
const oldProfile: OpenDotaProfile = { accountId: 1, public: true, rank: "OLD-RANK", mmr: 9999,
  winRate: 99, games: 1234, kda: 9, mainHero: { name: "Axe", games: 100, winRate: 99 },
  baselines: { gpmAvg: 999, xpmAvg: 888, kAvg: 9, dAvg: 1, aAvg: 9, csAvg: 999, deniesAvg: 88, sampleSize: 20 } };
beforeEach(async () => {
  vi.resetModules(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.identity.mockReset().mockResolvedValue({ accountId: 1 });
  fixture.profile.mockReset().mockResolvedValue(oldProfile);
  const { useCompanionData } = await import("../companion");
  function Observer() { data = useCompanionData().data; return null; }
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Observer />));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function identity(next: number | null) {
  fixture.identity.mockResolvedValue(next === null ? null : { accountId: next });
  await act(async () => { window.dispatchEvent(new Event("identity-isolation")); });
}
it.each([null, 2])("clears old Steam profile and derived baselines while identity %s waits", async (next) => {
  expect(data.heroes[0].profile.games).toBe(1234);
  fixture.profile.mockReturnValue(new Promise(() => {}));
  await identity(next);
  expect(data.heroes[0].profile.games).toBe(0);
  expect(JSON.stringify(data.match.player)).not.toContain("999");
  expect(data.weeklyReport.winRate).not.toBe(99);
  expect(data.insights.powerScore).not.toBe(9999);
});
it("rejects a delayed old profile after unlink and permits relinking the same Steam", async () => {
  let resolve!: (value: OpenDotaProfile) => void;
  fixture.profile.mockReturnValueOnce(new Promise((complete) => { resolve = complete; }));
  await identity(2);
  await identity(null);
  await act(async () => resolve({ ...oldProfile, accountId: 2, games: 4567 }));
  expect(data.heroes[0].profile.games).toBe(0);
  fixture.profile.mockResolvedValue({ ...oldProfile, accountId: 2, games: 4321 });
  await identity(2);
  expect(data.heroes[0].profile.games).toBe(4321);
});
