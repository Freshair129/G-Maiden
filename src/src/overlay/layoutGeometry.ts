import { BOX_REF, DEFAULT_LAYOUT, MODULE_META, boxPercent, type Layout, type ModuleCfg, type ModuleId } from './modules'

export const HUD_ZONES = [
  { name: 'เมนู / สถิติ Dota', x: 0, y: 0, w: 27, h: 18 },
  { name: 'ฮีโร่ / เวลา / คะแนน', x: 27, y: 0, w: 46, h: 8 },
  { name: 'เครือข่าย', x: 93, y: 0, w: 7, h: 7 },
  { name: 'ประกาศของเกม', x: 29, y: 8, w: 43, h: 8 },
  { name: 'ยูนิตที่เลือก / Death summary', x: 0, y: 18, w: 17, h: 32 },
  { name: 'Kill feed', x: 0, y: 50, w: 28, h: 22 },
  { name: 'แชต', x: 24, y: 66, w: 46, h: 12 },
  { name: 'มินิแมป', x: 0, y: 74, w: 18, h: 26 },
  { name: 'สกิล / ไอเทม', x: 25, y: 79, w: 49, h: 21 },
  { name: 'ร้านค้า / Quickbuy', x: 84, y: 90, w: 16, h: 10 },
  { name: 'พื้นที่เล่นกลางจอ', x: 25, y: 18, w: 50, h: 48 },
]

export function moduleRect(id: ModuleId, cfg: ModuleCfg) {
  const { w, h } = boxPercent(id, cfg, BOX_REF)
  return { x: cfg.x - w / 2, y: cfg.y - h / 2, w, h }
}

export function clampModule(id: ModuleId, cfg: ModuleCfg): ModuleCfg {
  const scale = Math.max(0.6, Math.min(1.6, cfg.scale))
  const { w, h } = boxPercent(id, { scale })
  return { ...cfg, scale, x: Math.max(w / 2, Math.min(100 - w / 2, cfg.x)), y: Math.max(h / 2, Math.min(100 - h / 2, cfg.y)) }
}

export function normalizeLayout(value: unknown): Layout {
  const raw = value && typeof value === 'object' ? value as Partial<Layout> : {}
  return Object.fromEntries(MODULE_META.map(({ id }) => {
    const cfg = raw[id]
    const base = DEFAULT_LAYOUT[id]
    const finite = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback
    return [id, clampModule(id, {
      x: finite(cfg?.x, base.x), y: finite(cfg?.y, base.y), scale: finite(cfg?.scale, base.scale),
      enabled: typeof cfg?.enabled === 'boolean' ? cfg.enabled : base.enabled,
    })]
  })) as Layout
}

export function hudOverlaps(id: ModuleId, cfg: ModuleCfg): string[] {
  const r = moduleRect(id, cfg)
  return HUD_ZONES.filter(z => r.x < z.x + z.w && r.x + r.w > z.x && r.y < z.y + z.h && r.y + r.h > z.y).map(z => z.name)
}
