// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import VoiceInventory from "../VoiceInventory";
import AudioSettings from "../AudioSettings";
import { InsightsPage } from "../CompanionPages";
import type { VoiceState } from "../voice-types";

const { invokeMock, navigate } = vi.hoisted(() => ({ invokeMock: vi.fn(), navigate: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, convertFileSrc: (path: string) => path }));
vi.mock("../companion", () => ({ formatKda: vi.fn(), formatTimer: vi.fn(), toneClass: vi.fn(), useCompanionData: () => ({ data: {
  insights: { powerScore: -1, winRate: -1, objectiveControl: -1, wardEfficiency: -1 },
  weeklyReport: { winRate: -1, kd: -1, topHeroes: [] },
} }) }));

let fixture: VoiceState;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: () => void) {}
    observe() { this.callback(); }
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(424);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
  const packs = Array.from({ length: 12 }, (_, i) => ({
    id: `fixture-${i}`, name: `Fixture pack ${i}`, version: "0.0.0", locale: "th-TH",
    author: "Synthetic fixture", description: "", path: "fixture-only", coveredEvents: 0,
    totalEvents: 0, clips: 0, availableClips: [], availableBanners: [], items: [],
    coverImage: "", coverImageUrl: null, builtIn: false,
  }));
  fixture = { rootDir: "fixture-only", packsDir: "fixture-only", cacheDir: "fixture-only",
    activePackId: packs[0].id, activePack: packs[0], packs, groups: [] };
  invokeMock.mockReset().mockImplementation(async (cmd: string) => {
    if (cmd === "voice_api_state") return fixture;
    throw new Error(`Unexpected native mutation: ${cmd}`);
  });
  navigate.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}

it("paginates all packs without equipping and retains selection across pages", async () => {
  await act(async () => root.render(<VoiceInventory />));
  expect(host.querySelectorAll(".voice-card")).toHaveLength(4);
  const seen = new Set<string>();
  for (let page = 0; page < 3; page++) {
    host.querySelectorAll(".voice-card-name").forEach((el) => seen.add(el.textContent!));
    if (page < 2) await click("ถัดไป");
  }
  expect(seen.size).toBe(12);
  await act(async () => (host.querySelector(".voice-card") as HTMLButtonElement).click());
  const selected = host.querySelector(".voice-detail h3")?.textContent;
  await click("ก่อนหน้า");
  expect(host.querySelector(".voice-detail h3")?.textContent).toBe(selected);
  expect(invokeMock.mock.calls.every(([cmd]) => cmd === "voice_api_state")).toBe(true);
});

it("clamps pagination after rescan removes the last page and handles an empty inventory", async () => {
  await act(async () => root.render(<VoiceInventory />));
  await click("ถัดไป"); await click("ถัดไป");
  fixture = { ...fixture, packs: fixture.packs.slice(0, 1) };
  await click("Rescan");
  expect(host.querySelectorAll(".voice-card")).toHaveLength(1);
  expect(host.querySelector(".voice-pagination")?.textContent).toContain("1 / 1");
  fixture = { ...fixture, packs: [], activePack: null, activePackId: null };
  await click("Rescan");
  expect(host.querySelector(".voice-empty")?.textContent).toContain("ยังไม่มี voice pack");
});

it("retains an unsaved template draft when switching editor sections", async () => {
  await act(async () => root.render(<AudioSettings />));
  const input = host.querySelector('input[placeholder="My Voice Pack"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Unsaved fixture");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("ข้อมูลและไฟล์"); await click("ผูกอีเวนต์"); await click("ติดตั้งและสร้าง");
  expect((host.querySelector('input[placeholder="My Voice Pack"]') as HTMLInputElement).value).toBe("Unsaved fixture");
  expect(invokeMock.mock.calls.every(([cmd]) => cmd === "voice_api_state")).toBe(true);
});

it("provides an Account navigation action in the Insights teaching empty state", async () => {
  await act(async () => root.render(<InsightsPage onOpenAccount={navigate} />));
  await click("ไปหน้า Account");
  expect(navigate).toHaveBeenCalledOnce();
});
