import { useRef, useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { GameTick, GsiStatus, MinimapCv, MinimapFrame, DraftRoster, EnemyMissing, SignalAlert, ResourceStats, UtteranceEvent } from "./live/events";
import { buildMatch } from "./live/buildMatch";
import { buildUtterances, type Utterance } from "./live/utterances";
import { buildHeroes, assignEnemySlot } from "./live/buildHeroes";
import { buildMarkers } from "./live/buildMarkers";
import { buildSignals } from "./live/buildSignals";
import { buildProfile } from "./live/buildProfile";
import { buildBaselines } from "./live/buildBaselines";
import { buildTelemetry } from "./live/buildTelemetry";
import { buildWeekly } from "./live/buildWeekly";
import { buildInsights } from "./live/buildInsights";
import { buildHistory, type MatchLog } from "./live/buildHistory";
import { buildActivity } from "./live/buildActivity";
import { stepMomentum, momentumView, EMPTY_MOMENTUM, type MomentumState, type GamePhase } from "./live/buildMomentum";
import { stepPhase, type MatchPhase } from "./live/phase";
import { fetchOpenDotaProfile, type OpenDotaProfile } from "./live/opendota";
import { loadIdentity, saveIdentity, IDENTITY_EVENT } from "./live/identity";
import { heroName } from "./live/heroNames";

const STEAMID64_BASE = 76561197960265728n;

export type CompanionTone = "info" | "warn" | "danger" | "good";
// "empty" = an honestly-unknown slot (CR-007 WP-4): GSI exposes only the
// local player, so 9 of the 10 hero slots start with no identity at all.
export type HeroState = "visible" | "missing" | "dead" | "empty";

export type CompanionData = {
  updatedAt: number;
  match: {
    clock: string;
    seconds: number;
    mode: string;
    phase: "pregame" | "live";
    // CR-011 §B/§E phase axis (CR011-P3-02): standby -> prep -> live -> debrief,
    // derived by live/phase.ts's stepPhase() from GSI online + game_state. Kept
    // separate from the existing `phase` field above (that one stays exactly as
    // it was — this is additive, not a replacement).
    matchPhase: MatchPhase;
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
    latencyMs: number;
    gsiScore: number;
    overlayMode: string;
    voicePack: string;
    privacy: string;
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
    // CR-007 WP-4 (honest state): GSI/CV can tell us a slot is occupied
    // without telling us its KDA/economy — these render "—", never a fake 0.
    level?: number;
    kills?: number;
    deaths?: number;
    assists?: number;
    state: HeroState;
    timer: number;
    lane: string;
    items: string[];
    pingMs?: number;
    connection: "online" | "lagging" | "offline";
    nw?: number;
    gpm?: number;
    xpm?: number;
    lastHits?: number;
    denies?: number;
    mmr?: number;
    rank: string;
    hpPercent?: number;
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
  // CR-007 WP-4: D/E/F/G annunciator cluster. barPct (0-100) drives the bar
  // fill directly — no ad-hoc math left in the UI layer (see buildSignals.ts).
  signals: Array<{ label: string; tone: CompanionTone; value: string; barPct: number }>;
  activity: Array<{ id: string; at: string; text: string; tone: CompanionTone }>;
  events: Array<{ id: string; at: string; text: string; tone: CompanionTone }>;
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
  // Game-momentum proxy + phase (see live/buildMomentum.ts). value is -100..100
  // from OUR team's perspective; phase is the clock-based laning/mid/late split.
  momentum: {
    value: number;
    label: string;
    tone: CompanionTone;
    phase: GamePhase;
    phaseLabel: string;
  };
  // CR-011 §B: the ON AIR console ledger — Maiden's persona rendered as an
  // utterance log (most-recent-first, capped) instead of a static agent-art
  // block. See live/utterances.ts; fed by the `utterance` Tauri event.
  utterances: Utterance[];
};

// CR-007 WP-4: an honestly-empty hero slot. GSI only ever exposes the local
// player (ally slot 0); every other slot starts with no identity and no
// numeric stats — those render "—", never a fabricated 0. buildHeroes() fills
// enemy slots in from the `missing` map / MinimapCv as real identities arrive.
function emptyHeroSlot(id: string, team: "ally" | "enemy"): CompanionData["heroes"][number] {
  return {
    id,
    hero: "—",
    player: "—",
    team,
    state: "empty",
    timer: 0,
    lane: "—",
    items: [],
    connection: "online",
    rank: "—",
    buyback: false,
    tp: false,
    ultReady: false,
    neutral: "",
    profile: { public: false, winRate: 0, games: 0, kda: 0, mainHero: { name: "", games: 0, winRate: 0 }, behavior: 0, role: "" }
  };
}

const FALLBACK_HEROES: CompanionData["heroes"] = [
  emptyHeroSlot("a1", "ally"),
  emptyHeroSlot("a2", "ally"),
  emptyHeroSlot("a3", "ally"),
  emptyHeroSlot("a4", "ally"),
  emptyHeroSlot("a5", "ally"),
  emptyHeroSlot("e1", "enemy"),
  emptyHeroSlot("e2", "enemy"),
  emptyHeroSlot("e3", "enemy"),
  emptyHeroSlot("e4", "enemy"),
  emptyHeroSlot("e5", "enemy")
];

// Retained sparse pregame fallback (exported for reference / future use). Phase 1
// renders the rich MOCK below instead so the deck shows a full demo with no backend.
export const FALLBACK: CompanionData = {
  updatedAt: Date.now(),
  match: {
    clock: "--:--",
    seconds: 0,
    mode: "—",
    phase: "pregame",
    matchPhase: "standby",
    minimapState: "empty",
    gsiOnline: false,
    centerLabel: "NOT IN A MATCH",
    centerSubLabel: "WAITING FOR GSI",
    leftTeamName: "Radiant",
    rightTeamName: "Dire",
    leftScore: 0,
    rightScore: 0,
    viewers: 0,
    watchLabel: "WATCH IN-GAME",
    activeAlerts: 3,
    latencyMs: 18,
    gsiScore: 86,
    overlayMode: "Mirror mode",
    voicePack: "Calm tactical",
    privacy: "Local-only",
    systemStatus: "Companion monitoring",
    playerStats: { goal: "Hold river", net: "0", ward: "0/0", gpm: 0, xpm: 0 },
    player: {
      nw: 0, nwAvg: 0, gpm: 0, gpmAvg: 0, xpm: 0, xpmAvg: 0,
      k: 0, kAvg: 0, d: 0, dAvg: 0, a: 0, aAvg: 0,
      cs: 0, csAvg: 0, denies: 0, deniesAvg: 0, ping: 0
    }
  },
  heroes: FALLBACK_HEROES,
  markers: [],
  // Honest "not connected yet" state — no invented baseline (CR-007 WP-4).
  // Once live data arrives, buildSignals() computes these fresh from real
  // gank-alert/missing-map inputs, which naturally settle on the same shape
  // (0 missing / no gank) when the match is genuinely quiet.
  signals: [
    { label: "Enemy Missing", tone: "info", value: "—", barPct: 0 },
    { label: "Gank Risk", tone: "info", value: "—", barPct: 0 },
    { label: "Risk Level", tone: "info", value: "—", barPct: 0 },
    { label: "Gank ETA", tone: "info", value: "—", barPct: 0 }
  ],
  activity: [],
  events: [],
  buildAdvisor: { hero: "Maiden", lane: "Support", itemPath: [], nextItem: "", notes: [] },
  companion: { overlayEnabled: true, voiceEnabled: true, motionIntensity: 60, dangerThreshold: 70, hotkeys: [] },
  // -1 = "no reading" so the footer/stat cards render "—" (waiting), not a fake 0.
  telemetry: { cpuLoad: -1, cpuTemp: -1, gpuLoad: -1, gpuTemp: -1, ramLoad: -1, ramTemp: -1, vramLoad: -1, vramTemp: -1, ramUsedGb: -1, ramTotalGb: -1, vramUsedGb: -1, vramTotalGb: -1 },
  weeklyReport: { winRate: -1, kd: -1, topHeroes: [] },
  agentSector: { name: "G-Maiden", title: "Tactical AI", status: "Standby", summary: [] },
  insights: { powerScore: -1, winRate: -1, objectiveControl: -1, wardEfficiency: -1, learnedMatches: -1 },
  history: [],
  momentum: { value: 0, label: "—", tone: "info", phase: "pregame", phaseLabel: "ก่อนเกม" },
  // Honest empty ledger — the ON AIR console shows its Thai teaching line
  // until the first real `utterance` event arrives (see CommandDeck.tsx).
  utterances: []
};

// Small helper for the MOCK utterance ledger below: computes a wall-clock
// atMs/timeLabel pair `minutesAgo` minutes before now, keeping the two fields
// consistent. MOCK/FALLBACK already read Date.now() directly elsewhere in this
// file (e.g. `updatedAt`) — the pure builder (live/utterances.ts) is the one
// that avoids it, since it's the piece under test for determinism.
function mockUtteranceAt(minutesAgo: number): { atMs: number; timeLabel: string } {
  const d = new Date(Date.now() - minutesAgo * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return { atMs: d.getTime(), timeLabel: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` };
}

// TEST FIXTURE ONLY. This rich object used to seed the deck as a demo when no
// live data was flowing — that has been retired. Production code (useCompanionData
// below) now stays on FALLBACK until live events arrive, so signed-out / no-match
// users only see honest "waiting / not connected" states. The 9 build*.ts tests
// still consume slices of this object as an integration fixture; do not import it
// into any new UI code.
export const MOCK: CompanionData = {
  updatedAt: Date.now(),
  match: {
    clock: "24:18",
    seconds: 24 * 60 + 18,
    mode: "All Pick",
    phase: "live",
    matchPhase: "live",
    minimapState: "live",
    gsiOnline: true,
    centerLabel: "ALL PICK",
    centerSubLabel: "24:18",
    leftTeamName: "Radiant",
    rightTeamName: "Dire",
    leftScore: 45,
    rightScore: 23,
    viewers: 5,
    watchLabel: "WATCH IN-GAME",
    activeAlerts: 3,
    latencyMs: 18,
    gsiScore: 86,
    overlayMode: "Mirror mode",
    voicePack: "Calm tactical",
    privacy: "Local-only",
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
    { label: "Enemy Missing", tone: "danger", value: "2 heroes", barPct: 40 },
    { label: "Roshan Window", tone: "warn", value: "00:38", barPct: 60 },
    { label: "Ward Suggestion", tone: "info", value: "Top rune", barPct: 80 },
    { label: "Push Opportunity", tone: "good", value: "Bot T1", barPct: 25 }
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
  ],
  momentum: { value: 34, label: "กำลังนำ", tone: "good", phase: "mid", phaseLabel: "กลางเกม" },
  // CR-011 §B: ON AIR console fixture — 3 plausible Thai lines (most-recent
  // first), one of them a belief-revision so the struck-through pattern has
  // something to render in the demo. MOCK-only, same honesty rule as the rest
  // of this object (see the fixture comment above); never used as a live default.
  utterances: [
    {
      id: "utt-mock-1",
      ...mockUtteranceAt(1),
      source: "signal",
      kind: "revision",
      text: "เอ๊ะ! เดี๋ยวก่อน — เจอ Pudge ที่รูนบนค่ะ ถอยก่อนนะคะ",
      retracted: "เลนบนปลอดภัย เดินหน้าได้เลย",
      meta: null
    },
    {
      id: "utt-mock-2",
      ...mockUtteranceAt(3),
      source: "master",
      kind: "line",
      text: "ศัตรูมี magic burst สูง — ชิ้นต่อไปแนะนำ Glimmer Cape ค่ะ (เหลืออีก 350 ทอง)",
      retracted: null,
      meta: "claude"
    },
    {
      id: "utt-mock-3",
      ...mockUtteranceAt(5),
      source: "announcer",
      kind: "line",
      text: "ดับเบิลคิล (Double Kill) — แพ็ก Thai Caster Vol.2",
      retracted: null,
      meta: "Thai Caster Vol.2"
    }
  ]
};

// Phase 2a (CR-002): live-wire the deck to the Rust backend's Tauri events. The
// hook subscribes to game-tick / gsi-status / minimap-cv / enemy-missing /
// gank-alert / gank-clear, holds the latest of each, and merges the four pure
// builders (live/build*.ts) over FALLBACK (empty scaffold). Every builder falls
// back to its FALLBACK slice when its source is absent, so partially-wired data
// still renders honestly — never as a fake demo. Phase 2c wires the remaining
// panels to the data the backend actually has: telemetry ← resource-stats
// (governor), weeklyReport + insights ← OpenDota, history + learnedMatches ←
// local G-Log files, agentSector status ← live GSI.
type LiveState = {
  tick: GameTick | null;
  status: GsiStatus | null;
  cv: MinimapCv | null;
  gank: SignalAlert | null;
  missing: Map<string, number>;
  missingPos: Map<string, [number, number]>; // 2b-B: last-seen pos of missing enemies (markers)
  // CR-007 WP-4 Fix 3: permanent npcHeroName -> enemy-slot-index (0-4) table.
  // Assigned once per hero (assignEnemySlot in buildHeroes.ts), never
  // reassigned, so enemy slots stop shuffling mid-match. Reset only on a new
  // match — see the game-tick handler in ensureRuntime() below.
  enemySlots: Map<string, number>;
  active: boolean; // flips true after the first live event (else pure FALLBACK)
  od: OpenDotaProfile | null; // Phase 2b-A: your public OpenDota profile (no DB)
  stats: ResourceStats | null; // Phase 2c: governor RAM/CPU sample (telemetry footer)
  logs: MatchLog[] | null;     // Phase 2c: local G-Log match files (history + learnedMatches)
  // CR-007 WP-4: persisted ring buffer for the Alert Deck, same pattern as
  // `missing`/`missingPos` above — appended incrementally by buildActivity()
  // as discrete gank-alert/gank-clear/enemy-missing events arrive, not
  // recomputed from scratch on every publish (a ring buffer has no "current
  // value" to re-derive, only a history to append to).
  activityLog: CompanionData["activity"];
  // Rolling game-momentum accumulator (EWMA), advanced per game-tick. Reset on a
  // new match alongside the enemy-slot table. See live/buildMomentum.ts.
  mom: MomentumState;
  // Draft-CV: the full 10-hero roster read off the pick screen (short label form,
  // split by team). Fills ally slots 1-4 + pre-seeds enemy identities. NOT reset
  // on the game-start tick (the draft that produced it ran just before) — it's
  // replaced when the next match's draft emits a fresh `draft-roster`.
  roster: DraftRoster | null;
  // CR-011 §B: ON AIR console ledger, same ring-buffer ownership pattern as
  // `activityLog` above — appended via buildUtterances() as each `utterance`
  // Tauri event arrives. NOT reset on a new match (the pre-match "last session"
  // line is honest context, not stale data).
  utterances: Utterance[];
  // CR-011 §E phase axis (CR011-P3-02): the persisted `prev` the stepPhase()
  // state machine advances from on every game-tick/gsi-status. NOT reset on a
  // new match — debrief must survive until the *next* real prep/live tick
  // (stepPhase's own stickiness rule), so resetting it here would defeat that.
  phase: MatchPhase;
};

const EMPTY_LIVE: LiveState = {
  tick: null, status: null, cv: null, gank: null, missing: new Map(), missingPos: new Map(),
  enemySlots: new Map(),
  active: false, od: null, stats: null, logs: null, activityLog: [], mom: EMPTY_MOMENTUM, roster: null,
  utterances: [],
  phase: "standby"
};

type CompanionSnapshot = {
  data: CompanionData;
  loading: false;
  error: string | null;
};

const CV_UPDATE_MS = 1000;
// Live minimap mirror publishes at ≈2 Hz on the frontend — smooth enough to
// glance at, and (unlike the full deck data) isolated in its own store so this
// cadence re-renders only the <img>, never the whole deck tree.
const MINIMAP_IMG_MS = 500;
const LIVE_FLUSH_MS = 250;
const subscribers = new Set<() => void>();
const expiryTimers = new Map<string, number>();
let liveState: LiveState = EMPTY_LIVE;
let snapshot: CompanionSnapshot = { data: FALLBACK, loading: false, error: null };
let accountIdState: number | null = null;
let runtimeStarted = false;
let runtimeActive = true;
// Collision breaker for utterance ids — see the `utterance` sub below.
let utteranceSeq = 0;
let docVisible = true;
let windowFocused = true;
let pendingLive: LiveState | null = null;
let flushTimer: number | null = null;
let lastCvAt = 0;
let lastFrameAt = 0;
let logsLoadedForInGame: boolean | null = null;
let lastOpenDotaAccountId: number | null = null;
let logsRequestSeq = 0;
let profileRequestSeq = 0;
let activitySeq = 0; // monotonic id source for buildActivity() — keeps ids pure/deterministic

function cloneLive(state: LiveState): LiveState {
  return {
    ...state,
    missing: new Map(state.missing),
    missingPos: new Map(state.missingPos),
    enemySlots: new Map(state.enemySlots),
  };
}

function buildCompanionData(live: LiveState): CompanionData {
  let d: CompanionData = live.active
    ? {
        ...FALLBACK,
        updatedAt: Date.now(),
        match: { ...buildMatch(live.tick, live.status, FALLBACK.match), matchPhase: live.phase },
        heroes: buildHeroes(live.tick, live.missing, live.cv, FALLBACK.heroes, live.enemySlots, live.roster, live.tick?.team_name ?? ""),
        markers: buildMarkers(live.cv, live.missingPos, FALLBACK.markers),
        signals: buildSignals(live.gank, live.missing),
        activity: live.activityLog,
        momentum: momentumView(live.mom, live.tick),
        utterances: live.utterances
      }
    : { ...FALLBACK, updatedAt: Date.now() };

  const od = live.od;
  if (od) {
    d = {
      ...d,
      match: { ...d.match, player: buildBaselines(d.match.player, od) },
      heroes: d.heroes.map((h, i) => (i === 0 ? { ...h, profile: buildProfile(od, h.profile) } : h)),
      weeklyReport: buildWeekly(od, d.weeklyReport),
      insights: buildInsights(od, d.insights)
    };
  }

  if (live.stats) {
    d = { ...d, telemetry: buildTelemetry(live.stats, d.telemetry) };
  }

  if (live.logs && live.logs.length > 0) {
    d = {
      ...d,
      history: buildHistory(live.logs, d.history),
      insights: { ...d.insights, learnedMatches: live.logs.length }
    };
  }

  if (live.active) {
    d = {
      ...d,
      agentSector: {
        ...d.agentSector,
        status: live.status?.gsi_active ? "Live orchestration" : "Standby"
      }
    };
  }

  return d;
}

function publish() {
  snapshot = { data: buildCompanionData(liveState), loading: false, error: null };
  subscribers.forEach((fn) => fn());
}

function subscribeStore(onStoreChange: () => void) {
  ensureRuntime();
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
}

function applyDerivedSideEffects() {
  const sid = liveState.tick?.steamid;
  if (sid && accountIdState == null) {
    try {
      const acc = Number(BigInt(sid) - STEAMID64_BASE);
      if (acc > 0) {
        accountIdState = acc;
        void saveIdentity({ steamid64: sid, accountId: acc });
        void refreshOpenDotaProfile(acc);
      }
    } catch {
      /* malformed steamid — ignore */
    }
  }

  const inGame = liveState.tick?.in_game ?? false;
  if (logsLoadedForInGame !== inGame) {
    logsLoadedForInGame = inGame;
    void refreshMatchLogs();
  }
}

function commitLive(next: LiveState, notify: boolean) {
  liveState = next;
  applyDerivedSideEffects();
  if (notify) publish();
}

function flushPending() {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pendingLive) return;
  const next = pendingLive;
  pendingLive = null;
  commitLive(next, true);
}

function scheduleFlush() {
  if (!runtimeActive || flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushPending();
  }, LIVE_FLUSH_MS);
}

function updateLive(mutator: (state: LiveState) => LiveState, immediate = false) {
  const base = pendingLive ?? liveState;
  const next = mutator(base);
  if (next === base) return;
  if (!runtimeActive) {
    pendingLive = null;
    commitLive(next, false);
    return;
  }
  if (immediate) {
    pendingLive = null;
    commitLive(next, true);
    return;
  }
  pendingLive = next;
  scheduleFlush();
}

function syncRuntimeActive() {
  const next = docVisible && windowFocused;
  if (runtimeActive === next) return;
  runtimeActive = next;
  if (runtimeActive) flushPending();
}

async function refreshOpenDotaProfile(accountId: number) {
  if (lastOpenDotaAccountId === accountId) return;
  lastOpenDotaAccountId = accountId;
  const req = ++profileRequestSeq;
  try {
    const od = await fetchOpenDotaProfile(String(accountId), heroName);
    if (req !== profileRequestSeq || !od) return;
    updateLive((s) => (s.od === od ? s : { ...s, od }), true);
  } catch {
    /* offline / private profile — stay on fallback */
  }
}

async function refreshMatchLogs() {
  const req = ++logsRequestSeq;
  try {
    const rows = await invoke<MatchLog[]>("list_match_logs");
    if (req !== logsRequestSeq) return;
    updateLive((s) => ({ ...s, logs: rows }), true);
  } catch {
    /* not under Tauri / command unavailable — stay on fallback */
  }
}

function bindControlActivity() {
  if (typeof document !== "undefined") {
    docVisible = document.visibilityState !== "hidden";
    document.addEventListener("visibilitychange", () => {
      docVisible = document.visibilityState !== "hidden";
      syncRuntimeActive();
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("focus", () => {
      windowFocused = true;
      syncRuntimeActive();
    });
    window.addEventListener("blur", () => {
      windowFocused = false;
      syncRuntimeActive();
    });
  }
  try {
    void getCurrentWindow().onFocusChanged(({ payload }) => {
      windowFocused = payload;
      syncRuntimeActive();
    });
  } catch {
    /* plain browser dev / non-Tauri runtime */
  }
  syncRuntimeActive();
}

function ensureRuntime() {
  if (runtimeStarted) return;
  runtimeStarted = true;
  bindControlActivity();

  function sub<T>(event: string, handler: (payload: T) => void) {
    try {
      listen<T>(event, (e) => handler(e.payload)).catch(() => {});
    } catch {
      /* not running under Tauri — stay on FALLBACK */
    }
  }

  sub<GameTick>("game-tick", (p) =>
    updateLive((s) => {
      // CR-007 WP-4 Fix 3: reset the permanent enemy-slot table (+ the missing
      // map that feeds it) on a new match. `clock_time <= 5` is the same
      // "match just started" heuristic the backend already uses for the
      // `match_start` announcer event (announcer.rs, `tick.clock_time <= 5`);
      // reusing it here means we detect a new match with the same signal the
      // rest of the app already treats as authoritative, instead of inventing
      // a second one. Guarded by the previous tick so we only reset on the
      // actual transition (pre-game -> pre-game with clock<=5 would otherwise
      // re-reset every single tick).
      const isNewMatch = p.clock_time <= 5 && (!s.tick || s.tick.clock_time > 5 || !s.tick.in_game);
      // Advance the momentum EWMA from the prior state (reset on a new match so
      // last match's swing doesn't bleed in). gpm baseline isn't threaded here
      // yet, so pass p.gpm → the economy term is 0 (kill-lead + swing only).
      const mom = stepMomentum(isNewMatch ? EMPTY_MOMENTUM : s.mom, p, p.gpm);
      // CR-011 §E: advance the phase axis from this tick's game_state/in_game,
      // using whatever gsi-status last reported (a game-tick implies GSI is
      // posting, but `gsiOnline` here should still reflect the watchdog's own
      // view, not be inferred from the mere fact a tick arrived).
      const phase = stepPhase(s.phase, {
        gsiOnline: s.status?.gsi_active ?? false,
        gameState: p.game_state,
        inGame: p.in_game,
        clockSeconds: p.clock_time
      });
      if (isNewMatch) {
        return { ...s, tick: p, active: true, missing: new Map(), missingPos: new Map(), enemySlots: new Map(), mom, phase };
      }
      return { ...s, tick: p, active: true, mom, phase };
    })
  );
  sub<GsiStatus>("gsi-status", (p) =>
    updateLive((s) => ({
      ...s,
      status: p,
      active: true,
      phase: stepPhase(s.phase, {
        gsiOnline: p.gsi_active,
        gameState: s.tick?.game_state ?? null,
        inGame: s.tick?.in_game ?? false,
        clockSeconds: s.tick?.clock_time ?? -1
      })
    }))
  );
  sub<ResourceStats>("resource-stats", (p) => updateLive((s) => ({ ...s, stats: p }), true));
  sub<MinimapCv>("minimap-cv", (p) => {
    const now = Date.now();
    if (now - lastCvAt < CV_UPDATE_MS) return;
    lastCvAt = now;
    updateLive((s) => {
      let enemySlots = s.enemySlots;
      for (const d of p.detections) {
        if (d.name) enemySlots = assignEnemySlot(enemySlots, d.name);
      }
      if (enemySlots === s.enemySlots) return { ...s, cv: p, active: true };
      return { ...s, cv: p, enemySlots, active: true };
    });
  });
  sub<DraftRoster>("draft-roster", (p) =>
    updateLive((s) => ({ ...s, roster: p, active: true }), true)
  );
  sub<MinimapFrame>("minimap-frame", (p) => {
    const now = Date.now();
    if (now - lastFrameAt < MINIMAP_IMG_MS) return;
    lastFrameAt = now;
    setMinimapImage(p.image || null);
  });
  sub<SignalAlert>("gank-alert", (p) =>
    updateLive((s) => ({
      ...s,
      gank: p,
      active: true,
      activityLog: buildActivity({ kind: "gank-alert", payload: p }, Date.now(), ++activitySeq, s.activityLog)
    }), true)
  );
  sub<unknown>("gank-clear", () =>
    updateLive((s) => ({
      ...s,
      gank: null,
      missing: new Map(),
      missingPos: new Map(),
      active: true,
      activityLog: buildActivity({ kind: "gank-clear" }, Date.now(), ++activitySeq, s.activityLog)
    }), true)
  );
  sub<EnemyMissing>("enemy-missing", (p) => {
    updateLive((s) => {
      const next = cloneLive(s);
      next.missing.set(p.hero, p.missing_for_ms);
      next.missingPos.set(p.hero, p.last_pos);
      next.enemySlots = assignEnemySlot(next.enemySlots, p.hero);
      next.active = true;
      next.activityLog = buildActivity({ kind: "enemy-missing", payload: p }, Date.now(), ++activitySeq, s.activityLog);
      return next;
    });
    const prev = expiryTimers.get(p.hero);
    if (prev) window.clearTimeout(prev);
    const t = window.setTimeout(() => {
      updateLive((s) => {
        if (!s.missing.has(p.hero) && !s.missingPos.has(p.hero)) return s;
        const next = cloneLive(s);
        next.missing.delete(p.hero);
        next.missingPos.delete(p.hero);
        return next;
      }, true);
      expiryTimers.delete(p.hero);
    }, 30_000);
    expiryTimers.set(p.hero, t);
  });
  sub<UtteranceEvent>("utterance", (p) => {
    // Monotonic seq (not Date.now()) as the collision breaker: a 3rd same-source
    // event in one wall-clock ms would otherwise regenerate the same fallback id
    // and duplicate a React key (Opus gate, CR011-P2).
    utteranceSeq += 1;
    const seq = utteranceSeq;
    updateLive((s) => ({ ...s, active: true, utterances: buildUtterances(s.utterances, p, p.atMs + seq) }), true);
  });

  const syncIdentity = () => {
    void loadIdentity().then((id) => {
      const next = id?.accountId ?? null;
      if (accountIdState === next) return;
      accountIdState = next;
      if (next != null) void refreshOpenDotaProfile(next);
    });
  };
  syncIdentity();
  if (typeof window !== "undefined") window.addEventListener(IDENTITY_EVENT, syncIdentity);
  void refreshMatchLogs();
}

export function useCompanionData() {
  return useSyncExternalStore(
    subscribeStore,
    () => snapshot,
    () => snapshot
  );
}

// --- Live minimap mirror -----------------------------------------------------
// The captured minimap image (base64 PNG data URL from capture.rs `minimap-frame`)
// lives in its OWN tiny external store, deliberately separate from CompanionData.
// The image refreshes ≈2 Hz and is a few KB; folding it into the big snapshot
// would re-run every deck builder and re-render the whole tree at that cadence.
// Isolated here, only the <img> subtree (useMinimapImage consumers) updates —
// the WebView2 render fan-out is the sensitive CPU path in this window.
let minimapImage: string | null = null;
const minimapSubs = new Set<() => void>();

function setMinimapImage(url: string | null) {
  if (minimapImage === url) return;
  minimapImage = url;
  for (const cb of minimapSubs) cb();
}

/** Latest live minimap mirror as a `data:` URL, or `null` before any frame /
 *  outside Tauri. Subscribing also guarantees the event runtime is started. */
export function useMinimapImage(): string | null {
  // Piggy-back on the main store's subscribe so the Tauri `minimap-frame`
  // listener (registered in ensureRuntime) is running even if a consumer uses
  // only this hook.
  useSyncExternalStore(subscribeStore, () => snapshot, () => snapshot);
  return useSyncExternalStore(
    (cb) => {
      minimapSubs.add(cb);
      return () => minimapSubs.delete(cb);
    },
    () => minimapImage,
    () => minimapImage
  );
}

export function useCompanionDataSelector<T>(
  selector: (data: CompanionData) => T,
  isEqual: (prev: T, next: T) => boolean = Object.is
) {
  const selectionRef = useRef<T>(selector(snapshot.data));
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  return useSyncExternalStore(
    subscribeStore,
    () => {
      const next = selectorRef.current(snapshot.data);
      if (!isEqualRef.current(selectionRef.current, next)) {
        selectionRef.current = next;
      }
      return selectionRef.current;
    },
    () => selectionRef.current
  );
}

export function toneClass(tone: CompanionTone) {
  return `tone-${tone}`;
}

// CR-007 WP-4 Fix 2: hero.kills/deaths/assists are optional (honest "unknown"
// slots — see HeroState "empty" + emptyHeroSlot above). Every consumer that
// renders a K/D/A line must go through this guard instead of interpolating
// the three fields directly, or an undefined field renders as a literal
// "undefined" and the missing separators collapse into a bare "//".
export function formatKda(
  hero: { kills?: number; deaths?: number; assists?: number },
  separator = " / "
): string {
  return hero.kills !== undefined && hero.deaths !== undefined && hero.assists !== undefined
    ? `${hero.kills}${separator}${hero.deaths}${separator}${hero.assists}`
    : "—";
}

export function formatTimer(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
