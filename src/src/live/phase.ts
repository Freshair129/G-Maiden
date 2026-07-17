// Pure match-phase state machine (CR-011 §B/§E, CR011-P3-02).
// No Tauri/React imports — same house pattern as buildMomentum.ts: inputs in,
// one new value out, fully deterministic and unit-testable in isolation.
//
// The Command Deck is "glanced at, not used" while live and "used, not
// glanced at" between matches (CR-011 §A) — the booth changes ITSELF across
// four phases instead of being browsed. This machine derives that phase from
// the same GSI signals the rest of the app already trusts (gsi.rs `is_in_game`
// / `is_in_draft`, GameTick.in_game, GsiStatus.gsi_active) — it invents no new
// backend concept, only a UI-side reduction of states the backend already emits.

export type MatchPhase = "standby" | "prep" | "live" | "debrief";

export type PhaseInput = {
  /** GsiStatus.gsi_active — false means the backend hasn't heard from GSI
   *  recently (watchdog, gsi.rs). Not connected = nothing else is trustworthy. */
  gsiOnline: boolean;
  /** GameTick.game_state verbatim, e.g. "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS".
   *  null/undefined/"" when no tick has arrived yet (menu, or pre-GSI). */
  gameState?: string | null;
  /** GameTick.in_game — the backend's own `is_in_game` reduction (gsi.rs), an
   *  OR'd shortcut for the two live states below so callers that only have the
   *  boolean (not the raw string) still classify correctly. */
  inGame: boolean;
  /** GameTick.clock_time in seconds. Not consulted by this machine today (no
   *  phase boundary depends on match clock, only on `game_state`/`inGame`) —
   *  kept in the input contract because the phase axis is clock-adjacent and
   *  a future phase split (e.g. early/late debrief) may want it without a
   *  breaking signature change. */
  clockSeconds: number;
};

// gsi.rs `is_in_draft`: the hero-pick / strategy window before the horn.
const DRAFT_STATES = new Set<string>([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  // Not covered by gsi.rs `is_in_draft` (Draft-CV only wakes for the two above),
  // but still squarely "getting ready, not yet on the map" per gsi.rs's own
  // `in_game_only_during_active_play` test fixture — teaching content here
  // ("กำลังดราฟต์ — รอเข้าเกม") is honest for all of these.
  "DOTA_GAMERULES_STATE_TEAM_SHOWCASE",
  "DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD",
  "DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD",
]);

// gsi.rs `is_in_game`: the tight "actually in a match" definition.
const LIVE_STATES = new Set<string>([
  "DOTA_GAMERULES_STATE_PRE_GAME",
  "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
]);

const POST_STATES = new Set<string>(["DOTA_GAMERULES_STATE_POST_GAME"]);

/**
 * Advance the match phase by one GSI observation. Deterministic, hysteresis-
 * style — the same `prev` + `input` pair always yields the same result, and
 * the only "memory" is `prev` itself (debrief stickiness / the live->debrief
 * edge), so this never flaps on a single noisy sample.
 *
 * Rules (CR-011 §E order of precedence):
 * 1. GSI offline -> "standby", EXCEPT a prior "debrief" survives Dota closing
 *    (a finished match's debrief is honest context even after GSI drops).
 * 2. A recognized live state (or `inGame`) -> "live".
 * 3. A recognized draft/hero-selection/loading state -> "prep".
 * 4. A recognized post-game state -> "debrief".
 * 5. Anything else while GSI is online (menu/init/disconnect/unknown future
 *    value): if we were "live", the match just ended without an explicit
 *    POST_GAME tick (e.g. a disconnect) -> "debrief"; if we were already
 *    "debrief", stay there until the next real prep/live; otherwise "standby".
 */
export function stepPhase(prev: MatchPhase, input: PhaseInput): MatchPhase {
  if (!input.gsiOnline) {
    return prev === "debrief" ? "debrief" : "standby";
  }

  const state = input.gameState ?? "";

  if (LIVE_STATES.has(state) || input.inGame) return "live";
  if (DRAFT_STATES.has(state)) return "prep";
  if (POST_STATES.has(state)) return "debrief";

  // Unknown/menu/init/disconnect/nonsense-future-value state while GSI is
  // still connected.
  if (prev === "live") return "debrief";
  if (prev === "debrief") return "debrief";
  return "standby";
}
