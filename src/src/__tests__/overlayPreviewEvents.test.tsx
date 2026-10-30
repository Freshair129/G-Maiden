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
vi.mock('../overlay/vrzoBannerVideo', () => ({ VrzoBannerVideo: () => null }))
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(name, handler)
    return Promise.resolve(() => handlers.delete(name))
  }),
}))
vi.mock('../overlay/FullOverlay', () => ({
  FullOverlay: ({ tick, missingHeroes, warningStatus }: { tick: GameTick | null; missingHeroes: Set<string>; warningStatus?: { ready: boolean } }) => <output data-missing={[...missingHeroes].join(',')} data-ready={String(warningStatus?.ready ?? false)}>{tick?.gold ?? 'offline'}</output>,
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
  expect(invokeMock.mock.calls).toEqual([['overlay_bootstrap_ready']])
  invokeMock.mockClear()
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

it('uses current missing snapshots and expires to unknown rather than retaining old names', async () => {
  await send('missing-state', { heroes: ['axe'], roster_known: 5, ready: true, reason: 'evidence_ready' })
  expect(container.querySelector('output')?.getAttribute('data-missing')).toBe('axe')
  await send('missing-state', { heroes: [], roster_known: 5, ready: true, reason: 'missing_without_rotation' })
  expect(container.querySelector('output')?.getAttribute('data-missing')).toBe('')
  await send('missing-state', { heroes: ['lina'], roster_known: 5, ready: true, reason: 'evidence_ready' })
  await act(async () => { vi.advanceTimersByTime(3001) })
  expect(container.querySelector('output')?.getAttribute('data-missing')).toBe('')
  expect(container.querySelector('output')?.getAttribute('data-ready')).toBe('false')
})

it('rejects stale match snapshots and clears warnings when evidence is unavailable', async () => {
  await send('missing-state', { session_epoch: 8, session_lifecycle: 'live', heroes: ['axe'], roster_known: 5, ready: true });
  await send('missing-state', { session_epoch: 7, session_lifecycle: 'live', heroes: ['lina'], roster_known: 5, ready: true });
  expect(container.querySelector('output')?.getAttribute('data-missing')).toBe('axe');
  await send('missing-state', { session_epoch: 8, session_lifecycle: 'live', heroes: [], roster_known: 5, ready: false });
  expect(container.querySelector('output')?.getAttribute('data-missing')).toBe('');
  expect(container.querySelector('output')?.getAttribute('data-ready')).toBe('false');
});
