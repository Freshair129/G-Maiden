// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (event: { payload: unknown }) => void>() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue([]) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onFocusChanged: vi.fn() }) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
  handlers.set(name, handler)
  return Promise.resolve(() => {})
}) }))
vi.mock('../live/identity', () => ({ loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn(), IDENTITY_EVENT: 'identity' }))

let root: Root
let container: HTMLDivElement
let currentData: import('../companion').CompanionData
const session = { session_epoch: 8, session_lifecycle: 'live' }
async function send(name: string, payload: unknown) {
  await act(async () => { handlers.get(name)?.({ payload }); vi.advanceTimersByTime(250) })
}
const observation = { hero: 'zeus', missing_for_ms: 7000, last_pos: [0.4, 0.3] }
const snapshot = { ...session, heroes: [], observations: [], visible_heroes: ['axe'], roster_known: 5, ready: true, reason: 'evidence_ready' }
beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  handlers.clear()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const { useCompanionData } = await import('../companion')
  const { FeedAgePill } = await import('../deck/onair')
  function Presence() {
    const { data } = useCompanionData()
    currentData = data
    return <><output>{data.heroes.slice(5).map((hero) => `${hero.hero}:${hero.state}`).join(',')}</output><FeedAgePill updatedAt={data.updatedAt} online /></>
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<Presence />) })
  await send('gsi-status', { ...session, gsi_freshness: 'fresh', gsi_active: true, dota_running: true, in_game: true })
  await send('game-tick', { ...session, in_game: true, clock_time: 100, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', hero: 'npc_dota_hero_crystal_maiden', team_name: 'radiant', alive: true, gold: 100, level: 5, kills: 0, deaths: 0, assists: 0, radiant_score: 0, dire_score: 0, hp_percent: 100 })
  await send('draft-roster', { ...session, radiant: ['crystal_maiden', 'lion', 'pudge', 'drow_ranger', 'lina'], dire: ['axe', 'zeus', 'sniper', 'invoker', 'tinker'], complete: true })
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('roster knowledge alone leaves enemy presence unknown', () => {
  expect(container.textContent).toContain('Axe:empty')
})

it('uses confirmed current observations, then clears presence on unready without losing identities', async () => {
  await send('missing-state', { ...snapshot, heroes: ['zeus'], observations: [observation] })
  expect(container.textContent).toContain('Axe:visible,Zeus:missing')
  await send('missing-state', { ...snapshot, ready: false, heroes: ['zeus'], observations: [observation] })
  expect(container.textContent).toContain('Axe:empty,Zeus:empty')
})

it('expires presence when snapshots stop and retains roster identity', async () => {
  await send('missing-state', snapshot)
  expect(container.textContent).toContain('Axe:visible')
  await act(async () => { vi.advanceTimersByTime(1001) })
  expect(container.textContent).toContain('Axe:empty')
})

it('ignores a wrong-epoch snapshot without disturbing current observations', async () => {
  await send('missing-state', snapshot)
  await send('missing-state', { ...snapshot, session_epoch: 7, visible_heroes: ['zeus'], heroes: ['axe'], observations: [{ ...observation, hero: 'axe' }] })
  expect(container.textContent).toContain('Axe:visible,Zeus:empty')
})

it('publishes expired presence when the deck regains focus after background expiry', async () => {
  await send('missing-state', snapshot)
  expect(container.textContent).toContain('Axe:visible')
  await act(async () => {
    window.dispatchEvent(new Event('blur'))
    vi.advanceTimersByTime(1001)
    window.dispatchEvent(new Event('focus'))
  })
  expect(container.textContent).toContain('Axe:empty')
})

const idleStatus = { session_epoch: 8, session_lifecycle: 'live', gsi_freshness: 'unavailable', gsi_active: false, dota_running: false, in_game: false, gsi_age_ms: null, server_state: 'listening', gsi_port: 3000, dota_restart_required: false }
const idleSensor = { backend: 'lite', classifier: false, throttled: false, frameAgeMs: null, healthy: false }

it('does not rebuild the deck for an exact idle status heartbeat but keeps receipt age current', async () => {
  await send('gsi-status', idleStatus)
  const before = currentData
  await act(async () => { vi.advanceTimersByTime(1500) })
  await send('gsi-status', { ...idleStatus })
  expect(currentData).toBe(before)
  await act(async () => { vi.advanceTimersByTime(250) })
  expect(container.querySelector('.g-ping-pill strong')?.textContent).toBe('<1s')
})

it('does not rebuild the deck for an exact idle sensor heartbeat', async () => {
  await send('sensor-health', idleSensor)
  const before = currentData
  await send('sensor-health', { ...idleSensor })
  expect(currentData).toBe(before)
})

it('preserves every real port, lifecycle, freshness and sensor-age change', async () => {
  await send('gsi-status', idleStatus)
  let before = currentData
  await send('gsi-status', { ...idleStatus, gsi_port: 3001 })
  expect(currentData).not.toBe(before)
  before = currentData
  await send('gsi-status', { ...idleStatus, gsi_port: 3001, gsi_age_ms: 1 })
  expect(currentData).not.toBe(before)
  await send('sensor-health', { ...idleSensor, frameAgeMs: 0 })
  before = currentData
  await send('sensor-health', { ...idleSensor, frameAgeMs: 1 })
  expect(currentData).not.toBe(before)
  await send('gsi-status', { ...idleStatus, gsi_freshness: 'fresh', gsi_active: true, in_game: true, dota_running: true })
  expect(currentData.match.gsiFreshness).toBe('fresh')
})
