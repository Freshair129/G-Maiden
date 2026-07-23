import { describe, expect, it } from 'vitest'
import { clampUnit, heroExitProgress } from './scrollNarrative'

describe('scroll narrative math', () => {
  it('clamps the normalized progress to the supported range', () => {
    expect(clampUnit(-0.2)).toBe(0)
    expect(clampUnit(0.42)).toBe(0.42)
    expect(clampUnit(1.2)).toBe(1)
  })

  it('derives Hero exit progress from the viewport height', () => {
    expect(heroExitProgress(450, 900)).toBe(0.5)
    expect(heroExitProgress(1200, 900)).toBe(1)
    expect(heroExitProgress(40, 0)).toBe(0)
  })
})
