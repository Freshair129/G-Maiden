/**
 * Status of each module shown in the Settings overview (FEAT-G-DAMAGE §12a).
 *
 * Doc-derived, not runtime health: it says how much of the module is wired in
 * this build, not whether it is running right now. Source of truth for the
 * values is docs/FEATURE-LEDGER.md and the module's FEAT doc; change both
 * together.
 */
export type ModuleWiring = 'live' | 'partial' | 'not-wired'

export interface ModuleStatus {
  readonly name: string
  readonly desc: string
  readonly wiring: ModuleWiring
  /** Shown after the description when the module is not fully wired. */
  readonly note?: string
}

export const MODULE_STATUS: readonly ModuleStatus[] = [
  { name: 'G-Sentry', desc: 'fog-of-war monitor', wiring: 'live' },
  { name: 'G-Motion', desc: 'gank prediction', wiring: 'partial', note: 'heuristic v1' },
  { name: 'G-Signal', desc: 'voice gank warning', wiring: 'live' },
  { name: 'G-Master', desc: 'advisor (Claude Plan + SLM fallback)', wiring: 'live' },
  { name: 'G-Damage', desc: 'burst lethality engine', wiring: 'partial', note: 'self-burst เท่านั้น' },
  { name: 'G-Log', desc: 'match history', wiring: 'live' },
]

export const WIRING_MARK: Record<ModuleWiring, string> = {
  live: '✓',
  partial: '◐',
  'not-wired': '○',
}
