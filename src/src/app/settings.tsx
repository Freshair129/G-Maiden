import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { DEFAULTS, type Settings } from './types'
import { DEFAULT_LAYOUT, MODULE_META, type Layout, type ModuleId } from '../overlay/modules'

const SETTINGS_KEY = 'gm-settings'
const LEGACY_AUDIO_KEY = 'gm-deck-audio-rail'
const SETTINGS_FIELDS = [
  'showTimer', 'showScore', 'showHeroBar', 'showKda', 'showGold',
] as const

type RecordValue = Record<string, unknown>

export interface StartupSettingsContextValue {
  settings: Settings
  setSettings: Dispatch<SetStateAction<Settings>>
  clearLegacyMasterApiKey: () => void
}

const StartupSettingsContext = createContext<StartupSettingsContextValue | null>(null)

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
}

function parseObjectJson(value: unknown): RecordValue | null {
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

function sameSettings(left: Settings, right: Settings): boolean {
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

function readLocalObject(key: string): RecordValue | null {
  try { return parseObjectJson(localStorage.getItem(key)) } catch { return null }
}

function writeBrowserCopies(settings: Settings, legacyMasterApiKey: string | null): void {
  const persisted: RecordValue = { ...settings }
  if (legacyMasterApiKey) persisted.masterApiKey = legacyMasterApiKey
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(persisted))
    // Migrate the retired audio rail key once the consolidated snapshot is safe.
    localStorage.removeItem(LEGACY_AUDIO_KEY)
  } catch { /* unavailable storage */ }
}

const RUNTIME_BOOTSTRAP_FIELDS: (keyof Settings)[] = [
  'volume', 'announcerEnabled', 'signalEnabled', 'signalSensitivity', 'voiceName', 'voiceRate',
  'personaPreset', 'masterBackend', 'masterAuth', 'masterOllamaModel', 'telemetrySource',
  'calibration', 'efficacyStudy',
]

function applyNativeSettings(
  settings: Settings,
  previous: Settings | null,
  options: { startupSettings?: Settings; includeVoice?: boolean } = {},
): Promise<PromiseSettledResult<unknown>[]> {
  const calls: Promise<unknown>[] = []
  const changed = <K extends keyof Settings>(key: K) => previous === null || previous[key] !== settings[key]
  const syncRuntime = <K extends keyof Settings>(key: K) => changed(key)
    && (!options.startupSettings || !RUNTIME_BOOTSTRAP_FIELDS.includes(key)
      || !Object.is(settings[key], options.startupSettings[key]))
  if (changed('overlayVisible')) calls.push(invoke('set_overlay_visible', { visible: settings.overlayVisible }))
  if (syncRuntime('volume')) calls.push(invoke('set_volume', { vol: settings.volume }))
  if (syncRuntime('announcerEnabled')) calls.push(invoke('set_announcer_enabled', { enabled: settings.announcerEnabled }))
  if (syncRuntime('signalEnabled')) calls.push(invoke('set_cv_signal_enabled', { enabled: settings.signalEnabled }))
  if (options.includeVoice !== false && (syncRuntime('voiceName') || syncRuntime('voiceRate'))) {
    calls.push(invoke('set_cv_voice', { name: settings.voiceName || null, rate: settings.voiceRate }))
  }
  if (syncRuntime('signalSensitivity')) calls.push(invoke('set_cv_signal_sensitivity', { level: settings.signalSensitivity }))
  if (syncRuntime('personaPreset')) calls.push(invoke('set_persona_preset', { preset: settings.personaPreset }))
  if (syncRuntime('telemetrySource')) {
    const source = { auto: 0, feeder: 1, gtelemetry: 2, off: 3 }[settings.telemetrySource]
    calls.push(invoke('set_telemetry_source', { source }))
  }
  if (syncRuntime('masterBackend')) calls.push(invoke('set_master_backend', { backend: settings.masterBackend }))
  if (syncRuntime('masterOllamaModel')) calls.push(invoke('set_master_ollama_model', { name: settings.masterOllamaModel }))
  if (syncRuntime('masterAuth')) calls.push(invoke('set_master_mode', { auth: settings.masterAuth }))
  if (syncRuntime('calibration')) calls.push(invoke('set_calibration_enabled', { enabled: settings.calibration }))
  if (syncRuntime('efficacyStudy')) calls.push(invoke('set_efficacy_enabled', { enabled: settings.efficacyStudy }))
  return Promise.allSettled(calls)
}

function persistNativeSettings(settings: Settings, legacyMasterApiKey: string | null = null): Promise<void> {
  const snapshot: RecordValue = { ...settings }
  if (legacyMasterApiKey) snapshot.masterApiKey = legacyMasterApiKey
  return invoke('save_settings_file', { json: JSON.stringify(snapshot) }).then(() => undefined).catch(() => undefined)
}

export function StartupSettingsProvider({
  children,
  syncNative = true,
}: PropsWithChildren<{ syncNative?: boolean }>) {
  const [settings, setSettingsState] = useState<Settings | null>(null)
  const settingsRef = useRef<Settings | null>(null)
  const appliedRef = useRef<Settings | null>(null)
  const appliedVoiceRef = useRef<{ name: string; rate: number } | null>(null)
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const legacyMasterApiKeyRef = useRef<string | null>(null)
  const syncChainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let active = true
    let unlistenOverlayReady: (() => void) | undefined
    void (async () => {
      if (syncNative) {
        try {
          unlistenOverlayReady = await listen('overlay-ready', () => {
            const current = settingsRef.current
            if (current) void emit('settings', current).catch(() => {})
          })
        } catch { /* plain-browser preview */ }
      }
      if (!active) { unlistenOverlayReady?.(); return }

      const local = readLocalObject(SETTINGS_KEY)
      const legacyAudio = readLocalObject(LEGACY_AUDIO_KEY)
      let native: RecordValue | null = null
      try {
        native = parseObjectJson(await invoke<string | null>('load_settings_file'))
      } catch { /* plain-browser preview or no native settings file */ }
      if (!active) { unlistenOverlayReady?.(); return }

      if (!syncNative) {
        const initial = mergeStoredSettings(local, native, legacyAudio)
        settingsRef.current = initial
        appliedRef.current = initial
        appliedVoiceRef.current = { name: initial.voiceName, rate: initial.voiceRate }
        setSettingsState(initial)
        return
      }

      const localKey = typeof local?.masterApiKey === 'string' ? local.masterApiKey.trim() : ''
      const nativeKey = typeof native?.masterApiKey === 'string' ? native.masterApiKey.trim() : ''
      const legacyKey = localKey || nativeKey || ''
      let keyMigrated = false
      if (legacyKey) {
        try {
          await invoke('set_master_api_key', { key: legacyKey })
          keyMigrated = true
        } catch { /* keep the legacy value locally until DPAPI accepts it */ }
      }
      if (!active) { unlistenOverlayReady?.(); return }
      if (keyMigrated) {
        if (local) delete local.masterApiKey
        if (native) delete native.masterApiKey
      }
      legacyMasterApiKeyRef.current = keyMigrated || !legacyKey ? null : legacyKey

      const initial = mergeStoredSettings(local, native, legacyAudio)
      settingsRef.current = initial
      writeBrowserCopies(initial, legacyMasterApiKeyRef.current)
      await Promise.all([
        persistNativeSettings(initial, legacyMasterApiKeyRef.current),
        applyNativeSettings(initial, null, { startupSettings: native ? normalizeSettings(native) : undefined }),
      ])
      if (!active) { unlistenOverlayReady?.(); return }
      appliedRef.current = initial
      appliedVoiceRef.current = { name: initial.voiceName, rate: initial.voiceRate }
      try { await emit('settings', initial) } catch { /* plain-browser preview */ }
      if (active) setSettingsState(initial)
    })()

    return () => {
      active = false
      unlistenOverlayReady?.()
      if (voiceTimerRef.current !== null) clearTimeout(voiceTimerRef.current)
    }
  }, [syncNative])

  const setSettings = useCallback<Dispatch<SetStateAction<Settings>>>((action) => {
    const previous = settingsRef.current
    if (!previous) return
    const candidate = typeof action === 'function' ? action(previous) : action
    const next = normalizeSettings(candidate, previous)
    if (sameSettings(previous, next)) return
    settingsRef.current = next
    setSettingsState(next)
    writeBrowserCopies(next, legacyMasterApiKeyRef.current)

    const appliedVoice = appliedVoiceRef.current
    if (!appliedVoice || appliedVoice.name !== next.voiceName || appliedVoice.rate !== next.voiceRate) {
      if (voiceTimerRef.current !== null) clearTimeout(voiceTimerRef.current)
      voiceTimerRef.current = setTimeout(() => {
        const current = settingsRef.current
        if (!current || current.voiceName !== next.voiceName || current.voiceRate !== next.voiceRate) return
        void invoke('set_cv_voice', { name: current.voiceName || null, rate: current.voiceRate })
          .then(() => { appliedVoiceRef.current = { name: current.voiceName, rate: current.voiceRate } })
          .catch(() => {})
      }, 400)
    }

    syncChainRef.current = syncChainRef.current.then(async () => {
      if (settingsRef.current !== next) return
      const applied = appliedRef.current
      await persistNativeSettings(next, legacyMasterApiKeyRef.current)
      if (settingsRef.current !== next) return
      await applyNativeSettings(next, applied, { includeVoice: false })
      if (settingsRef.current !== next) return
      appliedRef.current = next
      try { await emit('settings', next) } catch { /* plain-browser preview */ }
    }).catch(() => {})
  }, [])

  const clearLegacyMasterApiKey = useCallback(() => {
    legacyMasterApiKeyRef.current = null
    const current = settingsRef.current
    if (current) {
      writeBrowserCopies(current, null)
      syncChainRef.current = syncChainRef.current.then(() => persistNativeSettings(current)).catch(() => {})
    }
  }, [])

  if (!settings) {
    return <main role="status" aria-busy="true" style={{ padding: 24, color: '#e7eef6' }}>Loading saved settings…</main>
  }
  return (
    <StartupSettingsContext.Provider value={{ settings, setSettings, clearLegacyMasterApiKey }}>
      {children}
    </StartupSettingsContext.Provider>
  )
}

export function useStartupSettings(): StartupSettingsContextValue {
  const value = useContext(StartupSettingsContext)
  if (!value) throw new Error('useStartupSettings must be used inside StartupSettingsProvider')
  return value
}
