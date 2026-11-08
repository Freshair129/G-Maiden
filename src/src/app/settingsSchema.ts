import { DEFAULTS, type Settings } from './types'
import { DEFAULT_LAYOUT, MODULE_META, type Layout, type ModuleId } from '../overlay/modules'

const SETTINGS_FIELDS = [
  'showTimer', 'showScore', 'showHeroBar', 'showKda', 'showGold',
] as const

export type RecordValue = Record<string, unknown>

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
}

export function parseObjectJson(value: unknown): RecordValue | null {
  if (typeof value !== 'string') return asRecord(value)
  try { return asRecord(JSON.parse(value)) } catch { return null }
}

function withLegacyStats(value: unknown): RecordValue {
  const raw = asRecord(value) ?? {}
  const migrated = { ...raw }
  if (raw.showStats === true) {
    for (const field of SETTINGS_FIELDS) {
      if (typeof migrated[field] !== 'boolean') migrated[field] = true
    }
  }
  delete migrated.showStats
  return migrated
}

function boolValue(raw: RecordValue, key: string, fallback: boolean): boolean {
  return typeof raw[key] === 'boolean' ? raw[key] as boolean : fallback
}

function numberValue(
  raw: RecordValue,
  key: string,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  const value = raw[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const bounded = Math.min(max, Math.max(min, value))
  return integer ? Math.round(bounded) : bounded
}

function stringValue(raw: RecordValue, key: string, fallback: string, maxLength: number): string {
  const value = raw[key]
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  const hasControlCharacter = Array.from(trimmed).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })
  if (trimmed.length > maxLength || hasControlCharacter) return fallback
  return trimmed
}

function enumValue<T extends string>(
  raw: RecordValue,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw[key]
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function normalizeLayout(value: unknown, fallback: Layout): Layout {
  const rawLayout = asRecord(value)
  const next = {} as Layout
  for (const { id } of MODULE_META) {
    const source = asRecord(rawLayout?.[id])
    const base = fallback[id] ?? DEFAULT_LAYOUT[id]
    next[id as ModuleId] = {
      x: numberValue(source ?? {}, 'x', base.x, 0, 100),
      y: numberValue(source ?? {}, 'y', base.y, 0, 100),
      scale: numberValue(source ?? {}, 'scale', base.scale, 0.25, 4),
      enabled: boolValue(source ?? {}, 'enabled', base.enabled),
    }
  }
  return next
}

// Frozen DEFAULT_LAYOUT at 4f19eb83ed80146a4cffe8b8de9baeb20eb3ded5^:
// src/src/overlay/modules.ts, immediately before the #91 right-side layout.
const PRE_91_DEFAULT_LAYOUT = Object.freeze({
  alert: Object.freeze({ x: 50, y: 20, scale: 1, enabled: true }),
  gmeter: Object.freeze({ x: 7, y: 47, scale: 1, enabled: true }),
  toast: Object.freeze({ x: 50, y: 24, scale: 1, enabled: true }),
  companion: Object.freeze({ x: 7, y: 39, scale: 1, enabled: true }),
  advice: Object.freeze({ x: 50, y: 72, scale: 1, enabled: true }),
  buyback: Object.freeze({ x: 50, y: 63, scale: 1, enabled: true }),
  missing: Object.freeze({ x: 88, y: 12, scale: 1, enabled: true }),
  banner: Object.freeze({ x: 84, y: 27, scale: 1, enabled: true }),
  lowhp: Object.freeze({ x: 50, y: 44, scale: 1, enabled: true }),
  vol: Object.freeze({ x: 20, y: 95, scale: 1, enabled: true }),
  standby: Object.freeze({ x: 92, y: 14, scale: 1, enabled: true }),
  clock: Object.freeze({ x: 4, y: 4, scale: 1, enabled: true }),
  kda: Object.freeze({ x: 9.5, y: 4, scale: 1, enabled: true }),
  gold: Object.freeze({ x: 15, y: 4, scale: 1, enabled: true }),
  gpm: Object.freeze({ x: 20.5, y: 4, scale: 1, enabled: true }),
  xpm: Object.freeze({ x: 20.5, y: 10, scale: 1, enabled: false }),
  nw: Object.freeze({ x: 26, y: 4, scale: 1, enabled: true }),
  score: Object.freeze({ x: 75, y: 4, scale: 1, enabled: false }),
  hero: Object.freeze({ x: 14, y: 33, scale: 1, enabled: false }),
} satisfies Layout)

// Frozen #91 defaults: 4f19eb83ed80146a4cffe8b8de9baeb20eb3ded5:
// src/src/overlay/modules.ts; unchanged through 6a26d628992f0267ef4d848d92f2050bdbfa3c0f.
// Includes the owner's 2026-11-08 reset. Never derive historical values from DEFAULT_LAYOUT.
const POST_91_DEFAULT_LAYOUT = Object.freeze({
  alert: Object.freeze({ x: 89, y: 54, scale: 0.75, enabled: true }),
  gmeter: Object.freeze({ x: 89, y: 26, scale: 0.9, enabled: true }),
  toast: Object.freeze({ x: 89, y: 67, scale: 0.7, enabled: true }),
  companion: Object.freeze({ x: 82, y: 5, scale: 0.8, enabled: true }),
  advice: Object.freeze({ x: 89, y: 75, scale: 0.75, enabled: true }),
  buyback: Object.freeze({ x: 89, y: 84, scale: 0.75, enabled: true }),
  missing: Object.freeze({ x: 89, y: 33, scale: 0.8, enabled: true }),
  banner: Object.freeze({ x: 89, y: 44, scale: 0.7, enabled: true }),
  lowhp: Object.freeze({ x: 89, y: 61, scale: 0.8, enabled: true }),
  vol: Object.freeze({ x: 78, y: 94, scale: 0.8, enabled: true }),
  standby: Object.freeze({ x: 93, y: 10, scale: 0.85, enabled: true }),
  clock: Object.freeze({ x: 78, y: 13, scale: 1, enabled: true }),
  score: Object.freeze({ x: 84.5, y: 13, scale: 1, enabled: true }),
  kda: Object.freeze({ x: 91, y: 13, scale: 1, enabled: true }),
  gold: Object.freeze({ x: 97, y: 13, scale: 1, enabled: true }),
  gpm: Object.freeze({ x: 84.5, y: 19, scale: 1, enabled: true }),
  xpm: Object.freeze({ x: 91, y: 19, scale: 1, enabled: false }),
  nw: Object.freeze({ x: 97, y: 19, scale: 1, enabled: true }),
  hero: Object.freeze({ x: 79.5, y: 35, scale: 0.8, enabled: false }),
} satisfies Layout)

// Frozen pre-#90 defaults from a71d07a47c64379a8a2be6d8038e19c22ebc46bd^:
// src/src/overlay/modules.ts, retained from the original notification migration.
const LEGACY_DEFAULT_POSITIONS = Object.freeze({
  banner: Object.freeze({ x: 50, y: 34, scale: 1, enabled: true }),
  standby: Object.freeze({ x: 50, y: 5, scale: 1, enabled: true }),
})

function migrateLegacyDefaultPositions(value: unknown): unknown {
  const saved = asRecord(value)
  if (!saved) return value

  const next = { ...saved }
  for (const defaults of [PRE_91_DEFAULT_LAYOUT, POST_91_DEFAULT_LAYOUT, LEGACY_DEFAULT_POSITIONS]) {
    for (const [id, legacy] of Object.entries(defaults)) {
      const current = asRecord(saved[id])
      if (current && current.x === legacy.x && current.y === legacy.y
        && current.scale === legacy.scale && current.enabled === legacy.enabled) {
        next[id] = { ...DEFAULT_LAYOUT[id as ModuleId] }
      }
    }
  }
  return next
}

export function sameSettings(left: Settings, right: Settings): boolean {
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (key === 'layout') {
      for (const { id } of MODULE_META) {
        const a = left.layout[id]
        const b = right.layout[id]
        if (a.x !== b.x || a.y !== b.y || a.scale !== b.scale || a.enabled !== b.enabled) return false
      }
    } else if (!Object.is(left[key], right[key])) {
      return false
    }
  }
  return true
}

/** Validate every persisted setting; invalid fields fall back field by field. */
export function normalizeSettings(value: unknown, fallback: Settings = DEFAULTS): Settings {
  const raw = withLegacyStats(value)
  const voice = asRecord(raw.voice)
  // Move only exact shipped defaults. Any user-adjusted module remains intact.
  const layout = migrateLegacyDefaultPositions(raw.layout)
  return {
    overlayVisible: boolValue(raw, 'overlayVisible', fallback.overlayVisible),
    position: enumValue(raw, 'position', ['top', 'left', 'right', 'custom'] as const, fallback.position),
    customX: numberValue(raw, 'customX', fallback.customX, 0, 100),
    customY: numberValue(raw, 'customY', fallback.customY, 0, 100),
    opacity: numberValue(raw, 'opacity', fallback.opacity, 0, 1),
    alertEnabled: boolValue(raw, 'alertEnabled', fallback.alertEnabled),
    alertThreshold: numberValue(raw, 'alertThreshold', fallback.alertThreshold, 0, 100, true),
    voiceEnabled: boolValue(raw, 'voiceEnabled', fallback.voiceEnabled),
    micEnabled: typeof voice?.micEnabled === 'boolean'
      ? voice.micEnabled
      : boolValue(raw, 'micEnabled', fallback.micEnabled),
    voiceName: stringValue(raw, 'voiceName', fallback.voiceName, 128),
    voiceRate: numberValue(raw, 'voiceRate', fallback.voiceRate, -10, 10, true),
    volume: numberValue(raw, 'volume', fallback.volume, 0, 100, true),
    announcerEnabled: boolValue(raw, 'announcerEnabled', fallback.announcerEnabled),
    signalEnabled: boolValue(raw, 'signalEnabled', fallback.signalEnabled),
    personaLines: boolValue(raw, 'personaLines', fallback.personaLines),
    autoAdvice: boolValue(raw, 'autoAdvice', fallback.autoAdvice),
    gankVisuals: boolValue(raw, 'gankVisuals', fallback.gankVisuals),
    killVisuals: boolValue(raw, 'killVisuals', fallback.killVisuals),
    signalSensitivity: enumValue(raw, 'signalSensitivity', ['low', 'med', 'high'] as const, fallback.signalSensitivity),
    masterEnabled: boolValue(raw, 'masterEnabled', fallback.masterEnabled),
    masterBackend: enumValue(raw, 'masterBackend', ['auto', 'claude', 'ollama'] as const, fallback.masterBackend),
    cloudContextOptIn: boolValue(raw, 'cloudContextOptIn', fallback.cloudContextOptIn),
    masterAuth: enumValue(raw, 'masterAuth', ['plan', 'apikey'] as const, fallback.masterAuth),
    masterOllamaModel: stringValue(raw, 'masterOllamaModel', fallback.masterOllamaModel, 128) || fallback.masterOllamaModel,
    cvDebug: boolValue(raw, 'cvDebug', fallback.cvDebug),
    calibration: boolValue(raw, 'calibration', fallback.calibration),
    efficacyStudy: boolValue(raw, 'efficacyStudy', fallback.efficacyStudy),
    telemetrySource: enumValue(raw, 'telemetrySource', ['auto', 'feeder', 'gtelemetry', 'off'] as const, fallback.telemetrySource),
    uiMode: 'full',
    layout: normalizeLayout(layout, fallback.layout),
    showTimer: boolValue(raw, 'showTimer', fallback.showTimer),
    showScore: boolValue(raw, 'showScore', fallback.showScore),
    showHeroBar: boolValue(raw, 'showHeroBar', fallback.showHeroBar),
    showKda: boolValue(raw, 'showKda', fallback.showKda),
    showGold: boolValue(raw, 'showGold', fallback.showGold),
    personaPreset: enumValue(raw, 'personaPreset', ['coach', 'silent', 'caster', 'meme'] as const, fallback.personaPreset),
  }
}

export function serializeSettings(settings: Settings): RecordValue {
  const serialized: RecordValue = { ...settings }
  delete serialized.micEnabled
  const voice = asRecord(serialized.voice) ?? {}
  serialized.voice = { ...voice, micEnabled: settings.micEnabled }
  return serialized
}

/** Native settings win over the origin-scoped copy; the deck audio key migrates into that snapshot. */
export function mergeStoredSettings(localValue: unknown, nativeValue: unknown, legacyAudioValue: unknown): Settings {
  const local = withLegacyStats(localValue)
  const native = withLegacyStats(nativeValue)
  const legacyAudio = asRecord(legacyAudioValue) ?? {}
  const fallback = normalizeSettings(local)
  const merged: RecordValue = { ...local, ...native }

  // The audio rail predates native settings persistence and could be newer than
  // a settings.json volume written only from the Settings page.
  const legacyVolume = typeof legacyAudio.volume === 'number'
    ? legacyAudio.volume
    : legacyAudio.master
  if (typeof legacyVolume === 'number' && Number.isFinite(legacyVolume)) merged.volume = legacyVolume
  if (typeof native.announcerEnabled !== 'boolean' && typeof legacyAudio.annEnabled === 'boolean') {
    merged.announcerEnabled = legacyAudio.annEnabled
  }
  if (typeof native.signalEnabled !== 'boolean' && typeof legacyAudio.signalEnabled === 'boolean') {
    merged.signalEnabled = legacyAudio.signalEnabled
  }

  return normalizeSettings(merged, fallback)
}
