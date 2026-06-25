/**
 * Overlay module registry for the Full (redesign) tier.
 *
 * The redesign's core idea: each overlay piece is an independent MODULE the user
 * can position + scale freely (vs the lite tier's single stacked column). The
 * layout lives in Settings (persisted + broadcast to the overlay), so the Control
 * window's layout editor and the live overlay share one source of truth.
 */

export type ModuleId =
  | 'alert'
  | 'companion'
  | 'advice'
  | 'missing'
  | 'clock'
  | 'kda'
  | 'gold'
  | 'gpm'
  | 'xpm'
  | 'nw'
  | 'score'
  | 'hero'

export interface ModuleCfg {
  /** position as % of the screen (centre-anchored) */
  x: number
  y: number
  /** size multiplier */
  scale: number
  enabled: boolean
}

export type Layout = Record<ModuleId, ModuleCfg>

export const MODULE_META: { id: ModuleId; label: string }[] = [
  { id: 'alert', label: 'Danger Alert' },
  { id: 'companion', label: 'Maiden Presence' },
  { id: 'advice', label: 'Advice' },
  { id: 'missing', label: 'Enemy Missing' },
  { id: 'clock', label: 'Clock' },
  { id: 'kda', label: 'K / D / A' },
  { id: 'gold', label: 'Gold' },
  { id: 'gpm', label: 'GPM' },
  { id: 'xpm', label: 'XPM' },
  { id: 'nw', label: 'Net Worth' },
  { id: 'score', label: 'Score' },
  { id: 'hero', label: 'HP / Mana' },
]

/**
 * Peripheral-first defaults — corners/edges, never over the play area. Stat
 * chips are positioned in a row but OFF by default (Dota already shows them;
 * the user enables + places what they want).
 */
export const DEFAULT_LAYOUT: Layout = {
  alert: { x: 50, y: 6, scale: 1, enabled: true },
  companion: { x: 9, y: 11, scale: 1, enabled: true },
  advice: { x: 50, y: 88, scale: 1, enabled: true },
  missing: { x: 88, y: 8, scale: 1, enabled: true },
  clock: { x: 50, y: 4, scale: 1, enabled: false },
  kda: { x: 20, y: 24, scale: 1, enabled: true },
  gold: { x: 30, y: 24, scale: 1, enabled: false },
  gpm: { x: 39, y: 24, scale: 1, enabled: false },
  xpm: { x: 47, y: 24, scale: 1, enabled: false },
  nw: { x: 56, y: 24, scale: 1, enabled: false },
  score: { x: 50, y: 11, scale: 1, enabled: false },
  hero: { x: 14, y: 33, scale: 1, enabled: false },
}

/** Read a module's config with a safe fallback (covers old/partial saved layouts). */
export const cfgOf = (layout: Layout | undefined, id: ModuleId): ModuleCfg =>
  layout?.[id] ?? DEFAULT_LAYOUT[id]
