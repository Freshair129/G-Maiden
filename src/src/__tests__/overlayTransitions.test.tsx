// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GameTick, Settings } from '../app/types'

const { handlers, invokeMock, view, killLine } = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  invokeMock: vi.fn().mockResolvedValue(undefined),
  view: { current: {} as Record<string, unknown> },
  killLine: 'ฆ่า {hero}',
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn((name: string, fn: (e: { payload: unknown }) => void) => {
    handlers.set(name, fn)
    return Promise.resolve(() => handlers.delete(name))
  }),
}))
vi.mock('../overlay/FullOverlay', () => ({ FullOverlay: (props: Record<string, unknown>) => {
  view.current = props
  return <output />
} }))
vi.mock('../app/lines', async (original) => {
  const actual = await original<typeof import('../app/lines')>()
  return { ...actual, TONE_LINES: {
    serious: { ...actual.TONE_LINES.serious, kill: [killLine] },
    casual: { ...actual.TONE_LINES.casual, kill: [killLine] },
  } }
})
import { Overlay } from '../app/Overlay'
import { DEFAULTS } from '../app/types'
import { OVERLAY_PREVIEW_TICK } from '../overlay/preview'

let root: Root
let container: HTMLDivElement
let settings: Settings
const base = { ...OVERLAY_PREVIEW_TICK, session_epoch: 8, session_lifecycle: 'live' as const,
  clock_time: 100, level: 5, kills: 0, deaths: 0, alive: true, hp_percent: 100, mana_percent: 100, local_player_verified: true }
async function send(name: string, payload: unknown) {
  await act(async () => { handlers.get(name)?.({ payload }) })
}
async function tick(patch: Partial<GameTick> = {}) { await send('game-tick', { ...base, ...patch }) }
beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-28T00:00:00Z'))
  handlers.clear()
  invokeMock.mockReset().mockResolvedValue(undefined)
  view.current = {}
  settings = { ...DEFAULTS, uiMode: 'full', voiceEnabled: true, personaLines: true,
    personaPreset: 'caster', masterEnabled: true, autoAdvice: true, killVisuals: true, announcerEnabled: false }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<Overlay initialSettings={settings} />) })
  await send('gsi-status', { session_epoch: 8, session_lifecycle: 'live', gsi_freshness: 'fresh', dota_running: true, in_game: true })
  await tick()
  invokeMock.mockClear()
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.useRealTimers()
})
it('leaves gameplay audio to the native announcer while retaining kill visuals', async () => {
  await send('settings', { ...settings, announcerEnabled: true })
  await tick({ kills: 1, clock_time: 110 })
  expect(view.current.killBanner).toMatchObject({ kills: 1 })
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'speak_event')).toHaveLength(0)
  await act(async () => { vi.advanceTimersByTime(7000) })
  await tick({ kills: 1, deaths: 1, alive: false, clock_time: 120 })
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'speak_event')).toHaveLength(0)
})
it('never announces or shows kills from unverified player data and reseeds on recovery', async () => {
  await tick({ kills: 2, clock_time: 110, local_player_verified: false })
  expect(view.current.killBanner).toBeNull()
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'speak_event')).toHaveLength(0)
  await tick({ kills: 2, clock_time: 111 })
  expect(view.current.killBanner).toBeNull()
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'speak_event')).toHaveLength(0)
})
it('delivers one kill transition to both persona and banner without replay on settings or duplicate ticks', async () => {
  await tick({ kills: 2, clock_time: 110 })
  expect(view.current.killBanner).toMatchObject({ kills: 2, streak: 2, victim: null })
  expect(invokeMock.mock.calls.filter(([cmd, args]) => cmd === 'speak_event' && args.event === 'kill')).toHaveLength(1)
  await send('settings', settings)
  await tick({ kills: 2, clock_time: 110 })
  expect(view.current.killBanner).toMatchObject({ streak: 2 })
  expect(invokeMock.mock.calls.filter(([cmd, args]) => cmd === 'speak_event' && args.event === 'kill')).toHaveLength(1)
})
it('never names a missing hero as the victim without a confirmed victim ID', async () => {
  await send('missing-state', { session_epoch: 8, session_lifecycle: 'live', heroes: ['axe'], roster_known: 5, ready: true })
  await tick({ kills: 1, clock_time: 110 })
  const call = invokeMock.mock.calls.find(([cmd, args]) => cmd === 'speak_event' && args.event === 'kill')
  expect(call?.[1].fallback).toBe('ฆ่า ศัตรู')
  expect(view.current.killBanner).toMatchObject({ victim: null })
})
it('retains confirmed victim identity and counts later kills after persona cooldown', async () => {
  await tick({ kills: 1, clock_time: 110, last_victim_hero: 'npc_dota_hero_axe' })
  expect(view.current.killBanner).toMatchObject({ victim: 'npc_dota_hero_axe', streak: 1 })
  await act(async () => { vi.advanceTimersByTime(7000) })
  await tick({ kills: 2, clock_time: 120, last_victim_hero: 'npc_dota_hero_lina' })
  expect(view.current.killBanner).toMatchObject({ victim: 'npc_dota_hero_lina', streak: 2 })
})
it('lets auto-advice observe level and cumulative death transitions independently', async () => {
  await tick({ level: 6, clock_time: 120 })
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'request_advice')).toHaveLength(1)
  await tick({ level: 6, clock_time: 130, deaths: 1 })
  await tick({ level: 6, clock_time: 140, deaths: 2 })
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'request_advice')).toHaveLength(2)
  await tick({ level: 6, clock_time: 141, deaths: 2 })
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'request_advice')).toHaveLength(2)
})
it('clears kill history after a death hidden in a feed gap and on a new session', async () => {
  await tick({ kills: 2, clock_time: 110 })
  await tick({ kills: 2, deaths: 1, clock_time: 150 })
  await tick({ kills: 3, deaths: 1, clock_time: 180 })
  expect(view.current.killBanner).toMatchObject({ streak: 1 })
  await send('gsi-status', { session_epoch: 9, session_lifecycle: 'live', gsi_freshness: 'fresh', dota_running: true, in_game: true })
  await tick({ session_epoch: 9, kills: 7, level: 12 })
  expect(view.current.killBanner).toBeNull()
})
it('does not infer a streak from unordered kills and deaths in one update', async () => {
  await tick({ kills: 2, clock_time: 110 })
  await tick({ kills: 3, deaths: 1, clock_time: 150 })
  expect(view.current.killBanner).toMatchObject({ streak: 0 })
})
it('rebaselines after a stale feed rather than replaying missed transitions', async () => {
  await send('gsi-status', { session_epoch: 8, session_lifecycle: 'live', gsi_freshness: 'stale', dota_running: true, in_game: true })
  await tick({ kills: 8, level: 12 })
  await send('gsi-status', { session_epoch: 8, session_lifecycle: 'live', gsi_freshness: 'fresh', dota_running: true, in_game: true })
  expect(view.current.killBanner).toBeNull()
  expect(invokeMock.mock.calls.some(([cmd]) => cmd === 'request_advice')).toBe(false)
})

it('seeds independent consumers when a new epoch begins with identical tick values', async () => {
  await tick({ session_epoch: 9 })
  await tick({ session_epoch: 9, kills: 1, level: 6, clock_time: 110 })
  expect(view.current.killBanner).toMatchObject({ kills: 1, streak: 1 })
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'request_advice')).toHaveLength(1)
})

it('seeds independent consumers on draft to live with identical counters', async () => {
  await send('gsi-status', { session_epoch: 9, session_lifecycle: 'draft', gsi_freshness: 'fresh', dota_running: true, in_game: true })
  await tick({ session_epoch: 9, session_lifecycle: 'draft' })
  await tick({ session_epoch: 9, session_lifecycle: 'live' })
  await tick({ session_epoch: 9, kills: 1, level: 6, clock_time: 110 })
  expect(view.current.killBanner).toMatchObject({ kills: 1, streak: 1 })
  expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'request_advice')).toHaveLength(1)
})

const buybackVerdict = { session_epoch: 8, session_lifecycle: 'live', death_episode: 1, request_id: 1,
  recommend_buyback: null, urgency: 'Unknown', base_under_threat: null, allies_alive: null,
  natural_respawn_remaining: 30, affordable: null, next_respawn_if_buyback: 0, reason: 'first death' }

it('rejects delayed buyback verdict and narrative after respawn in the same match', async () => {
  await tick({ alive: false, deaths: 1 })
  await send('buyback-advice', buybackVerdict)
  expect(view.current.buyback).toMatchObject({ advice: { reason: 'first death' } })
  await tick({ alive: true, deaths: 1 })
  await send('buyback-advice', buybackVerdict)
  await send('buyback-narrative', { ...buybackVerdict, text: 'obsolete narrative' })
  expect(view.current.buyback).toBeNull()
})

it('keeps the newest buyback request and death episode when older events arrive late', async () => {
  await tick({ alive: false, deaths: 1 })
  await send('buyback-advice', buybackVerdict)
  await tick({ alive: true, deaths: 1 })
  await tick({ alive: false, deaths: 2 })
  const next = { ...buybackVerdict, death_episode: 2, request_id: 2, reason: 'second death' }
  await send('buyback-advice', next)
  await send('buyback-narrative', { ...buybackVerdict, text: 'obsolete death' })
  expect(view.current.buyback).toMatchObject({ advice: { reason: 'second death' }, narrative: null })
  await send('buyback-advice', { ...next, request_id: 3, reason: 'newest verdict' })
  await send('buyback-advice', next)
  await send('buyback-narrative', { ...next, text: 'obsolete request' })
  expect(view.current.buyback).toMatchObject({ advice: { reason: 'newest verdict' }, narrative: null })
  await send('buyback-narrative', { ...next, request_id: 3, text: 'current narrative' })
  expect(view.current.buyback).toMatchObject({ advice: { reason: 'newest verdict' }, narrative: 'current narrative' })
})
