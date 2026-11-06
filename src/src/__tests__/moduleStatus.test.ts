import { describe, expect, it } from 'vitest'
import { MODULE_STATUS, WIRING_MARK } from '../app/moduleStatus'

describe('module status (FEAT-G-DAMAGE §12a)', () => {
  it('lists each module once with a known wiring state', () => {
    const names = MODULE_STATUS.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
    for (const m of MODULE_STATUS) expect(WIRING_MARK[m.wiring]).toBeTruthy()
  })

  it('does not claim G-Damage is fully wired (self-burst only)', () => {
    const damage = MODULE_STATUS.find((m) => m.name === 'G-Damage')
    expect(damage?.wiring).toBe('partial')
    expect(damage?.note).toBeTruthy()
  })

  it('requires a note for every module that is not fully live', () => {
    for (const m of MODULE_STATUS) {
      if (m.wiring !== 'live') expect(m.note, m.name).toBeTruthy()
    }
  })
})
