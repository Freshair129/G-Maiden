import React, { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

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

/** CV/G-Signal events emitted by the Rust backend (src-tauri cv pipeline). */
interface MinimapCv {
  region: { x: number; y: number; side: number }
  icon: number
  candidates: [number, number][]
  count: number
  detections: { label: number; name: string; x: number; y: number; score: number }[]
  classifier: boolean
}
interface GankAlert { probability: number; missing_heroes: string[]; eta_ms: number }
/** Connection/status pushed by the Rust watchdog (gsi.rs) every ~4s. */
interface GsiStatus { dota_running: boolean; gsi_active: boolean; in_game: boolean }

type Pos = 'top' | 'left' | 'right'
interface Settings {
  overlayVisible: boolean
  position: Pos
  opacity: number
  alertEnabled: boolean
  alertThreshold: number
  voiceEnabled: boolean
  voiceName: string
  voiceRate: number
  personaLines: boolean
  autoAdvice: boolean
  gankVisuals: boolean
  cvDebug: boolean
}
const DEFAULTS: Settings = { overlayVisible: true, position: 'top', opacity: 0.72, alertEnabled: true, alertThreshold: 25, voiceEnabled: true, voiceName: '', voiceRate: 0, personaLines: true, autoAdvice: false, gankVisuals: true, cvDebug: false }
const DANGER_LINE = 'ถอยก่อนค่ะเพื่อน เลือดเหลือน้อยแล้ว'

// Maiden's persona pool — gentle, smart, lightly self-deprecating about CM nerfs,
// per CLAUDE.md. Multiple lines per event so it doesn't feel scripted.
const PERSONA_LINES = {
  levelUp: [
    'ขึ้นเลเวลแล้วค่ะ สวยมาก ขยายอำนาจต่อเลย',
    'เลเวลใหม่นะคะ เก็บสกิลตามเพลนเดิม',
    'เลเวลขึ้นแล้ว — ยังเก่งกว่า movement speed ของซีเอ็มอีกนะ',
  ],
  kill: [
    'ฆ่าได้สวยค่ะ! เก็บไปเรื่อย ๆ',
    'นั่นน่ะ pick ของชั้น — เอ๊ะ ของเพื่อนก็ได้',
    'ดีมากเลย รักษาแรงโมเมนตัมไว้',
  ],
  death: [
    'ตายแล้วเหรอคะ ไม่เป็นไรเดี๋ยวกลับมาใหม่',
    'เสียใจด้วยนะ — มาวิเคราะห์กันว่าเกิดอะไรขึ้น',
    'เกิดขึ้นได้ค่ะ จดจังหวะ map ไว้นะ',
  ],
  respawn: [
    'กลับมาแล้ว ค่อย ๆ นะคะ',
    'ฟื้นแล้ว — ดู map ก่อนค่อยเดินออกนะ',
    'พร้อมแล้วใช่ไหม ไปด้วยกันค่ะ',
  ],
  manaLow: [
    'มานาเหลือน้อยแล้วค่ะ ระวังด้วย',
    'มานาใกล้หมด — ถอยกลับฐานก่อนไหม',
  ],
} as const
type PersonaEvent = keyof typeof PERSONA_LINES

// Belief Revision (CLAUDE.md persona rule, required of G-Signal). Used when
// Maiden just warned "ถอย!" but the danger evaporated within the speech window —
// kill the current line and replace with one of these to keep her honest.
const REVISION_LINES = {
  dangerRetracted: [
    'เอ๊ะ! เดี๋ยวก่อน — ไม่ต้องถอยแล้วนะคะ ปลอดภัยแล้ว',
    'อ้าว! พลิกได้เก่งมาก — ขอโทษที่เพิ่งบอกถอย',
    'เอ๊ะ! โทษทีค่ะ คิดเร็วไปหน่อย — ตามล่าต่อได้',
  ],
  // G-Signal gank retraction (gank-clear). Soft Belief-Revision echo on the banner.
  gankCleared: [
    'เอ๊ะ... ปลอดภัยแล้วค่ะ',
    'อ้าว ไม่มาแล้ว — ปลอดภัยค่ะ',
  ],
} as const

interface VoiceInfo { name: string; culture: string; gender: string; age: string }
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
// G-Signal gank banner — ice palette, top-center, NEVER over the bottom-left minimap.
const gankStyle: React.CSSProperties = {
  background: 'rgba(18,20,28,0.82)', border: `1px solid ${C.warn}`, borderRadius: 12,
  color: C.warn, padding: '9px 22px', fontWeight: 700, fontSize: 14,
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxShadow: '0 0 24px rgba(255,207,107,0.35)',
}
const gankClearStyle: React.CSSProperties = {
  ...gankStyle, border: `1px solid ${C.ice}`, color: C.ice, fontWeight: 600,
  boxShadow: '0 0 18px rgba(143,212,255,0.3)',
}
type GankState = { phase: 'alert'; heroes: string[]; probability: number } | { phase: 'clear' } | null

const Overlay: React.FC = () => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [s, setS] = useState<Settings>(DEFAULTS)
  // G-Signal gank banner + CV debug feed (item A & B).
  const [gank, setGank] = useState<GankState>(null)
  const [cv, setCv] = useState<MinimapCv | null>(null)
  // GSI activity from the watchdog — so the HUD disappears when Dota closes
  // (Dota stops POSTing without a final tick; `tick` would otherwise stay stale).
  const [gsiActive, setGsiActive] = useState(true)
  const gankTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gankClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // rising-edge state for danger: speak once when HP crosses the threshold down,
  // not every tick. Reset when HP recovers or the hero dies/respawns.
  const dangerActive = useRef(false)
  const lastSpokeAt = useRef(0)
  // What Maiden last said (so Belief Revision can retract a danger line specifically)
  // and the HP at the moment she warned, so we can detect a real recovery.
  const lastSpokeKind = useRef<'danger' | 'persona' | 'revision' | null>(null)
  const dangerHpAtSpeak = useRef(0)
  // Previous tick for transition detection (level up, kill, death, respawn).
  // We don't snapshot the whole tick — only the fields that drive a persona line.
  const prev = useRef<{ level: number; kills: number; deaths: number; alive: boolean; mana: number; hp: number } | null>(null)
  const manaActive = useRef(false)
  // Auto-advice trigger memory (in clock_time seconds; -Infinity = never fired).
  // Per-key cooldown keeps the Plan quota honest even if multiple triggers fire close together.
  const recentDeathClock = useRef<number | null>(null)
  const advisedAt = useRef<Record<string, number>>({})
  const sRef = useRef(s)
  sRef.current = s
  useEffect(() => {
    const u1 = listen<GameTick>('game-tick', (e) => { setTick(e.payload); setSeen(true) })
    const u2 = listen<Settings>('settings', (e) => setS({ ...DEFAULTS, ...e.payload }))
    // CV debug feed — fires 8–15 Hz. Cheap setState; only rendered when cvDebug is on.
    const u3 = listen<MinimapCv>('minimap-cv', (e) => setCv(e.payload))
    // G-Signal: show banner on alert, retract on clear (Belief Revision visual echo).
    const u4 = listen<GankAlert>('gank-alert', (e) => {
      if (gankClearTimer.current) { clearTimeout(gankClearTimer.current); gankClearTimer.current = null }
      setGank({ phase: 'alert', heroes: e.payload.missing_heroes ?? [], probability: e.payload.probability })
      if (gankTimer.current) clearTimeout(gankTimer.current)
      // auto-dismiss after ~6s if no gank-clear arrives
      gankTimer.current = setTimeout(() => setGank(null), 6000)
    })
    const u5 = listen('gank-clear', () => {
      if (gankTimer.current) { clearTimeout(gankTimer.current); gankTimer.current = null }
      setGank({ phase: 'clear' })
      // brief soft echo, then fade out; don't re-show until a new gank-alert
      if (gankClearTimer.current) clearTimeout(gankClearTimer.current)
      gankClearTimer.current = setTimeout(() => setGank(null), 2200)
    })
    const u6 = listen<GsiStatus>('gsi-status', (e) => setGsiActive(e.payload.gsi_active))
    void emit('overlay-ready')
    return () => {
      void u1.then((f) => f()); void u2.then((f) => f()); void u3.then((f) => f())
      void u4.then((f) => f()); void u5.then((f) => f()); void u6.then((f) => f())
      if (gankTimer.current) clearTimeout(gankTimer.current)
      if (gankClearTimer.current) clearTimeout(gankClearTimer.current)
    }
  }, [])

  // ── All hooks below run EVERY render, before any early return. React requires
  // a constant hook order; an early `return` above these (as there was) makes the
  // hook count change when a match starts and crashes the overlay. They guard on
  // `tick` internally instead. ──
  const lowHp = !!tick && tick.in_game && s.alertEnabled && tick.alive
    && tick.hp_percent > 0 && tick.hp_percent <= s.alertThreshold

  // Speak on the rising edge (alive + crossing the line). Re-arm when safe again,
  // and throttle to at most once every 8s in case HP flickers across the line.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    if (!tick.alive || tick.hp_percent > s.alertThreshold + 5) {
      dangerActive.current = false
      return
    }
    if (lowHp && !dangerActive.current && s.voiceEnabled) {
      const now = Date.now()
      if (now - lastSpokeAt.current > 8000) {
        lastSpokeAt.current = now
        dangerActive.current = true
        lastSpokeKind.current = 'danger'
        dangerHpAtSpeak.current = tick.hp_percent
        void invoke('speak_event', { event: 'danger', fallback: DANGER_LINE, voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})
      }
    }
  }, [lowHp, tick?.in_game, tick?.alive, tick?.hp_percent, s.alertThreshold, s.voiceEnabled])

  // Belief Revision (CLAUDE.md): if Maiden just yelled "ถอย!" but the danger
  // evaporated within ~2.5s (player got a kill, or HP swung well above safe),
  // kill the in-flight line and replace with a self-correcting one.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    if (!p || lastSpokeKind.current !== 'danger') return
    const sinceSpoke = Date.now() - lastSpokeAt.current
    if (sinceSpoke > 2500 || sinceSpoke < 100) return  // out of window / same tick
    const hpRecovered = tick.hp_percent >= dangerHpAtSpeak.current + 25 && tick.hp_percent > s.alertThreshold + 15
    const gotKill = tick.kills > p.kills
    if (!hpRecovered && !gotKill) return
    const pool = REVISION_LINES.dangerRetracted
    const line = pool[Math.floor(Math.random() * pool.length)]
    lastSpokeAt.current = Date.now()
    lastSpokeKind.current = 'revision'
    dangerActive.current = false  // arm danger again so a fresh crossing can re-warn
    void invoke('cancel_speech').catch(() => {})
    // brief gap lets the killed SAPI process die before the new one starts,
    // otherwise Windows audio sometimes squashes the first syllable
    setTimeout(() => {
      void invoke('speak_event', { event: 'revision', fallback: line, voice: sRef.current.voiceName || null, rate: sRef.current.voiceRate }).catch(() => {})
    }, 90)
  }, [tick?.in_game, tick?.hp_percent, tick?.kills, s.alertThreshold])

  // Persona events — detect transitions vs. the previous tick. We minimum-gap
  // every utterance to 6s and skip persona lines whenever a danger line is
  // already due, so Maiden never talks over her own warnings.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    prev.current = { level: tick.level, kills: tick.kills, deaths: tick.deaths, alive: tick.alive, mana: tick.mana_percent, hp: tick.hp_percent }
    if (!p || !sRef.current.voiceEnabled || !sRef.current.personaLines) return
    if (lowHp) return // don't talk over a danger warning

    const events: PersonaEvent[] = []
    if (tick.level > p.level && tick.level >= 2) events.push('levelUp')
    if (tick.kills > p.kills) events.push('kill')
    if (p.alive && !tick.alive) events.push('death')
    if (!p.alive && tick.alive) events.push('respawn')

    // mana-low rising edge: <= 15% while alive; clear at > 25%.
    if (tick.alive && tick.mana_percent > 0 && tick.mana_percent <= 15 && !manaActive.current) {
      events.push('manaLow')
      manaActive.current = true
    } else if (tick.mana_percent > 25) {
      manaActive.current = false
    }
    if (events.length === 0) return

    const now = Date.now()
    if (now - lastSpokeAt.current < 6000) return
    // Pick the highest-priority event in order: death > respawn > kill > levelUp > manaLow
    const order: PersonaEvent[] = ['death', 'respawn', 'kill', 'levelUp', 'manaLow']
    const evt = order.find((e) => events.includes(e))!
    const pool = PERSONA_LINES[evt]
    const line = pool[Math.floor(Math.random() * pool.length)]
    lastSpokeAt.current = now
    lastSpokeKind.current = 'persona'
    void invoke('speak_event', { event: evt, fallback: line, voice: sRef.current.voiceName || null, rate: sRef.current.voiceRate }).catch(() => {})
  }, [tick?.in_game, tick?.level, tick?.kills, tick?.deaths, tick?.alive, tick?.mana_percent, lowHp])

  // Auto-advice (G-Master proactive). Fires Claude Plan request + speaks the
  // result on key moments: ult level milestones and a death-streak (2 deaths
  // within 5 clock-min). Per-trigger cooldown 10 clock-min; server-side
  // throttle (30s wallclock) also caps quota use.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    if (!p || !sRef.current.autoAdvice || !sRef.current.voiceEnabled) return

    type Trigger = { key: string }
    const triggers: Trigger[] = []

    if (tick.level > p.level && (tick.level === 6 || tick.level === 11 || tick.level === 16)) {
      triggers.push({ key: `lvl${tick.level}` })
    }
    if (tick.deaths > p.deaths) {
      const last = recentDeathClock.current
      if (last !== null && tick.clock_time - last > 0 && tick.clock_time - last < 300) {
        triggers.push({ key: 'deathStreak' })
      }
      recentDeathClock.current = tick.clock_time
    }

    for (const trig of triggers) {
      const last = advisedAt.current[trig.key] ?? -Infinity
      if (tick.clock_time - last < 600) continue
      advisedAt.current[trig.key] = tick.clock_time
      void invoke<{ text: string; cached: boolean }>('request_advice', { tick })
        .then((a) => {
          if (!a?.text) return
          void invoke('speak_event', {
            event: 'advice',
            fallback: a.text,
            voice: sRef.current.voiceName || null,
            rate: sRef.current.voiceRate,
          }).catch(() => {})
        })
        .catch(() => { /* claude CLI missing or login fail — silent in auto mode */ })
    }
  }, [tick?.in_game, tick?.level, tick?.deaths, tick?.clock_time])

  const wrap: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'transparent', display: 'flex',
    justifyContent: s.position === 'left' ? 'flex-start' : s.position === 'right' ? 'flex-end' : 'center',
    alignItems: 'flex-start', padding: 12, pointerEvents: 'none',
  }

  // B. CV debug overlay (calibration) — full-screen, screen px == overlay px.
  // OFF by default; drawn only when settings.cvDebug is on.
  const cvDebug = s.cvDebug && cv ? (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      <div style={{
        position: 'absolute', left: cv.region.x, top: cv.region.y, width: cv.region.side, height: cv.region.side,
        border: `1px solid ${C.ice}`, boxShadow: '0 0 8px rgba(143,212,255,0.4)',
      }} />
      {cv.candidates.map(([cx, cy], i) => (
        <div key={`c${i}`} style={{
          position: 'absolute', left: cv.region.x + cx, top: cv.region.y + cy, width: cv.icon, height: cv.icon,
          border: '1px solid rgba(143,212,255,0.35)', borderRadius: 2,
        }} />
      ))}
      {cv.detections.map((d, i) => (
        <div key={`d${i}`} style={{ position: 'absolute', left: cv.region.x + d.x, top: cv.region.y + d.y }}>
          <div style={{ width: cv.icon, height: cv.icon, border: `1.5px solid ${C.warn}`, borderRadius: 2, boxShadow: '0 0 6px rgba(255,207,107,0.5)' }} />
          <div style={{ fontSize: 9.5, color: C.warn, whiteSpace: 'nowrap', marginTop: 1, textShadow: '0 0 3px #000' }}>{heroName(d.name)} {(d.score * 100).toFixed(0)}%</div>
        </div>
      ))}
      <div style={{ position: 'absolute', left: cv.region.x, top: cv.region.y - 16, fontSize: 10.5, color: C.ice, textShadow: '0 0 3px #000', whiteSpace: 'nowrap' }}>
        CV: {cv.count} cand · {cv.detections.length} det · {cv.classifier ? 'ONNX' : 'candidate-only'}
      </div>
    </div>
  ) : null

  // A. Gank warning banner — top-center, above the stat HUD, never over the minimap.
  const gankBanner = s.gankVisuals && gank ? (
    gank.phase === 'clear'
      ? <div className="gm-gank-clear" style={gankClearStyle}>{REVISION_LINES.gankCleared[0]}</div>
      : <div className="gm-gank" style={gankStyle}>
          ⚠️ ระวังแก๊งค์! {gank.heroes.length ? gank.heroes.map(heroName).join(', ') + ' หาย — ' : ''}{Math.round(gank.probability * 100)}%
        </div>
  ) : null

  if (!seen || !tick || !tick.in_game || !gsiActive) {
    return (
      <>
        {cvDebug}
        <div style={wrap}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {gankBanner}
            <div style={{ ...panel(s.opacity), padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: seen ? C.warn : C.mut }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>G-Maiden</div>
                <div style={{ fontSize: 11.5, color: C.mut }}>{seen ? 'เชื่อมต่อ GSI แล้ว — รอเข้าเกม…' : 'รอข้อมูลจาก Dota 2  ·  Alt+S = ซ่อน/แสดง'}</div>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }
  const t = tick

  return (
    <>
    {cvDebug}
    <div style={wrap}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {gankBanner}
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
    </>
  )
}

// ─────────────────────────────── SETUP (GSI config auto-install) ───────────────────────────────
interface SetupStatus {
  installed: boolean
  steam_path: string | null
  dota_cfg_dir: string | null
  cfg_present: boolean
  message: string
}
const SetupCard: React.FC = () => {
  const [st, setSt] = useState<SetupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    try { setSt(await invoke<SetupStatus>('detect_gsi_setup')) } catch { /* command unavailable */ }
  }
  useEffect(() => { void refresh() }, [])
  const install = async () => {
    setBusy(true)
    try { setSt(await invoke<SetupStatus>('install_gsi_config')) } finally { setBusy(false) }
  }
  if (!st) return (
    <Card title="Setup (GSI)"><div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังตรวจสอบ Steam / Dota 2…</div></Card>
  )
  const ok = st.installed
  const dot = <span style={{ width: 9, height: 9, borderRadius: 99, background: ok ? C.ok : C.warn, display: 'inline-block', marginRight: 8, boxShadow: ok ? `0 0 8px ${C.ok}` : 'none' }} />
  return (
    <Card title="Setup (GSI)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
        <div style={{ fontSize: 13, color: ok ? C.txt : C.warn }}>{dot}{ok ? 'GSI config พร้อมใช้งาน' : 'ยังไม่ได้ติดตั้ง GSI config'}</div>
        <button onClick={install} disabled={busy || !st.dota_cfg_dir}
          style={{ background: ok ? 'transparent' : 'rgba(143,212,255,0.16)', color: st.dota_cfg_dir ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 13px', fontSize: 12, cursor: st.dota_cfg_dir && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? 'กำลังติดตั้ง…' : ok ? 'ติดตั้งซ้ำ' : 'ติดตั้ง GSI config'}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.55 }}>
        {st.steam_path && <div>Steam: <span style={{ color: C.txt }}>{st.steam_path}</span></div>}
        {st.dota_cfg_dir && <div style={{ wordBreak: 'break-all' }}>Dota 2 cfg: <span style={{ color: C.txt }}>{st.dota_cfg_dir}</span></div>}
        <div style={{ marginTop: 6 }}>{st.message}</div>
        {!ok && st.dota_cfg_dir && <div style={{ marginTop: 4, color: C.mut }}>💡 หลังติดตั้ง: เปิด Dota 2 รอบใหม่เพื่อโหลด config.</div>}
      </div>
    </Card>
  )
}

// ─────────────────────────────── VOICE CACHE (pre-recorded clips) ───────────────────────────────
interface VoiceCacheStatus { dir: string; counts: Record<string, number>; total: number }
const VoiceCacheCard: React.FC = () => {
  const [st, setSt] = useState<VoiceCacheStatus | null>(null)
  const refresh = () => { void invoke<VoiceCacheStatus>('voice_cache_status').then(setSt).catch(() => {}) }
  useEffect(refresh, [])
  if (!st) return <Card title="Voice cache"><div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังสแกน…</div></Card>
  const events = Object.entries(st.counts)
  const ok = st.total > 0
  return (
    <Card title="Voice cache (เสียงจริง)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: ok ? C.ok : C.mut }} />
          <span style={{ color: ok ? C.txt : C.mut }}>{ok ? `${st.total} clips พร้อมใช้` : 'ยังไม่มี clip — ใช้ SAPI fallback'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={refresh} style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>⟳</button>
          <button onClick={() => void invoke('open_voice_cache_dir').catch(() => {})} style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 13px', fontSize: 12, cursor: 'pointer' }}>📂 เปิดโฟลเดอร์</button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.6 }}>
        <div style={{ wordBreak: 'break-all', marginBottom: 4 }}>โฟลเดอร์: <span style={{ color: C.txt }}>{st.dir}</span></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
          {events.map(([ev, n]) => (
            <span key={ev} style={{ color: n > 0 ? C.ok : C.mut }}>{ev}: <b>{n}</b></span>
          ))}
        </div>
        <div style={{ marginTop: 6 }}>วาง WAV ลง <code style={{ color: C.txt }}>{`{event}/{n}.wav`}</code> เช่น <code style={{ color: C.txt }}>danger/01.wav</code>. แนะนำ 5-10 takes ต่อ event กันฟังซ้ำ.</div>
      </div>
    </Card>
  )
}

// ─────────────────────────────── G-MASTER (Claude Plan advisor) ───────────────────────────────
interface Advice { text: string; cached: boolean }
const MasterCard: React.FC<{ tick: GameTick | null; voice: string; rate: number; autoAdvice: boolean; onAutoAdviceChange: (v: boolean) => void }> = ({ tick, voice, rate, autoAdvice, onAutoAdviceChange }) => {
  const [advice, setAdvice] = useState<Advice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canAsk = !!tick && tick.in_game && !busy
  const ask = async () => {
    if (!tick) return
    setBusy(true); setError(null)
    try {
      const a = await invoke<Advice>('request_advice', { tick })
      setAdvice(a)
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }
  const speakAdvice = () => {
    if (!advice) return
    // Go through speak_event so a user-supplied advice/ WAV pool is used when present.
    void invoke('speak_event', { event: 'advice', fallback: advice.text, voice: voice || null, rate }).catch(() => {})
  }
  return (
    <Card title="G-Master (advisor · Claude Plan)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, gap: 12 }}>
        <div style={{ fontSize: 12, color: C.mut }}>
          ใช้ Claude CLI ของคุณ (Plan quota · zero cost). throttle 30s/คำขอ.
          {!canAsk && tick?.in_game === false && ' · เปิด Dota 2 ก่อน'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', fontSize: 12, color: C.mut }}>
          พูดอัตโนมัติเมื่อเลเวล 6/11/16 หรือตาย 2 รอบติด
          <Toggle on={autoAdvice} onChange={onAutoAdviceChange} />
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
          <button onClick={ask} disabled={!canAsk}
            style={{ background: canAsk ? 'rgba(143,212,255,0.18)' : 'rgba(255,255,255,0.06)', color: canAsk ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 15px', fontSize: 12.5, fontWeight: 600, cursor: canAsk ? 'pointer' : 'not-allowed' }}>
            {busy ? 'กำลังคิด…' : 'ขอคำแนะนำ'}
          </button>
          {advice && (
            <button onClick={speakAdvice}
              style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 13px', fontSize: 12.5, cursor: 'pointer' }}>
              🔊 อ่าน
            </button>
          )}
        </div>
      </div>
      {advice && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(143,212,255,0.06)', border: `1px solid ${C.line}`, borderRadius: 10, lineHeight: 1.55, fontSize: 13.5 }}>
          {advice.text}
          {advice.cached && <div style={{ fontSize: 11, color: C.mut, marginTop: 6 }}>· คำตอบที่แคชไว้ (ยังไม่หมด throttle)</div>}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, padding: '10px 13px', background: 'rgba(255,123,133,0.10)', border: '1px solid rgba(255,123,133,0.35)', borderRadius: 10, color: '#ffd6da', fontSize: 12.5 }}>
          {error}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────── G-LOG (local match logging) ───────────────────────────────
interface MatchLog { name: string; size: number; modified_ms: number }
const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`
const fmtDate = (ms: number) => { if (!ms) return ''; const d = new Date(ms); return `${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}` }

const LogCard: React.FC<{ live: boolean; clockTime: number }> = ({ live, clockTime }) => {
  const [dir, setDir] = useState<string>('')
  const [current, setCurrent] = useState<string | null>(null)
  const [matches, setMatches] = useState<MatchLog[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const refreshMatches = () => { void invoke<MatchLog[]>('list_match_logs').then(setMatches).catch(() => setMatches([])) }
  useEffect(() => { void invoke<string>('get_log_dir').then(setDir).catch(() => {}) }, [])
  // Re-check current match path whenever the in-game flag flips or the clock
  // makes a sub-minute jump — covers the start of a new match without polling.
  useEffect(() => {
    void invoke<string | null>('current_match_path').then(setCurrent).catch(() => {})
  }, [live, Math.floor(clockTime / 60)])
  useEffect(() => { if (showHistory) refreshMatches() }, [showHistory, live])

  const totalSize = matches.reduce((acc, m) => acc + m.size, 0)
  const deleteOne = async (name: string) => {
    try { await invoke('delete_match_log', { name }); refreshMatches() } catch { /* surface? */ }
  }
  const deleteAll = async () => {
    if (matches.length === 0) return
    if (!confirm(`ลบประวัติทั้งหมด ${matches.length} แมตช์? ลบแล้วเอากลับไม่ได้.`)) return
    try { await invoke<number>('delete_all_match_logs'); refreshMatches() } catch { /* surface? */ }
  }

  return (
    <Card title="G-Log (local only)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: live ? C.bad : C.mut, boxShadow: live ? '0 0 8px rgba(255,123,133,0.7)' : 'none' }} />
          {live ? <span style={{ color: C.txt }}>กำลังบันทึก</span> : <span style={{ color: C.mut }}>ไม่ได้บันทึก</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowHistory((v) => !v)}
            style={{ background: showHistory ? 'rgba(143,212,255,0.16)' : 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 11px', fontSize: 12, cursor: 'pointer' }}>
            📋 ประวัติ
          </button>
          <button onClick={() => void invoke('open_log_dir').catch(() => {})}
            style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 11px', fontSize: 12, cursor: 'pointer' }}>
            📂 โฟลเดอร์
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.55 }}>
        {dir && <div style={{ wordBreak: 'break-all' }}>โฟลเดอร์: <span style={{ color: C.txt }}>{dir}</span></div>}
        {current && <div style={{ wordBreak: 'break-all' }}>ไฟล์ปัจจุบัน: <span style={{ color: C.txt }}>{current.split(/[\\/]/).pop()}</span></div>}
        <div style={{ marginTop: 6 }}>ข้อมูลทั้งหมดอยู่บนเครื่องนี้เท่านั้น — ไม่ส่งออกไปไหน.</div>
      </div>

      {showHistory && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.mut }}>
              {matches.length === 0 ? 'ยังไม่มีประวัติ' : `${matches.length} แมตช์ · รวม ${fmtSize(totalSize)}`}
            </span>
            {matches.length > 0 && (
              <button onClick={deleteAll}
                style={{ background: 'rgba(255,123,133,0.08)', color: '#ffd6da', border: '1px solid rgba(255,123,133,0.35)', borderRadius: 7, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer' }}>
                ล้างทั้งหมด
              </button>
            )}
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {matches.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 9px', background: 'rgba(143,212,255,0.04)', borderRadius: 7, fontSize: 11.5 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: C.txt }}>{m.name}</span>
                  <span style={{ color: C.mut, fontSize: 10.5 }}>{fmtDate(m.modified_ms)} · {fmtSize(m.size)}</span>
                </div>
                <button onClick={() => void deleteOne(m.name)}
                  style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 6, padding: '3px 9px', fontSize: 11, cursor: 'pointer' }}
                  title="ลบไฟล์นี้">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────── ONBOARDING (first run welcome) ───────────────────────────────
const Welcome: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [st, setSt] = useState<SetupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void (async () => { try { setSt(await invoke<SetupStatus>('detect_gsi_setup')) } catch { /* command unavailable */ } })() }, [])
  const install = async () => { setBusy(true); try { setSt(await invoke<SetupStatus>('install_gsi_config')) } finally { setBusy(false) } }
  const step1Done = st?.installed === true
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(8,9,12,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  }
  return (
    <div style={overlay}>
      <div style={{ ...panel(0.94), padding: '28px 34px', width: 540, maxWidth: 'calc(100vw - 32px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <Gem size={36} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>ยินดีต้อนรับสู่ G-Maiden</div>
            <div style={{ fontSize: 12.5, color: C.mut }}>Maiden จะคอยดู Dota 2 ของคุณและบอกเมื่อเลือดต่ำ — ใช้เวลา 30 วินาทีตั้งค่า</div>
          </div>
        </div>

        <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: 99, background: step1Done ? C.ok : 'rgba(143,212,255,0.18)', color: step1Done ? '#0c1018' : C.ice, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{step1Done ? '✓' : '1'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>ติดตั้ง GSI config ใน Dota 2</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>
                {!st ? 'กำลังตรวจสอบ…' : step1Done ? `ติดตั้งแล้วที่ ${st.dota_cfg_dir}` : st.dota_cfg_dir ? 'กดปุ่มด้านล่างเพื่อให้ G-Maiden วางไฟล์ให้อัตโนมัติ' : st.message}
              </div>
              {st && !step1Done && st.dota_cfg_dir && (
                <button onClick={install} disabled={busy}
                  style={{ marginTop: 9, background: 'rgba(143,212,255,0.18)', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 15px', fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', fontWeight: 600 }}>
                  {busy ? 'กำลังติดตั้ง…' : 'ติดตั้ง GSI config'}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, opacity: step1Done ? 1 : 0.55 }}>
            <div style={{ width: 26, height: 26, borderRadius: 99, background: 'rgba(143,212,255,0.18)', color: C.ice, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>2</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>เปิด Dota 2 แล้วเริ่มแมตช์</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>
                ถ้า Dota 2 เปิดอยู่ก่อนติดตั้ง: ต้องรีสตาร์ทเกมรอบหนึ่งให้ GSI โหลด. overlay จะขึ้นบนเกมพร้อมข้อมูลสด — กด <b style={{ color: C.ice }}>Alt+S</b> ซ่อน/แสดง.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onDone}
            style={{ background: 'transparent', color: C.mut, border: 'none', fontSize: 12, cursor: 'pointer' }}>
            ข้าม (ตั้งค่าเองภายหลัง)
          </button>
          <button onClick={onDone} disabled={!step1Done}
            style={{ background: step1Done ? C.ice : 'rgba(255,255,255,0.08)', color: step1Done ? '#0c1018' : C.mut, border: 'none', borderRadius: 8, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: step1Done ? 'pointer' : 'not-allowed' }}>
            พร้อมแล้ว!
          </button>
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
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [status, setStatus] = useState<GsiStatus | null>(null)
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('gm-onboarded') !== '1')
  const dismissWelcome = () => { localStorage.setItem('gm-onboarded', '1'); setShowWelcome(false) }
  // In-app updater (ask-first). updRef holds the pending Update so the button can
  // download+install it; updPhase drives the UI.
  const updRef = useRef<Update | null>(null)
  const [upd, setUpd] = useState<{ version: string; notes: string } | null>(null)
  const [updPhase, setUpdPhase] = useState<'idle' | 'checking' | 'downloading' | 'uptodate' | 'error'>('idle')
  const sRef = useRef(s)
  sRef.current = s

  // Check GitHub Releases for a newer signed build on startup. Ask-first: we only
  // surface the prompt; nothing installs until the user clicks. Silent on failure
  // (offline, or no release published yet).
  useEffect(() => {
    void (async () => {
      try {
        const u = await check()
        if (u?.available) { updRef.current = u; setUpd({ version: u.version, notes: u.body ?? '' }) }
      } catch { /* offline / no endpoint yet */ }
    })()
  }, [])

  const checkUpdateNow = async () => {
    setUpdPhase('checking')
    try {
      const u = await check()
      if (u?.available) { updRef.current = u; setUpd({ version: u.version, notes: u.body ?? '' }); setUpdPhase('idle') }
      else { setUpd(null); setUpdPhase('uptodate') }
    } catch { setUpdPhase('error') }
  }

  const installUpdate = async () => {
    if (!updRef.current) return
    setUpdPhase('downloading')
    try {
      await updRef.current.downloadAndInstall()
      await relaunch() // restart into the new version
    } catch { setUpdPhase('error') }
  }

  // Load installed voices once; if Maiden has never been assigned one, prefer the
  // first Female voice so the default sounds like her instead of a male advisor.
  useEffect(() => {
    void (async () => {
      try {
        const list = await invoke<VoiceInfo[]>('list_voices')
        setVoices(list)
        setS((prev) => {
          if (prev.voiceName) return prev
          const female = list.find((v) => v.gender === 'Female')
          return female ? { ...prev, voiceName: female.name } : prev
        })
      } catch { /* command unavailable */ }
    })()
  }, [])

  // bind once; use ref so the overlay-ready handler always emits current settings
  useEffect(() => {
    document.body.style.background = C.bg
    // index.css sets html,body { overflow:hidden } for the transparent click-through
    // overlay window. The control window has more content than fits, so re-enable
    // vertical scroll here (this effect never runs in the overlay window).
    document.documentElement.style.overflowY = 'auto'
    document.documentElement.style.overflowX = 'hidden'
    const u1 = listen<GameTick>('game-tick', (e) => { setTick(e.payload); setSeen(true) })
    const u2 = listen('overlay-ready', () => { void emit('settings', sRef.current) })
    const u3 = listen<GsiStatus>('gsi-status', (e) => setStatus(e.payload))
    return () => { void u1.then((f) => f()); void u2.then((f) => f()); void u3.then((f) => f()) }
  }, [])

  // persist + broadcast + apply overlay visibility on any change
  useEffect(() => {
    localStorage.setItem('gm-settings', JSON.stringify(s))
    void emit('settings', s)
    void invoke('set_overlay_visible', { visible: s.overlayVisible }).catch(() => {})
  }, [s])

  // Item 5: keep Rust's gank voice in sync with the user's chosen voice/rate.
  // Fires once on startup and on every voice setting change. Best-effort.
  useEffect(() => {
    void invoke('set_cv_voice', { name: s.voiceName || null, rate: s.voiceRate ?? null }).catch(() => {})
  }, [s.voiceName, s.voiceRate])

  // Keep Rust's G-Signal gank voice gated by the master voice toggle, so muting
  // voice also silences gank warnings (not just the HP-danger line).
  useEffect(() => {
    void invoke('set_cv_signal_enabled', { enabled: s.voiceEnabled }).catch(() => {})
  }, [s.voiceEnabled])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }))

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.txt, fontFamily: '"Segoe UI", system-ui, sans-serif', padding: '22px 26px' }}>
      {showWelcome && <Welcome onDone={dismissWelcome} />}
      <header style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
        <Gem size={30} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.3 }}>G-Maiden</div>
          <div style={{ fontSize: 12, color: C.mut }}>Real-time Dota 2 AI Companion · OSD + Control</div>
        </div>
        {(() => {
          // Drive the chips off the watchdog once it reports; fall back to the
          // sticky `seen` only until the first status event arrives.
          const dotaRunning = status?.dota_running ?? false
          const gsiActive = status ? status.gsi_active : seen
          const dotaColor = dotaRunning ? C.ok : C.mut
          const gsiColor = gsiActive ? C.ok : dotaRunning ? C.warn : C.mut
          const chip = (color: string, on: boolean, label: string) => (
            <span style={{ ...panel(0.6), padding: '7px 14px', fontSize: 12.5, color, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: color, boxShadow: on ? `0 0 8px ${color}` : 'none' }} />
              {label}
            </span>
          )
          return (
            <div style={{ display: 'flex', gap: 8 }}>
              {chip(dotaColor, dotaRunning, dotaRunning ? 'Dota 2 กำลังรัน' : 'Dota 2 ปิดอยู่')}
              {chip(gsiColor, gsiActive, gsiActive ? 'GSI เชื่อมต่อแล้ว' : dotaRunning ? 'รอ GSI' : 'GSI หยุด')}
            </div>
          )
        })()}
      </header>

      {upd && (
        <div style={{ ...panel(0.86), padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${C.ice}` }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ice }}>มีเวอร์ชันใหม่ {upd.version}</div>
            <div style={{ fontSize: 11.5, color: C.mut, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
              {updPhase === 'downloading' ? 'กำลังดาวน์โหลดและติดตั้ง… แอปจะรีสตาร์ทเอง' : (upd.notes || 'อัปเดตแล้วแอปจะรีสตาร์ทให้อัตโนมัติ')}
            </div>
          </div>
          <button onClick={installUpdate} disabled={updPhase === 'downloading'}
            style={{ background: C.ice, color: '#0c1018', border: 'none', borderRadius: 9, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>
            {updPhase === 'downloading' ? 'กำลังอัปเดต…' : 'อัปเดตเลย'}
          </button>
          <button onClick={() => setUpd(null)} disabled={updPhase === 'downloading'}
            style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', fontSize: 12.5 }}>
            ภายหลัง
          </button>
        </div>
      )}

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
          <Row label="เสียงพูด (Maiden)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => void invoke('speak_event', { event: 'danger', fallback: DANGER_LINE, voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})} disabled={!s.voiceEnabled}
                style={{ background: 'transparent', color: s.voiceEnabled ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 11px', fontSize: 12, cursor: s.voiceEnabled ? 'pointer' : 'not-allowed' }}>
                🔊 ทดสอบเสียง
              </button>
              <Toggle on={s.voiceEnabled} onChange={(v) => set('voiceEnabled', v)} />
            </div>
          </Row>
          <Row label="เลือกเสียง">
            <select value={s.voiceName} onChange={(e) => set('voiceName', e.target.value)} disabled={!s.voiceEnabled || voices.length === 0}
              style={{ background: 'rgba(18,20,28,0.86)', color: s.voiceEnabled ? C.txt : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, maxWidth: 240 }}>
              <option value="">— ระบบเลือกเอง —</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name} ({v.culture}, {v.gender === 'Female' ? 'หญิง' : v.gender === 'Male' ? 'ชาย' : v.gender})</option>
              ))}
            </select>
          </Row>
          <Row label={`ความเร็ว: ${s.voiceRate > 0 ? '+' : ''}${s.voiceRate}`}>
            <input type="range" min={-5} max={5} step={1} value={s.voiceRate} onChange={(e) => set('voiceRate', Number(e.target.value))} disabled={!s.voiceEnabled} style={{ width: 150 }} />
          </Row>
          <Row label="พูดเสริมตามเหตุการณ์">
            <Toggle on={s.personaLines} onChange={(v) => set('personaLines', v)} />
          </Row>
          <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
            Windows SAPI · ติดตั้งเสียงไทยใน Windows Settings · Time & Language · Speech เพื่อให้ Maiden พูดไทยชัดขึ้น
            {voices.length > 0 && voices.every((v) => !v.culture.startsWith('th')) && (
              <span style={{ color: C.warn }}> · ตอนนี้ยังไม่มี Thai voice → จะใช้เสียง {voices[0]?.gender === 'Female' ? 'อังกฤษ' : 'อังกฤษ'} อ่านข้อความไทย</span>
            )}
          </div>
        </Card>

        <Card title="G-Signal / CV (gank)">
          <Row label="แบนเนอร์เตือนแก๊งค์ (gank)"><Toggle on={s.gankVisuals} onChange={(v) => set('gankVisuals', v)} /></Row>
          <Row label="CV debug overlay (calibrate)"><Toggle on={s.cvDebug} onChange={(v) => set('cvDebug', v)} /></Row>
          <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
            แบนเนอร์ขึ้นกลาง-บนของจอเมื่อ G-Signal เตือนแก๊งค์ (ไม่บังมินิแมพ). CV debug แสดงกรอบมินิแมพ + จุดที่ตรวจจับได้ — เปิดเฉพาะตอนปรับเทียบ.
          </div>
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

        <SetupCard />
        <LogCard live={!!tick?.in_game} clockTime={tick?.clock_time ?? 0} />
        <VoiceCacheCard />
      </div>

      <div style={{ marginTop: 14 }}>
        <MasterCard tick={tick} voice={s.voiceName} rate={s.voiceRate} autoAdvice={s.autoAdvice} onAutoAdviceChange={(v) => set('autoAdvice', v)} />
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="Modules (เร็ว ๆ นี้)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, paddingTop: 6, fontSize: 12.5, color: C.mut }}>
            <span>○ G-Sentry — fog-of-war monitor</span>
            <span>○ G-Motion — gank path prediction</span>
            <span>○ G-Signal — voice gank warning</span>
            <span>○ G-Master — item/skill advisor</span>
          </div>
        </Card>
      </div>

      <footer style={{ marginTop: 18, fontSize: 11.5, color: C.mut, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>GSI: http://127.0.0.1:3000/gsi</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={checkUpdateNow} disabled={updPhase === 'checking' || updPhase === 'downloading'}
            style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
            {updPhase === 'checking' ? 'กำลังตรวจ…' : updPhase === 'uptodate' ? 'เป็นเวอร์ชันล่าสุด ✓' : updPhase === 'error' ? 'ตรวจไม่สำเร็จ' : 'ตรวจหาอัปเดต'}
          </button>
          <span>v0.1.0</span>
        </span>
      </footer>
    </div>
  )
}

export const App: React.FC = () => {
  const label = getCurrentWindow().label
  return label === 'overlay' ? <Overlay /> : <Control />
}
