// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../app/types'

const { handlers, invokeMock } = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  invokeMock: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onFocusChanged: vi.fn() }) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
  handlers.set(name, handler)
  return Promise.resolve(() => {})
}) }))
vi.mock('../live/identity', () => ({ loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn(), IDENTITY_EVENT: 'identity' }))

let root: Root
let container: HTMLDivElement
let validation: boolean | Promise<boolean>
const session = { session_epoch: 8, session_lifecycle: 'live' }
const advice = { ...session, text: 'private build note', cached: false, backend: 'claude', context_generation: 7 }
async function send(name: string, payload: unknown) {
  await act(async () => { handlers.get(name)?.({ payload }); vi.advanceTimersByTime(250) })
}
beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  handlers.clear()
  validation = true
  invokeMock.mockReset().mockImplementation((command: string) => Promise.resolve(command === 'is_advice_generation_current' ? validation : []))
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const { useCompanionData } = await import('../companion')
  function BuildNotes() {
    return <output>{useCompanionData().data.buildAdvisor.notes.join(',')}</output>
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<BuildNotes />) })
  await send('settings', { ...DEFAULTS, cloudContextOptIn: true, masterBackend: 'claude' })
  await send('gsi-status', { ...session, gsi_freshness: 'fresh', gsi_active: true, dota_running: true, in_game: true })
  await send('game-tick', { ...session, in_game: true, clock_time: 100, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', hero: 'npc_dota_hero_crystal_maiden', team_name: 'radiant', alive: true, gold: 100, level: 5, kills: 0, deaths: 0, assists: 0, radiant_score: 0, dire_score: 0, hp_percent: 100 })
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('does not accept revoked delayed advice into Live Build notes', async () => {
  validation = false
  await send('advice-update', advice)
  expect(container.textContent).not.toContain(advice.text)
})

it('clears Live Build notes immediately at a native generation boundary', async () => {
  await send('advice-update', advice)
  expect(container.textContent).toContain(advice.text)
  await send('master-context-changed', { context_generation: 8 })
  expect(container.textContent).not.toContain(advice.text)
})

it('does not publish a validation result that crosses a local policy change', async () => {
  let resolve!: (value: boolean) => void
  validation = new Promise<boolean>((complete) => { resolve = complete })
  await send('advice-update', advice)
  await send('settings', { ...DEFAULTS, cloudContextOptIn: false, masterBackend: 'claude' })
  await act(async () => { resolve(true) })
  expect(container.textContent).not.toContain(advice.text)
})

it('retains newer notes when an older native validation reply arrives later', async () => {
  let resolve!: (value: boolean) => void
  validation = new Promise<boolean>((complete) => { resolve = complete })
  await send('advice-update', advice)
  validation = true
  await send('advice-update', { ...advice, text: 'current build note', context_generation: 8 })
  expect(container.textContent).toContain('current build note')
  await act(async () => { resolve(true) })
  expect(container.textContent).toContain('current build note')
  expect(container.textContent).not.toContain(advice.text)
})
