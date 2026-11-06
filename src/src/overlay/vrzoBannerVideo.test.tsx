// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VrzoBannerVideo } from './vrzoBannerVideo'
import type { VrzoVisual } from './vrzoBanner'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
const players = vi.hoisted(() => [] as { canvas: HTMLCanvasElement; url: string; start: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; ended: () => void; failed: (why: string) => void }[])
vi.mock('./gannFramePlayer', () => ({ GannFramePlayer: class { constructor(url: string, ended: () => void, failed: (why: string) => void) {
  const player = { url, ended, failed, canvas: document.createElement('canvas'), ready: true, start: vi.fn(), dispose: vi.fn(),
    stats: () => ({ frames: 400, expectedFrames: 400, firstFrameMs: 10, elapsedMs: 6667, mediaSeconds: 6.667, durationSeconds: 6.667, waiting: 0, maxLatenessMs: 2, renderer: 'webcodecs-webgl' }) }
  player.dispose.mockImplementation(() => player.canvas.remove()); players.push(player); return player
} } }))

const visual: VrzoVisual = { id: '42', phase: 'start', clipId: 'bnr_00000000-0000-0000-0000-000000000001', event: 'kill',
  session_epoch: 2, preview: false, expires_at_ms: 9000,
  url: 'http://g-announcer-video.localhost/ann_00000000-0000-0000-0000-000000000001/bnr_00000000-0000-0000-0000-000000000001/1',
  manifestVisual: { packId: 'ann_00000000-0000-0000-0000-000000000001', bannerId: 'bnr_00000000-0000-0000-0000-000000000001', revision: '1' } }
afterEach(() => { vi.restoreAllMocks() })
beforeEach(() => {
  players.length = 0
  vi.mocked(invoke).mockResolvedValue(undefined); vi.mocked(invoke).mockClear()
  vi.mocked(listen).mockResolvedValue(() => {}); vi.mocked(listen).mockClear()
})

describe('VRZO video', () => {
  it('subscribes while idle before querying candidates and releases the subscription on unmount', async () => {
    const unlisten = vi.fn()
    vi.mocked(listen).mockResolvedValueOnce(unlisten)
    const container = document.createElement('div'), root = createRoot(container)
    await act(async () => root.render(<VrzoBannerVideo visual={null} fail={vi.fn()} layout={{ x: 50, y: 20, scale: 1, enabled: true }} />))
    expect(listen).toHaveBeenCalledWith('announcer-visual-warm', expect.any(Function))
    expect(invoke).toHaveBeenCalledWith('announcer_visual_warm_candidates')
    expect(container.querySelector('video')).toBeNull()
    await act(async () => root.unmount())
    expect(unlisten).toHaveBeenCalledOnce()
  })
  it('forwards submitted and expected frame counts once without claiming compositor drops', async () => {
    const container = document.createElement('div'), root = createRoot(container)
    await act(async () => root.render(<VrzoBannerVideo visual={visual} fail={vi.fn()} layout={{ x: 50, y: 20, scale: 1, enabled: true }} />))
    expect(container.querySelector('canvas')).toBe(players[0].canvas)
    await act(async () => players[0].ended())
    await act(async () => root.unmount())
    expect(invoke).toHaveBeenCalledWith('record_announcer_visual', expect.objectContaining({ playbackId: '42', frames: 400, expectedFrames: 400, renderer: 'webcodecs-webgl', reason: 'ended' }))
    const receipt = vi.mocked(invoke).mock.calls.find(([name]) => name === 'record_announcer_visual')?.[1]
    expect(receipt).not.toHaveProperty('dropped')
    expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === 'record_announcer_visual')).toHaveLength(1)
    vi.mocked(invoke).mockClear()
  })
  it('uses the GANN frame surface, reports decoding failure and releases it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fail = vi.fn(), container = document.createElement('div'), root = createRoot(container)
    await act(async () => root.render(<VrzoBannerVideo visual={visual} fail={fail} layout={{ x: 80, y: 40, scale: 1, enabled: true }} />))
    expect(container.querySelector('video, audio')).toBeNull()
    expect(players[0].url).toBe(visual.url)
    expect(players[0].start).toHaveBeenCalledOnce()
    await act(async () => players[0].failed('decoder failure'))
    expect(fail).toHaveBeenCalledWith('42')
    await act(async () => root.unmount())
    expect(players[0].dispose).toHaveBeenCalledOnce()
  })
})
