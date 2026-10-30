const clips: Readonly<Record<string, readonly string[]>> = {
  match_start: ['match_start_01'], first_blood: ['first_blood_01'],
  double_kill: ['double_kill_01'], triple_kill: ['triple_kill_01'],
  ultra_kill: ['ultra_kill_01'], rampage: ['rampage_01'],
  killing_spree: ['killing_spree_01'], dominating: ['dominating_01'],
  mega_kill: ['mega_kill_01'], unstoppable: ['unstoppable_01'],
  wicked_sick: ['wicked_sick_01'], monster_kill: ['monster_kill_01'],
  godlike: ['godlike_01'], beyond_godlike: ['beyond_godlike_01', 'beyond_godlike_02'],
  kill: ['kill_01', 'kill_02', 'kill_03', 'kill_04', 'kill_05', 'kill_06'],
}
export const VRZO_CLIPS: readonly { event: string; clipId: string }[] = Object.entries(clips)
  .flatMap(([event, entries]) => entries.map((clipId) => ({ event, clipId })))
export function vrzoAsset(clipId: string, event: string): string | null {
  return Object.prototype.hasOwnProperty.call(clips, event) && clips[event].includes(clipId)
    ? `/vrzo-banners/${clipId}.webm` : null
}
export interface VrzoPlayback {
  id: string
  phase: 'start' | 'stop' | 'completed' | 'retire'
  clipId: string
  event: string
  session_epoch: number
  preview: boolean
  expires_at_ms: number
  manifestVisual?: { packId: string; bannerId: string; revision: string } | null
}
export interface VrzoVisual extends VrzoPlayback { url: string; exiting?: boolean; outgoing?: VrzoVisual }

/** Native audio assigns ids; higher ids fence late starts and stops. */
export class VrzoBannerController {
  private latest = 0n
  private current: VrzoVisual | null = null
  private completedId: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private retirement: ReturnType<typeof setTimeout> | null = null
  constructor(private readonly update: (visual: VrzoVisual | null) => void) {}

  receive(value: unknown, session: number | null, now: number) {
    if (!value || typeof value !== 'object') return
    const p = value as VrzoPlayback
    if (typeof p.id !== 'string' || !/^[1-9]\d{0,19}$/.test(p.id)
      || typeof p.clipId !== 'string' || typeof p.event !== 'string'
      || !['start', 'stop', 'completed', 'retire'].includes(p.phase) || typeof p.preview !== 'boolean'
      || !Number.isSafeInteger(p.session_epoch) || p.session_epoch < 0
      || !Number.isSafeInteger(p.expires_at_ms) || !Number.isFinite(now)) return
    const idPattern = (prefix: string) => new RegExp(`^${prefix}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
    let url: string | null
    if (p.manifestVisual != null) {
      const v = p.manifestVisual
      if (typeof v !== 'object' || !idPattern('ann').test(v.packId)
        || !idPattern('bnr').test(v.bannerId) || v.bannerId !== p.clipId
        || typeof v.revision !== 'string' || !/^[1-9]\d{0,19}$/.test(v.revision)
        || BigInt(v.revision) > 0xffffffffffffffffn) return
      url = `http://g-announcer-video.localhost/${v.packId}/${v.bannerId}/${v.revision}`
    } else url = vrzoAsset(p.clipId, p.event)
    if (!url || (!p.preview && (session === null || p.session_epoch !== session || session <= 0))) return
    const id = BigInt(p.id)
    const outgoing = this.current?.outgoing
    if (p.phase === 'stop' && outgoing?.id === p.id && outgoing.clipId === p.clipId
      && outgoing.event === p.event && outgoing.session_epoch === p.session_epoch && outgoing.preview === p.preview) {
      this.fail(p.id)
      return
    }
    if (id > 0xffffffffffffffffn || id < this.latest) return
    if (p.phase === 'completed') {
      if (id !== this.latest || this.completedId === p.id || this.current?.id !== p.id
        || this.current.preview !== p.preview || this.current.session_epoch !== p.session_epoch
        || this.current.clipId !== p.clipId || this.current.event !== p.event) return
      this.completedId = p.id
      if (this.timer !== null) clearTimeout(this.timer)
      const delay = Math.max(0, Math.min(4200, this.current.expires_at_ms - now))
      this.timer = setTimeout(() => { if (this.current?.id === p.id) this.clear() }, delay)
      return
    }
    if (p.phase === 'stop' || p.phase === 'retire') {
      if (id > this.latest) this.latest = id
      if (this.current?.id === p.id && this.current.preview === p.preview
        && this.current.session_epoch === p.session_epoch && this.current.clipId === p.clipId
        && this.current.event === p.event) {
        if (p.phase === 'stop') this.clear()
        else {
          if (this.timer !== null) clearTimeout(this.timer)
          this.current = { ...this.current, exiting: true, outgoing: undefined }
          this.update(this.current)
          this.scheduleRetirement(p.id)
        }
      }
      return
    }
    if (id <= this.latest || p.expires_at_ms <= now || p.expires_at_ms > now + 15_500) return
    this.latest = id
    this.completedId = null
    if (this.timer !== null) clearTimeout(this.timer)
    const sameScope = this.current?.preview === p.preview && this.current.session_epoch === p.session_epoch
      && this.current.manifestVisual?.packId === p.manifestVisual?.packId
      && this.current.manifestVisual?.revision === p.manifestVisual?.revision
    const retiring = this.current && sameScope ? { ...this.current, exiting: true, outgoing: undefined } : undefined
    this.current = { ...p, url, outgoing: retiring }
    this.update(this.current)
    if (retiring) this.scheduleRetirement(retiring.id)
    this.timer = setTimeout(() => { if (this.current?.id === p.id) this.clear() }, p.expires_at_ms - now)
    return true
  }
  private scheduleRetirement(id: string) {
    if (this.retirement !== null) clearTimeout(this.retirement)
    this.retirement = setTimeout(() => this.fail(id), 300)
  }
  fail(id: string) {
    if (this.current?.id === id) this.clear()
    else if (this.current?.outgoing?.id === id) {
      this.current = { ...this.current, outgoing: undefined }
      this.update(this.current)
    }
  }
  clearLive() {
    if (this.current && !this.current.preview) this.clear()
    else if (this.current?.outgoing && !this.current.outgoing.preview) this.fail(this.current.outgoing.id)
  }
  clear() {
    if (this.timer !== null) clearTimeout(this.timer)
    if (this.retirement !== null) clearTimeout(this.retirement)
    this.retirement = null
    this.timer = null
    this.completedId = null
    if (this.current) { this.current = null; this.update(null) }
  }
  destroy() { this.clear() }
}
