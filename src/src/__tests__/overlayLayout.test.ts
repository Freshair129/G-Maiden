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
    xpm: ['เมนู / สถิติ Dota'], gmeter: ['Kill feed'],
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
