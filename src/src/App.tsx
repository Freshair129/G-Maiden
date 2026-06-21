import React, { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/** Mirrors the Rust `GameTick` emitted by the GSI server (src-tauri/src/gsi.rs). */
interface GameTick {
  in_game: boolean
  clock_time: number
  game_state: string
  daytime: boolean
  radiant_score: number
  dire_score: number
  gold: number
  net_worth: number
  gpm: number
  xpm: number
  kills: number
  deaths: number
  assists: number
  last_hits: number
  denies: number
  hero: string
  level: number
  alive: boolean
  hp_percent: number
  mana_percent: number
}

type Pos = 'top' | 'left' | 'right'
interface Settings {
  overlayVisible: boolean
  position: Pos
  opacity: number
  alertEnabled: boolean
  alertThreshold: number
}
const DEFAULTS: Settings = { overlayVisible: true, position: 'top', opacity: 0.72, alertEnabled: true, alertThreshold: 25 }
const loadSettings = (): Settings => {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('gm-settings') ?? '{}') as Partial<Settings>) }
  } catch {
    return DEFAULTS
  }
}

const C = { bg: '#08090c', ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6', ok: '#5be3a7', warn: '#ffcf6b', bad: '#ff7b85', line: 'rgba(143,212,255,0.16)' }

const fmtClock = (t: number): string => {
  const a = Math.abs(t)
  return `${t < 0 ? '-' : ''}${Math.floor(a / 60)}:${(a % 60).toString().padStart(2, '0')}`
}
const heroName = (raw: string): string => {
  const n = raw.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ').trim()
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : '—'
}

const panel = (op: number): React.CSSProperties => ({
  background: `rgba(18,20,28,${op})`,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  color: C.txt,
  boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
})
const Gem: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.27, transform: 'rotate(45deg)', background: 'linear-gradient(135deg,#8fd4ff,#3f7fb0)', boxShadow: '0 0 14px rgba(143,212,255,0.5)', flex: 'none' }} />
)
const Stat: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color }) => (
  <div style={{ textAlign: 'center', minWidth: 54 }}>
    <div style={{ fontSize: 18, fontWeight: 700, color: color ?? C.txt, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 10, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
  </div>
)
const Bar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 99, transition: 'width .25s' }} />
  </div>
)
const sep = <div style={{ width: 1, height: 38, background: C.line }} />
const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button onClick={() => onChange(!on)} style={{ width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', position: 'relative', background: on ? C.ice : 'rgba(255,255,255,0.14)', transition: '.15s' }}>
    <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: 99, background: '#0c1018', transition: '.15s' }} />
  </button>
)
const Seg: React.FC<{ value: Pos; options: [Pos, string][]; onChange: (v: Pos) => void }> = ({ value, options, onChange }) => (
  <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
    {options.map(([v, label]) => (
      <button key={v} onClick={() => onChange(v)} style={{ background: value === v ? 'rgba(143,212,255,0.16)' : 'transparent', color: value === v ? C.ice : C.mut, border: 'none', padding: '6px 13px', cursor: 'pointer', fontSize: 12 }}>{label}</button>
    ))}
  </div>
)
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderTop: '1px solid rgba(143,212,255,0.08)' }}>
    <span style={{ fontSize: 13.5 }}>{label}</span>
    {children}
  </div>
)

// ─────────────────────────────── OSD OVERLAY (transparent, click-through) ───────────────────────────────
const dangerStyle: React.CSSProperties = {
  background: 'rgba(58,12,16,0.86)', border: '1px solid rgba(255,123,133,0.6)', borderRadius: 12,
  color: '#ffd6da', padding: '8px 20px', fontWeight: 700, fontSize: 14,
  backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', fontFamily: '"Segoe UI", system-ui, sans-serif',
}
const Overlay: React.FC = () => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [s, setS] = useState<Settings>(DEFAULTS)
  useEffect(() => {
    const u1 = listen<GameTick>('game-tick', (e) => { setTick(e.payload); setSeen(true) })
    const u2 = listen<Settings>('settings', (e) => setS({ ...DEFAULTS, ...e.payload }))
    void emit('overlay-ready')
    return () => { void u1.then((f) => f()); void u2.then((f) => f()) }
  }, [])

  const wrap: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'transparent', display: 'flex',
    justifyContent: s.position === 'left' ? 'flex-start' : s.position === 'right' ? 'flex-end' : 'center',
    alignItems: 'flex-start', padding: 12, pointerEvents: 'none',
  }
  if (!seen || !tick || !tick.in_game) {
    return (
      <div style={wrap}>
        <div style={{ ...panel(s.opacity), padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: seen ? C.warn : C.mut }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>G-Maiden</div>
            <div style={{ fontSize: 11.5, color: C.mut }}>{seen ? 'เชื่อมต่อ GSI แล้ว — รอเข้าเกม…' : 'รอข้อมูลจาก Dota 2  ·  Alt+S = ซ่อน/แสดง'}</div>
          </div>
        </div>
      </div>
    )
  }
  const t = tick
  const lowHp = s.alertEnabled && t.alive && t.hp_percent > 0 && t.hp_percent <= s.alertThreshold
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {lowHp && <div className="gm-danger" style={dangerStyle}>⚠ HP เหลือ {t.hp_percent}% — ถอยก่อนค่ะเพื่อน!</div>}
        <div style={{ ...panel(s.opacity), padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ice, lineHeight: 1 }}>{fmtClock(t.clock_time)}</div>
            <div style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>
              <span style={{ color: C.ok }}>{t.radiant_score}</span><span style={{ margin: '0 5px', opacity: 0.5 }}>:</span><span style={{ color: C.bad }}>{t.dire_score}</span><span style={{ marginLeft: 7 }}>{t.daytime ? '☀' : '🌙'}</span>
            </div>
          </div>
          {sep}
          <div style={{ minWidth: 120 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: t.alive ? C.txt : C.bad }}>{heroName(t.hero)} {!t.alive && '💀'}</div>
            <div style={{ fontSize: 11, color: C.mut, marginBottom: 5 }}>Lvl {t.level}</div>
            <div style={{ marginBottom: 3 }}><Bar pct={t.hp_percent} color={C.ok} /></div>
            <Bar pct={t.mana_percent} color={C.ice} />
          </div>
          {sep}
          <Stat label="K / D / A" value={`${t.kills}/${t.deaths}/${t.assists}`} />
          <Stat label="LH / DN" value={`${t.last_hits}/${t.denies}`} />
          {sep}
          <Stat label="Gold" value={t.gold.toLocaleString()} color={C.warn} />
          <Stat label="Net Worth" value={t.net_worth.toLocaleString()} color={C.ice} />
          <Stat label="GPM" value={t.gpm} />
          <Stat label="XPM" value={t.xpm} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────── CONTROL GUI (main window) ───────────────────────────────
const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ ...panel(0.86), padding: '16px 20px' }}>
    <div style={{ fontSize: 12, color: C.ice, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>{title}</div>
    {children}
  </div>
)
const Control: React.FC = () => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [s, setS] = useState<Settings>(loadSettings)
  const sRef = useRef(s)
  sRef.current = s

  // bind once; use ref so the overlay-ready handler always emits current settings
  useEffect(() => {
    document.body.style.background = C.bg
    const u1 = listen<GameTick>('game-tick', (e) => { setTick(e.payload); setSeen(true) })
    const u2 = listen('overlay-ready', () => { void emit('settings', sRef.current) })
    return () => { void u1.then((f) => f()); void u2.then((f) => f()) }
  }, [])

  // persist + broadcast + apply overlay visibility on any change
  useEffect(() => {
    localStorage.setItem('gm-settings', JSON.stringify(s))
    void emit('settings', s)
    void invoke('set_overlay_visible', { visible: s.overlayVisible }).catch(() => {})
  }, [s])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }))

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.txt, fontFamily: '"Segoe UI", system-ui, sans-serif', padding: '22px 26px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
        <Gem size={30} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.3 }}>G-Maiden</div>
          <div style={{ fontSize: 12, color: C.mut }}>Real-time Dota 2 AI Companion · OSD + Control</div>
        </div>
        <span style={{ ...panel(0.6), padding: '7px 14px', fontSize: 12.5, color: seen ? C.ok : C.mut, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: seen ? C.ok : C.mut, boxShadow: seen ? `0 0 8px ${C.ok}` : 'none' }} />
          {seen ? 'GSI เชื่อมต่อแล้ว' : 'รอ GSI (เปิด Dota 2)'}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Overlay (OSD)">
          <Row label="แสดง overlay บนเกม"><Toggle on={s.overlayVisible} onChange={(v) => set('overlayVisible', v)} /></Row>
          <Row label="ตำแหน่ง"><Seg value={s.position} options={[['top', 'บน'], ['left', 'ซ้าย'], ['right', 'ขวา']]} onChange={(v) => set('position', v)} /></Row>
          <Row label={`ความทึบพาเนล: ${Math.round(s.opacity * 100)}%`}>
            <input type="range" min={40} max={100} value={Math.round(s.opacity * 100)} onChange={(e) => set('opacity', Number(e.target.value) / 100)} style={{ width: 150 }} />
          </Row>
          <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8 }}>💡 กด <b style={{ color: C.ice }}>Alt+S</b> ในเกมเพื่อซ่อน/แสดง overlay</div>
        </Card>

        <Card title="Alerts (G-Signal)">
          <Row label="เตือนเมื่อ HP ต่ำ"><Toggle on={s.alertEnabled} onChange={(v) => set('alertEnabled', v)} /></Row>
          <Row label={`ขีดเตือน HP: ${s.alertThreshold}%`}>
            <input type="range" min={10} max={50} value={s.alertThreshold} onChange={(e) => set('alertThreshold', Number(e.target.value))} style={{ width: 150 }} disabled={!s.alertEnabled} />
          </Row>
          <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8 }}>เตือน "ถอยก่อนค่ะเพื่อน!" บน overlay เมื่อเลือดต่ำกว่าขีด</div>
        </Card>

        <Card title="Live (จาก GSI)">
          {tick && tick.in_game ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', paddingTop: 6 }}>
              <Stat label="Clock" value={fmtClock(tick.clock_time)} color={C.ice} />
              <Stat label="Hero" value={heroName(tick.hero)} />
              <Stat label="Lvl" value={tick.level} />
              <Stat label="K/D/A" value={`${tick.kills}/${tick.deaths}/${tick.assists}`} />
              <Stat label="Net Worth" value={tick.net_worth.toLocaleString()} color={C.ice} />
              <Stat label="HP" value={`${tick.hp_percent}%`} color={tick.hp_percent <= s.alertThreshold ? C.bad : C.ok} />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.mut, paddingTop: 10 }}>{seen ? 'เชื่อมต่อแล้ว — รอเข้าเกม Dota 2' : 'เปิด Dota 2 (ติดตั้ง GSI config แล้ว) เพื่อดูข้อมูลสด'}</div>
          )}
        </Card>

        <Card title="Modules (เร็ว ๆ นี้)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 8, fontSize: 12.5, color: C.mut }}>
            <div>○ G-Sentry — fog-of-war monitor</div>
            <div>○ G-Motion — gank path prediction</div>
            <div>○ G-Signal — voice gank warning</div>
            <div>○ G-Master — item/skill advisor</div>
          </div>
        </Card>
      </div>

      <footer style={{ marginTop: 18, fontSize: 11.5, color: C.mut, display: 'flex', justifyContent: 'space-between' }}>
        <span>GSI: http://127.0.0.1:3000/gsi</span>
        <span>v0.1.0</span>
      </footer>
    </div>
  )
}

export const App: React.FC = () => {
  const label = getCurrentWindow().label
  return label === 'overlay' ? <Overlay /> : <Control />
}
