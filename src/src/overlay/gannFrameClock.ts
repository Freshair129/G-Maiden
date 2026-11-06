export class GannFrameClock {
  maxLatenessMs = 0
  private index = 0
  private lastTick = -Infinity
  private lastSubmit = -Infinity
  private refreshMs = 1000 / 60
  constructor(readonly timestamps: readonly number[], readonly durationMs: number) {}
  next(now: number, available = true): number | null {
    if (!Number.isFinite(now) || now <= this.lastTick) return null
    const interval = now - this.lastTick
    if (interval >= 4 && interval <= 25) this.refreshMs = interval
    this.lastTick = now
    const pts = this.timestamps[this.index]
    // WebM's millisecond timestamps must land on their nearest display refresh.
    // Consume one frame per refresh; a late tick must never discard queued PTSs.
    if (!available || pts === undefined || now + this.refreshMs / 2 < pts) return null
    this.lastSubmit = now
    this.maxLatenessMs = Math.max(this.maxLatenessMs, now - pts)
    return this.index++
  }
  finished(now: number) {
    return this.index === this.timestamps.length && now >= this.durationMs
      && now - this.lastSubmit >= this.refreshMs / 2
  }
}
