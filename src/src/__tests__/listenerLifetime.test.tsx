// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../app/types'

const { registrations, focusRegistrations, setSettings } = vi.hoisted(() => ({
  registrations: [] as { name: string; finish: () => void; dispose: ReturnType<typeof vi.fn> }[],
  focusRegistrations: [] as { finish: () => void; dispose: ReturnType<typeof vi.fn> }[],
  setSettings: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (name: string) => name === 'list_voices' ? [] : name === 'voice_api_state' ? { activePack: null } : null) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn((name: string) => new Promise<() => void>((resolve) => {
  const dispose = vi.fn()
  registrations.push({ name, dispose, finish: () => resolve(dispose) })
})) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onFocusChanged: () => new Promise<() => void>((resolve) => {
  const dispose = vi.fn()
  focusRegistrations.push({ dispose, finish: () => resolve(dispose) })
}) }) }))
vi.mock('../app/settingsContext', () => ({ useStartupSettings: () => ({ settings: DEFAULTS, setSettings, clearLegacyMasterApiKey: vi.fn() }) }))
vi.mock('../companion', async (original) => {
  const actual = await original<typeof import('../companion')>()
  return { ...actual, useCompanionData: () => ({ data: actual.FALLBACK }), useMinimapImage: () => null }
})
vi.mock('../profile', () => ({ useProfile: () => ({ displayName: '', email: '' }) }))
vi.mock('../useAppUpdate', () => ({ useAppUpdate: () => ({ available: null, phase: 'idle' }) }))
import CommandDeck from '../CommandDeck'
import { Control } from '../app/Control'

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  localStorage.setItem('gm-onboarded', '1')
  registrations.length = 0
  focusRegistrations.length = 0
})

it('disposes all three CommandDeck settings listeners when registration resolves after unmount', async () => {
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<CommandDeck />))
  await act(async () => root.unmount())
  await act(async () => { for (const entry of registrations) entry.finish() })
  for (const name of ['volume-change', 'signal-change', 'announcer-change']) {
    const entry = registrations.find((registration) => registration.name === name)
    expect(entry).toBeDefined()
    expect(entry!.dispose).toHaveBeenCalledTimes(1)
  }
})

it('disposes a Control focus listener that resolves after the settings surface unmounts', async () => {
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Control category="privacy" />))
  await act(async () => root.unmount())
  await act(async () => {
    for (const entry of registrations) entry.finish()
    for (const entry of focusRegistrations) entry.finish()
  })
  expect(focusRegistrations).toHaveLength(1)
  expect(focusRegistrations[0].dispose).toHaveBeenCalledTimes(1)
})
