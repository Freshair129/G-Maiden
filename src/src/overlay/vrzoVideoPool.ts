import type { ModuleCfg } from './modules'
import type { VrzoVisual } from './vrzoBanner'
import { GannFramePlayer, type GannFrameStats } from './gannFramePlayer'

export interface VisualReceipt extends GannFrameStats { playbackId: string; reason: string; warmed: boolean }
interface Slot { player: GannFramePlayer; url: string; scope: string; visual: VrzoVisual | null; alive: boolean; warmed: boolean; reported: boolean }
interface Candidate { packId: string; bannerId: string; revision: number; event: string }
interface Batch { packId: string | null; revision: number; visuals: Candidate[] }
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


/** At most three GANN decoders: preparation never advances a media clock. */
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
    if (!sameScope) for (const slot of [...this.slots]) this.remove(slot)
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
    for (const slot of [...this.slots]) if (slot.visual && !desired.some(v => v.id === slot.visual?.id)) this.remove(slot)
    for (const next of desired) {
      let slot = this.slots.find(s => s.visual?.id === next.id)
      if (!slot) {
        const scope = this.visualScope(next)
        slot = this.slots.find(s => !s.visual && s.url === next.url && s.scope === scope)
        if (!slot) {
          if (this.slots.length >= 3) { const spare = this.slots.find(s => !s.visual); if (spare) this.remove(spare) }
          if (this.slots.length < 3) slot = this.create(next.url, scope)
        }
      }
      if (!slot) continue
      const first = !slot.visual
      slot.visual = next
      const canvas = slot.player.canvas
      canvas.dataset.playbackId = next.id
      Object.assign(canvas.style, { left: `${layout.x}%`, top: `${layout.y}%`,
        transform: `translate(-50%, -50%) scale(${layout.scale})`, opacity: next.exiting ? '0' : '1',
        transition: next.exiting ? 'opacity 300ms ease-out' : 'none', zIndex: next.exiting ? '39' : '40' })
      if (first) { slot.warmed = slot.player.ready; slot.player.start() }
    }
    this.warm()
  }
  private visualScope(visual: VrzoVisual) { return scopeOf(visual.manifestVisual.packId, visual.manifestVisual.revision) }
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
      const url = urls[priority]
      if (this.slots.some(s => s.url === url)) continue
      if (this.slots.length >= 3) {
        const rank = (slot: Slot) => { const index = urls.indexOf(slot.url); return index < 0 ? Infinity : index }
        const spare = this.slots.filter(s => !s.visual && rank(s) > priority).sort((a, b) => rank(b) - rank(a))[0]
        if (!spare) continue
        this.remove(spare)
      }
      this.create(url, scopeOf(candidate.packId, candidate.revision))
    }
  }
  private create(url: string, scope: string): Slot {
    const finish = (reason: string) => {
      if (!slot.alive) return
      const playbackId = slot.visual?.id
      this.receipt(slot, reason); this.remove(slot)
      if (playbackId) this.fail(playbackId)
    }
    const player = new GannFramePlayer(url, () => finish('ended'), reason => {
      if (slot.alive) console.warn('GANN visual rejected:', reason)
      finish('error')
    })
    const slot: Slot = { player, url, scope, visual: null, alive: true, warmed: false, reported: false }
    Object.assign(player.canvas.style, { position: 'fixed', width: '680px', maxWidth: '72vw', pointerEvents: 'none', opacity: '0', zIndex: '40' })
    this.slots.push(slot); this.host.append(player.canvas)
    return slot
  }
  private receipt(slot: Slot, reason: string) {
    if (!slot.visual || slot.reported) return
    slot.reported = true
    this.report({ playbackId: slot.visual.id, reason, ...slot.player.stats(), warmed: slot.warmed })
  }
  private remove(slot: Slot) {
    if (!slot.alive) return
    slot.alive = false; this.receipt(slot, 'cleared'); slot.player.dispose()
    this.slots = this.slots.filter(s => s !== slot)
  }
  dispose() { this.disposed = true; for (const slot of [...this.slots]) this.remove(slot) }
}
