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
  return {
    overlayVisible: boolValue(raw, 'overlayVisible', fallback.overlayVisible),
    position: enumValue(raw, 'position', ['top', 'left', 'right', 'custom'] as const, fallback.position),
    customX: numberValue(raw, 'customX', fallback.customX, 0, 100),
    customY: numberValue(raw, 'customY', fallback.customY, 0, 100),
    opacity: numberValue(raw, 'opacity', fallback.opacity, 0, 1),
    alertEnabled: boolValue(raw, 'alertEnabled', fallback.alertEnabled),
    alertThreshold: numberValue(raw, 'alertThreshold', fallback.alertThreshold, 0, 100, true),
    voiceEnabled: boolValue(raw, 'voiceEnabled', fallback.voiceEnabled),
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
    layout: normalizeLayout(raw.layout, fallback.layout),
    showTimer: boolValue(raw, 'showTimer', fallback.showTimer),
    showScore: boolValue(raw, 'showScore', fallback.showScore),
    showHeroBar: boolValue(raw, 'showHeroBar', fallback.showHeroBar),
    showKda: boolValue(raw, 'showKda', fallback.showKda),
    showGold: boolValue(raw, 'showGold', fallback.showGold),
    personaPreset: enumValue(raw, 'personaPreset', ['coach', 'silent', 'caster', 'meme'] as const, fallback.personaPreset),
  }
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
