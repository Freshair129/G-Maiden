import React, { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
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
  hudVisible: boolean
  position: Pos
  alertEnabled: boolean
  alertThreshold: number
  opacity: number
}
const DEFAULTS: Settings = { hudVisible: true, position: 'top', alertEnabled: true, alertThreshold: 25, opacity: 0.72 }
const loadSettings = (): Settings => {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('gm-settings') ?? '{}') as Partial<Settings>) }
  } catch {
    return DEFAULTS
  }
}

const C = { ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6', ok: '#5be3a7', warn: '#ffcf6b', bad: '#ff7b85' }

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
  border: '1px solid rgba(143,212,255,0.16)',
  borderRadius: 14,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  color: C.txt,
  boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
})

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
const sep = <div style={{ width: 1, height: 38, background: 'rgba(143,212,255,0.16)' }} />

// ---- settings controls ----
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderTop: '1px solid rgba(143,212,255,0.08)' }}>
    <span style={{ fontSize: 13 }}>{label}</span>
    {children}
  </div>
)
const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button
    onClick={() => onChange(!on)}
    style={{ width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', position: 'relative', background: on ? C.ice : 'rgba(255,255,255,0.14)', transition: '.15s' }}
  >
    <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: 99, background: '#0c1018', transition: '.15s' }} />
  </button>
)
const Seg: React.FC<{ value: Pos; options: [Pos, string][]; onChange: (v: Pos) => void }> = ({ value, options, onChange }) => (
  <div style={{ display: 'inline-flex', border: '1px solid rgba(143,212,255,0.18)', borderRadius: 9, overflow: 'hidden' }}>
    {options.map(([v, label]) => (
      <button
        key={v}
        onClick={() => onChange(v)}
        style={{ background: value === v ? 'rgba(143,212,255,0.16)' : 'transparent', color: value === v ? C.ice : C.mut, border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
      >
        {label}
      </button>
    ))}
  </div>
)

const SettingsView: React.FC<{
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
  connected: boolean
}> = ({ settings, onChange, onClose, connected }) => {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,10,0.45)', pointerEvents: 'auto' }}>
      <div style={{ ...panel(0.92), width: 380, padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, transform: 'rotate(45deg)', background: 'linear-gradient(135deg,#8fd4ff,#3f7fb0)', boxShadow: '0 0 14px rgba(143,212,255,0.5)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>G-Maiden — ตั้งค่า</div>
              <div style={{ fontSize: 11, color: C.mut }}>{connected ? '🟢 เชื่อมต่อ GSI แล้ว' : '⚪ ยังไม่มีข้อมูล GSI'} · ปิด: Alt+S</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(143,212,255,0.18)', borderRadius: 8, color: C.txt, cursor: 'pointer', padding: '4px 9px' }}>✕</button>
        </div>
        <Row label="แสดง HUD"><Toggle on={settings.hudVisible} onChange={(v) => set('hudVisible', v)} /></Row>
        <Row label="ตำแหน่ง HUD">
          <Seg value={settings.position} options={[['top', 'บน'], ['left', 'ซ้าย'], ['right', 'ขวา']]} onChange={(v) => set('position', v)} />
        </Row>
        <Row label="เตือนเมื่อ HP ต่ำ"><Toggle on={settings.alertEnabled} onChange={(v) => set('alertEnabled', v)} /></Row>
        <Row label={`ขีดเตือน HP: ${settings.alertThreshold}%`}>
          <input type="range" min={10} max={50} value={settings.alertThreshold} onChange={(e) => set('alertThreshold', Number(e.target.value))} style={{ width: 150 }} />
        </Row>
        <Row label={`ความทึบพาเนล: ${Math.round(settings.opacity * 100)}%`}>
          <input type="range" min={40} max={100} value={Math.round(settings.opacity * 100)} onChange={(e) => set('opacity', Number(e.target.value) / 100)} style={{ width: 150 }} />
        </Row>
      </div>
    </div>
  )
}

export const App: React.FC = () => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const un1 = listen<GameTick>('game-tick', (e) => { setTick(e.payload); setSeen(true) })
    const un2 = listen('toggle-settings', () => setOpen((o) => !o))
    return () => { void un1.then((f) => f()); void un2.then((f) => f()) }
  }, [])

  useEffect(() => { localStorage.setItem('gm-settings', JSON.stringify(settings)) }, [settings])
  useEffect(() => { void invoke('set_overlay_interactive', { interactive: open }).catch(() => {}) }, [open])

  const wrap: React.CSSProperties = {
    position: 'fixed', inset: 0, margin: 0, background: 'transparent',
    display: 'flex',
    justifyContent: settings.position === 'left' ? 'flex-start' : settings.position === 'right' ? 'flex-end' : 'center',
    alignItems: 'flex-start', padding: 12, pointerEvents: 'none',
  }

  const renderHud = (): React.ReactNode => {
    if (!settings.hudVisible) return null
    if (!seen || !tick || !tick.in_game) {
      return (
        <div style={{ ...panel(settings.opacity), padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: seen ? C.warn : C.mut, boxShadow: seen ? `0 0 8px ${C.warn}` : 'none' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>G-Maiden</div>
            <div style={{ fontSize: 11.5, color: C.mut }}>{seen ? 'เชื่อมต่อ GSI แล้ว — รอเข้าเกม Dota 2…' : 'รอข้อมูลจาก Dota 2  ·  Alt+S = ตั้งค่า'}</div>
          </div>
        </div>
      )
    }
    const t = tick
    const lowHp = settings.alertEnabled && t.alive && t.hp_percent > 0 && t.hp_percent <= settings.alertThreshold
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {lowHp && (
          <div className="gm-danger" style={dangerStyle}>⚠ HP เหลือ {t.hp_percent}% — ถอยก่อนค่ะเพื่อน!</div>
        )}
        <div style={{ ...panel(settings.opacity), padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ice, lineHeight: 1 }}>{fmtClock(t.clock_time)}</div>
            <div style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>
              <span style={{ color: C.ok }}>{t.radiant_score}</span>
              <span style={{ margin: '0 5px', opacity: 0.5 }}>:</span>
              <span style={{ color: C.bad }}>{t.dire_score}</span>
              <span style={{ marginLeft: 7 }}>{t.daytime ? '☀' : '🌙'}</span>
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
    )
  }

  return (
    <>
      <div style={wrap}>{renderHud()}</div>
      {open && <SettingsView settings={settings} onChange={setSettings} onClose={() => setOpen(false)} connected={seen} />}
    </>
  )
}

const dangerStyle: React.CSSProperties = {
  background: 'rgba(58, 12, 16, 0.86)',
  border: '1px solid rgba(255,123,133,0.6)',
  borderRadius: 12,
  color: '#ffd6da',
  padding: '8px 20px',
  fontWeight: 700,
  fontSize: 14,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
}
