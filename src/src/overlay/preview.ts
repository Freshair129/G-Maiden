import type { GameTick } from '../app/types'

/** Render-only fixture. Never publish this as game-tick. */
export const OVERLAY_PREVIEW_TICK: GameTick = {
  in_game: true, clock_time: 600, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  daytime: true, radiant_score: 12, dire_score: 9, gold: 1500, net_worth: 8200, gpm: 520, xpm: 610,
  kills: 4, deaths: 2, assists: 7, last_hits: 88, denies: 6, hero: 'npc_dota_hero_crystal_maiden',
  level: 9, alive: true, respawn_seconds: 0, hp_percent: 80, mana_percent: 42,
  kill_list_len: 0, last_victim_slot: -1,
}
