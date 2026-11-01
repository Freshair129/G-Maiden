// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VrzoVideoPool } from './vrzoVideoPool'
import type { VrzoVisual } from './vrzoBanner'

const pack = 'ann_11111111-1111-1111-1111-111111111111'
const banner = (n: number) => `bnr_00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const candidate = (n: number, revision = 1) => ({ packId: pack, bannerId: banner(n), revision, event: 'kill' })
const visual = (id: string, n = 1, revision = 1): VrzoVisual => ({ id, phase: 'start', clipId: banner(n), event: 'kill',
  session_epoch: 1, preview: false, expires_at_ms: 15000, manifestVisual: { packId: pack, bannerId: banner(n), revision: String(revision) },
  url: `http://g-announcer-video.localhost/${pack}/${banner(n)}/${revision}` })
const layout = { x: 50, y: 20, scale: 1, enabled: true }
let frames: Map<HTMLVideoElement, Map<number, VideoFrameRequestCallback>>, serial: number
Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { configurable: true, writable: true, value: () => 0 })
Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, writable: true, value: () => {} })
function present(video: HTMLVideoElement, mediaTime = 1 / 60) {
  const callbacks = [...(frames.get(video)?.values() ?? [])]
  frames.get(video)?.clear()
  callbacks.forEach(cb => cb(performance.now(), { mediaTime } as VideoFrameCallbackMetadata))
}
beforeEach(() => {
  frames = new Map(); serial = 0
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLVideoElement.prototype, 'requestVideoFrameCallback').mockImplementation(function (this: HTMLVideoElement, cb) {
    if (!frames.has(this)) frames.set(this, new Map())
    frames.get(this)!.set(++serial, cb); return serial
  })
  vi.spyOn(HTMLVideoElement.prototype, 'cancelVideoFrameCallback').mockImplementation(function (this: HTMLVideoElement, id) { frames.get(this)?.delete(id) })
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('bounded ready-frame video pool', () => {
  it('refuses raw or embedded video URLs without a GANN pair descriptor', () => {
    const host = document.createElement('div'), pool = new VrzoVideoPool(host, vi.fn(), vi.fn())
    pool.show({ ...visual('1'), manifestVisual: undefined, url: '/embedded.webm' } as unknown as VrzoVisual, layout)
    expect(host.querySelector('video')).toBeNull()
    pool.dispose()
  })
  it('primes muted nodes once, reuses the exact ready DOM node and measures only visible playback', () => {
    const host = document.createElement('div'), report = vi.fn(), pool = new VrzoVideoPool(host, vi.fn(), report)
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1)] })
    const ready = host.querySelector('video')!
    expect(ready).not.toBeNull(); expect(ready.muted).toBe(true)
    let quality = { totalVideoFrames: 5, droppedVideoFrames: 1 }
    Object.defineProperty(ready, 'getVideoPlaybackQuality', { value: () => quality })
    present(ready)
    expect(ready.style.opacity).toBe('0')
    expect(ready.pause).toHaveBeenCalledOnce()
    pool.show(visual('1'), layout)
    expect(host.querySelector('video')).toBe(ready)
    present(ready, 0)
    expect(frames.get(ready)?.size).toBe(1)
    present(ready)
    quality = { totalVideoFrames: 25, droppedVideoFrames: 2 }
    ready.dispatchEvent(new Event('waiting')); ready.dispatchEvent(new Event('ended'))
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ playbackId: '1', reason: 'ended', warmed: true, frames: 20, dropped: 1, waiting: 1 }))
    pool.dispose()
  })
  it('never lets a late priming callback pause the promoted active node', () => {
    const host = document.createElement('div'), pool = new VrzoVideoPool(host, vi.fn(), vi.fn())
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1)] })
    const node = host.querySelector('video')!, late = [...frames.get(node)!.values()][0]
    pool.show(visual('1'), layout)
    const pauses = vi.mocked(node.pause).mock.calls.length
    late(performance.now(), {} as VideoFrameCallbackMetadata)
    expect(vi.mocked(node.pause).mock.calls.length).toBe(pauses)
    expect(node.style.opacity).toBe('1'); pool.dispose()
  })
  it('bounds three nodes, uses a distinct node for same-URL retrigger, and fences stale scope', () => {
    const host = document.createElement('div'), pool = new VrzoVideoPool(host, vi.fn(), vi.fn())
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1), candidate(2), candidate(3)] })
    expect(host.querySelectorAll('video')).toHaveLength(3)
    pool.show(visual('1'), layout)
    const first = host.querySelector('[data-playback-id="1"]')
    pool.show({ ...visual('2'), outgoing: { ...visual('1'), exiting: true } }, layout)
    expect(host.querySelector('[data-playback-id="2"]')).not.toBe(first)
    expect((first as HTMLVideoElement).playbackRate).toBe(2)
    expect(host.querySelectorAll('video').length).toBeLessThanOrEqual(3)
    pool.candidates({ packId: pack, revision: 2, visuals: [candidate(2, 2)] })
    pool.show(visual('2'), layout)
    expect(host.querySelector('[data-playback-id]')).toBeNull()
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1)] })
    expect([...host.querySelectorAll('video')].every(v => v.src.endsWith('/2'))).toBe(true)
    pool.dispose(); expect(host.children).toHaveLength(0)
  })
  it('prioritizes new prediction over unused warm nodes while keeping current playback', () => {
    const host = document.createElement('div'), pool = new VrzoVideoPool(host, vi.fn(), vi.fn())
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1), candidate(2), candidate(3)] })
    pool.show(visual('1'), layout)
    const playing = host.querySelector('[data-playback-id="1"]')
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(4)] })
    expect(host.querySelector('[data-playback-id="1"]')).toBe(playing)
    expect([...host.querySelectorAll('video')].some(v => v.src.includes(banner(4)))).toBe(true)
    expect(host.querySelectorAll('video').length).toBeLessThanOrEqual(3)
    pool.dispose()
  })
  it('retains ready First Blood when the next-event hint arrives before its admitted start', () => {
    const host = document.createElement('div'), report = vi.fn(), pool = new VrzoVideoPool(host, vi.fn(), report)
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1), candidate(2), candidate(3)] })
    const firstBlood = [...host.querySelectorAll('video')].find(v => v.src.includes(banner(1)))!
    present(firstBlood)
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(2)] })
    pool.show(visual('1'), layout)
    expect(host.querySelector('[data-playback-id="1"]')).toBe(firstBlood)
    firstBlood.dispatchEvent(new Event('ended'))
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ warmed: true }))
    pool.dispose()
  })
  it('pauses decoded hidden media without a compositor callback and bounds an unready prime', () => {
    vi.useFakeTimers()
    const host = document.createElement('div'), report = vi.fn(), pool = new VrzoVideoPool(host, vi.fn(), report)
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1), candidate(2)] })
    const [decoded, stalled] = [...host.querySelectorAll('video')]
    Object.defineProperty(decoded, 'readyState', { value: 2 })
    decoded.dispatchEvent(new Event('loadeddata'))
    expect(decoded.pause).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1500)
    expect(stalled.pause).toHaveBeenCalledTimes(2)
    pool.show(visual('1'), layout)
    const calls = vi.mocked(decoded.pause).mock.calls.length
    vi.advanceTimersByTime(2000)
    expect(vi.mocked(decoded.pause).mock.calls.length).toBe(calls)
    decoded.dispatchEvent(new Event('ended'))
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ warmed: true }))
    pool.dispose(); vi.useRealTimers()
  })
  it('fences a late startup snapshot behind already admitted playback and null invalidation', () => {
    const host = document.createElement('div'), pool = new VrzoVideoPool(host, vi.fn(), vi.fn())
    pool.show(visual('1', 1, 3), layout)
    pool.candidates({ packId: pack, revision: 2, visuals: [candidate(2, 2)] })
    expect(host.querySelector('[data-playback-id="1"]')).not.toBeNull()
    pool.candidates({ packId: null, revision: 4, visuals: [] })
    pool.show(visual('1', 1, 3), layout)
    expect(host.children).toHaveLength(0)
    pool.dispose()
  })
  it('rewinds an advanced prime and admits readiness only after its zero-time seek completes', () => {
    const host = document.createElement('div'), report = vi.fn(), pool = new VrzoVideoPool(host, vi.fn(), report)
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1)] })
    const node = host.querySelector('video')!
    let time = 0.4, seeking = false
    Object.defineProperty(node, 'currentTime', { get: () => time, set: value => { time = value; seeking = true } })
    Object.defineProperty(node, 'seeking', { get: () => seeking })
    Object.defineProperty(node, 'readyState', { value: 2 })
    node.dispatchEvent(new Event('loadeddata'))
    expect(node.currentTime).toBe(0)
    seeking = false; node.dispatchEvent(new Event('seeked'))
    pool.show(visual('1'), layout)
    node.dispatchEvent(new Event('ended'))
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ warmed: true }))
    pool.dispose()
  })
  it('keeps a ready paused node when priming play rejects with its expected AbortError', async () => {
    let rejectPlay!: (reason: unknown) => void
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise((_, reject) => { rejectPlay = reject }))
    const host = document.createElement('div'), report = vi.fn(), pool = new VrzoVideoPool(host, vi.fn(), report)
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1)] })
    const node = host.querySelector('video')!
    Object.defineProperty(node, 'readyState', { value: 2 })
    node.dispatchEvent(new Event('loadeddata'))
    rejectPlay(new DOMException('Paused while starting', 'AbortError'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.querySelector('video')).toBe(node)
    pool.show(visual('1'), layout); node.dispatchEvent(new Event('ended'))
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ warmed: true }))
    pool.dispose()
  })
})
