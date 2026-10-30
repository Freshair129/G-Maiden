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

const visual: VrzoVisual = { id: '42', phase: 'start', clipId: 'kill_01', event: 'kill',
  session_epoch: 2, preview: false, expires_at_ms: 9000, url: '/vrzo-banners/kill_01.webm' }
afterEach(() => { vi.restoreAllMocks() })
beforeEach(() => {
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
  it('records actual decoder frame counts once at completion for local verification', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const container = document.createElement('div'), root = createRoot(container)
    await act(async () => root.render(<VrzoBannerVideo visual={visual} fail={vi.fn()} layout={{ x: 50, y: 20, scale: 1, enabled: true }} />))
    const video = container.querySelector('video')!
    Object.defineProperty(video, 'getVideoPlaybackQuality', { value: () => ({ totalVideoFrames: 400, droppedVideoFrames: 2 }) })
    await act(async () => video.dispatchEvent(new Event('ended')))
    await act(async () => root.unmount())
    expect(invoke).toHaveBeenCalledWith('record_announcer_visual', expect.objectContaining({ playbackId: '42', frames: 400, dropped: 2, reason: 'ended' }))
    expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === 'record_announcer_visual')).toHaveLength(1)
    vi.mocked(invoke).mockClear()
  })
  it('uses only muted local media, reports decoding failure and releases the decoder', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fail = vi.fn(), container = document.createElement('div'), root = createRoot(container)
    await act(async () => root.render(<VrzoBannerVideo visual={visual} fail={fail} layout={{ x: 80, y: 40, scale: 1, enabled: true }} />))
    const video = container.querySelector('video')!
    expect(video.muted).toBe(true)
    expect(video.getAttribute('src')).toBe('/vrzo-banners/kill_01.webm')
    expect(play).toHaveBeenCalledOnce()
    await act(async () => video.dispatchEvent(new Event('error')))
    expect(fail).toHaveBeenCalledWith('42')
    await act(async () => root.unmount())
    expect(pause).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledOnce()
  })
})
