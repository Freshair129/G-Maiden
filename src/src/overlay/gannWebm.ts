export interface GannEncodedFrame { timestamp: number; key: boolean; color: Uint8Array; alpha?: Uint8Array }
export interface GannWebm { codec: string; width: number; height: number; durationMs: number; frames: GannEncodedFrame[] }
interface Element { id: number; data: Uint8Array }
const requireValue = (ok: unknown, why: string): void => { if (!ok) throw new Error(`GANN WebM: ${why}`) }
function vint(data: Uint8Array, offset: number, id = false) {
  const first = data[offset]; let width = 1
  while (width <= 8 && !(first & (128 >> (width - 1)))) width++
  requireValue(width <= (id ? 4 : 8) && offset + width <= data.length, 'truncated integer')
  let value = BigInt(id ? first : first & (255 >> width))
  for (let i = 1; i < width; i++) value = value * 256n + BigInt(data[offset + i])
  const unknown = !id && value === (1n << BigInt(7 * width)) - 1n
  requireValue(unknown || value <= BigInt(Number.MAX_SAFE_INTEGER), 'integer overflow')
  return { value: Number(value), width, unknown }
}
function elements(data: Uint8Array): Element[] {
  const result: Element[] = []
  for (let at = 0; at < data.length;) {
    requireValue(result.length < 65536, 'element count')
    const id = vint(data, at, true); at += id.width
    const size = vint(data, at); at += size.width
    requireValue(!size.unknown || id.value === 0x18538067, 'unbounded nested element')
    const end = size.unknown ? data.length : at + size.value
    requireValue(end <= data.length, 'truncated element')
    result.push({ id: id.value, data: data.subarray(at, end) }); at = end
  }
  return result
}
function one(list: Element[], id: number, optional = false): Uint8Array | undefined {
  const found = list.filter(e => e.id === id)
  requireValue(found.length === 1 || (optional && found.length === 0), `field ${id.toString(16)}`)
  return found[0]?.data
}
function uint(data: Uint8Array | undefined, fallback?: number): number {
  if (!data && fallback !== undefined) return fallback
  requireValue(data && data.length > 0 && data.length <= 8, 'unsigned integer')
  const value = data!.reduce((v, b) => v * 256 + b, 0)
  requireValue(Number.isSafeInteger(value), 'integer overflow'); return value
}
const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data)

/** Split only the bounded, silent VP8/VP9 container admitted by the native GANN reader. */
export function readGannWebm(bytes: Uint8Array): GannWebm {
  requireValue(bytes.length <= 64 * 1024 * 1024, 'container budget')
  const top = elements(bytes)
  const header = elements(one(top, 0x1a45dfa3)!)
  requireValue(text(one(header, 0x4282)) === 'webm', 'document type')
  const segment = elements(one(top, 0x18538067)!)
  const info = elements(one(segment, 0x1549a966)!)
  const scale = uint(one(info, 0x2ad7b1, true), 1_000_000)
  const duration = one(info, 0x4489)!
  requireValue(duration.length === 4 || duration.length === 8, 'duration encoding')
  const view = new DataView(duration.buffer, duration.byteOffset, duration.byteLength)
  const durationMs = (duration.length === 4 ? view.getFloat32(0) : view.getFloat64(0)) * scale / 1_000_000
  requireValue(Number.isFinite(durationMs) && durationMs > 0 && durationMs <= 30_000, 'duration budget')
  const tracks = elements(one(segment, 0x1654ae6b)!)
  const track = elements(one(tracks, 0xae)!)
  requireValue(uint(one(track, 0x83)) === 1, 'silent video track required')
  const number = uint(one(track, 0xd7)), codecId = text(one(track, 0x86))
  requireValue(number > 0 && ['V_VP8', 'V_VP9'].includes(codecId), 'unsupported codec')
  const video = elements(one(track, 0xe0)!)
  const width = uint(one(video, 0xb0)), height = uint(one(video, 0xba))
  requireValue(width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 8_388_608, 'frame budget')
  const hasAlpha = uint(one(video, 0x53c0, true), 0) === 1
  const frames: GannEncodedFrame[] = []
  for (const cluster of segment.filter(e => e.id === 0x1f43b675)) {
    const children = elements(cluster.data), base = uint(one(children, 0xe7))
    for (const entry of children.filter(e => e.id === 0xa3 || e.id === 0xa0)) {
      const group = entry.id === 0xa0 ? elements(entry.data) : []
      const block = entry.id === 0xa3 ? entry.data : one(group, 0xa1)!
      const trackId = vint(block, 0), p = trackId.width
      requireValue(trackId.value === number && block.length > p + 3 && !(block[p + 2] & 6), 'track or lacing')
      const relative = new DataView(block.buffer, block.byteOffset, block.byteLength).getInt16(p)
      const timestamp = Math.round((base + relative) * scale / 1000)
      requireValue(timestamp >= 0 && timestamp / 1000 < durationMs
        && (!frames.length || timestamp > frames[frames.length - 1].timestamp), 'timestamp order')
      const key = entry.id === 0xa3 ? !!(block[p + 2] & 128) : !group.some(e => e.id === 0xfb)
      let alpha: Uint8Array | undefined
      const additions = one(group, 0x75a1, true)
      if (additions) {
        for (const extra of elements(additions).filter(e => e.id === 0xa6)) {
          const more = elements(extra.data)
          if (uint(one(more, 0xee, true), 1) === 1) {
            requireValue(!alpha, 'duplicate alpha'); alpha = one(more, 0xa5)
          }
        }
      }
      requireValue(!hasAlpha || (alpha && alpha.length > 0), 'missing alpha')
      requireValue(frames.length < 10_000, 'frame count')
      frames.push({ timestamp, key, color: block.subarray(p + 3), alpha })
    }
  }
  requireValue(frames.length > 0 && frames[0].key && frames[0].timestamp === 0, 'first frame')
  return { codec: codecId === 'V_VP8' ? 'vp8' : 'vp09.00.10.08', width, height, durationMs, frames }
}
