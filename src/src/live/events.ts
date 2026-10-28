// Wire contract for live Tauri events emitted by the Rust backend.
// Field names mirror the serde JSON exactly (snake_case) — see src-tauri/src/*.rs.
// Single source of truth so every live builder + the integration hook agree.
//
// Emit sites (relative to worktree root):
//   game-tick     gsi.rs:136        validated GSI observation (LOCAL player only)
//   gsi-status    gsi.rs:194        every 500ms freshness watchdog + observations
//   minimap-cv    capture.rs:314    ~5Hz CV debug (detections = pixels within region)
//   minimap-frame capture.rs        ~3Hz live minimap mirror (base64 PNG data URL)
//   draft-roster  capture.rs (portrait CV only)  10-hero roster from the pick screen
//   enemy-missing capture.rs:261    edge, per hero crossing 5s threshold
//   gank-alert    capture.rs:292    edge, gank probability >= danger threshold
//   gank-clear    capture.rs:297    edge, unit payload
//   capture-mode  capture.rs  state transitions: initializing/retrying/lite/dxgi/gdi
//   sensor-health capture.rs        edge + ~1Hz heartbeat; the ONLY honest
//                                   answer to "is the minimap sensor alive?"
//   resource-stats governor.rs:163  every 1s

export type MatchLifecycle = "draft" | "live" | "disconnected" | "end" | "abandon";

/** Canonical match identity and process-local session epoch. Optional because
 *  the overlay preview and older desktop builds can still publish ticks. */
export interface MatchSessionMetadata {
  match_id?: string | null;
  session_id?: string | null;
  session_epoch?: number;
  session_lifecycle?: MatchLifecycle | null;
}

/** game-tick — GSI snapshot of the LOCAL player only (not all 10 heroes). */
export interface GameTick extends MatchSessionMetadata {
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

export type GsiFreshness = "unavailable" | "waiting" | "fresh" | "stale";

/** gsi-status — connection and validated-source freshness, refreshed at 500ms. */
export interface GsiStatus extends MatchSessionMetadata {
  dota_running: boolean;
  gsi_active: boolean;
  gsi_freshness: GsiFreshness;
  gsi_age_ms: number | null;
  in_game: boolean;
  display_exclusive: boolean;
  server_state: "starting" | "listening" | "port_conflict" | "bind_error";
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
export interface MinimapCv extends MatchSessionMetadata {
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
export interface MinimapFrame extends MatchSessionMetadata {
  image: string;
  region: MinimapRegion;
  /** Bounds of the map interior represented by image, relative to region.side. */
  map_crop: { left: number; top: number; right: number; bottom: number };
}

/** draft-roster — slot-preserving progress from the pick-screen CV read.
 *  Null slots are unknown; arrays always map to the same 5 player positions. */
export interface DraftRoster extends MatchSessionMetadata {
  radiant: Array<string | null>;
  dire: Array<string | null>;
  complete: boolean;
  recognizer_active: boolean;
  templates_loading: boolean;
}

export type HeroHudCue = "death_hint" | "colored" | "unknown";

export interface HeroHudSlot {
  cue: HeroHudCue;
  /** Mean RGB chroma over the portrait, 0..255. Low chroma is only a visual death hint. */
  mean_chroma: number;
}

/** hero-hud — one sample per topbar player slot; identity is joined by draft slot order. */
export interface HeroHudRead extends MatchSessionMetadata {
  radiant: HeroHudSlot[];
  dire: HeroHudSlot[];
}

/** enemy-missing — edge event, last_pos already normalised to [0,1]². */
export interface EnemyMissing extends MatchSessionMetadata {
  hero: string;
  missing_for_ms: number;   // >= 5000
  last_pos: [number, number]; // normalised [0,1]
}

/** gank-alert — G-Signal gank warning (SignalAlert). */
export interface SignalAlert extends MatchSessionMetadata {
  probability: number;      // 0..1
  missing_heroes: string[];
  eta_ms: number;
}

/** resource-stats — G-Governor sample every second. CPU is the Windows Job
 *  Object process group, normalized by logical CPU capacity and hard-capped at
 *  10% when Job Object setup succeeds. A negative sample means the CPU group
 *  cannot be measured; this payload does not distinguish setup from query failure. */
export interface ResourceStats {
  ram_mb: number;
  cpu_pct: number;
  cpu_group_processes: number;
  over_budget: boolean;
  /** Session peaks (max since launch) from the whole-app governor. */
  peak_cpu_pct?: number;
  peak_ram_mb?: number;
  gpu_pct: number;        // -1 when the active telemetry source is absent/stale
  gpu_temp_c: number;     // -1 = unavailable
  vram_used_mb: number;   // -1 = unavailable
  vram_total_mb: number;  // -1 = unavailable
  cpu_temp_c: number;     // -1 unless the rich G-Telemetry source provides it
}

export type CaptureMode = "initializing" | "retrying" | "lite" | "dxgi" | "gdi" | "";

/** utterance — G-Signal/G-Master/G-AnnStudio persona line for the ON AIR console
 *  (CR-011 §B). Unlike the events above (snake_case, mirroring serde JSON on the
 *  wire), this payload is camelCase per the CR011-P2-02 contract — the backend
 *  worker adding the emit side is following the same shape. */
export interface UtteranceEvent extends MatchSessionMetadata {
  atMs: number;
  source: "signal" | "master" | "announcer";
  kind: "line" | "revision";
  phase: "generated" | "requested" | "admitted";
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
