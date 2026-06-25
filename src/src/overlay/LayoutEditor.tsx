/**
 * Overlay layout editor (Control window) — the redesign's "Overlay Preview" (C2).
 *
 * Drag each Full-overlay module to position it on a 16:9 preview, optionally over
 * a loaded in-game screenshot (to check it doesn't block any icon), and scale it.
 * Edits write the shared Settings.layout, so the live overlay updates immediately
 * via the existing settings broadcast — no live drag / click-through gymnastics.
 */
import React, { useRef, useState } from 'react'
import { MODULE_META, DEFAULT_LAYOUT, cfgOf, type Layout, type ModuleId, type ModuleCfg } from './modules'

const C = { ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6', line: 'rgba(143,212,255,0.16)' }

export const LayoutEditor: React.FC<{ value: Layout; onChange: (l: Layout) => void }> = ({ value, onChange }) => {
  const paneRef = useRef<HTMLDivElement>(null)
  const [bg, setBg] = useState<string | null>(null)
  const [drag, setDrag] = useState<ModuleId | null>(null)

  const update = (id: ModuleId, patch: Partial<ModuleCfg>) =>
    onChange({ ...value, [id]: { ...cfgOf(value, id), ...patch } })

  const onMove = (e: React.MouseEvent) => {
    if (!drag || !paneRef.current) return
    const r = paneRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))
    update(drag, { x: Math.round(x), y: Math.round(y) })
  }

  const loadBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setBg(URL.createObjectURL(f))
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, fontSize: 12, color: C.mut }}>
        <label style={{ cursor: 'pointer', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 11px' }}>
          📷 โหลด screenshot in-game
          <input type="file" accept="image/*" onChange={loadBg} style={{ display: 'none' }} />
        </label>
        {bg && <button onClick={() => setBg(null)} style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>ล้างพื้นหลัง</button>}
        <button onClick={() => onChange(DEFAULT_LAYOUT)} style={{ marginLeft: 'auto', background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>รีเซ็ตตำแหน่ง</button>
      </div>

      <div
        ref={paneRef}
        onMouseMove={onMove}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
        style={{
          position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${C.line}`, userSelect: 'none',
          background: bg ? `center / cover no-repeat url(${bg})` : 'repeating-linear-gradient(45deg,#0a0c11,#0a0c11 10px,#0c0f15 10px,#0c0f15 20px)',
        }}
      >
        {MODULE_META.map((m) => {
          const cfg = cfgOf(value, m.id)
          if (!cfg.enabled) return null
          return (
            <div
              key={m.id}
              onMouseDown={() => setDrag(m.id)}
              style={{
                position: 'absolute', left: `${cfg.x}%`, top: `${cfg.y}%`,
                transform: `translate(-50%, -50%) scale(${cfg.scale})`,
                cursor: drag === m.id ? 'grabbing' : 'grab',
                padding: '4px 10px', fontSize: 11, whiteSpace: 'nowrap', borderRadius: 8,
                background: 'rgba(143,212,255,0.18)', border: `1px solid ${C.ice}`, color: C.ice,
                boxShadow: drag === m.id ? '0 0 14px rgba(143,212,255,0.6)' : 'none',
              }}
            >
              {m.label}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 10 }}>
        {MODULE_META.map((m) => {
          const cfg = cfgOf(value, m.id)
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 12, borderTop: `1px solid rgba(143,212,255,0.08)` }}>
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => update(m.id, { enabled: e.target.checked })} />
              <span style={{ width: 120, color: cfg.enabled ? C.txt : C.mut }}>{m.label}</span>
              <span style={{ color: C.mut, fontSize: 11 }}>ขนาด</span>
              <input type="range" min={0.6} max={1.6} step={0.05} value={cfg.scale} disabled={!cfg.enabled} onChange={(e) => update(m.id, { scale: Number(e.target.value) })} style={{ width: 130 }} />
              <span style={{ color: C.mut, width: 34, fontSize: 11 }}>{cfg.scale.toFixed(2)}×</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: C.mut, marginTop: 6, lineHeight: 1.5 }}>
        ลากโมดูลบนพรีวิวเพื่อจัดตำแหน่ง · โหลด screenshot เพื่อเช็กว่าบังไอคอนไหม · ตำแหน่งใช้กับ overlay จริงทันที
      </div>
    </div>
  )
}
