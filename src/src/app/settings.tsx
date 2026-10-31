import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import type { Settings } from './types'
import { StartupSettingsContext } from './settingsContext'
import { mergeStoredSettings, normalizeSettings, parseObjectJson, sameSettings, type RecordValue } from './settingsSchema'

const SETTINGS_KEY = 'gm-settings'
const LEGACY_AUDIO_KEY = 'gm-deck-audio-rail'

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
  'personaPreset', 'masterBackend', 'cloudContextOptIn', 'masterAuth', 'masterOllamaModel', 'telemetrySource',
  'calibration', 'efficacyStudy', 'alertEnabled', 'alertThreshold', 'voiceEnabled',
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
  if (syncRuntime('alertEnabled') || syncRuntime('voiceEnabled') || syncRuntime('alertThreshold')) {
    calls.push(invoke('set_hp_alert_settings', { enabled: settings.alertEnabled, voiceEnabled: settings.voiceEnabled, threshold: settings.alertThreshold }))
  }
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
  if (syncRuntime('cloudContextOptIn')) calls.push(invoke('set_master_cloud_context_opt_in', { enabled: settings.cloudContextOptIn }))
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

    if (previous.cloudContextOptIn !== next.cloudContextOptIn) {
      void invoke('set_master_cloud_context_opt_in', { enabled: next.cloudContextOptIn }).catch(() => {})
    }

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
