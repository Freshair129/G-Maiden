// Wire contract for live Tauri events emitted by the Rust backend.
// Field names mirror the serde JSON exactly (snake_case) — see src-tauri/src/*.rs.
// Single source of truth so every live builder + the integration hook agree.
//
// Emit sites (relative to worktree root):
//   game-tick     gsi.rs:136        ~30s GSI heartbeat (LOCAL player only)
//   gsi-status    gsi.rs:194        every 4s watchdog
//   minimap-cv    capture.rs:314    ~5Hz CV debug (detections = pixels within region)
//   enemy-missing capture.rs:261    edge, per hero crossing 5s threshold
//   gank-alert    capture.rs:292    edge, gank probability >= danger threshold
//   gank-clear    capture.rs:297    edge, unit payload
//   capture-mode  capture.rs:140/151  once at startup: "lite" | "dxgi"
//   resource-stats governor.rs:60   every 10s

/** game-tick — GSI snapshot of the LOCAL player only (not all 10 heroes). */
export interface GameTick {
  in_game: boolean;
  clock_time: number;      // seconds; negative before horn
  game_state: string;      // e.g. "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS"
  daytime: boolean;
  radiant_score: number;
  dire_score: number;
  gold: number;
  net_worth: number;
  gpm: number;
  xpm: number;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  hero: string;            // "npc_dota_hero_crystal_maiden"
  level: number;
  alive: boolean;
  hp_percent: number;      // 0..100
  mana_percent: number;    // 0..100
  steamid?: string;        // player.steamid (SteamID64), "" / absent in menu — auto-identify

  buyback_cost: number;    // 0 when N/A
  respawn_seconds: number; // 0 when alive
  kill_list_len: number;
  last_victim_slot: number;
}

/** gsi-status — connection/liveliness pushed every ~4s. */
export interface GsiStatus {
  dota_running: boolean;
  gsi_active: boolean;
  in_game: boolean;
  display_exclusive: boolean;
}

/** A single confirmed hero detection inside the minimap-cv payload.
 *  x/y are PIXELS within the captured region (0..region.side), NOT normalised. */
export interface CvDetection {
  label: number;
  name: string;   // "npc_dota_hero_crystal_maiden"
  x: number;      // pixel within region
  y: number;      // pixel within region
  score: number;  // 0..1 softmax confidence
}

export interface MinimapRegion {
  x: number;    // top-left screen px
  y: number;    // top-left screen px
  side: number; // square side in px — divide detection x/y by this to normalise
}

/** minimap-cv — CV debug/detection feed (~5Hz). */
export interface MinimapCv {
  region: MinimapRegion;
  icon: number;
  candidates: [number, number][];
  count: number;
  detections: CvDetection[];
  classifier: boolean;
}

/** enemy-missing — edge event, last_pos already normalised to [0,1]². */
export interface EnemyMissing {
  hero: string;
  missing_for_ms: number;   // >= 5000
  last_pos: [number, number]; // normalised [0,1]
}

/** gank-alert — G-Signal gank warning (SignalAlert). */
export interface SignalAlert {
  probability: number;      // 0..1
  missing_heroes: string[];
  eta_ms: number;
}

/** resource-stats — G-Governor RAM/CPU sample every 10s. */
export interface ResourceStats {
  ram_mb: number;
  cpu_pct: number;
  over_budget: boolean;
}

export type CaptureMode = "lite" | "dxgi" | "";

/** Strip the GSI prefix and title-case: "npc_dota_hero_crystal_maiden" -> "Crystal Maiden". */
export function prettyHeroName(npcName: string): string {
  if (!npcName) return "";
  return npcName
    .replace(/^npc_dota_hero_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
