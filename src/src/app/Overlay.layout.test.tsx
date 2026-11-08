// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULTS } from './types'
import { DEFAULT_LAYOUT } from '../overlay/modules'
import { OVERLAY_PREVIEW_TICK } from '../overlay/preview'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(name, handler)
    return Promise.resolve(() => handlers.delete(name))
  }),
}))
import { Overlay } from './Overlay'

let root: Root
let container: HTMLDivElement
const chips = ['clock', 'kda', 'gold', 'gpm', 'xpm', 'nw', 'companion'] as const
const session = { session_epoch: 1, session_lifecycle: 'live', match_id: 'fixture-match' }

beforeEach(async () => {
  handlers.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<Overlay initialSettings={DEFAULTS} />) })
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

async function send(name: string, payload: unknown) {
  expect(handlers.has(name)).toBe(true)
  await act(async () => { handlers.get(name)!({ payload }) })
}

async function enterGame() {
  await send('gsi-status', { ...session, dota_running: true, in_game: true, gsi_freshness: 'fresh', gsi_age_ms: 0 })
  await send('game-tick', { ...OVERLAY_PREVIEW_TICK, ...session })
}

function module(id: string) { return container.querySelector<HTMLElement>(`[data-overlay-module="${id}"]`) }

it('renders the real FullOverlay after a live tick and layout reset with false legacy flags', async () => {
  await enterGame()
  await send('settings', { ...DEFAULTS, layout: DEFAULT_LAYOUT })
  for (const id of chips) {
    expect(module(id), id).not.toBeNull()
    expect(module(id)!.style.left).toBe(`${DEFAULT_LAYOUT[id].x}%`)
    expect(module(id)!.style.top).toBe(`${DEFAULT_LAYOUT[id].y}%`)
  }
  expect(module('clock')!.textContent).toContain('10:00')
})

it('preserves freshness and match gates instead of displaying stale own-state to force chips visible', async () => {
  await enterGame()
  await send('gsi-status', { ...session, dota_running: true, in_game: true, gsi_freshness: 'stale', gsi_age_ms: 6000 })
  expect(module('clock')).toBeNull()
  expect(module('companion')).not.toBeNull()
  await send('gsi-status', { ...session, session_lifecycle: 'end', dota_running: true, in_game: false, gsi_freshness: 'fresh', gsi_age_ms: 0 })
  for (const id of chips) expect(module(id)).toBeNull()
})
