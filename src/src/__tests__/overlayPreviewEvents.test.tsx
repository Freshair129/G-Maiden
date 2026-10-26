// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GameTick } from '../app/types'

const { handlers, invokeMock } = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  invokeMock: vi.fn().mockResolvedValue(undefined),
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
  FullOverlay: ({ tick }: { tick: GameTick | null }) => <output>{tick?.gold ?? 'offline'}</output>,
}))
import { Overlay } from '../app/Overlay'
import { DEFAULTS } from '../app/types'
import { OVERLAY_PREVIEW_TICK } from '../overlay/preview'

let root: Root
let container: HTMLDivElement
async function send(name: string, payload: unknown) {
  await act(async () => { handlers.get(name)?.({ payload }) })
}
beforeEach(async () => {
  vi.useFakeTimers()
  handlers.clear()
  invokeMock.mockClear()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<Overlay initialSettings={{ ...DEFAULTS, autoAdvice: true }} />) })
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.useRealTimers()
})

it('renders preview ticks without feeding audio, advice or live transitions; expires after sender stops', async () => {
  await send('overlay-preview', { ...OVERLAY_PREVIEW_TICK, hp_percent: 1, level: 6 })
  expect(container.textContent).toBe('1500')
  await send('overlay-preview', { ...OVERLAY_PREVIEW_TICK, gold: 2500, kills: 5, alive: false })
  expect(container.textContent).toBe('2500')
  expect(invokeMock).not.toHaveBeenCalled()
  await act(async () => { vi.advanceTimersByTime(4001) })
  expect(container.textContent).toBe('offline')
})

it('returns to the real feed after preview and never revives stale own-player data', async () => {
  await send('gsi-status', { gsi_freshness: 'fresh', dota_running: true, in_game: true })
  await send('game-tick', { ...OVERLAY_PREVIEW_TICK, gold: 900 })
  expect(container.textContent).toBe('900')
  await send('overlay-preview', OVERLAY_PREVIEW_TICK)
  expect(container.textContent).toBe('1500')
  await send('overlay-preview', null)
  expect(container.textContent).toBe('900')
  await send('gsi-status', { gsi_freshness: 'stale', dota_running: true, in_game: true })
  await send('overlay-preview', OVERLAY_PREVIEW_TICK)
  await send('overlay-preview', null)
  expect(container.textContent).toBe('offline')
})
