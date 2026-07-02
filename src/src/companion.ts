import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { GameTick, GsiStatus, MinimapCv, EnemyMissing, SignalAlert } from "./live/events";
import { buildMatch } from "./live/buildMatch";
import { buildHeroes } from "./live/buildHeroes";
import { buildMarkers } from "./live/buildMarkers";
import { buildSignals } from "./live/buildSignals";
import { buildProfile } from "./live/buildProfile";
import { buildBaselines } from "./live/buildBaselines";
import { fetchOpenDotaProfile, type OpenDotaProfile } from "./live/opendota";
import { loadIdentity, saveIdentity, IDENTITY_EVENT } from "./live/identity";
import { heroName } from "./live/heroNames";

const STEAMID64_BASE = 76561197960265728n;

export type CompanionTone = "info" | "warn" | "danger" | "good";
export type HeroState = "visible" | "missing" | "dead";

export type CompanionData = {
  updatedAt: number;
  match: {
    clock: string;
    seconds: number;
    mode: string;
    phase: "pregame" | "live";
    minimapState: "empty" | "live";
    gsiOnline: boolean;
    centerLabel: string;
    centerSubLabel: string;
    leftTeamName: string;
    rightTeamName: string;
    leftScore: number;
    rightScore: number;
    viewers: number;
    watchLabel: string;
    activeAlerts: number;
    server: string;
    latencyMs: number;
    gsiScore: number;
    overlayMode: string;
    voicePack: string;
    privacy: string;
    performance: string;
    systemStatus: string;
    playerStats: {
      goal: string;
      net: string;
      ward: string;
      gpm: number;
      xpm: number;
    };
    player: {
      nw: number;
      nwAvg: number;
      gpm: number;
      gpmAvg: number;
      xpm: number;
      xpmAvg: number;
      k: number;
      kAvg: number;
      d: number;
      dAvg: number;
      a: number;
      aAvg: number;
      cs: number;
      csAvg: number;
      denies: number;
      deniesAvg: number;
      ping: number;
    };
  };
  heroes: Array<{
    id: string;
    hero: string;
    player: string;
    team: "ally" | "enemy";
    level: number;
    kills: number;
    deaths: number;
    assists: number;
    state: HeroState;
    timer: number;
    lane: string;
    items: string[];
    pingMs: number;
    connection: "online" | "lagging" | "offline";
    nw: number;
    gpm: number;
    xpm: number;
    lastHits: number;
    denies: number;
    mmr: number;
    rank: string;
    hpPercent: number;
    buyback: boolean;
    tp: boolean;
    ultReady: boolean;
    neutral: string;
    profile: {
      public: boolean;
      winRate: number;
      games: number;
      kda: number;
      mainHero: { name: string; games: number; winRate: number };
      behavior: number;
      role: string;
      hours?: number;
    };
  }>;
  markers: Array<{
    id: string;
    heroId?: string;
    x: number;
    y: number;
    kind: string;
    label?: string;
    state?: HeroState;
  }>;
  signals: Array<{ label: string; tone: CompanionTone; value: string }>;
  recommendations: string[];
  activity: Array<{ id: string; at: string; text: string; tone: CompanionTone }>;
  events: Array<{ id: string; at: string; text: string; tone: CompanionTone }>;
  warningTabs: Array<{ key: string; label: string; count: number; text: string }>;
  buildAdvisor: {
    hero: string;
    lane: string;
    itemPath: string[];
    nextItem: string;
    notes: string[];
  };
  companion: {
    overlayEnabled: boolean;
    voiceEnabled: boolean;
    motionIntensity: number;
    dangerThreshold: number;
    hotkeys: Array<{ label: string; combo: string }>;
  };
  telemetry: {
    cpuLoad: number;
    cpuTemp: number;
    gpuLoad: number;
    gpuTemp: number;
    ramLoad: number;
    ramTemp: number;
    vramLoad: number;
    vramTemp: number;
    ramUsedGb: number;
    ramTotalGb: number;
    vramUsedGb: number;
    vramTotalGb: number;
  };
  weeklyReport: {
    winRate: number;
    kd: number;
    topHeroes: Array<{ rank: number; hero: string; games: number; winRate: number; kd: string }>;
  };
  agentSector: {
    name: string;
    title: string;
    status: string;
    summary: string[];
  };
  insights: {
    powerScore: number;
    winRate: number;
    objectiveControl: number;
    wardEfficiency: number;
    learnedMatches: number;
  };
  history: Array<{ id: string; result: string; hero: string; kda: string; note: string }>;
};

// Retained sparse pregame fallback (exported for reference / future use). Phase 1
// renders the rich MOCK below instead so the deck shows a full demo with no backend.
export const FALLBACK: CompanionData = {
  updatedAt: Date.now(),
  match: {
    clock: "24:18",
    seconds: 24 * 60 + 18,
    mode: "Tactical Assist",
    phase: "pregame",
    minimapState: "empty",
    gsiOnline: false,
    centerLabel: "CAPTAINS MODE",
    centerSubLabel: "WAITING FOR GSI",
    leftTeamName: "TEAM RADIANT",
    rightTeamName: "TEAM DIRE",
    leftScore: 0,
    rightScore: 0,
    viewers: 0,
    watchLabel: "WATCH IN-GAME",
    activeAlerts: 3,
    server: "SEA",
    latencyMs: 18,
    gsiScore: 86,
    overlayMode: "Mirror mode",
    voicePack: "Calm tactical",
    privacy: "Local-only",
    performance: "Balanced",
    systemStatus: "Companion monitoring",
    playerStats: { goal: "Hold river", net: "0", ward: "0/0", gpm: 0, xpm: 0 },
    player: {
      nw: 0, nwAvg: 0, gpm: 0, gpmAvg: 0, xpm: 0, xpmAvg: 0,
      k: 0, kAvg: 0, d: 0, dAvg: 0, a: 0, aAvg: 0,
      cs: 0, csAvg: 0, denies: 0, deniesAvg: 0, ping: 0
    }
  },
  heroes: [],
  markers: [],
  signals: [
    { label: "Enemy Missing", tone: "danger", value: "Standby" },
    { label: "Gank Risk", tone: "warn", value: "Low" },
    { label: "Vision Pressure", tone: "info", value: "Waiting" },
    { label: "Safe Push", tone: "good", value: "Hold" }
  ],
  recommendations: [],
  activity: [],
  events: [],
  warningTabs: [],
  buildAdvisor: { hero: "Maiden", lane: "Support", itemPath: [], nextItem: "", notes: [] },
  companion: { overlayEnabled: true, voiceEnabled: true, motionIntensity: 60, dangerThreshold: 70, hotkeys: [] },
  telemetry: { cpuLoad: 0, cpuTemp: 0, gpuLoad: 0, gpuTemp: 0, ramLoad: 0, ramTemp: 0, vramLoad: 0, vramTemp: 0, ramUsedGb: 0, ramTotalGb: 0, vramUsedGb: 0, vramTotalGb: 0 },
  weeklyReport: { winRate: 0, kd: 0, topHeroes: [] },
  agentSector: { name: "G-Maiden", title: "Tactical AI", status: "Standby", summary: [] },
  insights: { powerScore: 0, winRate: 0, objectiveControl: 0, wardEfficiency: 0, learnedMatches: 0 },
  history: []
};

// Phase 1 (CR-002): rich standalone demo data. Mirrors the live-phase output of
// store/companion.mjs so the command deck renders a full match with NO backend.
// The fetch to /api/companion is still attempted (Phase 2 wires real data); on
// any failure we fall back to MOCK instead of the sparse FALLBACK above.
export const MOCK: CompanionData = {
  updatedAt: Date.now(),
  match: {
    clock: "24:18",
    seconds: 24 * 60 + 18,
    mode: "All Pick",
    phase: "live",
    minimapState: "live",
    gsiOnline: true,
    centerLabel: "ALL PICK",
    centerSubLabel: "24:18",
    leftTeamName: "RADIANT",
    rightTeamName: "DIRE",
    leftScore: 45,
    rightScore: 23,
    viewers: 5,
    watchLabel: "WATCH IN-GAME",
    activeAlerts: 3,
    server: "SEA",
    latencyMs: 18,
    gsiScore: 86,
    overlayMode: "Mirror mode",
    voicePack: "Calm tactical",
    privacy: "Local-only",
    performance: "Balanced",
    systemStatus: "Companion monitoring",
    playerStats: { goal: "Avoid river", net: "14.8k", ward: "6/3", gpm: 612, xpm: 721 },
    player: {
      nw: 14800, nwAvg: 12100, gpm: 612, gpmAvg: 540, xpm: 721, xpmAvg: 690,
      k: 5, kAvg: 1, d: 2, dAvg: 3, a: 11, aAvg: 12,
      cs: 214, csAvg: 236, denies: 12, deniesAvg: 9, ping: 18
    }
  },
  heroes: [
    { id: "a1", hero: "Maiden", player: "Nikitin", team: "ally", level: 18, kills: 8, deaths: 2, assists: 11, state: "visible", timer: 0, lane: "Mid", items: ["Bo", "Gm", "Fo", "Lo", "Wa", "Sm"], pingMs: 18, connection: "online", nw: 18200, gpm: 612, xpm: 721, lastHits: 214, denies: 12, mmr: 6120, rank: "Divine II", hpPercent: 88, buyback: true, tp: true, ultReady: true, neutral: "Tk", profile: { public: true, winRate: 58, games: 1420, kda: 4.2, mainHero: { name: "Maiden", games: 312, winRate: 62 }, behavior: 9840, role: "Mid" } },
    { id: "a2", hero: "Bulwark", player: "Aegis", team: "ally", level: 16, kills: 4, deaths: 5, assists: 14, state: "visible", timer: 0, lane: "Offlane", items: ["Bl", "Cr", "Pi", "Va", "Tp", ""], pingMs: 24, connection: "online", nw: 13400, gpm: 478, xpm: 602, lastHits: 138, denies: 4, mmr: 5480, rank: "Ancient V", hpPercent: 26, buyback: false, tp: true, ultReady: false, neutral: "Vs", profile: { public: true, winRate: 53, games: 890, kda: 3.1, mainHero: { name: "Bulwark", games: 176, winRate: 55 }, behavior: 9210, role: "Offlane" } },
    { id: "a3", hero: "Echo", player: "RuneFox", team: "ally", level: 15, kills: 2, deaths: 3, assists: 17, state: "visible", timer: 0, lane: "Support", items: ["Ar", "Gl", "Wa", "Du", "Sm", ""], pingMs: 31, connection: "online", nw: 8600, gpm: 342, xpm: 458, lastHits: 42, denies: 2, mmr: 4900, rank: "Ancient I", hpPercent: 71, buyback: false, tp: true, ultReady: true, neutral: "", profile: { public: true, winRate: 51, games: 640, kda: 2.8, mainHero: { name: "Echo", games: 210, winRate: 54 }, behavior: 8600, role: "Support" } },
    { id: "a4", hero: "Nyx", player: "Shade", team: "ally", level: 17, kills: 6, deaths: 4, assists: 10, state: "visible", timer: 0, lane: "Roam", items: ["Da", "Ec", "Fo", "Sm", "Wa", ""], pingMs: 48, connection: "lagging", nw: 12800, gpm: 452, xpm: 588, lastHits: 96, denies: 6, mmr: 5210, rank: "Ancient III", hpPercent: 54, buyback: true, tp: false, ultReady: true, neutral: "Pn", profile: { public: true, winRate: 56, games: 1120, kda: 3.6, mainHero: { name: "Nyx", games: 288, winRate: 60 }, behavior: 9500, role: "Roam" } },
    { id: "a5", hero: "Razor", player: "Arc", team: "ally", level: 15, kills: 3, deaths: 2, assists: 9, state: "visible", timer: 0, lane: "Safe", items: ["Ma", "Bb", "Sa", "Tp", "", ""], pingMs: 21, connection: "online", nw: 11200, gpm: 506, xpm: 534, lastHits: 178, denies: 8, mmr: 5340, rank: "Ancient IV", hpPercent: 92, buyback: false, tp: true, ultReady: false, neutral: "Gr", profile: { public: true, winRate: 54, games: 760, kda: 3.3, mainHero: { name: "Razor", games: 142, winRate: 57 }, behavior: 9100, role: "Carry" } },
    { id: "e1", hero: "Warden", player: "Frost", team: "enemy", level: 17, kills: 7, deaths: 4, assists: 6, state: "missing", timer: 14, lane: "Fog", items: ["Da", "Bk", "Or", "Tp", "", ""], pingMs: 54, connection: "lagging", nw: 15600, gpm: 588, xpm: 640, lastHits: 202, denies: 10, mmr: 5960, rank: "Divine I", hpPercent: 100, buyback: true, tp: true, ultReady: true, neutral: "Tk", profile: { public: false, winRate: 0, games: 0, kda: 0, mainHero: { name: "", games: 0, winRate: 0 }, behavior: 0, role: "" } },
    { id: "e2", hero: "Hex", player: "Crow", team: "enemy", level: 15, kills: 3, deaths: 6, assists: 9, state: "visible", timer: 0, lane: "Top", items: ["Bl", "Fo", "Wa", "", "", ""], pingMs: 33, connection: "online", nw: 9200, gpm: 368, xpm: 470, lastHits: 88, denies: 3, mmr: 4820, rank: "Ancient I", hpPercent: 31, buyback: false, tp: false, ultReady: true, neutral: "Vs", profile: { public: true, winRate: 49, games: 540, kda: 2.4, mainHero: { name: "Hex", games: 132, winRate: 52 }, behavior: 8200, role: "Support" } },
    { id: "e3", hero: "Titan", player: "Stone", team: "enemy", level: 14, kills: 1, deaths: 5, assists: 7, state: "dead", timer: 21, lane: "Jungle", items: ["Va", "Br", "Tp", "", "", ""], pingMs: 0, connection: "offline", nw: 7400, gpm: 298, xpm: 402, lastHits: 64, denies: 1, mmr: 4600, rank: "Legend V", hpPercent: 0, buyback: false, tp: false, ultReady: false, neutral: "", profile: { public: true, winRate: 47, games: 410, kda: 2.1, mainHero: { name: "Titan", games: 98, winRate: 50 }, behavior: 7900, role: "Offlane" } },
    { id: "e4", hero: "Mirage", player: "Sable", team: "enemy", level: 16, kills: 5, deaths: 3, assists: 10, state: "missing", timer: 36, lane: "Bot", items: ["Sn", "Da", "Cr", "Tp", "", ""], pingMs: 41, connection: "online", nw: 14100, gpm: 542, xpm: 596, lastHits: 190, denies: 7, mmr: 5710, rank: "Divine III", hpPercent: 100, buyback: true, tp: true, ultReady: false, neutral: "Pn", profile: { public: false, winRate: 0, games: 0, kda: 0, mainHero: { name: "", games: 0, winRate: 0 }, behavior: 0, role: "" } },
    { id: "e5", hero: "Oracle", player: "Aster", team: "enemy", level: 13, kills: 0, deaths: 7, assists: 8, state: "visible", timer: 0, lane: "River", items: ["Gl", "Fo", "Wa", "Sm", "", ""], pingMs: 29, connection: "online", nw: 6800, gpm: 312, xpm: 388, lastHits: 38, denies: 2, mmr: 4400, rank: "Legend III", hpPercent: 66, buyback: false, tp: true, ultReady: true, neutral: "Gr", profile: { public: true, winRate: 45, games: 320, kda: 1.9, mainHero: { name: "Oracle", games: 76, winRate: 48 }, behavior: 7600, role: "Support" } }
  ],
  markers: [
    { id: "m1", heroId: "a1", x: 22, y: 34, kind: "ally", state: "visible" },
    { id: "m2", heroId: "a2", x: 15, y: 61, kind: "ally", state: "visible" },
    { id: "m3", heroId: "a3", x: 34, y: 56, kind: "ally", state: "visible" },
    { id: "m4", heroId: "a4", x: 44, y: 42, kind: "ally", state: "visible" },
    { id: "m5", heroId: "a5", x: 28, y: 72, kind: "ally", state: "visible" },
    { id: "m6", heroId: "e1", x: 66, y: 25, kind: "enemy", state: "missing" },
    { id: "m7", heroId: "e2", x: 80, y: 18, kind: "enemy", state: "visible" },
    { id: "m8", heroId: "e3", x: 72, y: 54, kind: "enemy", state: "dead" },
    { id: "m9", heroId: "e4", x: 84, y: 72, kind: "enemy", state: "missing" },
    { id: "m10", heroId: "e5", x: 60, y: 65, kind: "enemy", state: "visible" },
    { id: "ward-top", x: 20, y: 19, kind: "ward", label: "W" },
    { id: "ward-bot", x: 35, y: 75, kind: "ward", label: "W" },
    { id: "roshan", x: 73, y: 31, kind: "objective", label: "R" }
  ],
  signals: [
    { label: "Enemy Missing", tone: "danger", value: "2 heroes" },
    { label: "Roshan Window", tone: "warn", value: "00:38" },
    { label: "Ward Suggestion", tone: "info", value: "Top rune" },
    { label: "Push Opportunity", tone: "good", value: "Bot T1" }
  ],
  recommendations: [
    "Back off river in 8s: smoke route prediction active.",
    "Place a ward at top rune before the next wisdom cycle.",
    "Bot lane is the safest push window while 2 enemy heroes are off map.",
    "Roshan contest likelihood increased after enemy carry respawn."
  ],
  activity: [
    { id: "ac1", at: "24:11", text: "Two enemy heroes still off map; river route remains unsafe.", tone: "warn" },
    { id: "ac2", at: "24:07", text: "Ward placed near top rune.", tone: "good" },
    { id: "ac3", at: "23:58", text: "Enemy offlane spotted cutting river.", tone: "info" },
    { id: "ac4", at: "23:52", text: "Support rotated bot through jungle.", tone: "info" },
    { id: "ac5", at: "23:49", text: "Roshan pit movement detected.", tone: "warn" }
  ],
  events: [
    { id: "ev1", at: "24:15", text: "Kill secured: ally mid > enemy mid.", tone: "good" },
    { id: "ev2", at: "24:01", text: "Top T1 tower destroyed.", tone: "good" },
    { id: "ev3", at: "23:44", text: "Wisdom rune captured.", tone: "info" },
    { id: "ev4", at: "23:30", text: "Ultimate ready: Maiden callout armed.", tone: "info" },
    { id: "ev5", at: "23:02", text: "Enemy carry used buyback.", tone: "danger" }
  ],
  warningTabs: [
    { key: "danger", label: "Danger", count: 3, text: "2 off-map heroes, smoke risk, mid collapse" },
    { key: "objectives", label: "Objectives", count: 2, text: "Roshan window and bot tower pressure" },
    { key: "vision", label: "Vision", count: 4, text: "Fresh ward path and deward candidate near river" },
    { key: "power", label: "Power Spike", count: 1, text: "Ultimate stack ready for next fight" }
  ],
  buildAdvisor: {
    hero: "Maiden",
    lane: "Mid support flex",
    itemPath: ["Boots of Bearing", "Glimmer Cape", "Force Staff", "Lotus Orb"],
    nextItem: "Lotus Orb",
    notes: [
      "Their silence timings make Lotus higher value than greedy damage.",
      "You can delay shard if enemy jump remains the main threat.",
      "Save smoke usage for the Roshan contest instead of forcing mid."
    ]
  },
  companion: {
    overlayEnabled: true,
    voiceEnabled: true,
    motionIntensity: 60,
    dangerThreshold: 70,
    hotkeys: [
      { label: "Pochi Alert", combo: "Alt + 1" },
      { label: "Ward Suggest", combo: "Alt + 2" },
      { label: "Enemy Missing", combo: "Alt + 3" }
    ]
  },
  telemetry: {
    cpuLoad: 38, cpuTemp: 64, gpuLoad: 55, gpuTemp: 67,
    ramLoad: 14.4, ramTemp: 32, vramLoad: 6.4, vramTemp: 12,
    ramUsedGb: 14.4, ramTotalGb: 32, vramUsedGb: 6.4, vramTotalGb: 12
  },
  weeklyReport: {
    winRate: 72.6,
    kd: 4.8,
    topHeroes: [
      { rank: 3, hero: "Maiden", games: 18, winRate: 78, kd: "6.2 / 3.1" },
      { rank: 5, hero: "Nyx", games: 26, winRate: 71, kd: "5.4 / 3.8" },
      { rank: 10, hero: "Razor", games: 41, winRate: 68, kd: "4.9 / 4.1" }
    ]
  },
  agentSector: {
    name: "G-Maiden",
    title: "Layered Tactical Persona",
    status: "Live orchestration",
    summary: [
      "Weekly win rate holds above the target support band.",
      "KD line remains strongest when river-vision uptime stays high.",
      "Top hero pool is stable across top 3, top 5, and top 10 depth."
    ]
  },
  insights: {
    powerScore: 8742,
    winRate: 76.4,
    objectiveControl: 68,
    wardEfficiency: 81,
    learnedMatches: 3248
  },
  history: [
    { id: "m-1", result: "Win", hero: "Maiden", kda: "14 / 3 / 18", note: "Strong ward control and objective pacing." },
    { id: "m-2", result: "Loss", hero: "Nyx", kda: "6 / 8 / 11", note: "Late smoke read came 12s too late." },
    { id: "m-3", result: "Win", hero: "Razor", kda: "9 / 2 / 15", note: "Top pressure and rune contest looked clean." }
  ]
};

// Phase 2a (CR-002): live-wire the deck to the Rust backend's Tauri events. The
// hook subscribes to game-tick / gsi-status / minimap-cv / enemy-missing /
// gank-alert / gank-clear, holds the latest of each, and merges the four pure
// builders (live/build*.ts) over MOCK. Every builder falls back to its MOCK
// slice when its source is absent, so partially-wired data still renders. When
// NO live event ever arrives (e.g. plain browser, no Tauri), we return MOCK
// untouched — the full demo. Fields not yet live (telemetry, weeklyReport,
// profile, insights, history, buildAdvisor, agentSector) stay MOCK until 2b.
type LiveState = {
  tick: GameTick | null;
  status: GsiStatus | null;
  cv: MinimapCv | null;
  gank: SignalAlert | null;
  missing: Map<string, number>;
  missingPos: Map<string, [number, number]>; // 2b-B: last-seen pos of missing enemies (markers)
  active: boolean; // flips true after the first live event (else pure MOCK demo)
  od: OpenDotaProfile | null; // Phase 2b-A: your public OpenDota profile (no DB)
};

const EMPTY_LIVE: LiveState = {
  tick: null, status: null, cv: null, gank: null, missing: new Map(), missingPos: new Map(), active: false, od: null
};

export function useCompanionData() {
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [accountId, setAccountId] = useState<number | null>(null);
  const expiryTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const timers = expiryTimers.current;

    function sub<T>(event: string, handler: (payload: T) => void) {
      try {
        listen<T>(event, (e) => { if (!cancelled) handler(e.payload); })
          .then((fn) => { if (cancelled) fn(); else unlisteners.push(fn); })
          .catch(() => { /* Tauri event API unavailable */ });
      } catch {
        /* not running under Tauri — stay on MOCK */
      }
    }

    sub<GameTick>("game-tick", (p) => setLive((s) => ({ ...s, tick: p, active: true })));
    sub<GsiStatus>("gsi-status", (p) => setLive((s) => ({ ...s, status: p, active: true })));
    sub<MinimapCv>("minimap-cv", (p) => setLive((s) => ({ ...s, cv: p, active: true })));
    sub<SignalAlert>("gank-alert", (p) => setLive((s) => ({ ...s, gank: p, active: true })));
    // Belief revision: G-Signal retracts — clear the gank + the missing set.
    sub<unknown>("gank-clear", () => setLive((s) => ({ ...s, gank: null, missing: new Map(), missingPos: new Map(), active: true })));
    sub<EnemyMissing>("enemy-missing", (p) => {
      setLive((s) => {
        const missing = new Map(s.missing);
        missing.set(p.hero, p.missing_for_ms);
        const missingPos = new Map(s.missingPos);
        missingPos.set(p.hero, p.last_pos);
        return { ...s, missing, missingPos, active: true };
      });
      // Auto-expire a missing hero after 30s (mirrors App.tsx overlay behaviour).
      const prev = timers.get(p.hero);
      if (prev) window.clearTimeout(prev);
      const t = window.setTimeout(() => {
        setLive((s) => {
          if (!s.missing.has(p.hero) && !s.missingPos.has(p.hero)) return s;
          const missing = new Map(s.missing);
          missing.delete(p.hero);
          const missingPos = new Map(s.missingPos);
          missingPos.delete(p.hero);
          return { ...s, missing, missingPos };
        });
        timers.delete(p.hero);
      }, 30_000);
      timers.set(p.hero, t);
    });

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  // Phase A: account id comes from the persisted Steam identity (set via the
  // login screen -> Tauri store) so there's no manual localStorage juggling.
  useEffect(() => {
    let cancelled = false;
    const sync = () => loadIdentity().then((id) => { if (!cancelled) setAccountId(id?.accountId ?? null); });
    void sync();
    // Re-sync the moment the login screen links/unlinks — no reload needed.
    window.addEventListener(IDENTITY_EVENT, sync);
    return () => { cancelled = true; window.removeEventListener(IDENTITY_EVENT, sync); };
  }, []);

  // Auto-identify: once GSI reports the local player's steamid in-game, adopt it
  // (SteamID64 -> account_id, offline) and persist — no login needed while playing.
  useEffect(() => {
    const sid = live.tick?.steamid;
    if (!sid || accountId != null) return;
    try {
      const acc = Number(BigInt(sid) - STEAMID64_BASE);
      if (acc > 0) {
        setAccountId(acc);
        void saveIdentity({ steamid64: sid, accountId: acc });
      }
    } catch {
      /* malformed steamid — ignore */
    }
  }, [live.tick?.steamid, accountId]);

  // Phase 2b-A: pull the player's PUBLIC OpenDota profile once we know the
  // account id — no DB, RAM only. Offline / private / unset leave `od` null and
  // the builders fall back to MOCK. heroName resolves mainHero's hero id -> name.
  useEffect(() => {
    if (accountId == null) return;
    let cancelled = false;
    fetchOpenDotaProfile(String(accountId), heroName)
      .then((od) => { if (!cancelled && od) setLive((s) => ({ ...s, od })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accountId]);

  const data = useMemo<CompanionData>(() => {
    // Base: pure MOCK until a live event arrives, else the live-merged deck.
    let d: CompanionData = live.active
      ? {
          ...MOCK,
          match: buildMatch(live.tick, live.status, MOCK.match),
          heroes: buildHeroes(live.tick, live.missing, live.cv, MOCK.heroes),
          markers: buildMarkers(live.cv, live.missingPos, MOCK.markers),
          signals: buildSignals(live.gank, live.missing, MOCK.signals)
        }
      : MOCK;

    // OpenDota enrichment is YOUR historical data — apply it to the self slot +
    // stat-bar baselines whenever present, independent of live-match state.
    const od = live.od;
    if (od) {
      d = {
        ...d,
        match: { ...d.match, player: buildBaselines(d.match.player, od) },
        heroes: d.heroes.map((h, i) => (i === 0 ? { ...h, profile: buildProfile(od, h.profile) } : h))
      };
    }
    return d;
  }, [live]);

  return { data, loading: false as const, error: null as string | null };
}

export function toneClass(tone: CompanionTone) {
  return `tone-${tone}`;
}

export function formatTimer(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
