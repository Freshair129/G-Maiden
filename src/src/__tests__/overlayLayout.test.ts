import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, MODULE_META } from '../overlay/modules'
import { clampModule, hudOverlaps, moduleRect, normalizeLayout } from '../overlay/layoutGeometry'
import { normalizeSettings } from '../app/settingsSchema'

describe('screenshot-based overlay layout', () => {
  // Owner direction 2026-11-08: the buyback strip deliberately sits in the top
  // bar's centre column, under the score/clock cells; it is shown only while dead.
  const OWNER_PLACED: Partial<Record<string, string[]>> = { buyback: ['ฮีโร่ / เวลา / คะแนน'] }
  it.each(MODULE_META.filter(m => DEFAULT_LAYOUT[m.id].enabled))('$id clears reserved HUD areas and stays on screen', ({ id }) => {
    const cfg = DEFAULT_LAYOUT[id]
    expect(hudOverlaps(id, cfg)).toEqual(OWNER_PLACED[id] ?? [])
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
  it('keeps the buyback strip centred within the score/clock cells at 1920×1080', () => {
    const rect = moduleRect('buyback', DEFAULT_LAYOUT.buyback)
    // Score cell → clock → score cell spans about 860–1062px (44.8–55.3%) at the reference.
    expect(rect.x + rect.w / 2).toBeCloseTo(50)
    expect(rect.x).toBeGreaterThanOrEqual(44.8)
    expect(rect.x + rect.w).toBeLessThanOrEqual(55.3)
    expect(rect.y + rect.h).toBeLessThan(10)
  })
  it('moves an untouched old bottom-right buyback default to the top strip, keeping custom positions', () => {
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
