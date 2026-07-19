/* eslint-disable react-refresh/only-export-components -- this module
   intentionally groups tiny shared presentational components with the plain
   helper functions/consts they're used alongside (formatters, style objects);
   splitting further would be a structural change beyond this facade move. */
import React from 'react'
import { C } from './theme'
import type { Pos, EfficacyArm } from './types'

export const fmtClock = (t: number): string => {
  const a = Math.abs(t)
  return `${t < 0 ? '-' : ''}${Math.floor(a / 60)}:${(a % 60).toString().padStart(2, '0')}`
}
export const heroName = (raw: string): string => {
  const n = raw.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ').trim()
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : '—'
}

export const panel = (op: number): React.CSSProperties => ({
  background: `rgba(18,20,28,${op})`,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  color: C.txt,
  boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
})
export const overlayPanel = (op: number): React.CSSProperties => ({
  ...panel(op),
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
})
export const Gem: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.27, transform: 'rotate(45deg)', background: 'linear-gradient(135deg,#8fd4ff,#3f7fb0)', boxShadow: '0 0 14px rgba(143,212,255,0.5)', flex: 'none' }} />
)
export const Stat: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color }) => (
  <div style={{ textAlign: 'center', minWidth: 54 }}>
    <div style={{ fontSize: 18, fontWeight: 700, color: color ?? C.txt, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 10, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
  </div>
)
export const Bar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 99, transition: 'width .25s' }} />
  </div>
)
export const sep = <div style={{ width: 1, height: 38, background: C.line }} />
export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button type="button" onClick={() => onChange(!on)} className={`settings-toggle${on ? ' on' : ''}`}>
    <span className="settings-toggle-knob" />
  </button>
)
export const Seg: React.FC<{ value: Pos; options: [Pos, string][]; onChange: (v: Pos) => void }> = ({ value, options, onChange }) => (
  <div className="settings-seg">
    {options.map(([v, label]) => (
      <button key={v} type="button" onClick={() => onChange(v)} className={`settings-seg-opt${value === v ? ' on' : ''}`}>{label}</button>
    ))}
  </div>
)
export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="settings-row">
    <span className="settings-row-label">{label}</span>
    {children}
  </div>
)

// ─────────────────────────────── OSD OVERLAY (transparent, click-through) ───────────────────────────────
export const dangerStyle: React.CSSProperties = {
  background: 'rgba(58,12,16,0.86)', border: '1px solid rgba(255,123,133,0.6)', borderRadius: 12,
  color: '#ffd6da', padding: '8px 20px', fontWeight: 700, fontSize: 14,
  backdropFilter: 'none', WebkitBackdropFilter: 'none', fontFamily: '"Segoe UI", system-ui, sans-serif',
}
// G-Signal gank banner — ice palette, top-center, NEVER over the bottom-left minimap.
export const gankStyle: React.CSSProperties = {
  background: 'rgba(18,20,28,0.82)', border: `1px solid ${C.warn}`, borderRadius: 12,
  color: C.warn, padding: '9px 22px', fontWeight: 700, fontSize: 14,
  backdropFilter: 'none', WebkitBackdropFilter: 'none', fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxShadow: '0 0 24px rgba(255,207,107,0.35)',
}
export const gankClearStyle: React.CSSProperties = {
  ...gankStyle, border: `1px solid ${C.ice}`, color: C.ice, fontWeight: 600,
  boxShadow: '0 0 18px rgba(143,212,255,0.3)',
}
export const killBannerStyle: React.CSSProperties = {
  background: 'rgba(12,20,32,0.45)', border: `1px solid rgba(91,227,167,0.35)`,
  borderRadius: 16, padding: '10px 18px 10px 10px', display: 'flex', alignItems: 'center', gap: 14,
  backdropFilter: 'none', WebkitBackdropFilter: 'none', fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxShadow: '0 0 24px rgba(91,227,167,0.2)',
}
// Pack banner (announcer bundle) — a frame for the pack's own image. Relative so
// the caption can be absolutely positioned over the bottom of the image.
export const packBannerStyle: React.CSSProperties = {
  position: 'relative', display: 'inline-block', lineHeight: 0,
  borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 0 24px rgba(91,227,167,0.25)',
}

export const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`
export const fmtDate = (ms: number) => { if (!ms) return ''; const d = new Date(ms); return `${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}` }

export const armRate = (a: EfficacyArm): string => a.rate !== null ? `ตาย ${(a.rate * 100).toFixed(0)}%` : 'ยังไม่มีข้อมูล'

// ─────────────────────────────── CONTROL GUI (main window) ───────────────────────────────
export const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="settings-group">
    <div className="settings-group-head">{title}</div>
    {children}
  </section>
)
