// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULTS, type Advice, type GameTick } from '../app/types'
import { OVERLAY_PREVIEW_TICK } from '../overlay/preview'

const { handlers, invokeMock } = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  invokeMock: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(name, handler)
    return Promise.resolve(() => handlers.delete(name))
  }),
}))
vi.mock('../overlay/FullOverlay', () => ({
  FullOverlay: ({ overlayAdvice, toast }: { overlayAdvice: string | null; toast: { event: string; text: string } | null }) =>
    <output>{overlayAdvice}{toast?.event === 'advice' ? toast.text : ''}</output>,
}))
import { MasterCard } from '../app/cards/MasterCard'
import { Overlay } from '../app/Overlay'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}
let root: Root
let container: HTMLDivElement
let currentGeneration: boolean
let adviceResult: Promise<Advice>
let validationResult: Promise<boolean> | null
const session = { session_epoch: 8, session_lifecycle: 'live' as const }
const tick: GameTick = { ...OVERLAY_PREVIEW_TICK, ...session }
const answer = { text: 'private stale answer', cached: false, backend: 'claude' as const, context_generation: 7 }
const props: ComponentProps<typeof MasterCard> = {
  tick, voice: '', rate: 0, enabled: true, onEnabledChange: vi.fn(),
  autoAdvice: true, onAutoAdviceChange: vi.fn(), backend: 'claude', onBackendChange: vi.fn(),
  cloudContextOptIn: true, onCloudContextOptInChange: vi.fn(), auth: 'plan', onAuthChange: vi.fn(),
  apiKeyPresent: false, onApiKeySave: vi.fn(), ollamaModel: 'test-local', onOllamaModelChange: vi.fn(),
}
async function renderCard(overrides: Partial<ComponentProps<typeof MasterCard>> = {}) {
  await act(async () => { root.render(<MasterCard {...props} {...overrides} />) })
}
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
  expect(button).toBeDefined()
  await act(async () => { button!.click() })
}
async function send(name: string, payload: unknown) {
  await act(async () => { handlers.get(name)?.({ payload }) })
}
async function renderOverlay() {
  await act(async () => { root.render(<Overlay initialSettings={{ ...DEFAULTS, cloudContextOptIn: true, masterBackend: 'claude', personaLines: false }} />) })
  await send('gsi-status', { ...session, gsi_freshness: 'fresh', dota_running: true, in_game: true })
  await send('game-tick', tick)
}
beforeEach(() => {
  vi.useFakeTimers()
  handlers.clear()
  currentGeneration = true
  validationResult = null
  adviceResult = Promise.resolve(answer)
  invokeMock.mockReset().mockImplementation((command: string) => {
    if (command === 'request_advice') return adviceResult
    if (command === 'is_advice_generation_current') return validationResult ?? Promise.resolve(currentGeneration)
    return Promise.resolve(null)
  })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('does not display a deferred manual answer after cloud consent changes', async () => {
  const pending = deferred<Advice>()
  adviceResult = pending.promise
  await renderCard()
  await click('ขอคำแนะนำ')
  await renderCard({ cloudContextOptIn: false })
  await act(async () => { pending.resolve(answer) })
  expect(container.textContent).not.toContain(answer.text)
  expect(container.textContent).not.toContain('🔊 อ่าน')
})

it.each([{ backend: 'ollama' as const }, { ollamaModel: 'replacement model' }])(
  'discards an in-flight manual answer when backend/model changes: %j', async (change) => {
    const pending = deferred<Advice>()
    adviceResult = pending.promise
    await renderCard()
    await click('ขอคำแนะนำ')
    await renderCard(change)
    await act(async () => { pending.resolve(answer) })
    expect(container.textContent).not.toContain(answer.text)
    expect(container.textContent).not.toContain('🔊 อ่าน')
  },
)

it.each([
  { backend: 'ollama' as const }, { ollamaModel: 'replacement' }, { auth: 'apikey' as const },
  { enabled: false }, { autoAdvice: false }, { tick: { ...tick, session_lifecycle: 'end' as const } },
])('clears displayed manual advice when policy changes: %j', async (change) => {
  await renderCard()
  await click('ขอคำแนะนำ')
  expect(container.textContent).toContain(answer.text)
  await renderCard(change)
  expect(container.textContent).not.toContain(answer.text)
})

it('rejects manual output whose native generation was revoked before IPC delivery', async () => {
  currentGeneration = false
  await renderCard()
  await click('ขอคำแนะนำ')
  expect(container.textContent).not.toContain(answer.text)
})

it('rejects advice with no provider origin instead of assuming it is local', async () => {
  adviceResult = Promise.resolve({ ...answer, backend: undefined })
  await renderCard({ cloudContextOptIn: false })
  await click('ขอคำแนะนำ')
  expect(container.textContent).not.toContain(answer.text)
})

it('includes generation in manual voice replay for native admission', async () => {
  await renderCard()
  await click('ขอคำแนะนำ')
  await click('🔊 อ่าน')
  expect(invokeMock).toHaveBeenCalledWith('speak_event', expect.objectContaining({ event: 'advice', adviceGeneration: 7 }))
})

it('rejects an advice event delivered after native consent revocation', async () => {
  await renderOverlay()
  await send('settings', { ...DEFAULTS, cloudContextOptIn: false, masterBackend: 'claude' })
  currentGeneration = false
  await send('advice-update', { ...session, ...answer })
  expect(container.textContent).not.toContain(answer.text)
  expect(invokeMock.mock.calls.some(([command, args]) => command === 'speak_event' && args?.event === 'advice')).toBe(false)
})

it('clears displayed advice when native configuration changes without a settings change', async () => {
  await renderOverlay()
  await send('advice-update', { ...session, ...answer })
  expect(container.textContent).toContain(answer.text)
  await send('master-context-changed', { context_generation: 8 })
  expect(container.textContent).not.toContain(answer.text)
})

it('does not revive advice after a delayed validation crosses the configuration boundary', async () => {
  const pending = deferred<boolean>()
  validationResult = pending.promise
  await renderOverlay()
  await send('advice-update', { ...session, ...answer })
  await send('master-context-changed', { context_generation: 8 })
  await act(async () => { pending.resolve(true) })
  expect(container.textContent).not.toContain(answer.text)
})

it('does not let an older delayed event validation replace newer-generation advice', async () => {
  const pending = deferred<boolean>()
  validationResult = pending.promise
  await renderOverlay()
  await send('advice-update', { ...session, ...answer })
  validationResult = null
  await send('advice-update', { ...session, ...answer, text: 'current answer', context_generation: 8 })
  expect(container.textContent).toContain('current answer')
  await act(async () => { pending.resolve(true) })
  expect(container.textContent).toContain('current answer')
  expect(container.textContent).not.toContain(answer.text)
})

it('keeps the newest same-generation advice when validation resolves out of order', async () => {
  const pending = deferred<boolean>()
  validationResult = pending.promise
  await renderOverlay()
  await send('advice-update', { ...session, ...answer })
  validationResult = null
  await send('advice-update', { ...session, ...answer, text: 'newest same generation' })
  expect(container.textContent).toContain('newest same generation')
  await act(async () => { pending.resolve(true) })
  expect(container.textContent).toContain('newest same generation')
  expect(container.textContent).not.toContain(answer.text)
})
