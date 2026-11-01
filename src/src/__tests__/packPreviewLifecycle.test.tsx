// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const { handlers, invokeMock, view } = vi.hoisted(() => ({
  handlers: new Map<string, (e: { payload: unknown }) => void>(), invokeMock: vi.fn().mockResolvedValue(undefined),
  view: { current: {} as Record<string, unknown>, media: null as Record<string, unknown> | null },
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn().mockResolvedValue(undefined), listen: vi.fn((key: string, fn: (e: { payload: unknown }) => void) => {
  handlers.set(key, fn); return Promise.resolve(() => handlers.delete(key))
}) }))
vi.mock('../overlay/FullOverlay', () => ({ FullOverlay: (p: Record<string, unknown>) => { view.current = p; return <output /> } }))
vi.mock('../overlay/vrzoBannerVideo', () => ({ VrzoBannerVideo: (p: {visual: Record<string, unknown>|null}) => {view.media=p.visual;return <output/>} }))
import { Overlay } from '../app/Overlay'
import { DEFAULTS } from '../app/types'
let root: Root
let host: HTMLDivElement
async function send(key: string, payload: unknown) { await act(async () => { handlers.get(key)?.({ payload }) }) }
function preview(id: number, expires = Date.now() + 4800) { return {
  id: String(id), phase: 'start', expires_at_ms: expires, event: 'kill', session_epoch: 0, preview: true,
  clipId:'bnr_00000000-0000-0000-0000-000000000001',
  manifestVisual:{packId:'ann_00000000-0000-0000-0000-000000000001',bannerId:'bnr_00000000-0000-0000-0000-000000000001',revision:'1'}
} }
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z'))
  handlers.clear(); invokeMock.mockClear()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root.render(<Overlay initialSettings={{ ...DEFAULTS, killVisuals: true }} />) })
  invokeMock.mockClear()
})
afterEach(async () => { await act(async () => { root.unmount() }); host.remove(); vi.useRealTimers() })
it('shows an explicit offline pack preview with independent expiry and no simulated game/audio/advice', async () => {
  await send('announcer-media-playback', preview(1))
  expect(view.media).toMatchObject({id:'1',preview:true})
  expect(view.current.tick).toBeNull()
  expect(view.current.gsiFresh).toBe(false)
  expect(view.current.matchActive).toBe(false)
  expect(invokeMock).not.toHaveBeenCalled()
  await act(async () => { vi.advanceTimersByTime(4801) })
  expect(view.media).toBeNull()
})
it('rejects expired and older preview identities without replacing the latest', async () => {
  await send('announcer-media-playback', preview(2))
  await send('announcer-media-playback', preview(1))
  await send('announcer-media-playback', preview(3, Date.now() - 1))
  expect(view.media).toMatchObject({id:'2',preview:true})
})
it('does not accept untagged live banners as an offline preview', async () => {
  await send('announcer-banner', preview(1))
  expect(view.media).toBeNull()
})
