// Wire contract for live Tauri events emitted by the Rust backend.
// Field names mirror the serde JSON exactly (snake_case) — see src-tauri/src/*.rs.
// Single source of truth so every live builder + the integration hook agree.
//
// Emit sites (relative to worktree root):
//   game-tick     gsi.rs:136        ~30s GSI heartbeat (LOCAL player only)
//   gsi-status    gsi.rs:194        every 4s watchdog
//   minimap-cv    capture.rs:314    ~5Hz CV debug (detections = pixels within region)
//   minimap-frame capture.rs        ~3Hz live minimap mirror (base64 PNG data URL)
//   draft-roster  capture.rs / set_draft_roster cmd  10-hero roster from the pick screen
//   enemy-missing capture.rs:261    edge, per hero crossing 5s threshold
//   gank-alert    capture.rs:292    edge, gank probability >= danger threshold
//   gank-clear    capture.rs:297    edge, unit payload
//   capture-mode  capture.rs:140/151  once at startup: "lite" | "dxgi"
//   sensor-health capture.rs        edge + ~1Hz heartbeat; the ONLY honest
//                                   answer to "is the minimap sensor alive?"
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
  team_name: string;       // "radiant" | "dire" | "" — the LOCAL player's side
  level: number;
  alive: boolean;
  hp_percent: number;      // 0..100
  mana_percent: number;    // 0..100
  steamid?: string;        // player.steamid (SteamID64), "" / absent in menu — auto-identify

  buyback_cost: number;    // 0 when N/A
  respawn_seconds: number; // 0 when alive
  kill_list_len: number;
  last_victim_slot: number;
  /** Player's real current inventory (items.rs). Rust has always sent this;
   *  the deck simply never typed it. Drives the Build tab's item card.
   *  Optional to mirror the Rust field's `#[serde(default)]` — a tick
   *  round-tripped from an older build legitimately omits it. */
  item_names?: string[];
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

/** sensor-health — honest state of the minimap sensor (capture.rs). Edge-triggered
 *  on any field below plus a ~1Hz heartbeat, and broadcast to BOTH windows.
 *
 *  Branch on `healthy` before rendering ANY affirmative "safe" reading. An empty
 *  missing-hero set means "nothing detected", which is indistinguishable from
 *  "nothing is being detected" — Lite mode, a missing ONNX model, or a capture
 *  stall all produce it. `backend`/`classifier`/`throttled`/`frameAgeMs` are
 *  diagnosis, not the gate. Note `backend: "gdi"` is still healthy: frames flow,
 *  just via the CPU BitBlt fall-back rather than Desktop Duplication. */
export interface SensorHealth {
  backend: "dxgi" | "gdi" | "lite";
  classifier: boolean;
  throttled: boolean;
  /** null in Lite mode: no capture loop means no frame clock to report. */
  frameAgeMs: number | null;
  healthy: boolean;
}

/** minimap-frame — live minimap mirror for the Command Deck (~3Hz). `image` is a
 *  ready-to-render base64 `data:image/png` URL of the downscaled captured minimap;
 *  `region` is the same geometry as minimap-cv, in screen px. */
export interface MinimapFrame {
  image: string;
  region: MinimapRegion;
}

/** draft-roster — the full 10-hero roster read off the pick screen (Draft-CV),
 *  raw labels.json short form (e.g. "crystal_maiden"). Fills ally identities GSI
 *  can't expose and pre-seeds enemy slots. Split by team; index-independent. */
export interface DraftRoster {
  radiant: string[];
  dire: string[];
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

/** resource-stats — G-Governor RAM/CPU sample every 10s. GPU fields are bridged
 *  in from the sibling G-Telemetry app; `-1` = unavailable (bridge not running). */
export interface ResourceStats {
  ram_mb: number;
  cpu_pct: number;
  over_budget: boolean;
  /** Session peaks (max since launch) from the governor — prove the SRS §5.1
   *  budgets held over a match. Own-process, core-normalized (deck WebView2 is a
   *  separate process, not counted). Optional: absent on older ticks. */
  peak_cpu_pct?: number;
  peak_ram_mb?: number;
  gpu_pct: number;        // -1 when the active telemetry source is absent/stale
  gpu_temp_c: number;     // -1 = unavailable
  vram_used_mb: number;   // -1 = unavailable
  vram_total_mb: number;  // -1 = unavailable
  cpu_temp_c: number;     // -1 unless the rich G-Telemetry source provides it
}

export type CaptureMode = "lite" | "dxgi" | "";

/** utterance — G-Signal/G-Master/G-AnnStudio persona line for the ON AIR console
 *  (CR-011 §B). Unlike the events above (snake_case, mirroring serde JSON on the
 *  wire), this payload is camelCase per the CR011-P2-02 contract — the backend
 *  worker adding the emit side is following the same shape. */
export interface UtteranceEvent {
  atMs: number;
  source: "signal" | "master" | "announcer";
  kind: "line" | "revision";
  text: string;
  retracted?: string | null;
  meta?: string | null; // master: "claude"|"ollama"; announcer: pack name
}

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
