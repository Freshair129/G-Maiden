// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VrzoVideoPool } from './vrzoVideoPool'
import type { VrzoVisual } from './vrzoBanner'
const players = vi.hoisted(() => [] as { canvas: HTMLCanvasElement; ready: boolean; start: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; ended: () => void; failed: (why: string) => void; url: string }[])
vi.mock('./gannFramePlayer', () => ({ GannFramePlayer: vi.fn().mockImplementation((url, ended, failed) => {
  const p = { url, ended, failed, canvas: document.createElement('canvas'), ready: false, start: vi.fn(), dispose: vi.fn(),
    stats: () => ({ frames: 452, expectedFrames: 452, firstFrameMs: 8, elapsedMs: 7533, mediaSeconds: 7.533, durationSeconds: 7.533, waiting: 0, maxLatenessMs: 1, renderer: 'webcodecs-webgl' }) }
  p.dispose.mockImplementation(() => p.canvas.remove()); players.push(p); return p
}) }))
const pack = 'ann_11111111-1111-1111-1111-111111111111'
const banner = (n: number) => `bnr_00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const candidate = (n: number, revision = 1) => ({ packId: pack, bannerId: banner(n), revision, event: 'kill' })
const visual = (id: string, n = 1, revision = 1): VrzoVisual => ({ id, phase: 'start', clipId: banner(n), event: 'kill', session_epoch: 1, preview: false, expires_at_ms: 15000,
  manifestVisual: { packId: pack, bannerId: banner(n), revision: String(revision) }, url: `http://g-announcer-video.localhost/${pack}/${banner(n)}/${revision}` })
const layout = { x: 50, y: 20, scale: 1, enabled: true }
beforeEach(() => { players.length = 0 })
function setup() { const host = document.createElement('div'), fail = vi.fn(), report = vi.fn(); return { host, fail, report, pool: new VrzoVideoPool(host, fail, report) } }
describe('GANN frame presentation pool', () => {
  it('replaces the HTML video scheduler with a timestamped frame surface', () => {
    const { host, pool } = setup(); pool.show(visual('1'), layout)
    expect(host.querySelector('video')).toBeNull(); expect(host.querySelector('canvas')).not.toBeNull()
    expect(players[0].start).toHaveBeenCalledOnce(); pool.dispose()
  })
  it('rejects unpaired and non-GANN URLs', () => {
    const { host, pool } = setup(); pool.show({ ...visual('1'), url: '/legacy.webm' }, layout)
    pool.show({ ...visual('2'), manifestVisual: undefined } as unknown as VrzoVisual, layout)
    expect(host.children).toHaveLength(0); pool.dispose()
  })
  it('prepares without playing, reuses the ready canvas, and reports expected versus submitted frames', () => {
    const { host, pool, report } = setup(); pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1)] })
    expect(players).toHaveLength(1); expect(players[0].start).not.toHaveBeenCalled(); players[0].ready = true
    pool.show(visual('1'), layout); expect(host.querySelector('canvas')).toBe(players[0].canvas); players[0].ended()
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ warmed: true, frames: 452, expectedFrames: 452, renderer: 'webcodecs-webgl', reason: 'ended' })); pool.dispose()
  })
  it('bounds three decoders and gives a repeated clip its own surface while the old clip retires', () => {
    const { host, pool } = setup(); pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1), candidate(2), candidate(3)] }); pool.show(visual('1'), layout)
    const first = host.querySelector('[data-playback-id="1"]'); pool.show({ ...visual('2'), outgoing: { ...visual('1'), exiting: true } }, layout)
    expect(host.querySelector('[data-playback-id="2"]')).not.toBe(first); expect((first as HTMLElement).style.opacity).toBe('0'); expect(host.children.length).toBeLessThanOrEqual(3); pool.dispose()
  })
  it('keeps current playback while prioritizing the next prediction', () => {
    const { host, pool } = setup(); pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1), candidate(2), candidate(3)] }); pool.show(visual('1'), layout)
    const first = host.querySelector('[data-playback-id="1"]'); pool.candidates({ packId: pack, revision: 1, visuals: [candidate(4)] })
    expect(host.querySelector('[data-playback-id="1"]')).toBe(first); expect(players.some(p => p.url.includes(banner(4)))).toBe(true); expect(host.children.length).toBeLessThanOrEqual(3); pool.dispose()
  })
  it('preserves a ready first-blood prediction when the next-event hint arrives', () => {
    const { pool } = setup(); pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1), candidate(2), candidate(3)] }); expect(players).toHaveLength(3)
    const first = players[0]; first.ready = true; pool.candidates({ packId: pack, revision: 1, visuals: [candidate(2)] }); pool.show(visual('1'), layout)
    expect(first.start).toHaveBeenCalledOnce(); expect(first.dispose).not.toHaveBeenCalled(); pool.dispose()
  })
  it('fences stale startup snapshots and late callbacks after pack replacement', () => {
    const { host, pool, fail } = setup(); pool.show(visual('1', 1, 3), layout); expect(players).toHaveLength(1); const old = players[0]
    pool.candidates({ packId: pack, revision: 2, visuals: [candidate(2, 2)] }); expect(host.querySelector('[data-playback-id="1"]')).not.toBeNull()
    pool.candidates({ packId: null, revision: 4, visuals: [] }); old.ended(); old.failed('late'); pool.show(visual('1', 1, 3), layout)
    expect(host.children).toHaveLength(0); expect(fail).not.toHaveBeenCalled(); pool.dispose()
  })
  it('never restarts or changes media speed during layout and retirement updates', () => {
    const { pool } = setup(); pool.show(visual('1'), layout); pool.show(visual('1'), { ...layout, x: 40 }); pool.show({ ...visual('1'), exiting: true }, layout)
    expect(players).toHaveLength(1); expect(players[0].start).toHaveBeenCalledOnce(); pool.dispose()
  })
  it('reports error once without falling back to a different clip', () => {
    const { pool, fail, report } = setup(); pool.show(visual('1'), layout); expect(players).toHaveLength(1); players[0].failed('decode'); players[0].failed('late')
    expect(report).toHaveBeenCalledTimes(1); expect(report).toHaveBeenCalledWith(expect.objectContaining({ reason: 'error' })); expect(fail).toHaveBeenCalledTimes(1); expect(players).toHaveLength(1); pool.dispose()
  })
  it('disposes every decoder and ignores candidates after unmount', () => {
    const { host, pool } = setup(); pool.candidates({ packId: pack, revision: 1, visuals: [candidate(1), candidate(2)] }); pool.dispose()
    pool.candidates({ packId: pack, revision: 1, visuals: [candidate(3)] }); pool.show(visual('1'), layout)
    expect(players).toHaveLength(2); expect(players.every(p => p.dispose.mock.calls.length === 1)).toBe(true); expect(host.children).toHaveLength(0)
  })
})
