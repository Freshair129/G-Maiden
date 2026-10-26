/**
 * Overlay module registry for the Full (redesign) tier.
 *
 * The redesign's core idea: each overlay piece is an independent MODULE the user
 * can position + scale freely (vs the lite tier's single stacked column). The
 * layout lives in Settings (persisted + broadcast to the overlay).
 *
 * G-Maiden's in-app editor and G-AnnStudio's sync receiver both update
 * Settings.layout. The renderer and editor share the same reference geometry.
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

/** Measured against the bundled 1920×1080 Steam capture, 20261019153246_1.jpg.
 * Keep the player's central view and Dota's fixed HUD clear; use the right rail.
 * Existing custom layouts are preserved until the player chooses Reset. */
export const DEFAULT_LAYOUT: Layout = {
  alert: { x: 89, y: 54, scale: 0.75, enabled: true },
  gmeter: { x: 89, y: 26, scale: 0.9, enabled: true },
  toast: { x: 89, y: 67, scale: 0.7, enabled: true },
  companion: { x: 82, y: 5, scale: 0.8, enabled: true },
  advice: { x: 89, y: 75, scale: 0.75, enabled: true },
  buyback: { x: 89, y: 84, scale: 0.75, enabled: true },
  missing: { x: 89, y: 33, scale: 0.8, enabled: true },
  banner: { x: 89, y: 44, scale: 0.7, enabled: true },
  lowhp: { x: 89, y: 61, scale: 0.8, enabled: true },
  vol: { x: 78, y: 94, scale: 0.8, enabled: true },
  standby: { x: 93, y: 10, scale: 0.85, enabled: true },
  clock: { x: 78, y: 13, scale: 1, enabled: true },
  score: { x: 84.5, y: 13, scale: 1, enabled: true },
  kda: { x: 91, y: 13, scale: 1, enabled: true },
  gold: { x: 97, y: 13, scale: 1, enabled: true },
  gpm: { x: 84.5, y: 19, scale: 1, enabled: true },
  xpm: { x: 91, y: 19, scale: 1, enabled: false },
  nw: { x: 97, y: 19, scale: 1, enabled: true },
  hero: { x: 79.5, y: 35, scale: 0.8, enabled: false },
}

/** Read a module's config with a safe fallback (covers old/partial saved layouts). */
export const cfgOf = (layout: Layout | undefined, id: ModuleId): ModuleCfg =>
  layout?.[id] ?? DEFAULT_LAYOUT[id]

/** Reference viewport the boxes below are measured against. */
export const BOX_REF = { w: 1920, h: 1080 } as const

/** Reserved content boxes at the 1920×1080 reference viewport.
 * FullOverlay fits content inside these boxes and scales with the viewport;
 * the editor uses the same geometry for dragging and HUD collision warnings.
 * Geometry is renderer-owned, so the persisted layout contract stays unchanged.
 */
export const MODULE_BOX: Record<ModuleId, { w: number; h: number }> = {
  alert: { w: 420, h: 80 },
  gmeter: { w: 300, h: 36 },
  toast: { w: 460, h: 80 },
  companion: { w: 190, h: 64 },  // minWidth 142 + 44px portrait
  advice: { w: 420, h: 120 },
  buyback: { w: 420, h: 120 },
  missing: { w: 300, h: 84 },
  banner: { w: 420, h: 210 },    // art plus caption / waveform
  lowhp: { w: 300, h: 38 },      // pad 9/22, one line
  vol: { w: 190, h: 34 },        // icon + 80px bar + 32px readout
  standby: { w: 150, h: 50 },    // dot + two text lines
  clock: { w: 78, h: 30 },       // chip with no label row
  kda: { w: 90, h: 43 },         // chip + label
  gold: { w: 90, h: 43 },
  gpm: { w: 78, h: 43 },
  xpm: { w: 78, h: 43 },
  nw: { w: 96, h: 43 },
  score: { w: 96, h: 43 },
  hero: { w: 160, h: 62 },       // minWidth 140 + name line + hp/mana bars
}

/**
 * A module's footprint as a percentage of `viewport`, honouring `scale`.
 * Returns the full box; callers that position from the centre (as `Module`
 * does via `translate(-50%, -50%)`) should halve it to get the edges.
 */
export function boxPercent(
  id: ModuleId,
  cfg: Pick<ModuleCfg, 'scale'>,
  viewport: { w: number; h: number } = BOX_REF,
): { w: number; h: number } {
  const box = MODULE_BOX[id]
  return {
    w: ((box.w * cfg.scale) / viewport.w) * 100,
    h: ((box.h * cfg.scale) / viewport.h) * 100,
  }
}
