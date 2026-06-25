/**
 * Overlay layout editor (Control window) — the redesign's "Overlay Preview" (C2).
 *
 * Drag each Full-overlay module to position it on a 16:9 preview, snap to a grid
 * (magnet-style — drops modules at common positions instead of pixel-perfect
 * stacking that LOOKS clipped in the small preview but doesn't on a real 1920x1080
 * screen), optionally over a loaded in-game screenshot OR a labelled Dota HUD
 * reference, and scale each one. Edits write the shared Settings.layout, so the
 * live overlay updates immediately via the existing settings broadcast.
 */
import React, { useRef, useState } from 'react'
import { MODULE_META, DEFAULT_LAYOUT, cfgOf, type Layout, type ModuleId, type ModuleCfg } from './modules'

const C = { ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6', line: 'rgba(143,212,255,0.16)' }

/** Snap divisor (%): 5 → 21 columns × 21 rows. Coarse enough to avoid pixel-
 * stack clipping in the small preview; fine enough to hit corners/centres. */
const SNAP = 5

type BgKind = 'none' | 'hud' | 'screenshot'

const snap = (v: number) => Math.round(v / SNAP) * SNAP

export const LayoutEditor: React.FC<{ value: Layout; onChange: (l: Layout) => void }> = ({ value, onChange }) => {
  const paneRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<ModuleId | null>(null)
  const [bgKind, setBgKind] = useState<BgKind>('hud')
  const [shotUrl, setShotUrl] = useState<string | null>(null)
  // Solo focus — hovering/clicking a row in the module list spotlights that
  // module on the preview and dims the others. The preview is much smaller than
  // a real 1920×1080 screen, so fixed-px chips inevitably crowd; solo lets the
  // user pick one out without resizing the editor.
  const [solo, setSolo] = useState<ModuleId | null>(null)
  const [magnet, setMagnet] = useState(true)

  const update = (id: ModuleId, patch: Partial<ModuleCfg>) =>
    onChange({ ...value, [id]: { ...cfgOf(value, id), ...patch } })

  const onMove = (e: React.MouseEvent) => {
    if (!drag || !paneRef.current) return
    const r = paneRef.current.getBoundingClientRect()
    let x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))
    let y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))
    if (magnet) { x = snap(x); y = snap(y) }
    update(drag, { x: Math.round(x), y: Math.round(y) })
  }

  const loadShot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setShotUrl(URL.createObjectURL(f)); setBgKind('screenshot') }
  }

  const bgStyle: React.CSSProperties =
    bgKind === 'screenshot' && shotUrl
      ? { background: `center / cover no-repeat url(${shotUrl})` }
      : bgKind === 'hud'
        ? { background: `center / cover no-repeat url(/dota-hud-reference.webp)` }
        : { background: 'repeating-linear-gradient(45deg,#0a0c11,#0a0c11 10px,#0c0f15 10px,#0c0f15 20px)' }

  const seg = (k: BgKind, label: string) => (
    <button key={k} onClick={() => setBgKind(k)} style={{
      background: bgKind === k ? 'rgba(143,212,255,0.18)' : 'transparent',
      color: bgKind === k ? C.ice : C.mut, border: 'none', padding: '5px 12px',
      cursor: 'pointer', fontSize: 11.5,
    }}>{label}</button>
  )

  // Grid lines drawn as repeating gradients — cheap, no extra DOM nodes.
  const gridOverlay: React.CSSProperties = {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background:
      `repeating-linear-gradient(to right, rgba(143,212,255,0.08) 0 1px, transparent 1px ${SNAP}%),` +
      `repeating-linear-gradient(to bottom, rgba(143,212,255,0.08) 0 1px, transparent 1px ${SNAP}%)`,
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, fontSize: 12, color: C.mut, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
          {seg('none', 'ไม่มี')}
          {seg('hud', 'Dota HUD ref')}
          {seg('screenshot', 'Screenshot')}
        </div>
        <label style={{ cursor: 'pointer', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 11px' }}>
          📷 โหลด screenshot
          <input type="file" accept="image/*" onChange={loadShot} style={{ display: 'none' }} />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={magnet} onChange={(e) => setMagnet(e.target.checked)} /> แม่เหล็ก (grid {SNAP}%)
        </label>
        <button onClick={() => onChange(DEFAULT_LAYOUT)} style={{ marginLeft: 'auto', background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>รีเซ็ตตำแหน่ง</button>
      </div>

      <div
        ref={paneRef}
        onMouseMove={onMove}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
        style={{
          position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${C.line}`, userSelect: 'none', ...bgStyle,
        }}
      >
        {/* Dim the HUD reference (lots of baked-in labels) so module chips read on top. */}
        {bgKind === 'hud' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', pointerEvents: 'none' }} />}
        {magnet && <div style={gridOverlay} />}
        {MODULE_META.map((m) => {
          const cfg = cfgOf(value, m.id)
          if (!cfg.enabled) return null
          const isSolo = solo === m.id
          const dim = solo !== null && !isSolo
          return (
            <div
              key={m.id}
              onMouseDown={() => setDrag(m.id)}
              style={{
                position: 'absolute', left: `${cfg.x}%`, top: `${cfg.y}%`,
                transform: `translate(-50%, -50%) scale(${cfg.scale})`,
                cursor: drag === m.id ? 'grabbing' : 'grab',
                padding: '2px 7px', fontSize: 9.5, whiteSpace: 'nowrap', borderRadius: 6,
                background: isSolo ? 'rgba(143,212,255,0.45)' : 'rgba(143,212,255,0.18)',
                border: `1px solid ${C.ice}`, color: C.ice,
                opacity: dim ? 0.25 : 1,
                boxShadow: isSolo || drag === m.id ? '0 0 14px rgba(143,212,255,0.7)' : 'none',
                transition: drag === m.id ? 'none' : 'left 120ms ease, top 120ms ease, opacity 150ms, background 150ms',
                zIndex: isSolo ? 5 : 1,
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
          const isSolo = solo === m.id
          return (
            <div
              key={m.id}
              onMouseEnter={() => cfg.enabled && setSolo(m.id)}
              onMouseLeave={() => setSolo((s) => (s === m.id ? null : s))}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '5px 6px',
                fontSize: 12, borderTop: `1px solid rgba(143,212,255,0.08)`,
                background: isSolo ? 'rgba(143,212,255,0.07)' : 'transparent',
                borderRadius: 6, cursor: cfg.enabled ? 'default' : 'not-allowed',
              }}
            >
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => update(m.id, { enabled: e.target.checked })} />
              <span style={{ width: 150, color: cfg.enabled ? C.txt : C.mut }}>{m.label}</span>
              <span style={{ color: C.mut, fontSize: 11 }}>ขนาด</span>
              <input type="range" min={0.6} max={1.6} step={0.05} value={cfg.scale} disabled={!cfg.enabled} onChange={(e) => update(m.id, { scale: Number(e.target.value) })} style={{ width: 130 }} />
              <span style={{ color: C.mut, width: 34, fontSize: 11 }}>{cfg.scale.toFixed(2)}×</span>
              <span style={{ color: C.mut, width: 70, fontSize: 11 }}>{cfg.x}% , {cfg.y}%</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: C.mut, marginTop: 6, lineHeight: 1.6 }}>
        💡 <b style={{ color: C.ice }}>เคล็ดลับ:</b> hover ที่ชื่อโมดูลข้างล่าง → โมดูลนั้นจะสว่าง ตัวอื่นจางลง (solo). กดเช็คบ็อกซ์เพื่อปิดที่ไม่ใช้ออก. ปุ่ม <b style={{ color: C.txt }}>รีเซ็ตตำแหน่ง</b> ถ้าตำแหน่งเก่าซ้อนกัน.
        <br />⚠️ พรีวิวเล็กกว่าจอจริงประมาณ 5 เท่า — โมดูลที่ดูใกล้กันในนี้ บนจอ 1920×1080 จะห่างกันมาก.
      </div>
    </div>
  )
}
