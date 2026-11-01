import { describe, expect, it } from 'vitest'
import { readGannWebm } from './gannWebm'

const bytes = (...parts: (number[] | Uint8Array)[]) => new Uint8Array(parts.flatMap(p => [...p]))
const el = (id: number[], value: Uint8Array | number[]) => bytes(id,
  value.length < 127 ? [0x80 | value.length] : [0x40 | (value.length >> 8), value.length & 255], value)
const str = (s: string) => new TextEncoder().encode(s)
function fixture({ alpha = true, omitAlpha = false, lace = false, track = 1, width = 960, times = [0, 17, 33] } = {}) {
  const duration = new Uint8Array(8); new DataView(duration.buffer).setFloat64(0, 50)
  const video = el([0xe0], bytes(el([0xb0], [width >> 8, width & 255]), el([0xba], [1, 164]), el([0x53, 0xc0], [Number(alpha)])))
  const tracks = el([0x16, 0x54, 0xae, 0x6b], el([0xae], bytes(el([0xd7], [1]), el([0x83], [1]), el([0x86], str('V_VP8')), video)))
  const groups = times.map((t, i) => el([0xa0], bytes(el([0xa1], [0x80 | track, t >> 8, t & 255, lace ? 2 : 0, i === 0 ? 0 : 1, 123]),
    ...(i ? [el([0xfb], [0xff])] : []),
    ...(alpha && !omitAlpha ? [el([0x75, 0xa1], el([0xa6], bytes(el([0xee], [1]), el([0xa5], [i === 0 ? 0 : 1, 42]))))] : []))))
  return bytes(el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], str('webm'))), el([0x18, 0x53, 0x80, 0x67], bytes(
    el([0x15, 0x49, 0xa9, 0x66], bytes(el([0x2a, 0xd7, 0xb1], [15, 66, 64]), el([0x44, 0x89], duration))), tracks,
    el([0x1f, 0x43, 0xb6, 0x75], bytes(el([0xe7], [0]), ...groups)))))
}
describe('verified GANN WebM demuxing', () => {
  it('keeps all timestamped color and alpha packets without re-encoding', () => {
    const clip = readGannWebm(fixture())
    expect(clip).toMatchObject({ codec: 'vp8', width: 960, height: 420, durationMs: 50 })
    expect(clip.frames.map(f => f.timestamp)).toEqual([0, 17000, 33000])
    expect(clip.frames.map(f => f.key)).toEqual([true, false, false])
    expect([...clip.frames[1].color]).toEqual([1, 123])
    expect([...clip.frames[1].alpha!]).toEqual([1, 42])
  })
  it('supports an opaque GANN clip without inventing an alpha track', () => {
    expect(readGannWebm(fixture({ alpha: false })).frames.every(f => !f.alpha)).toBe(true)
  })
  it.each([
    ['truncated element', () => fixture().slice(0, -1)],
    ['missing alpha', () => fixture({ omitAlpha: true })],
    ['laced frame without per-frame timestamps', () => fixture({ lace: true })],
    ['foreign track', () => fixture({ track: 2 })],
    ['nonmonotonic PTS', () => fixture({ times: [0, 33, 17] })],
    ['frame beyond duration', () => fixture({ times: [0, 17, 100] })],
    ['unbounded dimensions', () => fixture({ width: 0 })],
  ] as const)('fails closed for %s', (_name, data) => {
    expect(() => readGannWebm(data())).toThrow()
  })
})
