import React, { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { FullOverlay } from './overlay/FullOverlay'
import { LayoutEditor } from './overlay/LayoutEditor'
import { DEFAULT_LAYOUT, type Layout } from './overlay/modules'
import CommandDeck from './CommandDeck'
import QuotaCard from './QuotaCard'
import { crossedAnyLevelUpMilestone, crossedLevelUpMilestones } from './personaMilestones'

/** Mirrors the Rust `GameTick` emitted by the GSI server (src-tauri/src/gsi.rs). */
export interface GameTick {
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
  kill_list_len: number
  last_victim_slot: number
  // Exact slain hero (npc name) resolved backend-side from last_victim_slot +
  // the roster the backend already holds (GSI/CV). Optional — when the backend
  // populates it, the kill banner shows the exact victim; until then we guess
  // from G-Sentry's missing set below. See CR-010.
  last_victim_hero?: string
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
/** G2.6: emitted by G-Sentry when a hero crosses the 5s missing threshold. */
interface EnemyMissing { hero: string; missing_for_ms: number; last_pos: [number, number] }
/** G5.4: advice broadcast from master.rs → overlay. */
interface AdviceUpdate { text: string; cached: boolean }
/** G-Revive: deterministic buyback verdict (revive.rs → `buyback-advice`).
 *  Mirrors `ReviveAdvice`; `urgency` is the serde-serialized `Urgency` enum. */
export type BuybackUrgency = 'None' | 'Consider' | 'Strong'
export interface ReviveAdvice {
  recommend_buyback: boolean
  urgency: BuybackUrgency
  natural_respawn_remaining: number
  affordable: boolean | null
  next_respawn_if_buyback: number
  reason: string
}
/** Connection/status pushed by the Rust watchdog (gsi.rs) every ~4s. */
interface GsiStatus { dota_running: boolean; gsi_active: boolean; in_game: boolean; display_exclusive: boolean }

type Pos = 'top' | 'left' | 'right' | 'custom'
export type Sensitivity = 'low' | 'med' | 'high'
/** CR-013 §4 (iOS-style Settings split view). `Control` groups its existing
 *  cards/rows into these six categories, switched on `category` near the
 *  bottom of `Control` — see the mapping there.
 *  "ทั่วไป"/general is deliberately NOT here: it's deck-prefs (quality/density/
 *  crisp/big-mode + window size), owned entirely by CommandDeck, not Control. */
export type SettingsCat = 'overlay' | 'voice' | 'ai' | 'modules' | 'privacy' | 'system'

export interface Settings {
  overlayVisible: boolean
  position: Pos
  customX: number
  customY: number
  opacity: number
  alertEnabled: boolean
  alertThreshold: number
  voiceEnabled: boolean
  voiceName: string
  voiceRate: number
  volume: number
  personaLines: boolean
  autoAdvice: boolean
  gankVisuals: boolean
  killVisuals: boolean
  signalSensitivity: Sensitivity
  masterEnabled: boolean
  masterBackend: 'auto' | 'claude' | 'ollama'
  masterAuth: 'plan' | 'apikey'
  masterOllamaModel: string
  cvDebug: boolean
  calibration: boolean
  efficacyStudy: boolean
  telemetrySource: 'auto' | 'feeder' | 'gtelemetry' | 'off'
  uiMode: 'lite' | 'full'
  layout: Layout
  showTimer: boolean
  showScore: boolean
  showHeroBar: boolean
  showKda: boolean
  showGold: boolean
}
const DEFAULTS: Settings = { overlayVisible: true, position: 'top', customX: 50, customY: 2, opacity: 0.72, alertEnabled: true, alertThreshold: 25, voiceEnabled: true, voiceName: '', voiceRate: 0, volume: 80, personaLines: true, autoAdvice: false, gankVisuals: true, killVisuals: true, signalSensitivity: 'med', masterEnabled: true, masterBackend: 'auto', masterAuth: 'plan', masterOllamaModel: 'qwen3.5:4b', cvDebug: false, calibration: false, efficacyStudy: false, telemetrySource: 'auto', uiMode: 'lite', layout: DEFAULT_LAYOUT, showTimer: false, showScore: false, showHeroBar: false, showKda: false, showGold: false }
interface OverlayProfile { name: string; position: Pos; customX: number; customY: number; opacity: number; showTimer: boolean; showScore: boolean; showHeroBar: boolean; showKda: boolean; showGold: boolean }
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
/** G7.2: resource-governor stats emitted every 10s from governor.rs */
interface ResourceStats { ram_mb: number; cpu_pct: number; over_budget: boolean }
const loadSettings = (): Settings => {
  try {
    const raw = JSON.parse(localStorage.getItem('gm-settings') ?? '{}') as Record<string, unknown>
    if (typeof raw.showStats === 'boolean' && raw.showStats) {
      raw.showTimer = raw.showScore = raw.showHeroBar = raw.showKda = raw.showGold = true
    }
    delete raw.showStats
    return { ...DEFAULTS, ...(raw as Partial<Settings>) }
  } catch {
    return DEFAULTS
  }
}
const loadProfiles = (): OverlayProfile[] => {
  try { return JSON.parse(localStorage.getItem('gm-profiles') ?? '[]') } catch { return [] }
}

const C = { bg: '#08090c', ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6', ok: '#5be3a7', warn: '#ffcf6b', bad: '#ff7b85', line: 'rgba(143,212,255,0.16)' }

const APP_VERSION = '0.9.1'

const CHANGELOG: { ver: string; date: string; items: string[] }[] = [
  { ver: '0.7.6', date: '2026-06-28', items: [
    'Audio Settings ใหม่ — รวม Voice Cache + Voice Packs เป็นการ์ดเดียว แสดง clip เป็น "Voice Pack Set01" (default)',
    'Event แบ่งกลุ่มตามหมวด (แจ้งเตือน / คิล / สตรีค / สถานะ) เห็นภาพรวมง่ายขึ้น',
    'กดขยายแต่ละ event ดู clip ทีละไฟล์ + เล่นฟังทีละ clip ได้',
    'Coverage bar แสดง % event ที่มี clip ครอบคลุม',
  ]},
  { ver: '0.7.5', date: '2026-06-27', items: [
    'G-Master on/off toggle + Claude auth dropdown (Plan / API key) + kill-banner settings & preview',
    'Announcer pack manager ใน Voice Packs card',
  ]},
  { ver: '0.7.4', date: '2026-06-26', items: [
    'แพ็คเสียงไทยติดเครื่อง — Maiden พูดเสียงไทยได้ทันทีโดยไม่ต้องลงเพิ่ม (gTTS, 25 clips, 9 events; แทน SAPI ที่ฟังไม่รู้เรื่อง)',
    'Net worth แสดงค่าจริง — คำนวณจาก gold + ราคาไอเทมใน inventory (GSI ไม่ส่ง NW ใน player mode)',
    'G-Signal ความไวปรับได้ — ตึง/สมดุล/ไว (≥85% / ≥65% / ≥50%) ดีฟอลต์ "สมดุล" — แก้ปัญหา "ไม่เคยเตือน"',
    'Overlay UI editor สะอาดขึ้น — chips เล็กลง, hover ที่ชื่อโมดูล = solo focus (โมดูลอื่นจาง), พื้น Dota HUD ref dim ลง',
  ]},
  { ver: '0.7.3', date: '2026-06-25', items: [
    'โหมด overlay ใหม่ "Full" — โมดูลแยกชิ้นวางอิสระ + glass ดีไซน์ Maiden Blue (lite ยังเป็นค่าเริ่มต้น)',
    'G-Meter: แถบบอกระดับความเสี่ยง low/med/high (ไม่บอก %) อยู่ตลอด — เห็นแม้ G-Signal ยังไม่ถึงเกณฑ์',
    'Voice notice toast — โชว์ trigger event บนจอแม้ยังไม่มี voice pack ("(voice)" บอก)',
    'Overlay UI editor — ลาก-วางโมดูลพร้อมแม่เหล็กกริด 5% + พรีวิวซ้อนภาพ Dota HUD reference',
    'Voice Packs tab — ปุ่ม "ทดลองฟัง" + ลิงก์ร้านเสียง (ซื้อผ่านเว็บ)',
    'Calibration mode — บันทึก screenshot/clip ทุก event ลง %LOCALAPPDATA%\\G-Maiden\\calibration\\ สำหรับ agent audit (QA)',
    'แก้ overlay ค้างหลังเล่นยาว — emit throttle 5Hz + slow-frame watchdog + panic hook ลง error.log',
    'เตือนเมื่อ Dota อยู่โหมด Exclusive Fullscreen (overlay ใช้ไม่ได้ ต้อง Borderless)',
    'เปลี่ยน hotkey Alt+S → Ctrl+Alt+S (Alt ชนกับ ping ใน Dota)',
    'GSI status สดจริง (ไม่ค้าง "เชื่อมต่อ" หลังออกเกม) · NW โชว์ "—" เมื่อ GSI ไม่ส่ง',
  ]},
  { ver: '0.7.2', date: '2026-06-23', items: [
    'แก้บั๊ก: หน้าต่าง PowerShell แวบตอนเตือน HP ต่ำ — TTS หา piper.exe ด้วย `where` โดยไม่ซ่อน console ตอนนี้ใส่ CREATE_NO_WINDOW แล้ว (เส้นทางเสียงไม่แวบจออีก)',
  ]},
  { ver: '0.7.1', date: '2026-06-23', items: [
    'แก้บั๊ก: หน้าต่าง PowerShell เด้งวน ๆ ตอนเล่นเกม — Resource Governor (ตรวจ RAM/CPU ทุก 10s) และ SLM (curl) ลืมซ่อน console window ตอนนี้ซ่อนด้วย CREATE_NO_WINDOW แล้ว',
  ]},
  { ver: '0.7.0', date: '2026-06-23', items: [
    'Piper local TTS — neural voice ≤80ms, ไม่ต้องรอ PowerShell cold-start (fallback SAPI)',
    'Overlay advice panel — G-Master ตอบบนหน้าจอโดยตรง 20 วินาที (G5.4)',
    'Enemy-missing badge — แสดงฮีโร่ที่ G-Sentry ตรวจจับว่าหายบนแผนที่ >5s (G2.6)',
    'Local SLM fallback — ถ้า Claude CLI offline ใช้ Aroow-9B ผ่าน ollama (G7.1)',
    'Resource Governor — ตรวจ RAM/CPU ทุก 10s แสดงใน System card (G7.2)',
    'System card — แสดงสถานะ module ทั้งหมด + แจ้งเตือนเมื่อเกิน budget',
  ]},
  { ver: '0.6.0', date: '2026-06-22', items: [
    'แผงสถิติ overlay เลือกเปิด/ปิดเป็นรายการ (นาฬิกา, สกอร์, HP/Mana, K/D/A, ทอง)',
    'ตำแหน่ง overlay กำหนดเองได้ (X/Y slider) + บันทึกโปรไฟล์',
    'ทดสอบ overlay ไม่เปลี่ยนสถานะ Dota/GSI แล้ว',
    'G-Damage engine — ฐานข้อมูล hero + สูตรคำนวณ burst damage (พื้นฐาน)',
  ]},
  { ver: '0.5.0', date: '2026-06-22', items: [
    'rodio audio backend — WAV เล่นในโปรเซส (ไม่ spawn PowerShell), cancel <1ms',
    'Changelog viewer — ดูรายละเอียดเวอร์ชันในแอปได้',
    'ไม่มีหน้าต่าง cmd แวบตอนเล่นเสียงอีกแล้ว',
  ]},
  { ver: '0.4.1', date: '2026-06-21', items: [
    'แก้ไข: แจ้งเตือน HP ต่ำ ตอนนี้แจ้งซ้ำได้ทุกรอบที่ HP ลดลงอีก',
  ]},
  { ver: '0.4.0', date: '2026-06-21', items: [
    'Stat HUD (timer, score, HP bar, K/D/A, gold) ปิดเป็นค่าเริ่มต้น — Dota แสดงอยู่แล้ว',
    'เปิดได้ในตั้งค่าถ้าต้องการ',
  ]},
  { ver: '0.3.0', date: '2026-06-21', items: [
    'Overlay preview — จำลอง overlay โดยไม่ต้องเปิด Dota',
    'ทดสอบเสียง Thai + English ในแผงควบคุม',
  ]},
  { ver: '0.2.0', date: '2026-06-20', items: [
    'แก้ไข: หน้าต่าง CMD ไม่แวบทุก 4 วินาทีแล้ว (CREATE_NO_WINDOW)',
  ]},
  { ver: '0.1.0', date: '2026-06-20', items: [
    'เปิดตัว: GSI server, overlay, แผงควบคุม',
    'Minimap CV pipeline (จับภาพ → ตรวจจับ → แจ้งเตือน gank)',
    'เสียงพูด SAPI + WAV clips, ระบบอัปเดตในแอป',
    'G-Log บันทึกแมตช์ในเครื่อง (JSONL)',
  ]},
]

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
const overlayPanel = (op: number): React.CSSProperties => ({
  ...panel(op),
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
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
  <button type="button" onClick={() => onChange(!on)} className={`settings-toggle${on ? ' on' : ''}`}>
    <span className="settings-toggle-knob" />
  </button>
)
const Seg: React.FC<{ value: Pos; options: [Pos, string][]; onChange: (v: Pos) => void }> = ({ value, options, onChange }) => (
  <div className="settings-seg">
    {options.map(([v, label]) => (
      <button key={v} type="button" onClick={() => onChange(v)} className={`settings-seg-opt${value === v ? ' on' : ''}`}>{label}</button>
    ))}
  </div>
)
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="settings-row">
    <span className="settings-row-label">{label}</span>
    {children}
  </div>
)

// ─────────────────────────────── OSD OVERLAY (transparent, click-through) ───────────────────────────────
const dangerStyle: React.CSSProperties = {
  background: 'rgba(58,12,16,0.86)', border: '1px solid rgba(255,123,133,0.6)', borderRadius: 12,
  color: '#ffd6da', padding: '8px 20px', fontWeight: 700, fontSize: 14,
  backdropFilter: 'none', WebkitBackdropFilter: 'none', fontFamily: '"Segoe UI", system-ui, sans-serif',
}
// G-Signal gank banner — ice palette, top-center, NEVER over the bottom-left minimap.
const gankStyle: React.CSSProperties = {
  background: 'rgba(18,20,28,0.82)', border: `1px solid ${C.warn}`, borderRadius: 12,
  color: C.warn, padding: '9px 22px', fontWeight: 700, fontSize: 14,
  backdropFilter: 'none', WebkitBackdropFilter: 'none', fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxShadow: '0 0 24px rgba(255,207,107,0.35)',
}
const gankClearStyle: React.CSSProperties = {
  ...gankStyle, border: `1px solid ${C.ice}`, color: C.ice, fontWeight: 600,
  boxShadow: '0 0 18px rgba(143,212,255,0.3)',
}
const killBannerStyle: React.CSSProperties = {
  background: 'rgba(12,20,32,0.45)', border: `1px solid rgba(91,227,167,0.35)`,
  borderRadius: 16, padding: '10px 18px 10px 10px', display: 'flex', alignItems: 'center', gap: 14,
  backdropFilter: 'none', WebkitBackdropFilter: 'none', fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxShadow: '0 0 24px rgba(91,227,167,0.2)',
}
// Pack banner (announcer bundle) — a frame for the pack's own image. Relative so
// the caption can be absolutely positioned over the bottom of the image.
const packBannerStyle: React.CSSProperties = {
  position: 'relative', display: 'inline-block', lineHeight: 0,
  borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 0 24px rgba(91,227,167,0.25)',
}
const STREAK_LABELS: Record<number, string> = {
  3: 'KILLING SPREE', 4: 'DOMINATING', 5: 'MEGA KILL',
  6: 'UNSTOPPABLE', 7: 'WICKED SICK', 8: 'MONSTER KILL',
  9: 'GODLIKE', 10: 'BEYOND GODLIKE',
}

// Reactive waveform for a fired announcer clip. The BACKEND plays the audible
// copy; here we decode the SAME clip and run it through an AnalyserNode at gain 0
// (silent) purely to drive the bars — so the waveform moves with the real sound,
// not a synthetic playhead. Cosmetic: any failure is swallowed and it renders
// nothing. Cleans up its AudioContext + rAF on unmount (single-slot banner, so a
// new event unmounts the old wave and stops its silent source).
const VoiceWave: React.FC<{ clip: string }> = ({ clip }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    let ctx: AudioContext | null = null
    let src: AudioBufferSourceNode | null = null
    let raf = 0
    let cancelled = false
    ;(async () => {
      try {
        const bytes = await invoke<number[]>('read_audio_bytes', { path: clip })
        if (cancelled) return
        const buf = new Uint8Array(bytes).buffer
        ctx = new AudioContext()
        await ctx.resume().catch(() => {})
        const audio = await ctx.decodeAudioData(buf)
        if (cancelled) { void ctx.close(); return }
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.75
        const gain = ctx.createGain()
        gain.gain.value = 0 // silent — the backend owns the audible playback
        src = ctx.createBufferSource()
        src.buffer = audio
        src.connect(analyser); analyser.connect(gain); gain.connect(ctx.destination)
        src.start()
        const bins = new Uint8Array(analyser.frequencyBinCount)
        const draw = () => {
          const cvs = canvasRef.current
          if (cvs) {
            const c = cvs.getContext('2d')
            if (c) {
              analyser.getByteFrequencyData(bins)
              const W = cvs.width, H = cvs.height, n = bins.length, bw = W / n
              c.clearRect(0, 0, W, H)
              for (let i = 0; i < n; i++) {
                const v = bins[i] / 255
                const bh = Math.max(2, v * H)
                c.fillStyle = `rgba(91,227,167,${0.3 + 0.65 * v})`
                c.fillRect(i * bw + bw * 0.15, (H - bh) / 2, bw * 0.7, bh)
              }
            }
          }
          raf = requestAnimationFrame(draw)
        }
        draw()
      } catch { /* cosmetic — ignore */ }
    })()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      try { src?.stop() } catch { /* already stopped */ }
      void ctx?.close()
    }
  }, [clip])
  return <canvas ref={canvasRef} width={280} height={38} style={{ display: 'block', width: 280, height: 38 }} />
}
export type GankState = { phase: 'alert'; heroes: string[]; probability: number } | { phase: 'clear' } | null

const Overlay: React.FC = () => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [s, setS] = useState<Settings>(DEFAULTS)
  // G-Signal gank banner + CV debug feed (item A & B).
  const [gank, setGank] = useState<GankState>(null)
  const [cv, setCv] = useState<MinimapCv | null>(null)
  // G2.6: set of hero names currently flagged as missing by G-Sentry.
  const [missingHeroes, setMissingHeroes] = useState<Set<string>>(new Set())
  // G5.4: latest advice from G-Master, shown as an in-overlay panel.
  const [overlayAdvice, setOverlayAdvice] = useState<string | null>(null)
  const adviceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // G-Revive: buyback verdict shown while the player is dead. `advice` is the
  // deterministic verdict; `narrative` is the local-SLM voiced line that arrives
  // a beat later on `buyback-narrative`. Cleared on respawn.
  const [buyback, setBuyback] = useState<{ advice: ReviveAdvice; narrative: string | null } | null>(null)
  // GSI activity from the watchdog — so the HUD disappears when Dota closes
  // (Dota stops POSTing without a final tick; `tick` would otherwise stay stale).
  const [gsiActive, setGsiActive] = useState(true)
  const [previewMode, setPreviewMode] = useState(false)
  // #6: mirror each Maiden voice line as a transient on-screen toast so triggers
  // are verifiable even before the voice pack / TTS is finalized (debug aid —
  // becomes a user toggle in the overlay redesign). The voice still fires too.
  const [toast, setToast] = useState<{ event: string; text: string } | null>(null)
  // Kill banner state: 'show' → visible, 'exit' → fading out, null → hidden.
  const [killBanner, setKillBanner] = useState<{
    phase: 'show' | 'exit'; kills: number; streak: number; victim: string | null
  } | null>(null)
  const killTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const killStreak = useRef(0)
  const lastKillHeroes = useRef<Set<string>>(new Set())
  // Pack banner (announcer bundle) — the active voice pack's image for a fired
  // event. When present it REPLACES the built-in kill card; falls back to the
  // card when the pack has no banner for that event. Driven by the backend
  // `announcer-banner` event so the image and the voiced clip fire together.
  const [packBanner, setPackBanner] = useState<{
    phase: 'show' | 'exit'; url: string | null; text: string; thai: string; clip: string | null
  } | null>(null)
  const packBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gankTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gankClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Volume toast — brief on-screen feedback when player uses Alt+Up/Down/M.
  const [volToast, setVolToast] = useState<number | null>(null)
  const volToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    const u3 = listen<MinimapCv>('minimap-cv', (e) => {
      if (!sRef.current.cvDebug) return
      setCv(e.payload)
    })
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
      // G2.6: clear the missing-hero indicator when G-Signal retracts.
      setMissingHeroes(new Set())
      // brief soft echo, then fade out; don't re-show until a new gank-alert
      if (gankClearTimer.current) clearTimeout(gankClearTimer.current)
      gankClearTimer.current = setTimeout(() => setGank(null), 2200)
    })
    const u6 = listen<GsiStatus>('gsi-status', (e) => setGsiActive(e.payload.gsi_active))
    const u7 = listen<boolean>('preview-mode', (e) => setPreviewMode(e.payload))
    // G2.6: G-Sentry missing-hero events — accumulate into a set; clear when gank clears.
    const u8 = listen<EnemyMissing>('enemy-missing', (e) => {
      setMissingHeroes((prev) => new Set([...prev, e.payload.hero]))
      // auto-clear the hero from the indicator after 30s (they probably re-appeared)
      setTimeout(() => setMissingHeroes((prev) => { const n = new Set(prev); n.delete(e.payload.hero); return n }), 30_000)
    })
    // G5.4: Advice panel — show for 20s then dismiss.
    const u9 = listen<AdviceUpdate>('advice-update', (e) => {
      if (!e.payload.cached) {
        setOverlayAdvice(e.payload.text)
        if (adviceTimer.current) clearTimeout(adviceTimer.current)
        adviceTimer.current = setTimeout(() => setOverlayAdvice(null), 20_000)
      }
    })
    // G-Revive: buyback verdict card. `buyback-advice` carries the deterministic
    // verdict (broadcast, so it shows regardless of which window triggered the
    // request); `buyback-narrative` follows with Maiden's voiced line.
    const uBA = listen<ReviveAdvice>('buyback-advice', (e) => {
      setBuyback({ advice: e.payload, narrative: null })
    })
    const uBN = listen<string>('buyback-narrative', (e) => {
      setBuyback((b) => (b ? { ...b, narrative: e.payload } : b))
    })
    const u10 = listen<number>('volume-change', (e) => {
      setVolToast(e.payload)
      if (volToastTimer.current) clearTimeout(volToastTimer.current)
      volToastTimer.current = setTimeout(() => setVolToast(null), 1500)
    })
    // Kill-banner preview (fired from the settings panel so users can see/hear
    // the kill/streak banner without being in a match).
    const uK = listen<{ streak: number; victim: string | null }>('preview-kill', (e) => {
      if (killTimer.current) clearTimeout(killTimer.current)
      setKillBanner({ phase: 'show', kills: 0, streak: e.payload.streak, victim: e.payload.victim })
      killTimer.current = setTimeout(() => {
        setKillBanner((kb) => kb ? { ...kb, phase: 'exit' } : null)
        killTimer.current = setTimeout(() => setKillBanner(null), 800)
      }, 4000)
    })
    // Announcer bundle: the active pack's banner image for a fired event. Only
    // shows when the pack actually maps an image (bannerUrl); otherwise we leave
    // the built-in kill card to handle it. Clears the card so we never stack both.
    const uPB = listen<{ event: string; bannerData: string | null; bannerText: string; thai: string; clip: string | null }>('announcer-banner', (e) => {
      // Show the bundle banner when the pack maps an image OR a voice clip fired —
      // a voice-only event still gets the transcript + reactive waveform strip.
      if ((!e.payload.bannerData && !e.payload.clip) || !sRef.current.killVisuals) return
      if (killTimer.current) { clearTimeout(killTimer.current); killTimer.current = null }
      setKillBanner(null)
      if (packBannerTimer.current) clearTimeout(packBannerTimer.current)
      setPackBanner({ phase: 'show', url: e.payload.bannerData, text: e.payload.bannerText, thai: e.payload.thai, clip: e.payload.clip })
      packBannerTimer.current = setTimeout(() => {
        setPackBanner((pb) => pb ? { ...pb, phase: 'exit' } : null)
        packBannerTimer.current = setTimeout(() => setPackBanner(null), 800)
      }, 4000)
    })
    void emit('overlay-ready')
    return () => {
      void u1.then((f) => f()); void u2.then((f) => f()); void u3.then((f) => f())
      void u4.then((f) => f()); void u5.then((f) => f()); void u6.then((f) => f())
      void u7.then((f) => f()); void u8.then((f) => f()); void u9.then((f) => f())
      void u10.then((f) => f()); void uK.then((f) => f()); void uPB.then((f) => f())
      void uBA.then((f) => f()); void uBN.then((f) => f())
      if (gankTimer.current) clearTimeout(gankTimer.current)
      if (gankClearTimer.current) clearTimeout(gankClearTimer.current)
      if (adviceTimer.current) clearTimeout(adviceTimer.current)
      if (volToastTimer.current) clearTimeout(volToastTimer.current)
      if (packBannerTimer.current) clearTimeout(packBannerTimer.current)
    }
  }, [])

  // #6: auto-dismiss the event toast 4s after the most recent voice event.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

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
        setToast({ event: 'danger', text: DANGER_LINE })
        if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: 'danger', line: DANGER_LINE, context: { hp: tick.hp_percent, clock: tick.clock_time, level: tick.level } }).catch(() => {})
        void invoke('speak_event', { event: 'danger', fallback: DANGER_LINE, voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})
      }
    }
  }, [lowHp, tick, tick?.in_game, tick?.alive, tick?.hp_percent, s.alertThreshold, s.voiceEnabled, s.voiceName, s.voiceRate])

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
    setToast({ event: 'revision', text: line })
    if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: 'revision', line, context: { hp: tick.hp_percent, clock: tick.clock_time } }).catch(() => {})
    void invoke('cancel_speech').catch(() => {})
    // brief gap lets the killed SAPI process die before the new one starts,
    // otherwise Windows audio sometimes squashes the first syllable
    setTimeout(() => {
      void invoke('speak_event', { event: 'revision', fallback: line, voice: sRef.current.voiceName || null, rate: sRef.current.voiceRate }).catch(() => {})
    }, 90)
  }, [tick, tick?.in_game, tick?.hp_percent, tick?.kills, s.alertThreshold])

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
    if (crossedAnyLevelUpMilestone(p.level, tick.level)) events.push('levelUp')
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
    setToast({ event: evt, text: line })
    if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: evt, line, context: { clock: tick.clock_time, level: tick.level, kills: tick.kills, deaths: tick.deaths } }).catch(() => {})
    void invoke('speak_event', { event: evt, fallback: line, voice: sRef.current.voiceName || null, rate: sRef.current.voiceRate }).catch(() => {})
  }, [tick, tick?.in_game, tick?.level, tick?.kills, tick?.deaths, tick?.alive, tick?.mana_percent, lowHp])

  // Kill banner — pop variant-B banner for 3.5s whenever the player scores a kill.
  // Guess victim from the set of heroes G-Sentry flagged missing (best we can do
  // without a dedicated kill-feed in GSI). Track consecutive kills for streak badge.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    if (!p || tick.kills <= p.kills) return
    if (killTimer.current) clearTimeout(killTimer.current)
    killStreak.current += 1
    const missing = [...missingHeroes]
    const seen = lastKillHeroes.current
    // exact victim from the backend (CR-010) if resolved, else guess from the
    // G-Sentry missing set (best we can do without a dedicated GSI kill feed).
    const victim = tick.last_victim_hero || missing.find((h) => !seen.has(h)) || missing[0] || null
    if (victim) seen.add(victim)
    setKillBanner({ phase: 'show', kills: tick.kills, streak: killStreak.current, victim })
    killTimer.current = setTimeout(() => {
      setKillBanner((kb) => kb ? { ...kb, phase: 'exit' } : null)
      killTimer.current = setTimeout(() => setKillBanner(null), 800)
    }, 4000)
  }, [tick?.in_game, tick?.kills])
  // Reset streak on death + fire the G-Revive buyback verdict; clear on respawn.
  // Uses its OWN prev-alive ref rather than the shared `prev.current`: the persona
  // effect above overwrites `prev.current` at the top of its body (and runs first,
  // every tick), so reading it here would always miss the alive→dead edge.
  const prevAlive = useRef<boolean | null>(null)
  useEffect(() => {
    if (!tick) return
    const was = prevAlive.current
    prevAlive.current = tick.alive
    if (was === null) return
    if (was && !tick.alive) {
      killStreak.current = 0
      lastKillHeroes.current.clear()
      // G-Revive: ask the backend for this death's buyback verdict. The verdict
      // returns immediately (deterministic) and is broadcast on `buyback-advice`
      // — the listener above owns display; the voiced narrative follows on
      // `buyback-narrative`. Fire-and-forget; ignore errors (SLM/CLI absent).
      if (tick.in_game) void invoke('request_buyback_advice', { tick }).catch(() => {})
    }
    if (!was && tick.alive) {
      setBuyback(null) // respawned — dismiss the card
    }
  }, [tick?.alive])

  // Auto-advice (G-Master proactive). Fires Claude Plan request + speaks the
  // result on key moments: ult level milestones and a death-streak (2 deaths
  // within 5 clock-min). Per-trigger cooldown 10 clock-min; server-side
  // throttle (30s wallclock) also caps quota use.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    if (!p || !sRef.current.masterEnabled || !sRef.current.autoAdvice || !sRef.current.voiceEnabled) return

    type Trigger = { key: string }
    const triggers: Trigger[] = []

    for (const milestone of crossedLevelUpMilestones(p.level, tick.level)) {
      triggers.push({ key: `lvl${milestone}` })
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
      void (async () => {
        // Budget gate — silent throttle when the user set a USD ceiling in the
        // QuotaCard and we've blown past it. Only auto-triggers are gated;
        // the manual ask button stays available (= explicit user intent).
        try {
          const raw = localStorage.getItem('gm-quota-budget')
          if (raw) {
            const budget = JSON.parse(raw) as Partial<{ sessionUsd: number; weeklyUsd: number }>
            const hasBudget = (typeof budget.sessionUsd === 'number' && budget.sessionUsd > 0)
              || (typeof budget.weeklyUsd === 'number' && budget.weeklyUsd > 0)
            if (hasBudget) {
              const stats = await invoke<{ session: { cost_usd: number }; weekly: { cost_usd: number } }>('read_usage')
              if (typeof budget.sessionUsd === 'number' && budget.sessionUsd > 0
                  && stats.session.cost_usd >= budget.sessionUsd) return
              if (typeof budget.weeklyUsd === 'number' && budget.weeklyUsd > 0
                  && stats.weekly.cost_usd >= budget.weeklyUsd) return
            }
          }
        } catch { /* budget parse failure -> let the request through */ }
        return invoke<{ text: string; cached: boolean }>('request_advice', { tick })
        .then((a) => {
          if (!a?.text) return
          setToast({ event: 'advice', text: a.text })
          if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: 'advice', line: a.text, context: { clock: tick.clock_time, level: tick.level } }).catch(() => {})
          void invoke('speak_event', {
            event: 'advice',
            fallback: a.text,
            voice: sRef.current.voiceName || null,
            rate: sRef.current.voiceRate,
          }).catch(() => {})
        })
        .catch(() => { /* claude CLI missing or login fail — silent in auto mode */ })
      })()
    }
  }, [tick?.in_game, tick?.level, tick?.deaths, tick?.clock_time])

  const wrap: React.CSSProperties = s.position === 'custom'
    ? { position: 'fixed', left: `${s.customX}%`, top: `${s.customY}%`, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }
    : {
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

  // G2.6: Enemy-missing indicator — compact badge list. Shows which heroes
  // G-Sentry has flagged missing >5s but haven't yet hit the 85% gank threshold.
  // Only shown when NOT already in a full gank-alert (to avoid double-messaging).
  const missingBadge = missingHeroes.size > 0 && !gank && s.gankVisuals ? (
    <div style={{
      background: 'rgba(18,20,28,0.78)', border: `1px solid rgba(255,207,107,0.45)`,
      borderRadius: 10, padding: '6px 14px', fontFamily: '"Segoe UI", system-ui, sans-serif',
      fontSize: 12.5, color: C.warn, display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 6px 18px rgba(0,0,0,0.24)',
    }}>
      <span style={{ opacity: 0.7 }}>👁️</span>
      <span>หาย: {[...missingHeroes].map(heroName).join(', ')}</span>
    </div>
  ) : null

  // G5.4: Overlay advice panel — shows G-Master response for 20s, dismissable.
  const advicePanel = overlayAdvice && s.gankVisuals ? (
    <div style={{
      ...overlayPanel(s.opacity), padding: '10px 16px', maxWidth: 380, fontSize: 13,
      lineHeight: 1.5, position: 'relative',
    }}>
      <div style={{ fontSize: 10.5, color: C.ice, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>Maiden แนะนำ</div>
      <div style={{ color: C.txt }}>{overlayAdvice}</div>
      <button onClick={() => setOverlayAdvice(null)} style={{
        position: 'absolute', top: 6, right: 8, background: 'transparent', border: 'none',
        color: C.mut, cursor: 'pointer', fontSize: 13, lineHeight: 1,
      }}>✕</button>
    </div>
  ) : null

  // G-Revive: buyback verdict card — shown while dead, dismissed on respawn.
  // Accent tracks urgency: Strong = red (buy back NOW), Consider = amber, else ice.
  const buybackPanel = buyback && s.gankVisuals ? (() => {
    const a = buyback.advice
    const accent = a.urgency === 'Strong' ? C.bad : a.urgency === 'Consider' ? C.warn : C.ice
    const verdict = a.recommend_buyback ? (a.urgency === 'Strong' ? 'ซื้อเกิดเลย!' : 'ควรซื้อเกิด') : 'รอเกิด'
    const secs = Math.max(0, Math.round(a.natural_respawn_remaining))
    return (
      <div style={{
        ...overlayPanel(s.opacity), padding: '10px 16px', maxWidth: 380, fontSize: 13,
        lineHeight: 1.5, position: 'relative', border: `1px solid ${accent}`,
      }}>
        <div style={{ fontSize: 10.5, color: accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💀 Buyback</span>
          <span style={{ background: accent, color: C.bg, borderRadius: 6, padding: '1px 7px', fontWeight: 700, letterSpacing: 0.4 }}>{verdict}</span>
        </div>
        <div style={{ color: C.txt }}>{buyback.narrative || a.reason}</div>
        <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>
          เกิดเองใน {secs}s{a.affordable === false ? ' · เงินไม่พอซื้อเกิด' : ''}
        </div>
        <button onClick={() => setBuyback(null)} style={{
          position: 'absolute', top: 6, right: 8, background: 'transparent', border: 'none',
          color: C.mut, cursor: 'pointer', fontSize: 13, lineHeight: 1,
        }}>✕</button>
      </div>
    )
  })() : null

  // A. Gank warning banner — top-center, above the stat HUD, never over the minimap.
  const gankBanner = s.gankVisuals && gank ? (
    gank.phase === 'clear'
      ? <div className="gm-gank-clear" style={gankClearStyle}>{REVISION_LINES.gankCleared[0]}</div>
      : <div className="gm-gank" style={gankStyle}>
          ⚠️ ระวังแก๊งค์! {gank.heroes.length ? gank.heroes.map(heroName).join(', ') + ' หาย — ' : ''}{Math.round(gank.probability * 100)}%
        </div>
  ) : null

  // #6: transient event toast — same lifetime as a voice cue, near the alert zone.
  const eventToast = toast ? (
    <div style={{
      background: 'rgba(18,20,28,0.86)', border: `1px solid ${C.ice}`, borderRadius: 10,
      padding: '7px 16px', fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: 12.5,
      color: C.txt, display: 'flex', alignItems: 'center', gap: 8, maxWidth: 440,
      boxShadow: '0 6px 18px rgba(0,0,0,0.24)',
    }}>
      <span style={{ fontSize: 10, color: C.ice, textTransform: 'uppercase', letterSpacing: 0.6, flex: 'none' }}>🔔 {toast.event}</span>
      <span style={{ opacity: 0.92 }}>{toast.text}</span>
    </div>
  ) : null

  // Redesign tier — isolated render path; lite (below) stays the stable default.
  if (s.uiMode === 'full') {
    return <FullOverlay tick={tick} s={s} gank={gank} missingHeroes={missingHeroes} overlayAdvice={overlayAdvice} buyback={buyback} toast={toast} />
  }

  if (!seen || !tick || !tick.in_game || (!gsiActive && !previewMode)) {
    return (
      <>
        {cvDebug}
        <div style={wrap}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {gankBanner}
            {missingBadge}
            {eventToast}
            <div style={{ ...overlayPanel(s.opacity), padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: gsiActive ? C.ok : C.bad }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>G-Maiden</div>
                <div style={{ fontSize: 11, color: C.mut }}>GSI Signal</div>
              </div>
            </div>
          </div>
        </div>
        {volToast !== null && (
          <div style={{
            position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
            ...overlayPanel(s.opacity), padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, pointerEvents: 'none', transition: 'opacity .2s', zIndex: 20,
          }}>
            <span>{volToast === 0 ? '🔇' : volToast <= 30 ? '🔈' : volToast <= 70 ? '🔉' : '🔊'}</span>
            <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${volToast}%`, background: C.ice, borderRadius: 99, transition: 'width .15s' }} />
            </div>
            <span style={{ color: C.ice, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{volToast}%</span>
          </div>
        )}
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
        {missingBadge}
        {eventToast}
        {lowHp && <div className="gm-danger" style={dangerStyle}>⚠ HP เหลือ {t.hp_percent}% — ถอยก่อนค่ะเพื่อน!</div>}
        {/* Announcer bundle: the active pack's queue banner image (replaces the
            built-in card when the pack maps an image for the fired event). */}
        {s.killVisuals && packBanner && (
          <div className={packBanner.phase === 'exit' ? 'gm-kill-exit' : 'gm-kill'} style={packBannerStyle}>
            {packBanner.url && (
              <img
                src={packBanner.url}
                alt={packBanner.text}
                style={{ display: 'block', maxWidth: 420, maxHeight: 150, width: 'auto', height: 'auto', objectFit: 'contain' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            {packBanner.url && (packBanner.text || packBanner.thai) && (
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 6, textAlign: 'center', pointerEvents: 'none' }}>
                {packBanner.text && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.txt, letterSpacing: 1, textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{packBanner.text}</div>
                )}
                {packBanner.thai && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ice, textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{packBanner.thai}</div>
                )}
              </div>
            )}
            {/* Voice strip: the transcript caption + a waveform reactive to the
                clip the overlay is playing (silently). Footer under an image, or
                the whole banner when the pack maps no image for this event. */}
            {packBanner.clip && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                padding: packBanner.url ? '6px 10px 8px' : '10px 14px',
                background: 'rgba(12,14,20,0.82)', lineHeight: 1.25,
              }}>
                {!packBanner.url && (packBanner.text || packBanner.thai) && (
                  <div style={{ textAlign: 'center' }}>
                    {packBanner.text && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.txt, letterSpacing: 1, textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{packBanner.text}</div>
                    )}
                    {packBanner.thai && (
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ice, textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{packBanner.thai}</div>
                    )}
                  </div>
                )}
                <VoiceWave key={packBanner.clip} clip={packBanner.clip} />
              </div>
            )}
          </div>
        )}
        {s.killVisuals && killBanner && !packBanner && (
          <div className={killBanner.phase === 'exit' ? 'gm-kill-exit' : 'gm-kill'} style={killBannerStyle}>
            {/* Hero portrait circle + animated red X */}
            <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', overflow: 'hidden',
                background: 'rgba(18,20,28,0.9)', border: '2px solid rgba(91,227,167,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {killBanner.victim ? (
                  <img
                    src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${killBanner.victim.replace(/^npc_dota_hero_/, '')}.png`}
                    alt="" style={{ width: '110%', height: '110%', objectFit: 'cover' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span style={{ fontSize: 22, opacity: 0.6 }}>💀</span>
                )}
              </div>
              <svg className="gm-kill-cross" viewBox="0 0 56 56" style={{
                position: 'absolute', inset: 0, width: 56, height: 56, pointerEvents: 'none',
              }}>
                <line x1="12" y1="12" x2="44" y2="44" stroke="#ff4455" strokeWidth="3.5" strokeLinecap="round" />
                <line x1="44" y1="12" x2="12" y2="44" stroke="#ff4455" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
            </div>
            {/* Kill text + victim name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.ok, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.8 }}>
                {killBanner.streak >= 3 ? (STREAK_LABELS[Math.min(killBanner.streak, 10)] ?? 'BEYOND GODLIKE') : 'ENEMY SLAIN'}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.txt, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {killBanner.victim ? heroName(killBanner.victim) : 'ฆ่าได้สวยค่ะ!'}
              </div>
            </div>
            {/* YOU : FOE score */}
            <div style={{
              background: 'rgba(143,212,255,0.06)', border: '1px solid rgba(143,212,255,0.18)',
              borderRadius: 10, padding: '5px 16px', textAlign: 'center', flexShrink: 0,
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: 1 }}>
                <span style={{ color: C.ok }}>{t.kills}</span>
                <span style={{ color: C.mut, fontSize: 14, margin: '0 6px' }}>:</span>
                <span style={{ color: C.bad }}>{t.deaths}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 0.8, marginTop: 2 }}>
                <span style={{ color: C.ok, fontWeight: 600 }}>YOU</span>
                <span style={{ color: C.bad, fontWeight: 600 }}>FOE</span>
              </div>
            </div>
          </div>
        )}
        {buybackPanel}
        {advicePanel}
        {(s.showTimer || s.showScore || s.showHeroBar || s.showKda || s.showGold) && (
        <div style={{ ...overlayPanel(s.opacity), padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {s.showTimer && (
            <div style={{ textAlign: 'center', minWidth: 54 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.ice, lineHeight: 1 }}>{fmtClock(t.clock_time)}</div>
              <div style={{ fontSize: 10, color: C.mut, marginTop: 3 }}>{t.daytime ? '☀' : '🌙'}</div>
            </div>
          )}
          {s.showScore && (
            <div style={{ textAlign: 'center', minWidth: 54 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                <span style={{ color: C.ok }}>{t.radiant_score}</span>
                <span style={{ margin: '0 4px', opacity: 0.5, color: C.mut }}>:</span>
                <span style={{ color: C.bad }}>{t.dire_score}</span>
              </div>
              <div style={{ fontSize: 10, color: C.mut }}>SCORE</div>
            </div>
          )}
          {s.showHeroBar && (
            <>
              {(s.showTimer || s.showScore) && sep}
              <div style={{ minWidth: 120 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: t.alive ? C.txt : C.bad }}>{heroName(t.hero)} {!t.alive && '💀'}</div>
                <div style={{ fontSize: 11, color: C.mut, marginBottom: 5 }}>Lvl {t.level}</div>
                <div style={{ marginBottom: 3 }}><Bar pct={t.hp_percent} color={C.ok} /></div>
                <Bar pct={t.mana_percent} color={C.ice} />
              </div>
            </>
          )}
          {s.showKda && (
            <>
              {(s.showTimer || s.showScore || s.showHeroBar) && sep}
              <Stat label="K / D / A" value={`${t.kills}/${t.deaths}/${t.assists}`} />
              <Stat label="LH / DN" value={`${t.last_hits}/${t.denies}`} />
            </>
          )}
          {s.showGold && (
            <>
              {(s.showTimer || s.showScore || s.showHeroBar || s.showKda) && sep}
              <Stat label="Gold" value={t.gold.toLocaleString()} color={C.warn} />
              <Stat label="NW" value={t.net_worth.toLocaleString()} color={C.ice} />
              <Stat label="GPM" value={t.gpm} />
              <Stat label="XPM" value={t.xpm} />
            </>
          )}
        </div>
        )}
      </div>
    </div>
    {volToast !== null && (
      <div style={{
        position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
        ...overlayPanel(s.opacity), padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 13, pointerEvents: 'none', transition: 'opacity .2s', zIndex: 20,
      }}>
        <span>{volToast === 0 ? '🔇' : volToast <= 30 ? '🔈' : volToast <= 70 ? '🔉' : '🔊'}</span>
        <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${volToast}%`, background: C.ice, borderRadius: 99, transition: 'width .15s' }} />
        </div>
        <span style={{ color: C.ice, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{volToast}%</span>
      </div>
    )}
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

// ─────────────────────────────── AUDIO SETTINGS (unified voice pack + event manager) ───────────────────────────────
interface VoiceCacheStatus { dir: string; counts: Record<string, number>; total: number }
interface EventClip { name: string; path: string; source: string }
const VOICE_STORE_URL = 'https://g-maiden.app/voicepacks' // TODO: real store URL
const PREVIEW_LINES: Record<string, string> = {
  match_start: 'เริ่มเกมแล้ว ลุยกันเลยค่ะ!',
  danger: 'ถอยก่อนค่ะเพื่อน เลือดเหลือน้อยแล้ว',
  gank: 'ระวังนะคะ ศัตรูหายไปจากแมพหลายตัว อาจมีแก๊งค์',
  revision: 'เอ๊ะ เดี๋ยวก่อน ดูเหมือนจะปลอดภัยแล้วค่ะ',
  first_blood: 'เลือดแรกเป็นของเรา!',
  kill: 'ฆ่าได้สวยค่ะ เก็บไปเรื่อยๆ',
  double_kill: 'สองศพรวด เด็ดมาก!',
  triple_kill: 'ขจัดไปสามแล้ว เริ่มมีกลิ่นแล้วนะ!',
  ultra_kill: 'สี่ศพ หยุดไม่อยู่แล้ว!',
  rampage: 'ห้าศพรวด แรมเพจ!',
  killing_spree: 'กำลังขึ้น คิลลิ่งสปรี!',
  dominating: 'ครองเกมแล้ว โดมิเนตติ้ง!',
  mega_kill: 'เมก้าคิล!',
  unstoppable: 'ไม่มีใครหยุดได้ อันสต็อปเปเบิล!',
  wicked_sick: 'โหดเกินไปแล้ว วิคเก็ดซิค!',
  monster_kill: 'มอนสเตอร์คิล!',
  godlike: 'ระดับเทพ ก็อดไลก์!',
  beyond_godlike: 'เหนือกว่าเทพ บียอนด์ก็อดไลก์!',
  death: 'ตายแล้วเหรอคะ ไม่เป็นไรเดี๋ยวกลับมาใหม่',
  respawn: 'กลับมาแล้ว ค่อยๆนะคะ',
  levelUp: 'ขึ้นเลเวลแล้วค่ะ สวยมาก',
  hpLow: 'เลือดน้อยมากแล้ว ระวังตัวด้วย!',
  manaLow: 'มานาเหลือน้อยแล้วค่ะ ระวังด้วย',
  advice: 'ลองดูคำแนะนำนี้นะคะ',
}
const EVENT_CATEGORIES: { label: string; color: string; events: string[] }[] = [
  { label: 'แจ้งเตือน', color: '#ff6b6b', events: ['danger', 'gank', 'revision', 'hpLow', 'manaLow'] },
  { label: 'คิล / มัลติคิล', color: '#ffd93d', events: ['first_blood', 'kill', 'double_kill', 'triple_kill', 'ultra_kill', 'rampage'] },
  { label: 'สตรีค', color: '#ff8c42', events: ['killing_spree', 'dominating', 'mega_kill', 'unstoppable', 'wicked_sick', 'monster_kill', 'godlike', 'beyond_godlike'] },
  { label: 'สถานะ', color: '#6bcb77', events: ['match_start', 'death', 'respawn', 'levelUp', 'advice'] },
]
const EVENT_LABELS: Record<string, string> = {
  danger: 'อันตราย', gank: 'แก๊งค์', revision: 'ยกเลิกเตือน', hpLow: 'เลือดต่ำ', manaLow: 'มานาต่ำ',
  first_blood: 'เลือดแรก', kill: 'คิล', double_kill: 'ดับเบิล', triple_kill: 'ทริปเปิล', ultra_kill: 'อัลตร้า', rampage: 'แรมเพจ',
  killing_spree: 'สปรี', dominating: 'ครองเกม', mega_kill: 'เมก้า', unstoppable: 'หยุดไม่ได้',
  wicked_sick: 'โหดมาก', monster_kill: 'มอนสเตอร์', godlike: 'ก็อดไลก์', beyond_godlike: 'เหนือเทพ',
  match_start: 'เริ่มเกม', death: 'ตาย', respawn: 'ฟื้น', levelUp: 'เลเวลอัป', advice: 'คำแนะนำ',
}
const AudioSettingsCard: React.FC = () => {
  const [st, setSt] = useState<VoiceCacheStatus | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [clips, setClips] = useState<EventClip[]>([])
  const [playing, setPlaying] = useState<string | null>(null)
  const refresh = () => { void invoke<VoiceCacheStatus>('voice_cache_status').then(setSt).catch(() => {}) }
  useEffect(refresh, [])
  const counts = st?.counts ?? {}
  const allEvents = Object.keys(PREVIEW_LINES)
  const total = st?.total ?? 0
  const covered = allEvents.filter((ev) => (counts[ev] ?? 0) > 0).length
  const pct = Math.round((covered / allEvents.length) * 100)

  const toggleExpand = (ev: string) => {
    if (expanded === ev) { setExpanded(null); setClips([]); return }
    setExpanded(ev)
    void invoke<EventClip[]>('list_event_clips', { event: ev }).then(setClips).catch(() => setClips([]))
  }
  const playClip = (path: string) => {
    setPlaying(path)
    void invoke('play_clip', { path }).catch(() => {})
    setTimeout(() => setPlaying(null), 2000)
  }
  const playEvent = (ev: string) => {
    setPlaying(ev)
    void invoke('speak_event', { event: ev, fallback: PREVIEW_LINES[ev] ?? '', voice: null, rate: null }).catch(() => {})
    setTimeout(() => setPlaying(null), 2000)
  }

  if (!st) return <Card title="Audio Settings"><div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังสแกน…</div></Card>
  return (
    <Card title="Audio Settings">
      {/* ── Pack header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(143,212,255,0.12)', border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎙️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.txt }}>Voice Pack Set01 <span style={{ fontSize: 10, color: '#0c1018', fontWeight: 600, background: C.ice, borderRadius: 4, padding: '1px 6px', marginLeft: 6 }}>hotfix</span></div>
            <div style={{ fontSize: 12, color: C.mut }}>{total} clips · {covered}/{allEvents.length} events ({pct}%)</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={refresh} title="สแกนใหม่" style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>⟳</button>
          <button onClick={() => void invoke('open_voice_cache_dir').catch(() => {})} title="เปิดโฟลเดอร์ voice-cache" style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>📂</button>
        </div>
      </div>

      {/* ── Coverage bar ── */}
      <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 6, height: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.ok : C.ice, borderRadius: 6, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 10.5, color: C.mut, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>{pct === 100 ? 'ครบทุก event แล้ว!' : `ยังขาด ${allEvents.length - covered} event — ใช้ SAPI fallback`}</span>
        <span style={{ color: C.ice }}>{st.dir}</span>
      </div>

      {/* ── Event categories ── */}
      <div style={{ marginTop: 14 }}>
        {EVENT_CATEGORIES.map((cat) => (
          <div key={cat.label} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: cat.color, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 3, borderRadius: 2, background: cat.color }} />
              {cat.label}
              <span style={{ color: C.mut, fontWeight: 400 }}>({cat.events.filter(e => (counts[e] ?? 0) > 0).length}/{cat.events.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {cat.events.map((ev) => {
                const n = counts[ev] ?? 0
                const has = n > 0
                const isExpanded = expanded === ev
                return (
                  <div key={ev}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: isExpanded ? 'rgba(143,212,255,0.08)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}
                      onClick={() => toggleExpand(ev)}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: has ? C.ok : 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: C.txt, flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: has ? C.ice : C.mut }}>{ev}</span>
                        <span style={{ color: C.mut, marginLeft: 6, fontSize: 11 }}>{EVENT_LABELS[ev] ?? ''}</span>
                      </span>
                      <span style={{ fontSize: 11, color: has ? C.ok : C.mut, fontFamily: 'monospace', minWidth: 30, textAlign: 'right' }}>{has ? `${n} clip${n > 1 ? 's' : ''}` : 'SAPI'}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); playEvent(ev) }}
                        title={has ? 'เล่น clip สุ่ม' : 'เล่นเสียง SAPI'}
                        style={{ background: 'transparent', color: playing === ev ? C.ok : (has ? C.ice : C.mut), border: `1px solid ${C.line}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                      >{playing === ev ? '⏹' : '▶'}</button>
                      <span style={{ fontSize: 10, color: C.mut, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>
                    {isExpanded && (
                      <div style={{ margin: '2px 0 6px 25px', padding: '8px 12px', background: 'rgba(18,20,28,0.6)', borderRadius: 8, border: `1px solid ${C.line}` }}>
                        {clips.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {clips.map((clip) => (
                              <div key={clip.path} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                <button
                                  onClick={() => playClip(clip.path)}
                                  style={{ background: 'transparent', color: playing === clip.path ? C.ok : C.ice, border: `1px solid ${C.line}`, borderRadius: 5, padding: '2px 7px', fontSize: 11, cursor: 'pointer' }}
                                >{playing === clip.path ? '⏹' : '▶'}</button>
                                <span style={{ color: C.txt, fontFamily: 'monospace', fontSize: 11 }}>{clip.name}</span>
                                <span style={{ fontSize: 10, color: C.mut, padding: '1px 5px', background: clip.source === 'user' ? 'rgba(91,227,167,0.12)' : 'rgba(143,212,255,0.08)', borderRadius: 4 }}>
                                  {clip.source === 'user' ? 'user' : 'default'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: C.mut }}>ไม่มี clip — จะใช้ SAPI TTS พูดว่า "<span style={{ color: C.txt, fontStyle: 'italic' }}>{PREVIEW_LINES[ev] ?? ''}</span>"</div>
                        )}
                        {clips.length > 0 && clips[0].source === 'default' && (
                          <div style={{ fontSize: 10.5, color: C.mut, marginTop: 6 }}>💡 วาง clip ใน <code style={{ color: C.txt }}>{ev}/</code> เพื่อ override default pack</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Bottom actions ── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
        <button onClick={() => void invoke('open_url', { url: VOICE_STORE_URL }).catch(() => {})}
          style={{ background: 'rgba(143,212,255,0.12)', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          🛒 ดู Voice Pack เพิ่ม
        </button>
        <button onClick={() => void invoke('open_voice_cache_dir').catch(() => {})}
          style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 9, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>
          📂 เปิดโฟลเดอร์เสียง
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: C.mut, marginTop: 6, lineHeight: 1.5 }}>
        สร้างแพ็คเอง: <b style={{ color: C.txt }}>G-AnnStudio</b> → map event → กด "ส่ง G-Maiden" แล้วกด ⟳ · วาง WAV/MP3 ลง <code style={{ color: C.txt }}>{`{event}/{n}.wav`}</code>
      </div>
    </Card>
  )
}

// ─────────────────────────────── G-MASTER (Claude Plan advisor) ───────────────────────────────
interface Advice { text: string; cached: boolean }
type MasterBackend = 'auto' | 'claude' | 'ollama'
const MasterCard: React.FC<{ tick: GameTick | null; voice: string; rate: number; enabled: boolean; onEnabledChange: (v: boolean) => void; autoAdvice: boolean; onAutoAdviceChange: (v: boolean) => void; backend: MasterBackend; onBackendChange: (b: MasterBackend) => void; auth: 'plan' | 'apikey'; onAuthChange: (a: 'plan' | 'apikey') => void; apiKeyPresent: boolean; onApiKeySave: (k: string) => void; ollamaModel: string; onOllamaModelChange: (m: string) => void; onUsageChanged?: () => void }> = ({ tick, voice, rate, enabled, onEnabledChange, autoAdvice, onAutoAdviceChange, backend, onBackendChange, auth, onAuthChange, apiKeyPresent, onApiKeySave, ollamaModel, onOllamaModelChange, onUsageChanged }) => {
  const [advice, setAdvice] = useState<Advice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // CR-008 WP-2: the key never round-trips back to the webview. We keep only a
  // transient draft; on save it goes straight to the DPAPI store via the backend
  // and is cleared here. `apiKeyPresent` reflects stored state (has_master_api_key).
  const [keyDraft, setKeyDraft] = useState('')
  const canAsk = enabled && !!tick && tick.in_game && !busy
  const usesClaude = backend === 'claude' || backend === 'auto'
  const ask = async () => {
    if (!tick) return
    setBusy(true); setError(null)
    try {
      const a = await invoke<Advice>('request_advice', { tick })
      setAdvice(a)
      if (!a.cached) onUsageChanged?.()
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }
  const speakAdvice = () => {
    if (!advice) return
    // Go through speak_event so a user-supplied advice/ WAV pool is used when present.
    void invoke('speak_event', { event: 'advice', fallback: advice.text, voice: voice || null, rate }).catch(() => {})
  }
  const backendLabel: Record<MasterBackend, string> = {
    auto: 'อัตโนมัติ (claude → ollama)',
    claude: 'Claude CLI (Plan quota)',
    ollama: `Ollama local${ollamaModel ? ` (${ollamaModel})` : ''}`,
  }
  return (
    <Card title="G-Master (advisor)">
      <Row label="เปิดใช้งาน G-Master"><Toggle on={enabled} onChange={onEnabledChange} /></Row>
      <Row label="Backend">
        <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
          {(['auto','claude','ollama'] as MasterBackend[]).map((b) => (
            <button key={b} onClick={() => onBackendChange(b)}
              style={{ background: backend === b ? 'rgba(143,212,255,0.16)' : 'transparent', color: backend === b ? C.ice : C.mut, border: 'none', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
              {b === 'auto' ? 'Auto' : b === 'claude' ? 'Claude' : 'Ollama'}
            </button>
          ))}
        </div>
      </Row>
      {usesClaude && (
        <Row label="Login / Auth (Claude)">
          <select value={auth} onChange={(e) => onAuthChange(e.target.value as 'plan' | 'apikey')}
            style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5 }}>
            <option value="plan">Plan — claude CLI (ล็อกอินอัตโนมัติ)</option>
            <option value="apikey">API key — Anthropic</option>
          </select>
        </Row>
      )}
      {usesClaude && auth === 'apikey' && (
        <Row label="Anthropic API key">
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={apiKeyPresent ? '•••••• บันทึกไว้แล้ว — พิมพ์เพื่อแทนที่' : 'sk-ant-…'} autoComplete="off"
              style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, width: 260 }} />
            <button onClick={() => { const k = keyDraft.trim(); if (k) { onApiKeySave(k); setKeyDraft('') } }} disabled={!keyDraft.trim()}
              style={{ background: keyDraft.trim() ? 'rgba(143,212,255,0.16)' : 'transparent', color: keyDraft.trim() ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: keyDraft.trim() ? 'pointer' : 'default' }}>บันทึก</button>
            {apiKeyPresent && (
              <button onClick={() => { onApiKeySave(''); setKeyDraft('') }}
                style={{ background: 'transparent', color: C.bad, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>ลบคีย์</button>
            )}
          </div>
        </Row>
      )}
      {(backend === 'ollama' || backend === 'auto') && (
        <Row label="Ollama model">
          <input value={ollamaModel} onChange={(e) => onOllamaModelChange(e.target.value)}
            placeholder="qwen3.5:4b"
            style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, width: 220 }} />
        </Row>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, gap: 12 }}>
        <div style={{ fontSize: 12, color: C.mut }}>
          {backendLabel[backend]} · throttle 30s/คำขอ.
          {!canAsk && tick?.in_game === false && ' · เปิด Dota 2 ก่อน'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', fontSize: 12, color: C.mut }}>
          พูดอัตโนมัติเมื่อเลเวล 6/12/18/25 หรือตาย 2 รอบติด
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

// Silent-arm efficacy study result (RWANG TASK 2). Read-only — shows the
// user their OWN warned-vs-silent death rate, computed entirely on-device by
// `efficacy_summary` from the local match logs. Only rendered when the user
// has opted into `efficacyStudy`.
interface EfficacyArm { events: number; deaths: number; rate: number | null }
interface EfficacySummary { armed: EfficacyArm; silent: EfficacyArm }
const armRate = (a: EfficacyArm): string => a.rate !== null ? `ตาย ${(a.rate * 100).toFixed(0)}%` : 'ยังไม่มีข้อมูล'
const EfficacyCard: React.FC = () => {
  const [data, setData] = useState<EfficacySummary | null>(null)
  const [err, setErr] = useState(false)
  const refresh = () => {
    setErr(false)
    void invoke<EfficacySummary>('efficacy_summary').then(setData).catch(() => setErr(true))
  }
  useEffect(() => { refresh() }, [])

  const armed = data?.armed
  const silent = data?.silent
  const delta = armed && silent && armed.rate !== null && silent.rate !== null ? armed.rate - silent.rate : null

  return (
    <Card title="ผลการศึกษาประสิทธิภาพเสียงเตือน G-Signal">
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 6, lineHeight: 1.55 }}>
        เปรียบเทียบอัตราการตายหลังการเตือนแก๊งค์ — ระหว่างแมตช์ที่ <b style={{ color: C.txt }}>ได้ยินเสียงเตือน</b> กับแมตช์ที่ถูกสุ่ม
        <b style={{ color: C.txt }}> ปิดเสียงเตือนไว้</b> (silent arm) เพื่อวัดผลจริง — คิดต่อ 1 เหตุการณ์เตือน ไม่ใช่ต่อแมตช์ ข้อมูลทั้งหมดอยู่ในเครื่องนี้เท่านั้น ไม่ส่งออกไปไหน.
      </div>
      {err && <div style={{ fontSize: 12, color: C.bad, marginTop: 10 }}>อ่านข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง</div>}
      {!err && !data && <div style={{ fontSize: 12, color: C.mut, marginTop: 10 }}>กำลังโหลด…</div>}
      {armed && silent && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
          <Stat label="ได้ยินเสียงเตือน (armed)" value={`${armed.events} ครั้ง · ${armRate(armed)}`} color={C.ice} />
          <Stat label="ปิดเสียงเตือน (silent)" value={`${silent.events} ครั้ง · ${armRate(silent)}`} color={C.warn} />
          {delta !== null && (armed.events > 0 || silent.events > 0) && (
            <Stat label="ผลต่าง" value={`${delta <= 0 ? '' : '+'}${(delta * 100).toFixed(0)}%`} color={delta < 0 ? C.ok : delta > 0 ? C.bad : C.mut} />
          )}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button onClick={refresh}
          style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 11px', fontSize: 12, cursor: 'pointer' }}>
          🔄 รีเฟรช
        </button>
      </div>
    </Card>
  )
}

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
                ถ้า Dota 2 เปิดอยู่ก่อนติดตั้ง: ต้องรีสตาร์ทเกมรอบหนึ่งให้ GSI โหลด. overlay จะขึ้นบนเกมพร้อมข้อมูลสด — กด <b style={{ color: C.ice }}>Ctrl+Alt+S</b> ซ่อน/แสดง.
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
  <section className="settings-group">
    <div className="settings-group-head">{title}</div>
    {children}
  </section>
)
// CR-002 Phase 1: the command deck (<CommandDeck/>) renders in the control
// window. CR-013 W3: `Control` now only ever renders one settings category
// (the deck's iOS-style split view always supplies `category`) — the old
// standalone full-page render + its `embedded` toggle were dead code and
// were deleted.
export const Control: React.FC<{ category: SettingsCat }> = ({ category }) => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [s, setS] = useState<Settings>(loadSettings)
  // CR-008 WP-2: reflects whether an Anthropic key is stored in the DPAPI secret
  // store (backend `has_master_api_key`) — the plaintext is never held here.
  const [apiKeyPresent, setApiKeyPresent] = useState(false)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [status, setStatus] = useState<GsiStatus | null>(null)
  const [resources, setResources] = useState<ResourceStats | null>(null)
  const [captureMode, setCaptureMode] = useState<string>('initializing')
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('gm-onboarded') !== '1')
  const dismissWelcome = () => { localStorage.setItem('gm-onboarded', '1'); setShowWelcome(false) }
  // Overlay preview: feed the overlay a fake in-game tick so you can see the HUD
  // + danger banner (and hear the voice) without launching Dota.
  const [preview, setPreview] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [quotaTick, setQuotaTick] = useState(0)
  const [profiles, setProfiles] = useState<OverlayProfile[]>(loadProfiles)
  const previewTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewClock = useRef(600)
  const sRef = useRef(s)
  const controlActiveRef = useRef(true)
  sRef.current = s

  const saveProfile = (name: string) => {
    const p: OverlayProfile = { name, position: s.position, customX: s.customX, customY: s.customY, opacity: s.opacity, showTimer: s.showTimer, showScore: s.showScore, showHeroBar: s.showHeroBar, showKda: s.showKda, showGold: s.showGold }
    const updated = [...profiles.filter(x => x.name !== name), p]
    setProfiles(updated)
    localStorage.setItem('gm-profiles', JSON.stringify(updated))
  }
  const applyProfile = (p: OverlayProfile) => {
    setS(prev => ({ ...prev, position: p.position, customX: p.customX, customY: p.customY, opacity: p.opacity, showTimer: p.showTimer, showScore: p.showScore, showHeroBar: p.showHeroBar, showKda: p.showKda, showGold: p.showGold }))
  }
  const deleteProfile = (name: string) => {
    const updated = profiles.filter(x => x.name !== name)
    setProfiles(updated)
    localStorage.setItem('gm-profiles', JSON.stringify(updated))
  }

  // Preview emits a synthetic game-tick + preview-mode flag to the overlay.
  // Does NOT emit fake gsi-status — status chips stay real.
  useEffect(() => {
    if (!preview) {
      if (previewTimer.current) { clearInterval(previewTimer.current); previewTimer.current = null }
      void emit('preview-mode', false)
      return
    }
    void emit('preview-mode', true)
    const tickOnce = () => {
      previewClock.current += 2
      const lowPhase = Math.floor(previewClock.current / 14) % 2 === 0
      const hp = lowPhase ? 18 : 80
      void emit('game-tick', {
        in_game: true, clock_time: previewClock.current, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        daytime: true, radiant_score: 12, dire_score: 9, gold: 1500, net_worth: 8200, gpm: 520, xpm: 610,
        kills: 4, deaths: 2, assists: 7, last_hits: 88, denies: 6, hero: 'npc_dota_hero_crystal_maiden',
        level: 9, alive: true, hp_percent: hp, mana_percent: 42,
      })
    }
    tickOnce()
    previewTimer.current = setInterval(tickOnce, 1500)
    return () => { if (previewTimer.current) { clearInterval(previewTimer.current); previewTimer.current = null } }
  }, [preview])

  // CR-013 W2 gate fix (Opus F1): the launch auto-check + install action moved
  // to useAppUpdate (owned by CommandDeck) so it fires regardless of which
  // settings category — or tab — is open. The old `checkUpdateNow`/
  // `installUpdate` here only served the legacy full-page render and were
  // deleted alongside it in CR-013 W3.

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
    const syncControlActive = (focused?: boolean) => {
      const docVisible = document.visibilityState !== 'hidden'
      controlActiveRef.current = focused == null ? docVisible : (docVisible && focused)
    }
    syncControlActive()
    const onVisibility = () => syncControlActive()
    document.addEventListener('visibilitychange', onVisibility)
    let offFocus: (() => void) | null = null
    try {
      void getCurrentWindow().onFocusChanged(({ payload }) => {
        syncControlActive(payload)
      }).then((fn) => { offFocus = fn }).catch(() => {})
    } catch { /* plain-browser dev / non-Tauri runtime */ }
    const u1 = listen<GameTick>('game-tick', (e) => {
      if (!controlActiveRef.current) return
      setTick(e.payload); setSeen(true)
    })
    const u2 = listen('overlay-ready', () => { void emit('settings', sRef.current) })
    const u3 = listen<GsiStatus>('gsi-status', (e) => {
      if (!controlActiveRef.current) return
      setStatus(e.payload)
    })
    const u4ctrl = listen<ResourceStats>('resource-stats', (e) => {
      if (!controlActiveRef.current) return
      setResources(e.payload)
    })
    const u5cap = listen<string>('capture-mode', (e) => {
      if (!controlActiveRef.current) return
      setCaptureMode(e.payload)
    })
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      offFocus?.()
      void u1.then((f) => f()); void u2.then((f) => f()); void u3.then((f) => f()); void u4ctrl.then((f) => f()); void u5cap.then((f) => f())
    }
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

  // CR-007 WP-4 Fix 1: `s.voiceEnabled` gates Maiden's PERSONA voice only.
  // G-Signal's own gate is now owned solely by the deck's audio rail SIGNAL
  // toggle (CommandDeck.tsx, `set_cv_signal_enabled`) — this effect used to
  // also push `set_cv_signal_enabled` here, which meant muting persona voice
  // silently desynced the deck's SIGNAL toggle (two owners writing the same
  // backend flag). Do not re-add an invoke('set_cv_signal_enabled', ...) call
  // keyed off s.voiceEnabled; see CR-007-frostline-deck-refresh.md WP-4.

  // Mirror the user's chosen gank-warning sensitivity to the Rust capture loop
  // (applied on the next CV tick — no restart needed).
  useEffect(() => {
    void invoke('set_cv_signal_sensitivity', { level: s.signalSensitivity }).catch(() => {})
  }, [s.signalSensitivity])

  // Telemetry source for the deck footer (GPU/CPU-temp): auto/feeder/gtelemetry/off.
  useEffect(() => {
    const src = { auto: 0, feeder: 1, gtelemetry: 2, off: 3 }[s.telemetrySource] ?? 0
    void invoke('set_telemetry_source', { source: src }).catch(() => {})
  }, [s.telemetrySource])

  // G-Master backend & ollama model — mirror to the Rust state used by advise().
  useEffect(() => {
    void invoke('set_master_backend', { backend: s.masterBackend }).catch(() => {})
  }, [s.masterBackend])
  useEffect(() => {
    void invoke('set_master_ollama_model', { name: s.masterOllamaModel }).catch(() => {})
  }, [s.masterOllamaModel])
  // G-Master auth MODE only (plan vs apikey). CR-008 WP-2: the key is owned by
  // the DPAPI secret store, not this effect — pushing it here would clobber the
  // startup-loaded key with '' (gate finding B2).
  useEffect(() => {
    void invoke('set_master_mode', { auth: s.masterAuth }).catch(() => {})
  }, [s.masterAuth])

  // CR-008 WP-2: store/clear the Anthropic key in the DPAPI secret store (backend
  // owns the plaintext). Passing '' clears it. Refresh saved-state from the
  // backend rather than trusting the local string.
  const saveMasterApiKey = async (k: string) => {
    try {
      await invoke('set_master_api_key', { key: k })
      setApiKeyPresent(await invoke<boolean>('has_master_api_key'))
    } catch { /* not under Tauri (browser dev) — nothing to persist */ }
  }

  // CR-008 WP-2 one-time migration: move a legacy plaintext key out of the
  // localStorage settings blob into the DPAPI store, then scrub it. We read the
  // value straight from localStorage (source of truth, independent of the `[s]`
  // save-effect ordering) and only delete the plaintext AFTER a confirmed DPAPI
  // write — on any failure the plaintext is kept and retried next launch (no
  // silent loss). Also seeds `apiKeyPresent` from the backend.
  useEffect(() => {
    void (async () => {
      try {
        const raw = JSON.parse(localStorage.getItem('gm-settings') ?? '{}') as Record<string, unknown>
        const legacy = typeof raw.masterApiKey === 'string' ? raw.masterApiKey.trim() : ''
        if (legacy) {
          await invoke('set_master_api_key', { key: legacy }) // throws → caught, plaintext kept
          delete raw.masterApiKey
          localStorage.setItem('gm-settings', JSON.stringify(raw))
          setS((p) => { const cp: Record<string, unknown> = { ...p }; delete cp.masterApiKey; return cp as unknown as Settings })
        }
      } catch { /* not under Tauri, or DPAPI write failed — keep plaintext, retry next launch */ }
      try { setApiKeyPresent(await invoke<boolean>('has_master_api_key')) } catch { /* browser dev */ }
    })()
  }, [])

  // Toggle in-game calibration evidence capture (off by default; QA/tuning mode).
  useEffect(() => {
    void invoke('set_calibration_enabled', { enabled: s.calibration }).catch(() => {})
  }, [s.calibration])

  // Silent-arm efficacy study opt-in (RWANG TASK 2) — off by default, local only.
  useEffect(() => {
    void invoke('set_efficacy_enabled', { enabled: s.efficacyStudy }).catch(() => {})
  }, [s.efficacyStudy])

  // Sync master volume to Rust audio backend on user-driven changes only.
  // CR-007 WP-4 Fix 1: the deck's audio rail is now the single owner that
  // pushes volume on MOUNT (CommandDeck.tsx) — if this effect also fired on
  // mount (it did: a `[s.volume]`-keyed effect runs on the initial render
  // too), Control's locally-loaded `s.volume` could stomp the rail's
  // just-pushed value the instant Control mounted (e.g. opening Settings).
  // The skip-first-run guard below means this only invokes on an actual
  // subsequent change, while the existing `volume-change` listener below
  // keeps Control's own slider in sync with whoever else changed it.
  const volumeFirstRun = useRef(true)
  useEffect(() => {
    if (volumeFirstRun.current) { volumeFirstRun.current = false; return }
    void invoke('set_volume', { vol: s.volume }).catch(() => {})
  }, [s.volume])

  // Listen for hotkey-driven volume changes from the backend (Alt+Up/Down/M).
  useEffect(() => {
    const u = listen<number>('volume-change', (e) => {
      setS((prev) => ({ ...prev, volume: e.payload }))
    })
    return () => { void u.then((f) => f()) }
  }, [])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }))

  // CR-013 W2 (§4 + §4.3 "move the skin, not the brain"): render ONLY the
  // given category's groups — bare, no outer page chrome (no app header, no
  // update/exclusive-fullscreen banners floating loose, no 2-col grid). The
  // deck (CommandDeck.tsx) always supplies a `category`; the old full-page
  // render (app header, 2-col grid, updater banner) was dead code and was
  // deleted in CR-013 W3.
  return (
    <>
      {showWelcome && <Welcome onDone={dismissWelcome} />}
      <div className="settings-detail-body">
        {category === 'overlay' && (
          <>
            <Card title="Overlay (OSD)">
              <Row label="แสดง overlay บนเกม"><Toggle on={s.overlayVisible} onChange={(v) => set('overlayVisible', v)} /></Row>
              <Row label="ตำแหน่ง"><Seg value={s.position} options={[['top', 'บน'], ['left', 'ซ้าย'], ['right', 'ขวา'], ['custom', 'กำหนดเอง']]} onChange={(v) => set('position', v)} /></Row>
              {s.position === 'custom' && (
                <>
                  <Row label={`X: ${s.customX}%`}>
                    <input type="range" min={0} max={100} value={s.customX} onChange={(e) => set('customX', Number(e.target.value))} style={{ width: 150 }} />
                  </Row>
                  <Row label={`Y: ${s.customY}%`}>
                    <input type="range" min={0} max={90} value={s.customY} onChange={(e) => set('customY', Number(e.target.value))} style={{ width: 150 }} />
                  </Row>
                </>
              )}
              <Row label={`ความทึบพาเนล: ${Math.round(s.opacity * 100)}%`}>
                <input type="range" min={40} max={100} value={Math.round(s.opacity * 100)} onChange={(e) => set('opacity', Number(e.target.value) / 100)} style={{ width: 150 }} />
              </Row>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderTop: '1px solid rgba(143,212,255,0.08)' }}>
                <span style={{ fontSize: 13.5 }}>แผงสถิติ overlay</span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {([['showTimer', 'นาฬิกา'], ['showScore', 'สกอร์'], ['showHeroBar', 'HP/Mana'], ['showKda', 'K/D/A'], ['showGold', 'ทอง/NW']] as [keyof Settings, string][]).map(([k, label]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: s[k] ? C.txt : C.mut, cursor: 'pointer' }}>
                      <input type="checkbox" checked={s[k] as boolean} onChange={(e) => set(k, e.target.checked as never)} style={{ accentColor: C.ice }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <Row label="ทดสอบ overlay (จำลอง ไม่ต้องเปิดเกม)"><Toggle on={preview} onChange={setPreview} /></Row>
              {profiles.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: C.mut }}>โปรไฟล์:</span>
                  {profiles.map(p => (
                    <span key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(143,212,255,0.08)', border: `1px solid ${C.line}`, borderRadius: 7, padding: '3px 8px', fontSize: 11.5 }}>
                      <button onClick={() => applyProfile(p)} style={{ background: 'none', border: 'none', color: C.ice, cursor: 'pointer', padding: 0, fontSize: 11.5 }}>{p.name}</button>
                      <button onClick={() => deleteProfile(p.name)} style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.6 }}>
                  💡 <b style={{ color: C.ice }}>Ctrl+Alt+S</b> ซ่อน/แสดง · <b style={{ color: C.ice }}>Alt+↑/↓</b> ระดับเสียง · <b style={{ color: C.ice }}>Alt+M</b> ปิด/เปิดเสียง
                </div>
                <button onClick={() => { const n = prompt('ชื่อโปรไฟล์:'); if (n?.trim()) saveProfile(n.trim()) }}
                  style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                  + บันทึกโปรไฟล์
                </button>
              </div>
            </Card>

            <Card title="Overlay UI">
              <Row label="โหมดหน้าตา overlay">
                <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
                  {(['lite', 'full'] as const).map((m) => (
                    <button key={m} onClick={() => set('uiMode', m)}
                      style={{ background: s.uiMode === m ? 'rgba(143,212,255,0.16)' : 'transparent', color: s.uiMode === m ? C.ice : C.mut, border: 'none', padding: '6px 16px', cursor: 'pointer', fontSize: 12 }}>
                      {m === 'lite' ? 'Lite (เดิม)' : 'Full (redesign)'}
                    </button>
                  ))}
                </div>
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                <b style={{ color: C.txt }}>Lite</b> = overlay เดิม เบา เสถียร · <b style={{ color: C.txt }}>Full</b> = ดีไซน์ใหม่ (โมดูลแยกชิ้น, glass) — กำลังพัฒนา
              </div>
              {s.uiMode === 'full' && <LayoutEditor value={s.layout} onChange={(l) => set('layout', l)} />}
            </Card>
          </>
        )}

        {category === 'voice' && (
          <>
            <Card title="Alerts (G-Signal)">
              <Row label="เตือนเมื่อ HP ต่ำ"><Toggle on={s.alertEnabled} onChange={(v) => set('alertEnabled', v)} /></Row>
              <Row label={`ขีดเตือน HP: ${s.alertThreshold}%`}>
                <input type="range" min={10} max={50} value={s.alertThreshold} onChange={(e) => set('alertThreshold', Number(e.target.value))} style={{ width: 150 }} disabled={!s.alertEnabled} />
              </Row>
              <Row label="เสียงพูด (Maiden)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => void invoke('speak', { text: 'G-Maiden voice test. ทดสอบเสียงค่ะ เลือดน้อยแล้ว ถอยก่อน', voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})} disabled={!s.voiceEnabled}
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
              <Row label={`ระดับเสียง: ${s.volume}%${s.volume === 0 ? ' (ปิดเสียง)' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => set('volume', s.volume === 0 ? 80 : 0)}
                    style={{ background: 'transparent', color: s.volume === 0 ? C.bad : C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 8px', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>
                    {s.volume === 0 ? '🔇' : s.volume <= 30 ? '🔈' : s.volume <= 70 ? '🔉' : '🔊'}
                  </button>
                  <input type="range" min={0} max={100} step={5} value={s.volume} onChange={(e) => set('volume', Number(e.target.value))} style={{ width: 130 }} />
                </div>
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

            <Card title="G-Signal — แบนเนอร์แจ้งเตือน">
              <Row label="แบนเนอร์เตือนแก๊งค์ (gank)"><Toggle on={s.gankVisuals} onChange={(v) => set('gankVisuals', v)} /></Row>
              <Row label="แบนเนอร์ฆ่า / สตรีค (kill banner)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => { void emit('preview-kill', { streak: 5, victim: 'npc_dota_hero_lina' }); void invoke('speak_event', { event: 'mega_kill', fallback: 'เมก้าคิล!', voice: null, rate: null }).catch(() => {}) }}
                    title="โชว์ตัวอย่างแบนเนอร์บน overlay (ต้องเปิด overlay อยู่)"
                    style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 11px', fontSize: 12, cursor: 'pointer' }}>▶ ดูตัวอย่าง</button>
                  <Toggle on={s.killVisuals} onChange={(v) => set('killVisuals', v)} />
                </div>
              </Row>
              <Row label="ความไวเตือนแก๊งค์">
                <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
                  {(['low','med','high'] as Sensitivity[]).map((lv) => (
                    <button key={lv} onClick={() => set('signalSensitivity', lv)}
                      style={{ background: s.signalSensitivity === lv ? 'rgba(143,212,255,0.16)' : 'transparent', color: s.signalSensitivity === lv ? C.ice : C.mut, border: 'none', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
                      {lv === 'low' ? 'ตึง (≥85%)' : lv === 'med' ? 'สมดุล (≥65%)' : 'ไว (≥50%)'}
                    </button>
                  ))}
                </div>
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                แบนเนอร์ขึ้นกลาง-บนของจอเมื่อ G-Signal เตือนแก๊งค์ (ไม่บังมินิแมพ).
              </div>
            </Card>

            <AudioSettingsCard />
          </>
        )}

        {category === 'ai' && (
          <>
            <MasterCard tick={tick} voice={s.voiceName} rate={s.voiceRate} enabled={s.masterEnabled} onEnabledChange={(v) => set('masterEnabled', v)} autoAdvice={s.autoAdvice} onAutoAdviceChange={(v) => set('autoAdvice', v)} backend={s.masterBackend} onBackendChange={(b) => set('masterBackend', b)} auth={s.masterAuth} onAuthChange={(a) => set('masterAuth', a)} apiKeyPresent={apiKeyPresent} onApiKeySave={saveMasterApiKey} ollamaModel={s.masterOllamaModel} onOllamaModelChange={(m) => set('masterOllamaModel', m)} onUsageChanged={() => setQuotaTick((n) => n + 1)} />
            <QuotaCard refreshTrigger={quotaTick} />
          </>
        )}

        {category === 'modules' && (
          <>
            <Card title="Modules &amp; System">
              {(() => {
                const capAcc = captureMode === 'dxgi' ? C.ok : captureMode === 'lite' ? C.warn : C.mut
                const capLabel = captureMode === 'dxgi' ? 'DXGI' : captureMode === 'lite' ? 'Lite' : '…'
                const capTitle = captureMode === 'dxgi'
                  ? 'DXGI Desktop Duplication — minimap detection active'
                  : captureMode === 'lite'
                    ? 'Minimap detection ปิดอยู่ — ใช้ borderless fullscreen เพื่อเปิด full detection เต็มรูปแบบ'
                    : 'กำลังเริ่มต้น capture'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, fontSize: 11.5, color: C.mut }}>
                    <span>Capture</span>
                    <span title={capTitle} style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: capAcc, background: `${capAcc}1f`, border: `1px solid ${capAcc}` }}>{capLabel}</span>
                  </div>
                )
              })()}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, paddingTop: 6, fontSize: 12.5 }}>
                {[
                  ['G-Sentry', 'fog-of-war monitor'],
                  ['G-Motion', 'gank prediction'],
                  ['G-Signal', 'voice gank warning'],
                  ['G-Master', 'advisor (Claude Plan + SLM fallback)'],
                  ['G-Damage', 'burst lethality engine'],
                  ['G-Log', 'match history'],
                ].map(([mod, desc]) => (
                  <span key={mod} style={{ color: C.ok }}>
                    <span style={{ color: C.ok }}>✓</span> <b style={{ color: C.ice }}>{mod}</b>
                    <span style={{ color: C.mut }}> — {desc}</span>
                  </span>
                ))}
              </div>
              {resources && (
                <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 10, paddingTop: 8, display: 'flex', gap: 20, fontSize: 12 }}>
                  <span style={{ color: resources.ram_mb > 400 ? C.bad : C.ok }}>
                    RAM: <b>{resources.ram_mb.toFixed(0)} MB</b> / 400 MB
                  </span>
                  <span style={{ color: resources.cpu_pct > 2.5 ? C.bad : C.ok }}>
                    CPU: <b>{resources.cpu_pct.toFixed(1)}%</b> / 2.5%
                  </span>
                  {resources.over_budget && (
                    <span style={{ color: C.warn }}>⚠ เกิน budget — อาจลดความถี่ CV</span>
                  )}
                </div>
              )}
            </Card>

            <Card title="G-Signal / CV (calibrate)">
              <Row label="CV debug overlay (calibrate)"><Toggle on={s.cvDebug} onChange={(v) => set('cvDebug', v)} /></Row>
              <Row label="Calibration capture (audit: screenshot + clip) — QA"><Toggle on={s.calibration} onChange={(v) => set('calibration', v)} /></Row>
              <Row label="แหล่งข้อมูล GPU/อุณหภูมิ (telemetry)">
                <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
                  {(['auto','feeder','gtelemetry','off'] as Settings['telemetrySource'][]).map((src) => (
                    <button key={src} onClick={() => set('telemetrySource', src)}
                      title={src === 'auto' ? 'ใช้ G-Telemetry ถ้ามี ไม่งั้น feeder' : src === 'feeder' ? 'gpu-feeder ในตัว (เบา, GPU อย่างเดียว)' : src === 'gtelemetry' ? 'G-Telemetry (ละเอียด: CPU temp, ~200ms)' : 'ปิด'}
                      style={{ background: s.telemetrySource === src ? 'rgba(143,212,255,0.16)' : 'transparent', color: s.telemetrySource === src ? C.ice : C.mut, border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
                      {src === 'auto' ? 'อัตโนมัติ' : src === 'feeder' ? 'Feeder' : src === 'gtelemetry' ? 'G-Telemetry' : 'ปิด'}
                    </button>
                  ))}
                </div>
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                CV debug แสดงกรอบมินิแมพ + จุดที่ตรวจจับได้ — เปิดเฉพาะตอนปรับเทียบ. แหล่ง telemetry: <b>Feeder</b> = gpu-feeder ในตัว (GPU); <b>G-Telemetry</b> = แอปแยก (เพิ่ม CPU temp, ~200ms) ต้องเปิดแอปนั้น.
              </div>
            </Card>
          </>
        )}

        {category === 'privacy' && (
          <>
            <Card title="ความเป็นส่วนตัว">
              <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.6, paddingTop: 6 }}>
                ข้อมูลแมตช์ (G-Log), สถานะเกมสด และผลตรวจจับจาก CV <b style={{ color: C.txt }}>อยู่ในเครื่องนี้เท่านั้น</b> โดยดีฟอลต์ —
                ผลตรวจจับ CV จะไม่ถูกส่งออกจากเครื่องไม่ว่ากรณีใด การเข้าสู่ระบบ (บัญชี) และการแชร์ข้อมูลแมตช์เพื่อแลกเครดิตเป็นคนละ opt-in
                แยกจากกัน และไม่ผูกกัน — ล็อกอินไม่ได้แปลว่าข้อมูลแมตช์ถูกแชร์ไปด้วย
              </div>
              <Row label="การศึกษาประสิทธิภาพ (สุ่มปิดเสียงเตือนบางแมตช์เพื่อวัดผล — ข้อมูลอยู่ในเครื่องเท่านั้น)">
                <Toggle on={s.efficacyStudy} onChange={(v) => set('efficacyStudy', v)} />
              </Row>
            </Card>
            {s.efficacyStudy && <EfficacyCard />}
          </>
        )}

        {category === 'system' && (
          <>
            {status?.display_exclusive && (
              <div style={{ ...panel(0.9), padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${C.warn}` }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.warn }}>Dota อยู่ในโหมด Exclusive Fullscreen</div>
                  <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.55, marginTop: 2 }}>
                    Overlay และการอ่าน minimap จะไม่ทำงาน และจออาจค้าง — สลับเป็น <b style={{ color: C.txt }}>Borderless</b> ที่
                    Dota → Settings → Video → Display Mode (บน Windows ยุคนี้ FPS แทบไม่ต่างจาก fullscreen)
                  </div>
                </div>
              </div>
            )}

            {/* CR-013 W2 gate fix (Opus F1): the update banner + version/
                update-check moved to the deck-owned settings shell (always
                visible, launch auto-check) — see CommandDeck.tsx + useAppUpdate.
                This category keeps GSI/diagnostics only. */}

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

            <Card title="ระบบ">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 11.5, color: C.mut }}>GSI: http://127.0.0.1:3000/gsi</span>
                <button onClick={() => setShowChangelog(true)}
                  style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                  มีอะไรใหม่
                </button>
              </div>
            </Card>

            {showChangelog && (
              <div onClick={() => setShowChangelog(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div onClick={e => e.stopPropagation()} style={{ ...panel(0.94), maxWidth: 520, maxHeight: '80vh', overflow: 'auto', padding: '24px 28px', width: '90%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.ice }}>Changelog</span>
                    <button onClick={() => setShowChangelog(false)}
                      style={{ background: 'transparent', color: C.mut, border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                  </div>
                  {CHANGELOG.map(entry => (
                    <div key={entry.ver} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: entry.ver === APP_VERSION ? C.ice : C.txt }}>
                        v{entry.ver} <span style={{ fontWeight: 400, color: C.mut, fontSize: 11.5 }}>{entry.date}</span>
                        {entry.ver === APP_VERSION && <span style={{ marginLeft: 8, fontSize: 10, background: C.ice, color: '#0c1018', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>ปัจจุบัน</span>}
                      </div>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12.5, color: C.txt, lineHeight: 1.7 }}>
                        {entry.items.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

export const App: React.FC = () => {
  // getCurrentWindow() throws outside a Tauri runtime (e.g. plain-browser dev
  // preview). Default to the control window so the deck still renders.
  let label = 'control'
  try { label = getCurrentWindow().label } catch { /* not running under Tauri */ }
  // Overlay window keeps the original transparent CV/voice overlay. The control
  // window now renders the ported command-deck shell (CR-002 Phase 1).
  // The real settings panel (legacy Control) mounts inside the deck's Settings
  // tab — passed as a RENDER PROP (CR-013 W2) so CommandDeck can request just
  // one category at a time (its iOS-style split view) without importing App
  // (no module cycle) and without Control ever needing to know about tabs/rails.
  return label === 'overlay' ? <Overlay /> : <CommandDeck renderSettings={(cat) => <Control category={cat} />} />
}
