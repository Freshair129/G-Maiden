import { afterEach, describe, expect, it, vi } from 'vitest'
import { GannDecodeQueue } from './gannDecodeQueue'
import type { GannWebm } from './gannWebm'

const decoders: { init: VideoDecoderInit; decode: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[] = []
function setup(alpha = true) {
  decoders.length = 0
  vi.stubGlobal('EncodedVideoChunk', class { constructor(readonly data: EncodedVideoChunkInit) {} })
  vi.stubGlobal('VideoDecoder', class {
    state = 'configured'
    decode = vi.fn(); close = vi.fn(); configure = vi.fn(); flush = vi.fn().mockResolvedValue(undefined)
    constructor(readonly init: VideoDecoderInit) { decoders.push(this) }
  })
  const clip: GannWebm = { codec: 'vp8', width: 960, height: 420, durationMs: 200,
    frames: Array.from({ length: 12 }, (_, i) => ({ timestamp: i * 16667, key: i === 0,
      color: new Uint8Array([i]), ...(alpha ? { alpha: new Uint8Array([i]) } : {}) })) }
  const failed = vi.fn(), ready = vi.fn()
  const queue = new GannDecodeQueue(clip, ready, failed)
  const frame = (timestamp: number) => ({ timestamp, close: vi.fn() }) as unknown as VideoFrame
  return { clip, queue, failed, ready, frame }
}
afterEach(() => { vi.unstubAllGlobals() })
describe('bounded color/alpha GANN decode queue', () => {
  it('waits for both planes of frame zero and never substitutes the next ready frame', () => {
    const { queue, frame, ready } = setup()
    expect(decoders).toHaveLength(2)
    decoders[0].init.output(frame(16667)); decoders[1].init.output(frame(16667))
    expect(queue.peek()).toBeNull(); expect(ready).not.toHaveBeenCalled()
    decoders[0].init.output(frame(0)); expect(queue.peek()).toBeNull()
    decoders[1].init.output(frame(0)); expect(ready).toHaveBeenCalledOnce()
    expect(queue.take()?.color.timestamp).toBe(0)
    expect(queue.take()?.color.timestamp).toBe(16667)
    queue.dispose()
  })
  it('bounds decode ahead and closes late output after cancellation', () => {
    const { queue, frame } = setup(false)
    expect(decoders).toHaveLength(1)
    expect(decoders[0].decode.mock.calls.length).toBeLessThanOrEqual(8)
    const first = frame(0); decoders[0].init.output(first)
    queue.dispose(); expect(first.close).toHaveBeenCalledOnce()
    const late = frame(16667); decoders[0].init.output(late)
    expect(late.close).toHaveBeenCalledOnce(); expect(decoders[0].close).toHaveBeenCalledOnce()
    expect(queue.take()).toBeNull()
  })
  it('fails once on an unrequested or duplicate timestamp and releases frame resources', () => {
    const { queue, failed, frame } = setup()
    expect(decoders).toHaveLength(2)
    const unexpected = frame(999); decoders[0].init.output(unexpected)
    expect(failed).toHaveBeenCalledOnce(); expect(unexpected.close).toHaveBeenCalledOnce()
    const late = frame(0); decoders[1].init.output(late)
    expect(late.close).toHaveBeenCalledOnce(); expect(queue.peek()).toBeNull()
  })
})
