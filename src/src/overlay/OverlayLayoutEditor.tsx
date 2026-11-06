import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isTauri } from '@tauri-apps/api/core'
import { enterEditorFullscreen } from './editorFullscreen'
import type { Settings } from '../app/types'
import { FullOverlay } from './FullOverlay'
import { BOX_REF, DEFAULT_LAYOUT, MODULE_META, cfgOf, type Layout, type ModuleCfg, type ModuleId } from './modules'
import { HUD_ZONES, clampModule, hudOverlaps, moduleRect, normalizeLayout } from './layoutGeometry'
import { OVERLAY_PREVIEW_TICK } from './preview'

const field: React.CSSProperties = { background: '#101925', color: '#e7eef6', border: '1px solid #42627b', borderRadius: 6, padding: 6 }

export function OverlayLayoutEditor({ settings, onChange, onEnterFullscreen }: { settings: Settings; onChange: (layout: Layout) => void; onEnterFullscreen?: () => void }) {
  const [selected, select] = useState<ModuleId>('gold')
  const [zones, showZones] = useState(false)
  const [width, setWidth] = useState(640)
  const canvas = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const launchButton = useRef<HTMLButtonElement>(null)
  const session = useRef<Promise<() => Promise<void>> | null>(null)
  const closing = useRef(false)
  const mounted = useRef(true)
  const [expanded, setExpanded] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const closeFullscreen = useCallback(async () => {
    if (!session.current || closing.current) return
    closing.current = true
    try {
      await (await session.current)()
      session.current = null
      if (mounted.current) {
        setExpanded(false)
        setFullscreenError('')
        requestAnimationFrame(() => launchButton.current?.focus())
      }
    } catch { if (mounted.current) setFullscreenError('คืนขนาดหน้าต่างไม่สำเร็จ กรุณากดปิดอีกครั้ง') }
    finally { closing.current = false }
  }, [])
  const openFullscreen = async () => {
    if (session.current) return
    const opening = enterEditorFullscreen()
    session.current = opening
    setExpanded(true)
    setFullscreenError('')
    onEnterFullscreen?.()
    try { await opening }
    catch {
      session.current = null
      if (mounted.current) { setExpanded(false); setFullscreenError('เปิดเต็มจอไม่สำเร็จ ลองกดขยายอีกครั้ง') }
    }
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void session.current?.then(restore => restore()).catch(error => console.error('Restore overlay editor window:', error))
    }
  }, [])
  useEffect(() => {
    if (!expanded) return
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); void closeFullscreen() }
      if (event.key === 'Tab') {
        const controls = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? [])]
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    const fullscreenChange = () => { if (!isTauri() && !document.fullscreenElement) void closeFullscreen() }
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('fullscreenchange', fullscreenChange)
    return () => { document.removeEventListener('keydown', keydown, true); document.removeEventListener('fullscreenchange', fullscreenChange) }
  }, [expanded, closeFullscreen])
  const drag = useRef<{ x: number; y: number; cfg: ModuleCfg; id: ModuleId } | null>(null)
  const cfg = cfgOf(settings.layout, selected)
  const warnings = cfg.enabled ? hudOverlaps(selected, cfg) : []
  useEffect(() => {
    if (!frame.current) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect
      setWidth(expanded ? Math.min(rect.width, rect.height * 16 / 9) : rect.width)
    })
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [expanded])
  const update = (id: ModuleId, patch: Partial<ModuleCfg>) => onChange({ ...settings.layout, [id]: clampModule(id, { ...cfgOf(settings.layout, id), ...patch }) })
  const sampleTick = { ...OVERLAY_PREVIEW_TICK, in_game: selected !== 'standby' }
  const editor = <div ref={root} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? 'จัดวาง Overlay เต็มจอ' : undefined}
    style={expanded ? { position: 'fixed', inset: 0, zIndex: 10000, background: '#080f18', color: '#e7eef6', fontFamily: '"Segoe UI", sans-serif', fontSize: 13, padding: 12, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 } : undefined}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      {expanded ? <><strong>จัดวาง Overlay • ลากหรือใช้ปุ่มลูกศรเพื่อขยับละเอียด</strong><button autoFocus style={field} onClick={() => void closeFullscreen()}>ปิดเต็มจอ (Esc)</button></>
        : <button ref={launchButton} style={field} onClick={() => void openFullscreen()}>⛶ ขยายตัวจัดวางเต็มจอ</button>}
    </div>
    {fullscreenError && <div role="alert" style={{ color: '#ffcf6b' }}>{fullscreenError}</div>}
    {!expanded && <p style={{ fontSize: 12, color: '#a5b4c6', lineHeight: 1.6 }}>ลากกรอบเพื่อย้าย • เลือกชิ้นส่วนแล้วปรับขนาดหรือเปิด/ปิด • บันทึกอัตโนมัติ<br />ภาพ Steam ในเกม 1920×1080 ฝังมากับแอป — ข้อมูลบน overlay เป็นตัวอย่าง</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
      <select aria-label="ชิ้นส่วน overlay" style={field} value={selected} onChange={e => select(e.target.value as ModuleId)}>
        {MODULE_META.map(m => <option key={m.id} value={m.id}>{cfgOf(settings.layout, m.id).enabled ? '●' : '○'} {m.label}</option>)}
      </select>
      <label><input type="checkbox" checked={cfg.enabled} onChange={e => update(selected, { enabled: e.target.checked })} /> แสดง</label>
      <label><input type="checkbox" checked={zones} onChange={e => showZones(e.target.checked)} /> เขต HUD เกม</label>
      <button style={field} onClick={() => onChange(normalizeLayout(DEFAULT_LAYOUT))}>ใช้เลย์เอาท์เริ่มต้นด้านขวา</button>
    </div>
    <div ref={frame} style={expanded ? { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width: '100%' }}>
    <div ref={canvas} style={{ position: 'relative', width: expanded ? width : '100%', flexShrink: 0, aspectRatio: '16 / 9', overflow: 'hidden', background: '#0a1119', border: '1px solid #42627b', borderRadius: 8 }}>
      <img src="/dota-overlay-reference.jpg" alt="ภาพ Dota 2 ในเกมสำหรับจัดวาง overlay" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: BOX_REF.w, height: BOX_REF.h, transform: `scale(${width / BOX_REF.w})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
        <FullOverlay referenceViewport tick={sampleTick} s={settings}
          gank={selected === 'alert' ? { phase: 'alert', heroes: ['npc_dota_hero_axe'], probability: 0.8 } : null}
          missingHeroes={new Set(['npc_dota_hero_axe', 'npc_dota_hero_pudge'])}
          overlayAdvice="เก็บระยะจากศัตรู และรอเพื่อนก่อนเข้าทีมไฟต์ค่ะ"
          buyback={{ advice: { death_episode: 1, request_id: 1, recommend_buyback: null, urgency: 'Unknown', base_under_threat: null, allies_alive: null, natural_respawn_remaining: 30, affordable: true, next_respawn_if_buyback: 55, reason: 'ข้อมูลภัยต่อฐานยังไม่พอประเมินซื้อเกิดค่ะ' }, narrative: null }}
          volToast={80} gsiActive={false} gsiFresh={true} gsiFreshness="unavailable" gsiAgeMs={null} matchActive={sampleTick.in_game} previewMode sensorOk={false} />
      </div>
      {zones && HUD_ZONES.map(z => <div key={z.name} title={z.name} style={{ position: 'absolute', left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`, background: '#ff7b8520', border: '1px dashed #ff7b8580', pointerEvents: 'none', boxSizing: 'border-box' }} />)}
      {MODULE_META.filter(m => cfgOf(settings.layout, m.id).enabled || m.id === selected).map(m => {
        const mc = cfgOf(settings.layout, m.id)
        const r = moduleRect(m.id, mc)
        const active = selected === m.id
        return <button key={m.id} aria-label={`ย้าย ${m.label}`} title={m.label}
          onFocus={() => select(m.id)}
          onPointerDown={e => { select(m.id); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cfg: mc, id: m.id } }}
          onPointerMove={e => {
            const start = drag.current
            const bounds = canvas.current?.getBoundingClientRect()
            if (!start || start.id !== m.id || !bounds) return
            update(m.id, { x: start.cfg.x + (e.clientX - start.x) / bounds.width * 100, y: start.cfg.y + (e.clientY - start.y) / bounds.height * 100 })
          }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
          onKeyDown={e => {
            const delta = e.shiftKey ? 1 : 0.1
            const movement: Record<string, Partial<ModuleCfg>> = { ArrowLeft: { x: mc.x - delta }, ArrowRight: { x: mc.x + delta }, ArrowUp: { y: mc.y - delta }, ArrowDown: { y: mc.y + delta } }
            if (movement[e.key]) { e.preventDefault(); update(m.id, movement[e.key]) }
          }}
          style={{ position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, padding: 0, background: active ? '#8fd4ff20' : 'transparent', border: `1px ${mc.enabled ? 'solid' : 'dashed'} ${active ? '#8fd4ff' : '#ffffff35'}`, borderRadius: 4, cursor: 'move', touchAction: 'none', zIndex: active ? 2 : 1 }} />
      })}
    </div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: expanded ? 0 : 12 }}>
      {(['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()} % <input aria-label={`${axis.toUpperCase()} ตำแหน่ง`} type="number" min={0} max={100} step={0.1} value={Number(cfg[axis].toFixed(1))} style={{ ...field, width: 65 }} onChange={e => { if (Number.isFinite(e.target.valueAsNumber)) update(selected, { [axis]: e.target.valueAsNumber }) }} /></label>)}
      <label>ขนาด {Math.round(cfg.scale * 100)}% <input aria-label="ขนาด overlay" type="range" min={0.6} max={1.6} step={0.05} value={cfg.scale} onChange={e => update(selected, { scale: Number(e.target.value) })} /></label>
    </div>
    <p style={{ margin: expanded ? 0 : undefined, fontSize: 12, color: warnings.length ? '#ffcf6b' : '#a5b4c6', lineHeight: 1.5 }}>{warnings.length ? `ทับพื้นที่: ${warnings.join(', ')}` : 'ตำแหน่งนี้ไม่ทับเขต HUD ที่ระบุในภาพอ้างอิง'}{!expanded && <><br />อ้างอิง HUD 16:9 มินิแมปซ้าย — โหมดเลือกฮีโร่ ร้านค้าที่เปิด และ HUD แบบอื่นต้องตรวจในเกมอีกครั้ง</>}</p>
  </div>
  return expanded ? createPortal(editor, document.body) : editor
}
