import { DEFAULT_LAYOUT, type Layout } from '../overlay/modules'
import { PERSONA_LINES } from './lines'

export type MatchLifecycle = 'draft' | 'live' | 'disconnected' | 'end' | 'abandon'
export interface MatchSessionMetadata {
  match_id?: string | null
  session_id?: string | null
  session_epoch?: number
  session_lifecycle?: MatchLifecycle | null
}

export interface MissingState extends MatchSessionMetadata {
  heroes: string[]
  /** Current Sentry-confirmed observations; roster identity alone is insufficient. */
  visible_heroes: string[]
  observations: { hero: string; missing_for_ms: number; last_pos: [number, number] }[]
  roster_known: number
  ready: boolean
  reason: string
}

/** Mirrors the Rust `GameTick` emitted by the GSI server (src-tauri/src/gsi.rs). */
export interface GameTick extends MatchSessionMetadata {
  local_player_verified?: boolean
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
  // populates it for a single kill, the banner can show the victim; otherwise
  // use generic wording. Missing-map evidence never identifies a victim.
  last_victim_hero?: string
}

/** CV/G-Signal events emitted by the Rust backend (src-tauri cv pipeline). */
export interface MinimapCv extends MatchSessionMetadata {
  region: { x: number; y: number; side: number }
  icon: number
  candidates: [number, number][]
  count: number
  detections: { label: number; name: string; x: number; y: number; score: number }[]
  classifier: boolean
}
export interface GankAlert extends MatchSessionMetadata { probability: number; missing_heroes: string[]; eta_ms: number }
/** G2.6: emitted by G-Sentry when a hero crosses the 5s missing threshold. */
export interface EnemyMissing extends MatchSessionMetadata { hero: string; missing_for_ms: number; last_pos: [number, number] }
/** G5.4: advice broadcast from master.rs → overlay. */
export interface AdviceUpdate extends MatchSessionMetadata, Advice {}
/** G-Revive: deterministic buyback verdict (revive.rs → `buyback-advice`).
 *  Mirrors `ReviveAdvice`; `urgency` is the serde-serialized `Urgency` enum. */
export type BuybackUrgency = 'Unknown' | 'None' | 'Consider' | 'Strong'
export interface BuybackIdentity {
  death_episode: number
  request_id: number
}
export interface BuybackNarrative extends MatchSessionMetadata, BuybackIdentity { text: string }
export interface ReviveAdvice extends MatchSessionMetadata, BuybackIdentity {
  /** null means the available evidence cannot support a buyback decision. */
  recommend_buyback: boolean | null
  urgency: BuybackUrgency
  base_under_threat: boolean | null
  allies_alive: number | null
  natural_respawn_remaining: number
  affordable: boolean | null
  next_respawn_if_buyback: number
  reason: string
}
export type GsiFreshness = 'unavailable' | 'waiting' | 'fresh' | 'stale'

/** Connection and validated-source age pushed by the Rust watchdog (gsi.rs). */
export interface GsiStatus extends MatchSessionMetadata {
  dota_running: boolean
  gsi_active: boolean
  gsi_freshness: GsiFreshness
  gsi_age_ms: number | null
  in_game: boolean
  display_exclusive: boolean
  server_state: 'starting' | 'listening' | 'port_conflict' | 'bind_error'
  gsi_port?: number
  dota_restart_required?: boolean
}

export interface AnnouncerBanner extends MatchSessionMetadata {
  event: string
  bannerData: string | null
  bannerText: string
  thai: string
  clip: string | null
}

export interface SessionTextEvent extends MatchSessionMetadata { text: string }

/** sensor-health (capture.rs) — the overlay's copy of the minimap-sensor
 * contract. Mirrors `live/events.ts`'s `SensorHealth`; duplicated rather than
 * imported because the Overlay window's type surface is deliberately kept
 * independent of the deck's `live/` builders. Branch on `healthy` before
 * rendering any affirmative "safe" reading — an empty missing-hero set is
 * produced both by a genuinely clear map and by a sensor that isn't running. */
export interface SensorHealth {
  backend: 'dxgi' | 'gdi' | 'lite'
  classifier: boolean
  throttled: boolean
  /** null in Lite mode: no capture loop means no frame clock to report. */
  frameAgeMs: number | null
  healthy: boolean
}

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
  announcerEnabled: boolean
  signalEnabled: boolean
  personaLines: boolean
  autoAdvice: boolean
  gankVisuals: boolean
  killVisuals: boolean
  signalSensitivity: Sensitivity
  masterEnabled: boolean
  masterBackend: 'auto' | 'claude' | 'ollama'
  cloudContextOptIn: boolean
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
export const DEFAULTS: Settings = { overlayVisible: true, position: 'top', customX: 50, customY: 2, opacity: 0.72, alertEnabled: true, alertThreshold: 25, voiceEnabled: true, voiceName: '', voiceRate: 0, volume: 80, announcerEnabled: true, signalEnabled: true, personaLines: true, autoAdvice: false, gankVisuals: true, killVisuals: true, signalSensitivity: 'med', masterEnabled: true, masterBackend: 'auto', cloudContextOptIn: false, masterAuth: 'plan', masterOllamaModel: 'qwen3.5:4b', cvDebug: false, calibration: false, efficacyStudy: false, telemetrySource: 'auto', uiMode: 'full', layout: DEFAULT_LAYOUT, showTimer: false, showScore: false, showHeroBar: false, showKda: false, showGold: false, personaPreset: 'coach' }
export interface OverlayProfile { name: string; layout?: Layout; position: Pos; customX: number; customY: number; opacity: number; showTimer: boolean; showScore: boolean; showHeroBar: boolean; showKda: boolean; showGold: boolean }

export interface VoiceInfo { name: string; culture: string; gender: string; age: string }
/** G7.2: one-second governor stats; CPU covers the Windows process group. */
export interface ResourceStats { ram_mb: number; cpu_pct: number; cpu_group_processes: number; over_budget: boolean }

export type GankState = { phase: 'alert'; heroes: string[]; probability: number } | { phase: 'clear' } | null

// ─────────────────────────────── SETUP (GSI config auto-install) ───────────────────────────────
export interface SetupStatus {
  installed: boolean
  steam_path: string | null
  dota_cfg_dir: string | null
  cfg_present: boolean
  cfg_valid: boolean
  message: string
}

// ─────────────────────────────── AUDIO SETTINGS (unified voice pack + event manager) ───────────────────────────────
export interface VoiceCacheStatus { dir: string; counts: Record<string, number>; total: number }
export interface EventClip { name: string; path: string; source: string }

// ─────────────────────────────── G-MASTER (local-first advisor) ───────────────────────────────
export interface Advice { text: string; cached: boolean; context_generation: number; backend?: 'claude' | 'ollama'; elapsed_ms?: number; cached_age_ms?: number | null }
export type MasterBackend = 'auto' | 'claude' | 'ollama'
export type OllamaReadinessState = 'available' | 'missing-model' | 'unavailable' | 'invalid-model'
export interface OllamaReadiness {
  state: OllamaReadinessState
  model: string
  detail: string | null
  probeTimeoutMs: number
  requestTimeoutMs: number
}
export interface MasterReadiness {
  backend: MasterBackend
  cloudContextOptIn: boolean
  route: 'local-only' | 'cloud-only' | 'cloud-then-local' | 'cloud-blocked-by-opt-in'
  ollama: OllamaReadiness
  claudeCli: { executableDetected: boolean; authenticationVerified: boolean }
  anthropicApi: { apiKeySaved: boolean; credentialVerified: boolean }
  deterministicLocalFallback: boolean
  claudeRequestTimeoutMs: number
  autoClaudeAttemptTimeoutMs: number
  ollamaRequestTimeoutMs: number
  maxAdviceRequestTimeoutMs: number
  costNote: string
}

// ─────────────────────────────── G-LOG (local match logging) ───────────────────────────────
export interface MatchLog { name: string; size: number; modified_ms: number }

// Silent-arm efficacy study result (RWANG TASK 2). Read-only — shows the
// user their OWN warned-vs-silent death rate, computed entirely on-device by
// `efficacy_summary` from the local match logs. Only rendered when the user
// has opted into `efficacyStudy`.
export interface EfficacyArm { events: number; deaths: number; rate: number | null }
export interface EfficacySummary { armed: EfficacyArm; silent: EfficacyArm }

export type PersonaEvent = keyof typeof PERSONA_LINES
