// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULTS, type ResourceStats } from '../app/types'

const { invokeMock, handlers, renders, companion } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
  renders: new Map<string, number>(),
  companion: { version: 0, renders: 0, subscribers: new Set<() => void>() },
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined), emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
    const set = handlers.get(name) ?? new Set()
    set.add(handler)
    handlers.set(name, set)
    return Promise.resolve(() => { set.delete(handler) })
  }),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({
  onFocusChanged: () => Promise.resolve(() => {}), setSize: vi.fn(), hide: vi.fn(), startDragging: vi.fn(),
}) }))
vi.mock('../app/primitives', async (original) => {
  const actual = await original<typeof import('../app/primitives')>()
  return { ...actual, Card: (props: { title: string; children: ReactNode }) => {
    renders.set(props.title, (renders.get(props.title) ?? 0) + 1)
    return <actual.Card {...props} />
  } }
})
vi.mock('../companion', async (original) => {
  const actual = await original<typeof import('../companion')>()
  const { useSyncExternalStore } = await import('react')
  return { ...actual, useCompanionData: () => {
    useSyncExternalStore((subscriber) => {
      companion.subscribers.add(subscriber)
      return () => { companion.subscribers.delete(subscriber) }
    }, () => companion.version)
    companion.renders++
    return { data: actual.FALLBACK, loading: false, error: null }
  } }
})
vi.mock('../profile', () => ({ useProfile: () => ({ displayName: '', email: '' }) }))
vi.mock('../useAppUpdate', () => ({ useAppUpdate: () => ({ available: null, phase: 'idle' }) }))
import { Control } from '../app/Control'
import { StartupSettingsProvider } from '../app/settings'
import CommandDeck from '../CommandDeck'
import { OVERLAY_PREVIEW_TICK } from '../overlay/preview'

let root: Root
let container: HTMLDivElement
const voices = [
  { name: 'Fixture A', culture: 'th-TH', gender: 'Female', age: 'Adult' },
  { name: 'Fixture B', culture: 'en-US', gender: 'Male', age: 'Adult' },
]
const resource = (index: number): ResourceStats => ({ ram_mb: 300 + index, cpu_pct: index / 10, cpu_group_processes: 8, over_budget: false })
const count = (title: string) => renders.get(title) ?? 0
const voiceCounts = () => ['Alerts (G-Signal)', 'G-Signal — แบนเนอร์แจ้งเตือน', 'G-Persona Presets', 'Audio Settings'].map(count)
async function render(children: ReactNode) {
  await act(async () => { root.render(<StartupSettingsProvider syncNative={false}>{children}</StartupSettingsProvider>) })
}
async function send(name: string, payload: unknown) {
  await act(async () => { for (const handler of handlers.get(name) ?? []) handler({ payload }) })
}
function eventRow(id: string): HTMLElement {
  return [...container.querySelectorAll('span')].find((span) => span.textContent === id)!.parentElement!.parentElement!
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  handlers.clear()
  renders.clear()
  companion.version = 0
  companion.renders = 0
  companion.subscribers.clear()
  localStorage.clear()
  localStorage.setItem('gm-onboarded', '1')
  localStorage.setItem('gm-settings', JSON.stringify({ ...DEFAULTS, voiceName: 'Fixture A' }))
  invokeMock.mockReset().mockImplementation((command: string) => {
    if (command === 'list_voices') return Promise.resolve(voices)
    if (command === 'voice_cache_status') return Promise.resolve({ dir: 'fixture', total: 1, counts: { kill: 1 } })
    if (command === 'list_event_clips') return Promise.resolve([{ name: 'fixture-kill.wav', path: 'fixture-kill.wav', source: 'pack' }])
    if (command === 'voice_api_state') return Promise.resolve({ activePack: null })
    return Promise.resolve(null)
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps the actual Voice subtree unchanged across ten Control resource updates', async () => {
  await render(<Control category="voice" />)
  const before = voiceCounts()
  const html = container.innerHTML
  expect(handlers.get('resource-stats')?.size).toBe(1)
  for (let pulse = 0; pulse < 10; pulse++) await send('resource-stats', resource(pulse))
  expect(voiceCounts()).toEqual(before)
  expect(container.innerHTML).toBe(html)
})

it('keeps the actual Voice subtree unchanged while CommandDeck consumes ten parent publications', async () => {
  await render(<CommandDeck renderSettings={(category) => <Control category={category} />} />)
  await act(async () => { container.querySelector<HTMLButtonElement>('button.g-nav-item[title="Settings"]')!.click() })
  const voice = [...container.querySelectorAll<HTMLButtonElement>('button.settings-cat')].find((button) => button.textContent?.includes('เสียง & เตือน'))!
  await act(async () => { voice.click() })
  const before = voiceCounts()
  const beforeParent = companion.renders
  for (let pulse = 0; pulse < 10; pulse++) await act(async () => {
    companion.version++
    for (const subscriber of [...companion.subscribers]) subscriber()
  })
  expect(companion.renders).toBeGreaterThanOrEqual(beforeParent + 10)
  expect(voiceCounts()).toEqual(before)
})

it('updates actual settings controls while keeping independent event rows out of that invalidation', async () => {
  await render(<Control category="voice" />)
  const beforeVoice = count('Alerts (G-Signal)')
  const beforeAudio = count('Audio Settings')
  const mute = [...container.querySelectorAll('button')].find((button) => button.textContent === '🔊')!
  await act(async () => { mute.click() })
  expect(container.textContent).toContain('ระดับเสียง: 0% (ปิดเสียง)')
  expect(count('Alerts (G-Signal)')).toBeGreaterThan(beforeVoice)
  expect(count('Audio Settings')).toBe(beforeAudio)
  const unmute = [...container.querySelectorAll('button')].find((button) => button.textContent === '🔇')!
  await act(async () => { unmute.click() })
  expect(container.textContent).toContain('ระดับเสียง: 80%')
})

it('renders a late voice list and accepts a real voice selection', async () => {
  let resolve!: (value: unknown) => void
  const list = new Promise((done) => { resolve = done })
  invokeMock.mockImplementation((command: string) => {
    if (command === 'list_voices') return list
    if (command === 'voice_cache_status') return Promise.resolve({ dir: 'fixture', total: 0, counts: {} })
    return Promise.resolve(null)
  })
  await render(<Control category="voice" />)
  const select = container.querySelector<HTMLSelectElement>('select')!
  expect(select.disabled).toBe(true)
  const before = count('Alerts (G-Signal)')
  await act(async () => { resolve(voices) })
  expect(select.disabled).toBe(false)
  expect(select.options).toHaveLength(3)
  expect(count('Alerts (G-Signal)')).toBeGreaterThan(before)
  await act(async () => {
    select.value = 'Fixture B'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(select.value).toBe('Fixture B')
  expect(JSON.parse(localStorage.getItem('gm-settings')!).voiceName).toBe('Fixture B')
})

it('retains expanded clips through resource updates and accepts real Rescan results', async () => {
  await render(<Control category="voice" />)
  await act(async () => { eventRow('kill').click() })
  const expanded = [...container.querySelectorAll('span')].find((span) => span.textContent === 'fixture-kill.wav')!
  expect(expanded).toBeDefined()
  const before = count('Audio Settings')
  for (let pulse = 0; pulse < 3; pulse++) await send('resource-stats', resource(pulse))
  expect(count('Audio Settings')).toBe(before)
  expect(container.contains(expanded)).toBe(true)
  invokeMock.mockImplementation((command: string) => Promise.resolve(command === 'voice_cache_status' ? { dir: 'fixture', total: 9, counts: { kill: 9 } } : null))
  await act(async () => { container.querySelector<HTMLButtonElement>('button[title="สแกนใหม่"]')!.click() })
  expect(container.textContent).toContain('9 clips ·')
  expect(container.contains(expanded)).toBe(true)
  expect(count('Audio Settings')).toBeGreaterThan(before)
})

it('keeps Modules and System on their existing live resource and freshness paths', async () => {
  await render(<Control category="modules" />)
  await send('resource-stats', { ...resource(0), ram_mb: 420, cpu_pct: 11, over_budget: true })
  await send('capture-mode', 'gdi')
  expect(container.textContent).toContain('420 MB')
  expect(container.textContent).toContain('11.0%')
  expect(container.textContent).toContain('GDI')
  await send('game-tick', { ...OVERLAY_PREVIEW_TICK, in_game: true, hero: 'npc_dota_hero_axe', level: 17 })
  await send('gsi-status', { gsi_freshness: 'fresh', dota_running: true, in_game: true })
  await render(<Control category="system" />)
  expect(container.textContent).toContain('Axe')
  await send('gsi-status', { gsi_freshness: 'stale', gsi_age_ms: 1200, dota_running: true, in_game: false })
  expect(container.textContent).toContain('ข้อมูล GSI ล้าสมัย')
  expect(container.textContent).not.toContain('Axe')
})
