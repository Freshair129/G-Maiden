import type { ModuleCfg } from './modules'
import type { VrzoVisual } from './vrzoBanner'

export interface VisualReceipt {
  playbackId: string; reason: string; frames: number; dropped: number; firstFrameMs: number
  elapsedMs: number; mediaSeconds: number; warmed: boolean; durationSeconds: number; waiting: number
}
interface Candidate { packId: string; bannerId: string; revision: number; event: string }
interface Batch { packId: string | null; revision: number; visuals: Candidate[] }
interface Slot {
  video: HTMLVideoElement; url: string; scope: string; visual: VrzoVisual | null
  ready: boolean; alive: boolean; frame: number | null; loaded: (() => void) | null
  seeked: (() => void) | null
  primeTimeout: ReturnType<typeof setTimeout> | null
  started: number; warmed: boolean; firstFrameMs: number; frames: number; dropped: number; waiting: number; reported: boolean
}
const id = (value: unknown, prefix: string): value is string => typeof value === 'string'
  && new RegExp(`^${prefix}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).test(value)
const generation = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const scopeOf = (pack: string | null, revision: number | string) => `${pack ?? ''}/${revision}`
function parseBatch(value: unknown): Batch | null {
  if (!value || typeof value !== 'object') return null
  const batch = value as Batch
  if ((batch.packId !== null && typeof batch.packId !== 'string') || !generation(batch.revision) || !Array.isArray(batch.visuals)) return null
  return { ...batch, visuals: batch.visuals.slice(0, 6).filter(v => v && id(v.packId, 'ann') && id(v.bannerId, 'bnr')
    && v.packId === batch.packId && v.revision === batch.revision && typeof v.event === 'string') }
}

/** DOM identity survives warm -> admitted playback; the pool owns at most three decoders. */
export class VrzoVideoPool {
  private slots: Slot[] = []
  private batch: Batch | null = null
  private disposed = false
  constructor(private readonly host: HTMLElement, private readonly fail: (id: string) => void,
    private readonly report: (receipt: VisualReceipt) => void) {}

  candidates(value: unknown) {
    const batch = parseBatch(value)
    if (this.disposed || !batch || (this.batch && batch.revision < this.batch.revision)) return
    const sameScope = this.batch && scopeOf(batch.packId, batch.revision) === scopeOf(this.batch.packId, this.batch.revision)
    if (!sameScope) {
      for (const slot of [...this.slots]) this.remove(slot)
    }
    const merged = [...batch.visuals, ...(sameScope ? this.batch?.visuals ?? [] : [])]
    this.batch = { ...batch, visuals: merged.filter((v, i) => merged.findIndex(c => c.bannerId === v.bannerId) === i).slice(0, 3) }
    this.warm()
  }

  show(visual: VrzoVisual | null, layout: ModuleCfg) {
    if (this.disposed) return
    const manifest = visual?.manifestVisual
    if (manifest && generation(Number(manifest.revision)) && (!this.batch || Number(manifest.revision) > this.batch.revision)) {
      this.candidates({ packId: manifest.packId, revision: Number(manifest.revision), visuals: [] })
    }
    const desired = [visual, visual?.outgoing].filter((v): v is VrzoVisual => !!v && this.accepts(v))
    for (const slot of [...this.slots]) {
      if (slot.visual && !desired.some(v => v.id === slot.visual?.id)) this.remove(slot)
    }
    for (const next of desired) {
      let slot = this.slots.find(s => s.visual?.id === next.id)
      if (!slot) {
        const scope = this.visualScope(next)
        slot = this.slots.find(s => !s.visual && s.url === next.url && s.scope === scope)
        if (!slot) {
          if (this.slots.length >= 3) {
            const spare = this.slots.find(s => !s.visual)
            if (spare) this.remove(spare)
          }
          if (this.slots.length < 3) slot = this.create(next.url, scope)
        }
        if (!slot) continue
        this.activate(slot, next)
      }
      slot.visual = next
      slot.video.playbackRate = next.exiting ? 2 : 1
      Object.assign(slot.video.style, { left: `${layout.x}%`, top: `${layout.y}%`,
        transform: `translate(-50%, -50%) scale(${layout.scale})`, opacity: next.exiting ? '0' : '1',
        transition: next.exiting ? 'opacity 300ms ease-out' : 'none',
        zIndex: next.exiting ? '39' : '40' })
    }
    this.warm()
  }

  private visualScope(visual: VrzoVisual) {
    return scopeOf(visual.manifestVisual.packId, visual.manifestVisual.revision)
  }
  private accepts(visual: VrzoVisual) {
    if (!visual.manifestVisual) return false
    const manifest = visual.manifestVisual
    if (!id(manifest.packId, 'ann') || !id(manifest.bannerId, 'bnr')
      || visual.url !== `http://g-announcer-video.localhost/${manifest.packId}/${manifest.bannerId}/${manifest.revision}`) return false
    return !this.batch || this.visualScope(visual) === scopeOf(this.batch.packId, this.batch.revision)
  }
  private warm() {
    const candidates = this.batch?.visuals ?? []
    const urls = candidates.map(v => `http://g-announcer-video.localhost/${v.packId}/${v.bannerId}/${v.revision}`)
    for (const [priority, candidate] of candidates.entries()) {
      const url = `http://g-announcer-video.localhost/${candidate.packId}/${candidate.bannerId}/${candidate.revision}`
      if (this.slots.some(s => s.url === url)) continue
      if (this.slots.length >= 3) {
        const rank = (slot: Slot) => { const index = urls.indexOf(slot.url); return index < 0 ? Infinity : index }
        const spare = this.slots.filter(s => !s.visual && rank(s) > priority).sort((a, b) => rank(b) - rank(a))[0]
        if (!spare) continue
        this.remove(spare)
      }
      const slot = this.create(url, scopeOf(candidate.packId, candidate.revision))
      const ready = () => {
        if (!slot.alive || slot.visual || slot.ready || slot.seeked) return
        this.cancelPrime(slot)
        slot.video.pause()
        if (slot.video.currentTime > 0.001) {
          const settled = () => {
            if (!slot.alive || slot.visual || slot.video.seeking || slot.video.currentTime > 0.001 || slot.video.readyState < 2) return
            slot.ready = true
            this.cancelPrime(slot)
          }
          slot.seeked = settled; slot.loaded = settled
          slot.video.addEventListener('seeked', settled)
          slot.video.addEventListener('loadeddata', settled)
          slot.video.currentTime = 0
          settled()
        } else slot.ready = true
      }
      if (typeof slot.video.requestVideoFrameCallback === 'function') {
        slot.frame = slot.video.requestVideoFrameCallback(ready)
      }
      // Hidden WebView video may decode without composing a frame callback.
      slot.loaded = () => { if (slot.video.readyState >= 2) ready() }
      slot.video.addEventListener('loadeddata', slot.loaded)
      slot.primeTimeout = setTimeout(() => {
        slot.primeTimeout = null
        if (!slot.alive || slot.visual) return
        if (slot.video.readyState >= 2) ready()
        else { this.cancelPrime(slot); slot.video.pause() }
      }, 1500)
      void slot.video.play().catch((error: unknown) => {
        if (!slot.alive || slot.visual) return
        const abort = error && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
        if (abort && (slot.ready || slot.seeked)) return
        this.remove(slot)
      })
    }
  }
  private create(url: string, scope: string): Slot {
    const video = document.createElement('video')
    video.muted = true; video.defaultMuted = true; video.playsInline = true; video.preload = 'auto'
    video.setAttribute('aria-label', 'VRZO announcer visual')
    Object.assign(video.style, { position: 'fixed', width: '680px', maxWidth: '72vw', pointerEvents: 'none',
      opacity: '0', transition: 'opacity 300ms ease-out', zIndex: '40' })
    const slot: Slot = { video, url, scope, visual: null, ready: false, alive: true, frame: null, loaded: null,
      primeTimeout: null, seeked: null,
      started: 0, warmed: false, firstFrameMs: -1, frames: 0, dropped: 0, waiting: 0, reported: false }
    video.addEventListener('ended', () => {
      if (!slot.alive) return
      if (slot.visual) { this.receipt(slot, 'ended'); this.fail(slot.visual.id) }
      else this.remove(slot)
    })
    video.addEventListener('error', () => {
      if (!slot.alive) return
      if (slot.visual) { this.receipt(slot, 'error'); this.fail(slot.visual.id) }
      else this.remove(slot)
    })
    video.addEventListener('waiting', () => { if (slot.visual) slot.waiting++ })
    this.slots.push(slot); this.host.append(video); video.src = url
    return slot
  }
  private cancelPrime(slot: Slot) {
    if (slot.primeTimeout !== null) clearTimeout(slot.primeTimeout)
    slot.primeTimeout = null
    if (slot.frame !== null && typeof slot.video.cancelVideoFrameCallback === 'function') slot.video.cancelVideoFrameCallback(slot.frame)
    slot.frame = null
    if (slot.loaded) slot.video.removeEventListener('loadeddata', slot.loaded)
    slot.loaded = null
    if (slot.seeked) slot.video.removeEventListener('seeked', slot.seeked)
    slot.seeked = null
  }
  private activate(slot: Slot, visual: VrzoVisual) {
    this.cancelPrime(slot)
    slot.visual = visual; slot.video.dataset.playbackId = visual.id
    slot.warmed = slot.ready; slot.started = performance.now()
    const quality = slot.video.getVideoPlaybackQuality?.()
    slot.frames = quality?.totalVideoFrames ?? 0; slot.dropped = quality?.droppedVideoFrames ?? 0
    if (typeof slot.video.requestVideoFrameCallback === 'function') {
      const presented: VideoFrameRequestCallback = (_now, metadata) => {
        slot.frame = null
        if (!slot.alive || slot.visual?.id !== visual.id) return
        // Revision4 frame0 is deliberately transparent; frame1 carries content.
        if (metadata.mediaTime < 0.01) slot.frame = slot.video.requestVideoFrameCallback(presented)
        else slot.firstFrameMs = performance.now() - slot.started
      }
      slot.frame = slot.video.requestVideoFrameCallback(presented)
    }
    void slot.video.play().catch(() => {
      if (slot.alive && slot.visual?.id === visual.id) { this.receipt(slot, 'error'); this.fail(visual.id) }
    })
  }
  private receipt(slot: Slot, reason: string) {
    if (!slot.visual || slot.reported) return
    slot.reported = true
    const quality = slot.video.getVideoPlaybackQuality?.()
    const frames = Math.max(0, (quality?.totalVideoFrames ?? 0) - slot.frames)
    this.report({ playbackId: slot.visual.id, reason, frames,
      dropped: Math.min(frames, Math.max(0, (quality?.droppedVideoFrames ?? 0) - slot.dropped)),
      firstFrameMs: slot.firstFrameMs, elapsedMs: performance.now() - slot.started,
      mediaSeconds: slot.video.currentTime, warmed: slot.warmed,
      durationSeconds: Number.isFinite(slot.video.duration) ? slot.video.duration : 0, waiting: slot.waiting })
  }
  private remove(slot: Slot) {
    if (!slot.alive) return
    slot.alive = false
    this.receipt(slot, 'cleared'); this.cancelPrime(slot)
    slot.video.pause(); slot.video.removeAttribute('src'); slot.video.load(); slot.video.remove()
    this.slots = this.slots.filter(s => s !== slot)
  }
  dispose() { this.disposed = true; for (const slot of [...this.slots]) this.remove(slot) }
}
