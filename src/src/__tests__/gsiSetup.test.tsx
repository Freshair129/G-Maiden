// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDotaInstallPath, savedDotaInstallPath } from '../app/gsiSetup'
import { SetupCard } from '../app/cards/SetupCard'
import { Welcome } from '../app/cards/Welcome'
import type { GsiStatus } from '../app/types'

const { invokeMock, openMock, listenMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), openMock: vi.fn(), listenMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }))

const PATH_A = 'D:\\SteamA\\dota 2 beta'
const PATH_B = 'E:\\SteamB\\dota 2 beta'
let root: Root | undefined
let container: HTMLDivElement
let gsiStatusCallback: ((event: { payload: GsiStatus }) => void) | undefined
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  localStorage.setItem('gm-dota-install-path', PATH_A)
  invokeMock.mockReset().mockImplementation(async (command: string) => {
    if (command === 'detect_gsi_setup') return { installed: false, cfg_present: false, cfg_valid: false, dota_cfg_dir: PATH_A, message: 'setup fixture' }
    return false
  })
  openMock.mockReset().mockResolvedValue(PATH_B)
  gsiStatusCallback = undefined
  listenMock.mockReset().mockImplementation(async (name: string, callback: typeof gsiStatusCallback) => {
    if (name === 'gsi-status') gsiStatusCallback = callback
    return () => { if (name === 'gsi-status') gsiStatusCallback = undefined }
  })
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  vi.unstubAllGlobals()
})

describe('native-authorized selected Dota install', () => {
  it.each([PATH_B, null])('persists %s natively before committing the local preference', async (path) => {
    let acknowledge!: () => void
    invokeMock.mockImplementation(() => new Promise<void>((resolve) => { acknowledge = resolve }))
    const pending = saveDotaInstallPath(path)
    expect(invokeMock).toHaveBeenCalledWith('set_gsi_dota_selection', { dotaInstallPath: path })
    expect(savedDotaInstallPath()).toBe(PATH_A)
    acknowledge()
    await pending
    expect(savedDotaInstallPath()).toBe(path)
  })

  it.each([PATH_B, null])('retains the previous selection when native persistence of %s fails', async (path) => {
    invokeMock.mockRejectedValue(new Error('native selection rejected'))
    await expect(Promise.resolve(saveDotaInstallPath(path))).rejects.toThrow('native selection rejected')
    expect(savedDotaInstallPath()).toBe(PATH_A)
  })
})

describe.each(['settings', 'welcome'] as const)('%s selection surface', (surface) => {
  async function mount() {
    container = document.createElement('div')
    root = createRoot(container)
    await act(async () => root!.render(surface === 'settings' ? <SetupCard /> : <Welcome onDone={() => {}} />))
  }
  async function click(label: string) {
    const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label)
    expect(button).toBeDefined()
    await act(async () => { button!.click() })
  }

  async function emitHealth(overrides: Partial<GsiStatus>) {
    expect(gsiStatusCallback).toBeDefined()
    await act(async () => gsiStatusCallback!({ payload: {
      server_state: 'listening', gsi_port: 3000, dota_running: true,
      gsi_active: false, gsi_freshness: 'waiting', gsi_age_ms: null,
      in_game: false, display_exclusive: false, dota_restart_required: false,
      ...overrides,
    } }))
  }

  it('shows GSI listening on a fallback port while Google sign-in is blocked', async () => {
    await mount()
    await emitHealth({ gsi_port: 3001 })
    expect(container.textContent).toContain('127.0.0.1:3001')
    expect(container.textContent).toContain('พร้อมรับข้อมูล GSI')
    const alert = container.querySelector('[role="alert"]')?.textContent
    expect(alert).toContain('ลงชื่อเข้าใช้ Google ไม่ได้')
    expect(alert).toContain('3000')
    expect(alert).toContain('GSI ยังทำงานบนพอร์ต 3001')
    expect(container.textContent).not.toContain('พอร์ตพร้อมสำหรับลงชื่อเข้าใช้ Google')
  })

  it('names the entire fallback range when all GSI ports are occupied', async () => {
    await mount()
    await emitHealth({ server_state: 'port_conflict', gsi_freshness: 'unavailable' })
    expect(container.textContent).toContain('3000–3010')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('ลงชื่อเข้าใช้ Google ไม่ได้')
  })

  it('shows the restart hint when the native status requires Dota to reload config', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'detect_gsi_setup') return {
        installed: true, cfg_present: true, cfg_valid: true,
        steam_path: null, dota_cfg_dir: PATH_A, message: 'setup fixture',
      }
      return true
    })
    await mount()
    await emitHealth({ gsi_port: 3001, gsi_freshness: 'fresh', gsi_active: true, gsi_age_ms: 100 })
    expect(container.textContent).not.toContain('ปิดแล้วเปิด Dota 2 เพื่อโหลด config ใหม่')
    await emitHealth({ gsi_port: 3001, gsi_freshness: 'fresh', gsi_active: true, gsi_age_ms: 100, dota_restart_required: true })
    expect(container.textContent).toContain('ปิดแล้วเปิด Dota 2 เพื่อโหลด config ใหม่')
  })

  it('retains the displayed and saved path when choosing a new native selection fails', async () => {
    await mount()
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'set_gsi_dota_selection') throw new Error('native selection rejected')
      return { installed: false, cfg_present: false, cfg_valid: false, dota_cfg_dir: PATH_B, message: 'setup fixture' }
    })
    await click('เลือกโฟลเดอร์ Dota 2')
    expect(savedDotaInstallPath()).toBe(PATH_A)
    expect(container.textContent).toContain(`Dota 2 ที่เลือก: ${PATH_A}`)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('native selection rejected')
  })

  it('retains the displayed and saved path when clearing native selection fails', async () => {
    await mount()
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'set_gsi_dota_selection') throw new Error('native clear rejected')
      return { installed: false, cfg_present: false, cfg_valid: false, dota_cfg_dir: PATH_A, message: 'setup fixture' }
    })
    await click('ใช้ตำแหน่ง Steam อัตโนมัติ')
    expect(savedDotaInstallPath()).toBe(PATH_A)
    expect(container.textContent).toContain(`Dota 2 ที่เลือก: ${PATH_A}`)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('native clear rejected')
  })
})
