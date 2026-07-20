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
  | 'gmeter'
  | 'toast'
  | 'companion'
  | 'advice'
  | 'buyback'
  | 'missing'
  | 'banner'
  | 'lowhp'
  | 'vol'
  | 'standby'
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
  { id: 'gmeter', label: 'G-Meter (risk)' },
  { id: 'toast', label: 'Voice Notice (toast)' },
  { id: 'companion', label: 'Maiden Presence' },
  { id: 'advice', label: 'Advice' },
  { id: 'buyback', label: 'Buyback (G-Revive)' },
  { id: 'missing', label: 'Enemy Missing' },
  { id: 'banner', label: 'Kill / Announcer Banner' },
  { id: 'lowhp', label: 'Low HP Warning' },
  { id: 'vol', label: 'Volume Toast' },
  { id: 'standby', label: 'Standby Chip (pre-game)' },
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
 * Defaults follow Boss's in-game guide (2026-07-20 screenshot): a stat strip
 * along the TOP-LEFT edge (the one area Dota leaves empty — its own top bar
 * of hero portraits starts ≈x35), Maiden presence on the left edge at mid
 * height, alerts centre but BELOW the portrait bar, verdict cards centre-low
 * above Dota's bottom HUD. Nothing may sit over the minimap (bottom-left),
 * the bottom-centre HUD, the item/shop cluster (bottom-right), or the
 * scoreboard/FPS corner (top-right).
 */
export const DEFAULT_LAYOUT: Layout = {
  alert: { x: 50, y: 12, scale: 1, enabled: true },
  gmeter: { x: 7, y: 47, scale: 1, enabled: true },
  toast: { x: 50, y: 19, scale: 1, enabled: true },
  companion: { x: 7, y: 39, scale: 1, enabled: true },
  advice: { x: 50, y: 72, scale: 1, enabled: true },
  buyback: { x: 50, y: 63, scale: 1, enabled: true },
  missing: { x: 88, y: 12, scale: 1, enabled: true },
  // Kill & pack banners share one slot (mutually exclusive), upper-centre
  // where the in-game kill feed reads. lowhp/vol/standby are transient cues.
  banner: { x: 50, y: 27, scale: 1, enabled: true },
  lowhp: { x: 50, y: 44, scale: 1, enabled: true },
  vol: { x: 50, y: 92, scale: 1, enabled: true },
  standby: { x: 50, y: 50, scale: 1, enabled: true },
  // Top-left stat strip per the guide: clock → KDA → gold → GPM → NW, y=4.
  clock: { x: 5, y: 4, scale: 1, enabled: true },
  kda: { x: 12, y: 4, scale: 1, enabled: true },
  gold: { x: 19, y: 4, scale: 1, enabled: true },
  gpm: { x: 26, y: 4, scale: 1, enabled: true },
  xpm: { x: 26, y: 10, scale: 1, enabled: false },
  nw: { x: 32, y: 4, scale: 1, enabled: true },
  score: { x: 58, y: 4, scale: 1, enabled: false },
  hero: { x: 14, y: 33, scale: 1, enabled: false },
}

/** Read a module's config with a safe fallback (covers old/partial saved layouts). */
export const cfgOf = (layout: Layout | undefined, id: ModuleId): ModuleCfg =>
  layout?.[id] ?? DEFAULT_LAYOUT[id]
