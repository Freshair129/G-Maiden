import { GannDecodeQueue } from './gannDecodeQueue'
import { GannFrameClock } from './gannFrameClock'
import { GannFrameSurface } from './gannFrameSurface'
import { readGannWebm } from './gannWebm'

export interface GannFrameStats {
  frames: number; expectedFrames: number; firstFrameMs: number; elapsedMs: number; mediaSeconds: number
  durationSeconds: number; waiting: number; maxLatenessMs: number; renderer: 'webcodecs-webgl'
}
export class GannFramePlayer {
  readonly canvas = document.createElement('canvas')
  ready = false
  private closed = false
  private active = false
  private request = new AbortController()
  private queue?: GannDecodeQueue
  private surface?: GannFrameSurface
  private clock?: GannFrameClock
  private raf = 0
  private started = 0
  private origin: number | null = null
  private frames = 0
  private firstFrameMs = -1
  private mediaSeconds = 0
  private waiting = 0
  private loadDeadline: ReturnType<typeof setTimeout>
  constructor(url: string, private readonly ended: () => void, private readonly failed: (reason: string) => void) {
    this.canvas.setAttribute('aria-label', 'VRZO announcer visual')
    this.canvas.dataset.renderer = 'webcodecs-webgl'
    this.loadDeadline = setTimeout(() => this.error('GANN decoder startup deadline'), 1500)
    void this.load(url).catch(error => this.error(String(error)))
  }
  private async load(url: string) {
    const response = await fetch(url, { signal: this.request.signal, cache: 'no-store', credentials: 'omit' })
    if (!response.ok) throw new Error('GANN video unavailable')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (this.closed) return
    const clip = readGannWebm(bytes)
    this.clock = new GannFrameClock(clip.frames.map(f => f.timestamp / 1000), clip.durationMs)
    this.surface = new GannFrameSurface(this.canvas, clip.width, clip.height)
    this.queue = new GannDecodeQueue(clip, () => {
      if (this.closed) return
      clearTimeout(this.loadDeadline); this.ready = true
      if (this.active) this.schedule()
    }, reason => this.error(reason))
  }
  start() {
    if (this.closed || this.active) return
    this.active = true; this.started = performance.now()
    if (this.ready) this.schedule()
  }
  private schedule() {
    if (!this.raf && !this.closed && this.active) this.raf = requestAnimationFrame(now => { void this.tick(now) })
  }
  private async tick(now: number) {
    this.raf = 0
    if (this.closed || !this.active || !this.queue || !this.clock || !this.surface) return
    this.origin ??= now
    const elapsed = now - this.origin
    const ready = this.queue.peek()
    const index = this.clock.next(elapsed, !!ready)
    if (index !== null) {
      const pair = this.queue.take()!
      try {
        this.canvas.dataset.frameIndex = String(index)
        this.canvas.dataset.mediaTime = String(pair.color.timestamp / 1_000_000)
        await this.surface.draw(pair)
        if (this.closed) return
        if (!this.frames) this.firstFrameMs = performance.now() - this.started
        this.frames++; this.mediaSeconds = pair.color.timestamp / 1_000_000
      } catch (error) { this.error(String(error)); return }
      finally { pair.color.close(); pair.alpha?.close() }
    } else if (!ready && this.frames < this.clock.timestamps.length) this.waiting++
    if (this.clock.finished(elapsed)) { this.mediaSeconds = this.clock.durationMs / 1000; this.ended(); return }
    // Report a stalled render instead of speeding the media up or skipping PTSs.
    if (elapsed > this.clock.durationMs + 1000) { this.error('GANN presentation deadline'); return }
    this.schedule()
  }
  stats(): GannFrameStats {
    return { frames: this.frames, expectedFrames: this.clock?.timestamps.length ?? 0,
      firstFrameMs: this.firstFrameMs, elapsedMs: this.active ? performance.now() - this.started : 0,
      mediaSeconds: this.mediaSeconds, durationSeconds: (this.clock?.durationMs ?? 0) / 1000,
      waiting: this.waiting, maxLatenessMs: this.clock?.maxLatenessMs ?? 0, renderer: 'webcodecs-webgl' }
  }
  private error(reason: string) {
    if (this.closed) return
    this.dispose(); this.failed(reason)
  }
  dispose() {
    if (this.closed) return
    this.closed = true; clearTimeout(this.loadDeadline); this.request.abort()
    cancelAnimationFrame(this.raf); this.raf = 0
    this.queue?.dispose(); this.surface?.dispose(); this.canvas.remove()
  }
}
