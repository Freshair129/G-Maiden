import { DEFAULT_LAYOUT, type Layout } from '../overlay/modules'
import { PERSONA_LINES } from './lines'

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
  /** GSI `hero.respawn_seconds` — live respawn countdown, 0 while alive.
   *  Rust has carried this since G-Revive; declared here so the buyback card
   *  can count down with the real timer instead of a frozen snapshot. */
  respawn_seconds: number
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
export interface MinimapCv {
  region: { x: number; y: number; side: number }
  icon: number
  candidates: [number, number][]
  count: number
  detections: { label: number; name: string; x: number; y: number; score: number }[]
  classifier: boolean
}
export interface GankAlert { probability: number; missing_heroes: string[]; eta_ms: number }
/** G2.6: emitted by G-Sentry when a hero crosses the 5s missing threshold. */
export interface EnemyMissing { hero: string; missing_for_ms: number; last_pos: [number, number] }
/** G5.4: advice broadcast from master.rs → overlay. */
export interface AdviceUpdate { text: string; cached: boolean }
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
export interface GsiStatus { dota_running: boolean; gsi_active: boolean; in_game: boolean; display_exclusive: boolean }

export type Pos = 'top' | 'left' | 'right' | 'custom'
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
  personaPreset: 'coach' | 'silent' | 'caster' | 'meme'
}
export const DEFAULTS: Settings = { overlayVisible: true, position: 'top', customX: 50, customY: 2, opacity: 0.72, alertEnabled: true, alertThreshold: 25, voiceEnabled: true, voiceName: '', voiceRate: 0, volume: 80, personaLines: true, autoAdvice: false, gankVisuals: true, killVisuals: true, signalSensitivity: 'med', masterEnabled: true, masterBackend: 'auto', masterAuth: 'plan', masterOllamaModel: 'qwen3.5:4b', cvDebug: false, calibration: false, efficacyStudy: false, telemetrySource: 'auto', uiMode: 'full', layout: DEFAULT_LAYOUT, showTimer: false, showScore: false, showHeroBar: false, showKda: false, showGold: false, personaPreset: 'coach' }
export interface OverlayProfile { name: string; position: Pos; customX: number; customY: number; opacity: number; showTimer: boolean; showScore: boolean; showHeroBar: boolean; showKda: boolean; showGold: boolean }

export interface VoiceInfo { name: string; culture: string; gender: string; age: string }
/** G7.2: resource-governor stats emitted every 10s from governor.rs */
export interface ResourceStats { ram_mb: number; cpu_pct: number; over_budget: boolean }

export type GankState = { phase: 'alert'; heroes: string[]; probability: number } | { phase: 'clear' } | null

// ─────────────────────────────── SETUP (GSI config auto-install) ───────────────────────────────
export interface SetupStatus {
  installed: boolean
  steam_path: string | null
  dota_cfg_dir: string | null
  cfg_present: boolean
  message: string
}

// ─────────────────────────────── AUDIO SETTINGS (unified voice pack + event manager) ───────────────────────────────
export interface VoiceCacheStatus { dir: string; counts: Record<string, number>; total: number }
export interface EventClip { name: string; path: string; source: string }

// ─────────────────────────────── G-MASTER (Claude Plan advisor) ───────────────────────────────
export interface Advice { text: string; cached: boolean }
export type MasterBackend = 'auto' | 'claude' | 'ollama'

// ─────────────────────────────── G-LOG (local match logging) ───────────────────────────────
export interface MatchLog { name: string; size: number; modified_ms: number }

// Silent-arm efficacy study result (RWANG TASK 2). Read-only — shows the
// user their OWN warned-vs-silent death rate, computed entirely on-device by
// `efficacy_summary` from the local match logs. Only rendered when the user
// has opted into `efficacyStudy`.
export interface EfficacyArm { events: number; deaths: number; rate: number | null }
export interface EfficacySummary { armed: EfficacyArm; silent: EfficacyArm }

export type PersonaEvent = keyof typeof PERSONA_LINES
