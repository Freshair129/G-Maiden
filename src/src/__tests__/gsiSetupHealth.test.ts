import { describe, expect, it } from 'vitest'
import { buildGsiSetupHealth } from '../app/gsiSetupHealth'
import type { GsiStatus, SetupStatus } from '../app/types'

const setup: SetupStatus = {
  installed: true, cfg_present: true, cfg_valid: true,
  steam_path: null, dota_cfg_dir: 'D:/Steam/dota 2 beta/game/dota/cfg', message: '',
}
const health: GsiStatus = {
  server_state: 'listening', gsi_port: 3000, dota_running: false,
  gsi_active: false, gsi_freshness: 'waiting', gsi_age_ms: null,
  in_game: false, display_exclusive: false, dota_restart_required: false,
}

describe('GSI setup health', () => {
  it('keeps every stage and OAuth unknown before either input arrives', () => {
    const result = buildGsiSetupHealth(null, null)
    expect(Object.values(result.stages).map(({ state }) => state)).toEqual(Array(5).fill('unknown'))
    expect(result.oauthCallback.state).toBe('unknown')
  })

  it.each([
    { name: 'missing config', patch: { installed: false, cfg_present: false, cfg_valid: false }, exists: 'pending', valid: 'pending', text: 'ติดตั้ง' },
    { name: 'invalid config', patch: { installed: false, cfg_present: true, cfg_valid: false }, exists: 'ok', valid: 'blocked', text: 'ซ่อม' },
    { name: 'unconfirmed installation', patch: { installed: false, cfg_present: true, cfg_valid: true }, exists: 'ok', valid: 'blocked', text: 'ซ่อม' },
  ])('reports $name without claiming valid configuration', ({ patch, exists, valid, text }) => {
    const result = buildGsiSetupHealth({ ...setup, ...patch }, null)
    expect(result.stages.configExists.state).toBe(exists)
    expect(result.stages.configValid.state).toBe(valid)
    expect(result.stages.configValid.text).toContain(text)
  })

  it.each([
    { name: 'port 3000', patch: {}, listening: 'ok', oauth: 'ready', text: '3000' },
    { name: 'legacy omitted port', patch: { gsi_port: undefined }, listening: 'ok', oauth: 'ready', text: '3000' },
    { name: 'fallback port', patch: { gsi_port: 3001 }, listening: 'ok', oauth: 'blocked', text: '3001' },
    { name: 'last fallback port', patch: { gsi_port: 3010 }, listening: 'ok', oauth: 'blocked', text: '3010' },
    { name: 'all ports occupied', patch: { server_state: 'port_conflict' }, listening: 'blocked', oauth: 'blocked', text: '3000–3010' },
    { name: 'bind error', patch: { server_state: 'bind_error' }, listening: 'blocked', oauth: 'blocked', text: 'ไม่สำเร็จ' },
    { name: 'starting', patch: { server_state: 'starting' }, listening: 'pending', oauth: 'unknown', text: 'กำลังเริ่ม' },
  ] satisfies { name: string; patch: Partial<GsiStatus>; listening: string; oauth: string; text: string }[])(
    'separates listener and OAuth readiness for $name', ({ patch, listening, oauth, text }) => {
      const result = buildGsiSetupHealth(setup, { ...health, ...patch })
      expect(result.stages.listening.state).toBe(listening)
      expect(result.stages.listening.text).toContain(text)
      expect(result.oauthCallback.state).toBe(oauth)
      if (oauth === 'blocked') expect(result.oauthCallback.text).toContain('3000')
      if (patch.gsi_port && patch.gsi_port !== 3000) {
        expect(result.oauthCallback.text).toContain(`GSI ยังทำงานบนพอร์ต ${patch.gsi_port}`)
        expect(result.oauthCallback.text).toContain('เปิด G-Maiden ใหม่')
      }
    },
  )

  it('waits for Dota while the config and port are ready', () => {
    const result = buildGsiSetupHealth(setup, health)
    expect(result.stages.configExists.state).toBe('ok')
    expect(result.stages.configValid.state).toBe('ok')
    expect(result.stages.waiting).toMatchObject({ state: 'pending', text: expect.stringContaining('รอเปิด Dota 2') })
    expect(result.stages.live.state).toBe('pending')
    expect(result.oauthCallback.state).toBe('ready')
  })

  it('waits for the first packet with a Dota restart hint', () => {
    const result = buildGsiSetupHealth(setup, { ...health, dota_running: true })
    expect(result.stages.waiting.state).toBe('pending')
    expect(result.stages.waiting.text).toContain('ปิดแล้วเปิด Dota 2')
  })

  it.each([
    { freshness: 'fresh', age: 200, state: 'ok', text: 'ล่าสุด' },
    { freshness: 'stale', age: 12_500, state: 'blocked', text: '12.5 วินาที' },
    { freshness: 'stale', age: null, state: 'blocked', text: 'ล้าสมัย' },
    { freshness: 'waiting', age: null, state: 'pending', text: 'รอ' },
    { freshness: 'unavailable', age: null, state: 'pending', text: 'รอ' },
  ] as const)('reports $freshness feed independently of gsi_active', ({ freshness, age, state, text }) => {
    const result = buildGsiSetupHealth(setup, { ...health, dota_running: true, gsi_freshness: freshness, gsi_age_ms: age })
    expect(result.stages.live.state).toBe(state)
    expect(result.stages.live.text).toContain(text)
    expect(result.stages.live.text).not.toMatch(/NaN|undefined/)
  })

  it.each([
    { name: 'setup', setup: null, health: { ...health, dota_running: true, gsi_freshness: 'fresh' as const }, keys: ['configExists', 'configValid'] as const },
    { name: 'health', setup, health: null, keys: ['listening', 'waiting', 'live'] as const },
  ])('never passes a stage whose $name input is missing', ({ setup, health, keys }) => {
    const result = buildGsiSetupHealth(setup, health)
    for (const key of keys) expect(result.stages[key].state).toBe('unknown')
  })

  it.each([
    { name: 'restart required', setup, health: { ...health, dota_restart_required: true }, text: 'ปิดแล้วเปิด Dota 2 เพื่อโหลด config ใหม่' },
    { name: 'install or repair', setup: { ...setup, installed: false, cfg_valid: false }, health, text: 'หลังติดตั้งหรือซ่อม' },
    { name: 'missing folder', setup: { ...setup, dota_cfg_dir: null }, health, text: 'เลือกโฟลเดอร์ Dota 2 beta' },
    { name: 'port retry', setup, health: { ...health, server_state: 'port_conflict' as const }, text: 'ทุก 3 วินาที' },
    { name: 'bind retry', setup, health: { ...health, server_state: 'bind_error' as const }, text: 'ทุก 3 วินาที' },
  ])('offers a terminal-free fix for $name', ({ setup, health, text }) => {
    expect(buildGsiSetupHealth(setup, health).remediation.join(' ')).toContain(text)
  })
})
