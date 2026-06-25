/**
 * Overlay module registry for the Full (redesign) tier.
 *
 * The redesign's core idea: each overlay piece is an independent MODULE the user
 * can position + scale freely (vs the lite tier's single stacked column). The
 * layout lives in Settings (persisted + broadcast to the overlay), so the Control
 * window's layout editor and the live overlay share one source of truth.
 */

export type ModuleId = 'alert' | 'presence' | 'missing' | 'advice'

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
  { id: 'presence', label: 'Maiden + Stats' },
  { id: 'missing', label: 'Enemy Missing' },
  { id: 'advice', label: 'Advice' },
]

/** Peripheral-first defaults — corners/edges, never over the play area. */
export const DEFAULT_LAYOUT: Layout = {
  alert: { x: 50, y: 6, scale: 1, enabled: true },
  presence: { x: 12, y: 9, scale: 1, enabled: true },
  missing: { x: 88, y: 9, scale: 1, enabled: true },
  advice: { x: 50, y: 88, scale: 1, enabled: true },
}

/** Read a module's config with a safe fallback (covers old/partial saved layouts). */
export const cfgOf = (layout: Layout | undefined, id: ModuleId): ModuleCfg =>
  layout?.[id] ?? DEFAULT_LAYOUT[id]
