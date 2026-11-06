import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, MODULE_META } from '../overlay/modules'
import { clampModule, hudOverlaps, moduleRect, normalizeLayout } from '../overlay/layoutGeometry'
import { normalizeSettings } from '../app/settingsSchema'

describe('screenshot-based overlay layout', () => {
  it.each(MODULE_META.filter(m => DEFAULT_LAYOUT[m.id].enabled))('$id clears reserved HUD areas and stays on screen', ({ id }) => {
    const cfg = DEFAULT_LAYOUT[id]
    expect(hudOverlaps(id, cfg)).toEqual([])
    const rect = moduleRect(id, cfg)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.w).toBeLessThanOrEqual(100)
    expect(rect.y + rect.h).toBeLessThanOrEqual(100)
  })
  it('does not stack enabled default modules on each other', () => {
    const enabled = MODULE_META.filter(m => DEFAULT_LAYOUT[m.id].enabled)
    enabled.forEach((a, i) => enabled.slice(i + 1).forEach(b => {
      if (a.id === 'standby' || b.id === 'standby') return // pre-game only
      const r = moduleRect(a.id, DEFAULT_LAYOUT[a.id])
      const s = moduleRect(b.id, DEFAULT_LAYOUT[b.id])
      const overlaps = r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y
      expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false)
    }))
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
