import type { GannWebm } from './gannWebm'
export interface GannFramePair { color: VideoFrame; alpha?: VideoFrame }
export class GannDecodeQueue {
  private readonly decoders: VideoDecoder[] = []
  private readonly frames = new Map<number, Partial<GannFramePair>>()
  private readonly requested = new Set<number>()
  private sent = 0
  private taken = 0
  private closed = false
  private notified = false
  private flushed = false
  private readonly capacity: number
  constructor(private readonly clip: GannWebm, private readonly ready: () => void,
    private readonly failed: (message: string) => void) {
    // Two I420 streams per alpha frame, bounded to 32 MiB of decoded lookahead.
    this.capacity = Math.max(1, Math.min(8, Math.floor(32 * 1024 * 1024 / (clip.width * clip.height * 3))))
    try {
      for (const kind of (clip.frames[0].alpha ? ['color', 'alpha'] : ['color']) as ('color' | 'alpha')[]) {
        const decoder = new VideoDecoder({ output: frame => this.output(kind, frame), error: e => this.error(e.message) })
        this.decoders.push(decoder)
        decoder.configure({ codec: clip.codec, codedWidth: clip.width, codedHeight: clip.height,
          hardwareAcceleration: 'prefer-software', optimizeForLatency: true })
      }
      this.feed()
    } catch (e) { this.error(String(e)) }
  }
  private output(kind: 'color' | 'alpha', frame: VideoFrame) {
    if (this.closed) { frame.close(); return }
    const pair = this.frames.get(frame.timestamp) ?? {}
    if (!this.requested.has(frame.timestamp) || pair[kind]) {
      frame.close(); this.error('Unexpected decoder timestamp'); return
    }
    pair[kind] = frame; this.frames.set(frame.timestamp, pair)
    if (!this.notified && this.peek()) { this.notified = true; this.ready() }
  }
  private feed() {
    while (!this.closed && this.sent < this.clip.frames.length && this.sent - this.taken < this.capacity) {
      const packet = this.clip.frames[this.sent++]
      this.requested.add(packet.timestamp)
      this.decoders[0].decode(new EncodedVideoChunk({ type: packet.key ? 'key' : 'delta', timestamp: packet.timestamp, data: packet.color }))
      if (packet.alpha) this.decoders[1].decode(new EncodedVideoChunk({ type: packet.key ? 'key' : 'delta', timestamp: packet.timestamp, data: packet.alpha }))
    }
    if (!this.closed && this.sent === this.clip.frames.length && !this.flushed) {
      this.flushed = true
      for (const decoder of this.decoders) void decoder.flush().catch(e => this.error(String(e)))
    }
  }
  peek(): GannFramePair | null {
    if (this.closed) return null
    const packet = this.clip.frames[this.taken]
    const pair = packet && this.frames.get(packet.timestamp)
    return pair?.color && (!packet.alpha || pair.alpha) ? pair as GannFramePair : null
  }
  take(): GannFramePair | null {
    const pair = this.peek()
    if (!pair) return null
    this.frames.delete(pair.color.timestamp); this.requested.delete(pair.color.timestamp); this.taken++
    try { this.feed() } catch (e) { this.error(String(e)) }
    return pair
  }
  private error(message: string) {
    if (this.closed) return
    this.dispose(); this.failed(message)
  }
  dispose() {
    if (this.closed) return
    this.closed = true
    for (const decoder of this.decoders) if (decoder.state !== 'closed') decoder.close()
    for (const pair of this.frames.values()) { pair.color?.close(); pair.alpha?.close() }
    this.frames.clear(); this.requested.clear()
  }
}
