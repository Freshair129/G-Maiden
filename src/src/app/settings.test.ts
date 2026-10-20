import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './types'
import { mergeStoredSettings, normalizeSettings } from './settingsSchema'

describe('startup settings normalization', () => {
  it('validates values and retains the saved preferences that are in range', () => {
    const settings = normalizeSettings({
      overlayVisible: false,
      position: 'custom',
      customX: 125,
      customY: 37.5,
      opacity: 0.65,
      alertThreshold: 108,
      voiceEnabled: false,
      voiceName: '  Microsoft Aria  ',
      voiceRate: -4,
      volume: 91,
      announcerEnabled: false,
      signalEnabled: false,
      autoAdvice: true,
      signalSensitivity: 'high',
      masterBackend: 'ollama',
      cloudContextOptIn: true,
      masterAuth: 'apikey',
      masterOllamaModel: 'llama3.2:3b',
      personaPreset: 'caster',
      telemetrySource: 'off',
      layout: {
        ...DEFAULTS.layout,
        alert: { x: 120, y: -5, scale: 8, enabled: false },
      },
    })

    expect(settings.overlayVisible).toBe(false)
    expect(settings.position).toBe('custom')
    expect(settings.customX).toBe(100)
    expect(settings.customY).toBe(37.5)
    expect(settings.opacity).toBe(0.65)
    expect(settings.alertThreshold).toBe(100)
    expect(settings.voiceName).toBe('Microsoft Aria')
    expect(settings.voiceRate).toBe(-4)
    expect(settings.volume).toBe(91)
    expect(settings.announcerEnabled).toBe(false)
    expect(settings.signalEnabled).toBe(false)
    expect(settings.autoAdvice).toBe(true)
    expect(settings.signalSensitivity).toBe('high')
    expect(settings.masterBackend).toBe('ollama')
    expect(settings.cloudContextOptIn).toBe(true)
    expect(settings.masterAuth).toBe('apikey')
    expect(settings.masterOllamaModel).toBe('llama3.2:3b')
    expect(settings.personaPreset).toBe('caster')
    expect(settings.telemetrySource).toBe('off')
    expect(settings.layout.alert).toEqual({ x: 100, y: 0, scale: 4, enabled: false })
    expect(settings.uiMode).toBe('full')
  })

  it('falls back per field for invalid, malformed, or missing values', () => {
    const settings = normalizeSettings({
      autoAdvice: 'true',
      signalSensitivity: 'extreme',
      masterBackend: 'remote',
      masterAuth: null,
      voiceName: 9,
      voiceRate: 11,
      masterOllamaModel: '\u0000',
      layout: [],
    })

    expect(settings.autoAdvice).toBe(DEFAULTS.autoAdvice)
    expect(settings.signalSensitivity).toBe(DEFAULTS.signalSensitivity)
    expect(settings.masterBackend).toBe(DEFAULTS.masterBackend)
    expect(settings.cloudContextOptIn).toBe(false)
    expect(settings.masterAuth).toBe(DEFAULTS.masterAuth)
    expect(settings.voiceName).toBe(DEFAULTS.voiceName)
    expect(settings.voiceRate).toBe(10)
    expect(settings.masterOllamaModel).toBe(DEFAULTS.masterOllamaModel)
    expect(settings.layout).toEqual(DEFAULTS.layout)
  })

  it('uses native settings over origin-scoped storage and migrates the deck audio rail', () => {
    const settings = mergeStoredSettings(
      { voiceName: 'local voice', signalSensitivity: 'low', volume: 35 },
      { voiceName: 'native voice', signalSensitivity: 'high' },
      { master: 64, annEnabled: false, signalEnabled: false },
    )

    expect(settings.voiceName).toBe('native voice')
    expect(settings.signalSensitivity).toBe('high')
    expect(settings.volume).toBe(64)
    expect(settings.announcerEnabled).toBe(false)
    expect(settings.signalEnabled).toBe(false)
  })

  it('uses local values when a native field is invalid and migrates legacy stats', () => {
    const settings = mergeStoredSettings(
      { voiceName: 'saved voice', showStats: true, showKda: false },
      { voiceName: 12, signalSensitivity: 'unsafe' },
      { volume: 240 },
    )

    expect(settings.voiceName).toBe('saved voice')
    expect(settings.signalSensitivity).toBe(DEFAULTS.signalSensitivity)
    expect(settings.volume).toBe(100)
    expect(settings.showTimer).toBe(true)
    expect(settings.showScore).toBe(true)
    expect(settings.showHeroBar).toBe(true)
    expect(settings.showKda).toBe(false)
    expect(settings.showGold).toBe(true)
  })
})
