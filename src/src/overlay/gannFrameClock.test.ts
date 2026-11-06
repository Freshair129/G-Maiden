import { describe, expect, it } from 'vitest'
import { GannFrameClock } from './gannFrameClock'

describe('GANN frame deadlines', () => {
  it('submits timestamp-rounded 60fps frames once each without skipping frame 17ms', () => {
    const clock = new GannFrameClock([0, 17, 33, 50], 67)
    expect([0, 16.667, 33.334, 50.001].map(t => clock.next(t))).toEqual([0, 1, 2, 3])
    expect(clock.finished(50.001)).toBe(false)
    expect(clock.finished(67)).toBe(true)
  })
  it('does not skip or submit several source frames in the same compositor interval when late', () => {
    const clock = new GannFrameClock([0, 17, 33, 50], 67)
    expect(clock.next(0)).toBe(0)
    expect(clock.next(40)).toBe(1)
    expect(clock.next(40)).toBeNull()
    expect(clock.next(56.667)).toBe(2)
    expect(clock.finished(67)).toBe(false)
    expect(clock.next(73.334)).toBe(3)
    expect(clock.finished(73.334)).toBe(false)
    expect(clock.finished(90)).toBe(true)
    expect(clock.maxLatenessMs).toBeGreaterThan(23)
  })
  it('keeps the original timestamps/duration and waits for future frames', () => {
    const pts = [0, 40, 80]
    const clock = new GannFrameClock(pts, 120)
    expect(clock.next(0)).toBe(0)
    expect(clock.next(16.667)).toBeNull()
    expect(clock.next(33.334)).toBe(1)
    expect(pts).toEqual([0, 40, 80])
    expect(clock.durationMs).toBe(120)
  })
})
