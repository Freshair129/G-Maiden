import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, MODULE_META, type ModuleId } from '../overlay/modules'
import { clampModule, hudOverlaps, moduleRect, normalizeLayout } from '../overlay/layoutGeometry'
import { normalizeSettings } from '../app/settingsSchema'

describe('screenshot-based overlay layout', () => {
  // Owner-approved top strip and presence overlap these conservative editor warning
  // regions. Banner/G-Meter/xpm positions follow the owner's 2026-11-08 decision.
  const approvedWarnings: Partial<Record<ModuleId, string[]>> = {
    clock: ['เมนู / สถิติ Dota'], kda: ['เมนู / สถิติ Dota'], gold: ['เมนู / สถิติ Dota'],
    gpm: ['เมนู / สถิติ Dota'], nw: ['เมนู / สถิติ Dota'],
    companion: ['เครือข่าย'], banner: ['ฮีโร่ / เวลา / คะแนน', 'ประกาศของเกม'],
    // Owner 2026-11-08: xpm continues the stat row; G-Meter sits directly above the minimap.
    xpm: ['เมนู / สถิติ Dota'],
    // Owner 2026-11-08: RISK strip top-centre under the score/clock cells; buyback above the minimap.
    gmeter: ['ฮีโร่ / เวลา / คะแนน'], buyback: ['Kill feed'],
  }
  it.each(MODULE_META.filter(m => DEFAULT_LAYOUT[m.id].enabled))('$id stays on screen with only owner-approved HUD warnings', ({ id }) => {
    const cfg = DEFAULT_LAYOUT[id]
    expect(hudOverlaps(id, cfg)).toEqual(approvedWarnings[id] ?? [])
    const rect = moduleRect(id, cfg)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.w).toBeLessThanOrEqual(100)
    expect(rect.y + rect.h).toBeLessThanOrEqual(100)
  })
  it('keeps the banner below the captured first-blood line and above the centre aim point', () => {
    // Mirrors src-tauri/src/gann_native_windows.rs `place`: banners render natively at
    // min(680px, 72% screen) × scale wide, 960:420 aspect, centred on (x, y).
    const { x, y, scale } = DEFAULT_LAYOUT.banner
    const width = Math.min(680, 1920 * 0.72) * scale
    const height = width * 420 / 960
    const top = 1080 * y / 100 - height / 2
    expect(x).toBe(50)
    expect(top + 27).toBeGreaterThan(68) // visible art (≈27px below box top) starts below the hero-bar labels
    expect(height).toBeLessThan(140) // owner: compact banner
    expect(top + height).toBeLessThan(1080 / 2) // stays above the centre aim point
  })
  it('does not stack enabled default modules on each other', () => {
    const enabled = MODULE_META.filter(m => DEFAULT_LAYOUT[m.id].enabled)
    enabled.forEach((a, i) => enabled.slice(i + 1).forEach(b => {
      if (a.id === 'standby' || b.id === 'standby') return // pre-game only
      // The banner box (native, 306×134 at y≈46px) starts with ≈27px of transparent padding;
      // its art begins ≈73px, below the RISK strip's bottom edge (≈71px), so they never overlap visibly.
      if ([a.id, b.id].includes('gmeter') && [a.id, b.id].includes('banner')) return
      const r = moduleRect(a.id, DEFAULT_LAYOUT[a.id])
      const s = moduleRect(b.id, DEFAULT_LAYOUT[b.id])
      const overlaps = r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y
      expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false)
    }))
  })
  it('keeps the RISK strip centred within the score/clock cells at 1920×1080', () => {
    const rect = moduleRect('gmeter', DEFAULT_LAYOUT.gmeter)
    // Score cell → clock → score cell spans about 860–1062px (44.8–55.3%) at the reference.
    expect(rect.x + rect.w / 2).toBeCloseTo(50)
    expect(rect.x).toBeGreaterThanOrEqual(44.8)
    expect(rect.x + rect.w).toBeLessThanOrEqual(55.3)
    expect((rect.y + rect.h) * 1080 / 100).toBeLessThan(73) // above the banner art
  })
  it('keeps the buyback strip above the minimap', () => {
    const rect = moduleRect('buyback', DEFAULT_LAYOUT.buyback)
    expect((rect.y + rect.h) * 1080 / 100).toBeLessThanOrEqual(788)
    expect(rect.x).toBeGreaterThanOrEqual(0)
  })
  it('moves an untouched old bottom-right buyback default to the new default, keeping custom positions', () => {
    const legacy = { ...DEFAULT_LAYOUT, buyback: { x: 89, y: 84, scale: 0.75, enabled: true } }
    expect(normalizeSettings({ layout: legacy }).layout.buyback).toEqual(DEFAULT_LAYOUT.buyback)
    const custom = { ...DEFAULT_LAYOUT, buyback: { x: 70, y: 40, scale: 0.75, enabled: true } }
    expect(normalizeSettings({ layout: custom }).layout.buyback).toEqual(custom.buyback)
  })
  it('clamps the entire scaled card when dragged beyond an edge', () => {
    const cfg = clampModule('banner', { x: 100, y: -10, scale: 1.6, enabled: true })
    const rect = moduleRect('banner', cfg)
    expect(rect.x + rect.w).toBeCloseTo(100)
    expect(rect.y).toBeCloseTo(0)
  })
  it('repairs malformed entries while preserving valid custom positions and toggles', () => {
    const layout = normalizeLayout({ clock: { x: 40, y: 50, scale: 0.8, enabled: false }, gold: { x: NaN, scale: Infinity } })
    expect(layout.clock).toEqual({ x: 40, y: 50, scale: 0.8, enabled: false })
    expect(layout.gold).toEqual(DEFAULT_LAYOUT.gold)
    expect(Object.keys(layout)).toHaveLength(MODULE_META.length)
  })
  it('restores the actual module layout from disk even when old stat flags disagree', () => {
    const saved = normalizeSettings({ showGold: false, layout: { ...DEFAULT_LAYOUT, gold: { x: 90, y: 50, scale: 0.8, enabled: true } } })
    expect(normalizeSettings(JSON.parse(JSON.stringify(saved))).layout.gold).toEqual(saved.layout.gold)
  })
})
