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
  voiceEnabled: boolean
  voiceName: string
  voiceRate: number
  personaLines: boolean
}
const DEFAULTS: Settings = { overlayVisible: true, position: 'top', opacity: 0.72, alertEnabled: true, alertThreshold: 25, voiceEnabled: true, voiceName: '', voiceRate: 0, personaLines: true }
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
const Overlay: React.FC = () => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [s, setS] = useState<Settings>(DEFAULTS)
  // rising-edge state for danger: speak once when HP crosses the threshold down,
  // not every tick. Reset when HP recovers or the hero dies/respawns.
  const dangerActive = useRef(false)
  const lastSpokeAt = useRef(0)
  // Previous tick for transition detection (level up, kill, death, respawn).
  // We don't snapshot the whole tick — only the fields that drive a persona line.
  const prev = useRef<{ level: number; kills: number; deaths: number; alive: boolean; mana: number } | null>(null)
  const manaActive = useRef(false)
  const sRef = useRef(s)
  sRef.current = s
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

  // Speak on the rising edge (alive + crossing the line). Re-arm when safe again,
  // and throttle to at most once every 8s in case HP flickers across the line.
  useEffect(() => {
    if (!t.alive || t.hp_percent > s.alertThreshold + 5) {
      dangerActive.current = false
      return
    }
    if (lowHp && !dangerActive.current && s.voiceEnabled) {
      const now = Date.now()
      if (now - lastSpokeAt.current > 8000) {
        lastSpokeAt.current = now
        dangerActive.current = true
        void invoke('speak', { text: DANGER_LINE, voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})
      }
    }
  }, [lowHp, t.alive, t.hp_percent, s.alertThreshold, s.voiceEnabled])

  // Persona events — detect transitions vs. the previous tick. We minimum-gap
  // every utterance to 6s and skip persona lines whenever a danger line is
  // already due, so Maiden never talks over her own warnings.
  useEffect(() => {
    const p = prev.current
    prev.current = { level: t.level, kills: t.kills, deaths: t.deaths, alive: t.alive, mana: t.mana_percent }
    if (!p || !sRef.current.voiceEnabled || !sRef.current.personaLines) return
    if (lowHp) return // don't talk over a danger warning

    const events: PersonaEvent[] = []
    if (t.level > p.level && t.level >= 2) events.push('levelUp')
    if (t.kills > p.kills) events.push('kill')
    if (p.alive && !t.alive) events.push('death')
    if (!p.alive && t.alive) events.push('respawn')

    // mana-low rising edge: <= 15% while alive; clear at > 25%.
    if (t.alive && t.mana_percent > 0 && t.mana_percent <= 15 && !manaActive.current) {
      events.push('manaLow')
      manaActive.current = true
    } else if (t.mana_percent > 25) {
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
    void invoke('speak', { text: line, voice: sRef.current.voiceName || null, rate: sRef.current.voiceRate }).catch(() => {})
  }, [t.level, t.kills, t.deaths, t.alive, t.mana_percent, lowHp])

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
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('gm-onboarded') !== '1')
  const dismissWelcome = () => { localStorage.setItem('gm-onboarded', '1'); setShowWelcome(false) }
  const sRef = useRef(s)
  sRef.current = s

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
      {showWelcome && <Welcome onDone={dismissWelcome} />}
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
          <Row label="เสียงพูด (Maiden)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => void invoke('speak', { text: DANGER_LINE, voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})} disabled={!s.voiceEnabled}
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
