/**
 * Overlay module registry for the Full (redesign) tier.
 *
 * The redesign's core idea: each overlay piece is an independent MODULE the user
 * can position + scale freely (vs the lite tier's single stacked column). The
 * layout lives in Settings (persisted + broadcast to the overlay).
 *
 * Arranging it moved OUT of this app: the in-app LayoutEditor was removed in
 * favour of G-AnnStudio's Overlay Lab, which draws each module at its real size
 * over a Dota HUD capture and flags overlaps. It writes back through the
 * `sync_overlay_layout` command and the `overlay-layout-sync` event, so Settings
 * remains the single source of truth the live overlay reads.
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
  // Top-centre column, restacked 2026-08-11 after measuring the real boxes
  // (MODULE_BOX) against Dota's own regions. Dota draws its kill feed across
  // y8–17 at centre; `alert` used to sit at y12, i.e. directly under the game's
  // kill banner — invisible in any screenshot, collided exactly when an event
  // fired. Everything below it shifted to keep the column clear of itself:
  //   Dota kill feed  8.0–17.0   (game-owned)
  //   alert          18.2–21.9
  //   toast          22.5–25.6
  //   banner         27.1–41.0
  //   lowhp          42.3–45.8
  alert: { x: 50, y: 20, scale: 1, enabled: true },
  gmeter: { x: 7, y: 47, scale: 1, enabled: true },
  toast: { x: 50, y: 24, scale: 1, enabled: true },
  companion: { x: 7, y: 39, scale: 1, enabled: true },
  advice: { x: 50, y: 72, scale: 1, enabled: true },
  buyback: { x: 50, y: 63, scale: 1, enabled: true },
  missing: { x: 88, y: 12, scale: 1, enabled: true },
  // Kill & pack banners share one slot, below the game's own kill feed rather
  // than on top of it. lowhp/vol/standby are transient cues.
  banner: { x: 50, y: 34, scale: 1, enabled: true },
  lowhp: { x: 50, y: 44, scale: 1, enabled: true },
  // Was (50, 92) — squarely inside Dota's bottom HUD. Moved to the left gutter,
  // which is clear between the Maiden/G-Meter stack and the minimap (y78+).
  vol: { x: 14, y: 72, scale: 1, enabled: true },
  standby: { x: 50, y: 50, scale: 1, enabled: true },
  // Top-left stat strip: clock → KDA → gold → GPM → NW, y=4.
  //
  // Compacted left 2026-08-11. The note above said Dota's portrait bar "starts
  // ≈x35"; measuring the bar off G-AnnStudio's reference capture (luminance
  // across y≈3.5%) puts its left edge at ~31% — bright grass to 30%, near-black
  // by 32%. At the old spacing Net Worth (box 29.5–34.5) sat under the bar.
  // Every chip moved left so the strip ends clear of 30.
  clock: { x: 4, y: 4, scale: 1, enabled: true },
  kda: { x: 9.5, y: 4, scale: 1, enabled: true },
  gold: { x: 15, y: 4, scale: 1, enabled: true },
  gpm: { x: 20.5, y: 4, scale: 1, enabled: true },
  xpm: { x: 20.5, y: 10, scale: 1, enabled: false },
  nw: { x: 26, y: 4, scale: 1, enabled: true },
  // Off the portrait bar: disabled by default, but x=58 put it inside the bar
  // for anyone who switched it on.
  score: { x: 75, y: 4, scale: 1, enabled: false },
  hero: { x: 14, y: 33, scale: 1, enabled: false },
}

/** Read a module's config with a safe fallback (covers old/partial saved layouts). */
export const cfgOf = (layout: Layout | undefined, id: ModuleId): ModuleCfg =>
  layout?.[id] ?? DEFAULT_LAYOUT[id]

/** Reference viewport the boxes below are measured against. */
export const BOX_REF = { w: 1920, h: 1080 } as const

/**
 * Nominal on-screen footprint of each module, in CSS px at [`BOX_REF`] and
 * `scale: 1`.
 *
 * NOT part of [`ModuleCfg`] on purpose. Size belongs to the RENDERER, not to the
 * user's layout: a player positions and scales a module but can never resize it,
 * so putting w/h in the persisted/synced layout would ship redundant data and
 * break the existing sync contract for no gain.
 *
 * These are *nominal* boxes, not exact measurements. Modules in `FullOverlay`
 * size themselves from content (`minWidth`/`maxWidth` + padding + text), so the
 * real box moves with hero-name length, advice wrapping and banner art. Each
 * entry is the typical-to-maximum footprint derived from that component's own
 * CSS — enough to lay out honestly, reserve space and detect overlap, which is
 * all any planner needs.
 *
 * Two consequences worth remembering:
 *  - px, not %. The same module covers ~24% of a 1920-wide screen but ~18% of a
 *    2560-wide one. Convert with [`boxPercent`] against the target resolution;
 *    never assume the reference.
 *  - keep in sync with `FullOverlay.tsx`. If you change a module's padding,
 *    `minWidth`/`maxWidth` or font size, update its entry here in the same
 *    commit — the layout planner in G-AnnStudio mirrors this table.
 */
export const MODULE_BOX: Record<ModuleId, { w: number; h: number }> = {
  alert: { w: 420, h: 40 },      // pad 10/24, 15px, one line; grows with hero list
  gmeter: { w: 158, h: 30 },     // minWidth 158
  toast: { w: 460, h: 34 },      // maxWidth 460
  companion: { w: 190, h: 64 },  // minWidth 142 + 44px portrait
  advice: { w: 420, h: 63 },     // maxWidth 420, 13px/1.5, ~2 lines
  buyback: { w: 420, h: 63 },    // same card as advice, accent border
  missing: { w: 300, h: 34 },    // pad 8/14, grows with the missing-hero list
  banner: { w: 420, h: 150 },    // pack art maxWidth 420 / maxHeight 150 (largest variant)
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
