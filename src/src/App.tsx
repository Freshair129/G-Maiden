import React, { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

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

const fmtClock = (t: number): string => {
  const neg = t < 0
  const a = Math.abs(t)
  const m = Math.floor(a / 60)
  const s = a % 60
  return `${neg ? '-' : ''}${m}:${s.toString().padStart(2, '0')}`
}

const heroName = (raw: string): string => {
  const n = raw.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ').trim()
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : '—'
}

const C = {
  ice: '#8fd4ff',
  txt: '#e7eef6',
  mut: '#8794a6',
  ok: '#5be3a7',
  warn: '#ffcf6b',
  bad: '#ff7b85',
}

const panel: React.CSSProperties = {
  background: 'rgba(18,20,28,0.72)',
  border: '1px solid rgba(143,212,255,0.16)',
  borderRadius: 14,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  color: C.txt,
  boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
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

const Stat: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color }) => (
  <div style={{ textAlign: 'center', minWidth: 56 }}>
    <div style={{ fontSize: 18, fontWeight: 700, color: color ?? C.txt, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 10, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
  </div>
)

const Bar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 99, transition: 'width .25s' }} />
  </div>
)

export const App: React.FC = () => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const un = listen<GameTick>('game-tick', (e) => {
      setTick(e.payload)
      setSeen(true)
    })
    return () => {
      void un.then((f) => f())
    }
  }, [])

  // Waiting state — no GSI data yet.
  if (!seen || !tick || !tick.in_game) {
    return (
      <div style={wrap}>
        <div style={{ ...panel, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: seen ? C.warn : C.mut, boxShadow: seen ? `0 0 8px ${C.warn}` : 'none' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>G-Maiden</div>
            <div style={{ fontSize: 11.5, color: C.mut }}>
              {seen ? 'เชื่อมต่อ GSI แล้ว — รอเข้าเกม Dota 2…' : 'รอข้อมูลจาก Dota 2 (ตรวจ GSI config + เปิดเกม)'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const t = tick
  const lowHp = t.alive && t.hp_percent > 0 && t.hp_percent <= 25
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {lowHp && (
          <div className="gm-danger" style={dangerStyle}>
            ⚠ HP เหลือ {t.hp_percent}% — ถอยก่อนค่ะเพื่อน!
          </div>
        )}
        <div style={{ ...panel, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 22 }}>
        {/* clock + score */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.ice, lineHeight: 1 }}>{fmtClock(t.clock_time)}</div>
          <div style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>
            <span style={{ color: C.ok }}>{t.radiant_score}</span>
            <span style={{ margin: '0 5px', opacity: 0.5 }}>:</span>
            <span style={{ color: C.bad }}>{t.dire_score}</span>
            <span style={{ marginLeft: 7 }}>{t.daytime ? '☀' : '🌙'}</span>
          </div>
        </div>

        <div style={{ width: 1, height: 38, background: 'rgba(143,212,255,0.16)' }} />

        {/* hero + level + alive */}
        <div style={{ minWidth: 120 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: t.alive ? C.txt : C.bad }}>
            {heroName(t.hero)} {!t.alive && '💀'}
          </div>
          <div style={{ fontSize: 11, color: C.mut, marginBottom: 5 }}>Lvl {t.level}</div>
          <div style={{ marginBottom: 3 }}><Bar pct={t.hp_percent} color={C.ok} /></div>
          <Bar pct={t.mana_percent} color={C.ice} />
        </div>

        <div style={{ width: 1, height: 38, background: 'rgba(143,212,255,0.16)' }} />

        {/* KDA */}
        <Stat label="K / D / A" value={`${t.kills}/${t.deaths}/${t.assists}`} />
        <Stat label="LH / DN" value={`${t.last_hits}/${t.denies}`} />

        <div style={{ width: 1, height: 38, background: 'rgba(143,212,255,0.16)' }} />

        {/* economy */}
        <Stat label="Gold" value={t.gold.toLocaleString()} color={C.warn} />
        <Stat label="Net Worth" value={t.net_worth.toLocaleString()} color={C.ice} />
        <Stat label="GPM" value={t.gpm} />
        <Stat label="XPM" value={t.xpm} />
        </div>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  margin: 0,
  background: 'transparent',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  paddingTop: 12,
  pointerEvents: 'none',
}
