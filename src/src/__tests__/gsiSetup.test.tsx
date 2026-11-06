// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDotaInstallPath, savedDotaInstallPath } from '../app/gsiSetup'
import { SetupCard } from '../app/cards/SetupCard'
import { Welcome } from '../app/cards/Welcome'

const { invokeMock, openMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), openMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

const PATH_A = 'D:\\SteamA\\dota 2 beta'
const PATH_B = 'E:\\SteamB\\dota 2 beta'
let root: Root | undefined
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  localStorage.setItem('gm-dota-install-path', PATH_A)
  invokeMock.mockReset().mockImplementation(async (command: string) => {
    if (command === 'detect_gsi_setup') return { installed: false, cfg_present: false, cfg_valid: false, dota_cfg_dir: PATH_A, message: 'setup fixture' }
    return false
  })
  openMock.mockReset().mockResolvedValue(PATH_B)
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
