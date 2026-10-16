// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, emitMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  emitMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock, listen: listenMock }))

import { StartupSettingsProvider } from './settings'
import { useStartupSettings } from './settingsContext'

function SettingsProbe() {
  const { settings } = useStartupSettings()
  return <output data-testid="settings">{`${settings.voiceName}|${settings.signalSensitivity}|${settings.volume}|${settings.announcerEnabled}|${settings.signalEnabled}`}</output>
}

function LegacyKeyProbe() {
  const { clearLegacyMasterApiKey } = useStartupSettings()
  return <button data-testid="clear-legacy-key" onClick={clearLegacyMasterApiKey}>Clear migrated key</button>
}

describe('startup settings hydration gate', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    localStorage.clear()
    invokeMock.mockReset()
    emitMock.mockReset().mockResolvedValue(undefined)
    listenMock.mockReset().mockResolvedValue(() => {})
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null
    localStorage.clear()
  })

  it('withholds the deck subtree until saved settings are read and applied', async () => {
    let resolveSettings!: (value: string | null) => void
    const nativeSettings = new Promise<string | null>((resolve) => { resolveSettings = resolve })
    invokeMock.mockImplementation((command: string) => {
      if (command === 'load_settings_file') return nativeSettings
      return Promise.resolve(undefined)
    })
    localStorage.setItem('gm-settings', JSON.stringify({ voiceName: 'local voice', signalSensitivity: 'low' }))
    localStorage.setItem('gm-deck-audio-rail', JSON.stringify({ volume: 64, annEnabled: false, signalEnabled: false }))

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<StartupSettingsProvider><SettingsProbe /></StartupSettingsProvider>)
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="settings"]')).toBeNull()
    expect(container.textContent).toContain('Loading saved settings')
    expect(invokeMock).toHaveBeenCalledWith('load_settings_file')
    expect(invokeMock).not.toHaveBeenCalledWith('set_master_backend', expect.anything())

    const native = { voiceName: 'native voice', signalSensitivity: 'high' }
    await act(async () => {
      resolveSettings(JSON.stringify(native))
      await nativeSettings
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelector('[data-testid="settings"]')?.textContent)
      .toBe('native voice|high|64|false|false')
    expect(localStorage.getItem('gm-deck-audio-rail')).toBeNull()
    expect(JSON.parse(localStorage.getItem('gm-settings') ?? '{}')).toMatchObject({
      volume: 64,
      announcerEnabled: false,
      signalEnabled: false,
    })
    const calls = invokeMock.mock.calls.map(([command]) => command)
    expect(calls.indexOf('load_settings_file')).toBeLessThan(calls.indexOf('set_volume'))
    expect(calls).not.toContain('set_master_backend')
    expect(calls).not.toContain('set_telemetry_source')
    expect(calls).not.toContain('set_calibration_enabled')
  })

  it('hydrates the overlay snapshot without applying or writing native settings', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'load_settings_file') return Promise.resolve(JSON.stringify({ volume: 31, voiceName: 'saved voice' }))
      return Promise.resolve(undefined)
    })

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<StartupSettingsProvider syncNative={false}><SettingsProbe /></StartupSettingsProvider>)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelector('[data-testid="settings"]')?.textContent)
      .toBe('saved voice|med|31|true|true')
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual(['load_settings_file'])
    expect(listenMock).not.toHaveBeenCalled()
    expect(emitMock).not.toHaveBeenCalled()
  })

  it('preserves a legacy key when DPAPI migration fails and removes it after a successful save', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'load_settings_file') return Promise.resolve(null)
      if (command === 'set_master_api_key') return Promise.reject(new Error('DPAPI unavailable'))
      return Promise.resolve(undefined)
    })
    localStorage.setItem('gm-settings', JSON.stringify({ masterApiKey: ' legacy-key ', voiceName: 'saved voice' }))

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<StartupSettingsProvider><><SettingsProbe /><LegacyKeyProbe /></></StartupSettingsProvider>)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(JSON.parse(localStorage.getItem('gm-settings') ?? '{}').masterApiKey).toBe('legacy-key')
    const initialSnapshot = invokeMock.mock.calls.find(([command]) => command === 'save_settings_file')?.[1]?.json
    expect(JSON.parse(initialSnapshot).masterApiKey).toBe('legacy-key')

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="clear-legacy-key"]')?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(JSON.parse(localStorage.getItem('gm-settings') ?? '{}')).not.toHaveProperty('masterApiKey')
    const snapshots = invokeMock.mock.calls
      .filter(([command]) => command === 'save_settings_file')
      .map(([, args]) => JSON.parse(args.json as string))
    expect(snapshots[snapshots.length - 1]).not.toHaveProperty('masterApiKey')
  })
})
