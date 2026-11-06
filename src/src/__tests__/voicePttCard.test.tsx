// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, handlers } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
    const set = handlers.get(name) ?? new Set()
    set.add(handler)
    handlers.set(name, set)
    return Promise.resolve(() => { set.delete(handler) })
  }),
}))

import { VoiceSettings } from '../app/VoiceSettings'
import { DEFAULTS } from '../app/types'

type KeyOptions = Partial<Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>>
type MockPttStatus = { accelerator: string; registered: boolean; error_code?: string }

let root: Root | undefined
let container: HTMLDivElement | undefined

const initialStatus: MockPttStatus = { accelerator: 'Ctrl+Alt+V', registered: true }
const reservedShortcuts: [string, string, KeyOptions][] = [
  ['Ctrl+Alt+S', 's', { ctrlKey: true, altKey: true }],
  ['Alt+Up', 'ArrowUp', { altKey: true }],
  ['Alt+Down', 'ArrowDown', { altKey: true }],
  ['Alt+M', 'm', { altKey: true }],
]

function configureStatus(status: MockPttStatus = initialStatus) {
  invokeMock.mockImplementation((command: string) => {
    if (command === 'get_voice_ptt_status') return Promise.resolve(status)
    if (command === 'set_voice_ptt_shortcut') return Promise.resolve('Ctrl+Alt+V')
    if (command === 'voice_cache_status') return Promise.resolve({ dir: 'fixture', total: 0, counts: {} })
    return Promise.resolve(null)
  })
}

async function mount(element: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(element) })
}

async function mountPttCard() {
  const { VoicePttCard } = await import('../app/cards/VoicePttCard')
  await mount(<VoicePttCard />)
}

async function unmount() {
  if (root) await act(async () => { root!.unmount() })
  root = undefined
  container?.remove()
  container = undefined
}

function button(label: string): HTMLButtonElement {
  return [...(container?.querySelectorAll('button') ?? [])]
    .find((candidate) => candidate.textContent?.trim() === label)!
}

async function click(label: string) {
  await act(async () => { button(label).click() })
}

function keyEvent(key: string, options: KeyOptions = {}) {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
}

async function sendKey(event: KeyboardEvent) {
  await act(async () => { window.dispatchEvent(event) })
}

async function sendEvent(name: string, payload: unknown) {
  await act(async () => {
    for (const handler of handlers.get(name) ?? []) handler({ payload })
  })
}

const callsFor = (command: string) => invokeMock.mock.calls.filter(([name]) => name === command)

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  handlers.clear()
  localStorage.clear()
  invokeMock.mockReset()
  configureStatus()
})

afterEach(async () => {
  await unmount()
  handlers.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('G-Voice push-to-talk settings', () => {
  it('keeps alerts as the default tab and shows G-Voice first in its panel', async () => {
    await mount(<VoiceSettings settings={DEFAULTS} voices={[]} set={() => {}} />)

    const tabs = [...container!.querySelectorAll('[role="tab"]')]
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['การแจ้งเตือน', 'G-Voice'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    expect(container!.querySelector('[role="tabpanel"]')?.textContent).toContain('Alerts (G-Signal)')

    await click('G-Voice')
    const activeTabs = [...container!.querySelectorAll('[role="tab"]')]
    expect(activeTabs[0].getAttribute('aria-selected')).toBe('false')
    expect(activeTabs[1].getAttribute('aria-selected')).toBe('true')
    const panel = container!.querySelector('[role="tabpanel"]')
    const pttCard = panel?.querySelector('section[aria-label="G-Voice · Push-to-talk"]')
    expect(pttCard).not.toBeNull()
    expect(panel?.firstElementChild).toBe(pttCard)
  })

  it('normalizes supported accelerators and returns null for modifiers or unsupported keys', async () => {
    const { acceleratorFromKeyEvent } = await import('../app/cards/voicePttHelpers')

    expect(acceleratorFromKeyEvent(keyEvent('v', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+V')
    expect(acceleratorFromKeyEvent(keyEvent('F9', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+F9')
    expect(acceleratorFromKeyEvent(keyEvent('1', { altKey: true }))).toBe('Alt+1')
    expect(acceleratorFromKeyEvent(keyEvent('Control', { ctrlKey: true }))).toBeNull()
    expect(acceleratorFromKeyEvent(keyEvent('Shift', { shiftKey: true }))).toBeNull()
    expect(acceleratorFromKeyEvent(keyEvent('v'))).toBeNull()
    expect(acceleratorFromKeyEvent(keyEvent('v', { metaKey: true }))).toBeNull()
  })

  it('shows ready and registration warning states while always explaining that STT is unavailable', async () => {
    await mountPttCard()
    expect(container!.textContent).toContain('พร้อมรับปุ่ม')
    expect(container!.querySelector('span[role="status"]')?.getAttribute('style')).toContain('var(--g-ok)')
    expect(container!.textContent).toContain('ยังไม่มีระบบจดจำเสียงในเครื่อง — กดแล้ว Maiden จะยังไม่ฟัง (ไม่เปิดไมโครโฟน)')

    await unmount()
    configureStatus({ accelerator: 'Ctrl+Alt+V', registered: false, error_code: 'registration_failed' })
    await mountPttCard()
    expect(container!.textContent).toContain('ลงทะเบียนปุ่มไม่ได้ — มีโปรแกรมอื่นใช้อยู่ ลองเปลี่ยนปุ่ม')
    expect(container!.querySelector('span[role="status"]')?.getAttribute('style')).toContain('var(--g-warn)')
  })

  it('shows Dota bind guidance and the shortcuts reserved by G-Maiden', async () => {
    await mountPttCard()
    expect(container!.textContent).toContain('แอปตรวจปุ่มที่ผูกไว้ในเกมไม่ได้ — เลือกปุ่มที่ไม่ได้ใช้ใน Dota 2')
    expect(container!.textContent).toContain('Ctrl+Alt+S')
    expect(container!.textContent).toContain('Alt+↑')
    expect(container!.textContent).toContain('Alt+↓')
    expect(container!.textContent).toContain('Alt+M')
  })

  it('captures a key and saves once, keeps controls disabled while pending, then reloads status', async () => {
    let resolveSave!: (accelerator: string) => void
    let resolveStatusRefresh!: (status: MockPttStatus) => void
    const statusRefresh = new Promise<MockPttStatus>((resolve) => { resolveStatusRefresh = resolve })
    let statusReads = 0
    invokeMock.mockImplementation((command: string) => {
      if (command === 'get_voice_ptt_status') {
        statusReads++
        return statusReads === 1 ? Promise.resolve(initialStatus) : statusRefresh
      }
      if (command === 'set_voice_ptt_shortcut') return new Promise<string>((resolve) => { resolveSave = resolve })
      return Promise.resolve(null)
    })
    await mountPttCard()

    await click('เปลี่ยนปุ่ม')
    expect(document.activeElement).toBe(container!.querySelector('section[aria-label="G-Voice · Push-to-talk"]'))
    expect(container!.querySelector('[aria-live="polite"]')?.textContent).toContain('กดปุ่มที่ต้องการ… (Esc เพื่อยกเลิก)')
    await sendKey(keyEvent('F9', { ctrlKey: true, shiftKey: true }))
    await click('บันทึก')

    expect(button('บันทึก').disabled).toBe(true)
    expect(button('ยกเลิก').disabled).toBe(true)
    expect(callsFor('set_voice_ptt_shortcut')).toHaveLength(1)
    expect(callsFor('set_voice_ptt_shortcut')[0]).toEqual(['set_voice_ptt_shortcut', { accelerator: 'Ctrl+Shift+F9' }])

    await act(async () => { resolveSave('Ctrl+Shift+F9'); await Promise.resolve() })
    expect(statusReads).toBe(2)
    expect(button('เปลี่ยนปุ่ม').disabled).toBe(true)

    await act(async () => { resolveStatusRefresh({ accelerator: 'Ctrl+Shift+F9', registered: true }); await statusRefresh })
    expect(container!.querySelector('[aria-label="ปุ่มปัจจุบัน: Ctrl+Shift+F9"]')).not.toBeNull()
    expect(button('เปลี่ยนปุ่ม').disabled).toBe(false)
  })

  it.each([
    ['invalid_accelerator', 'ปุ่มนี้ใช้ไม่ได้ — ต้องมี Ctrl หรือ Alt และตามด้วย A–Z, 0–9 หรือ F1–F12'],
    ['reserved_conflict', 'ปุ่มนี้ G-Maiden ใช้อยู่แล้ว'],
    ['registration_failed', 'ลงทะเบียนปุ่มไม่ได้ — มีโปรแกรมอื่นใช้อยู่ ปุ่มเดิมยังใช้งานได้'],
    ['settings_write_failed', 'บันทึกการตั้งค่าไม่สำเร็จ ปุ่มเดิมยังใช้งานได้'],
    ['unknown_backend_code', 'เปลี่ยนปุ่มไม่สำเร็จ ปุ่มเดิมยังใช้งานได้'],
  ])('maps %s to its message and preserves the current binding', async (errorCode, message) => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'get_voice_ptt_status') return Promise.resolve(initialStatus)
      if (command === 'set_voice_ptt_shortcut') return Promise.reject(errorCode)
      return Promise.resolve(null)
    })
    await mountPttCard()

    await click('เปลี่ยนปุ่ม')
    await sendKey(keyEvent('1', { altKey: true }))
    await click('บันทึก')

    expect(container!.textContent).toContain(message)
    expect(container!.querySelector('[aria-label="ปุ่มปัจจุบัน: Ctrl+Alt+V"]')).not.toBeNull()
    expect(callsFor('set_voice_ptt_shortcut')).toHaveLength(1)
  })

  it('shows invalid feedback for a key without Ctrl or Alt and for a Win or Meta combination', async () => {
    await mountPttCard()
    await click('เปลี่ยนปุ่ม')
    await sendKey(keyEvent('v'))
    expect(container!.textContent).toContain('ปุ่มนี้ใช้ไม่ได้ — ต้องมี Ctrl หรือ Alt และตามด้วย A–Z, 0–9 หรือ F1–F12')

    await sendKey(keyEvent('v', { ctrlKey: true, metaKey: true }))
    expect(container!.textContent).toContain('ปุ่มนี้ใช้ไม่ได้ — ต้องมี Ctrl หรือ Alt และตามด้วย A–Z, 0–9 หรือ F1–F12')
    expect(callsFor('set_voice_ptt_shortcut')).toHaveLength(0)
  })

  it.each(reservedShortcuts)('rejects reserved shortcut %s before saving and keeps Save disabled', async (_name, key, options) => {
    await mountPttCard()
    await click('เปลี่ยนปุ่ม')
    await sendKey(keyEvent(key, options))

    expect(container!.textContent).toContain('ปุ่มนี้ G-Maiden ใช้อยู่แล้ว')
    expect(container!.textContent).toContain(_name)
    expect(button('บันทึก').disabled).toBe(true)
    expect(callsFor('set_voice_ptt_shortcut')).toHaveLength(0)
  })

  it('hides Restore default at the default binding and restores Ctrl+Alt+V otherwise', async () => {
    await mountPttCard()
    expect([...container!.querySelectorAll('button')].some((candidate) => candidate.textContent?.trim() === 'คืนค่าเริ่มต้น')).toBe(false)

    await unmount()
    configureStatus({ accelerator: 'Ctrl+Shift+F9', registered: true })
    await mountPttCard()
    await click('คืนค่าเริ่มต้น')

    expect(callsFor('set_voice_ptt_shortcut')).toHaveLength(1)
    expect(callsFor('set_voice_ptt_shortcut')[0]).toEqual(['set_voice_ptt_shortcut', { accelerator: 'Ctrl+Alt+V' }])
  })

  it('cancels capture on Escape or Cancel without invoking a remap', async () => {
    await mountPttCard()
    await click('เปลี่ยนปุ่ม')
    const escape = keyEvent('Escape')
    await sendKey(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(container!.textContent).not.toContain('กดปุ่มที่ต้องการ…')

    await click('เปลี่ยนปุ่ม')
    await sendKey(keyEvent('1', { altKey: true }))
    const escapePreview = keyEvent('Escape')
    await sendKey(escapePreview)
    expect(escapePreview.defaultPrevented).toBe(true)
    expect(container!.querySelector('[aria-label^="ปุ่มตัวอย่าง:"]')).toBeNull()

    await click('เปลี่ยนปุ่ม')
    await sendKey(keyEvent('1', { altKey: true }))
    await click('ยกเลิก')
    expect(container!.textContent).not.toContain('กดปุ่มที่ต้องการ…')
    expect(callsFor('set_voice_ptt_shortcut')).toHaveLength(0)
  })

  it('leaves capture after ten seconds without invoking a remap', async () => {
    await mountPttCard()
    await click('เปลี่ยนปุ่ม')
    await act(async () => { vi.advanceTimersByTime(10_000) })

    expect(container!.textContent).not.toContain('กดปุ่มที่ต้องการ…')
    expect(callsFor('set_voice_ptt_shortcut')).toHaveLength(0)
  })

  it('does not invoke a remap when capture is unmounted', async () => {
    await mountPttCard()
    await click('เปลี่ยนปุ่ม')
    await unmount()
    await act(async () => { vi.advanceTimersByTime(10_000) })

    expect(callsFor('set_voice_ptt_shortcut')).toHaveLength(0)
  })

  it.each([
    ['unavailable', 'stt_not_installed', 'รับปุ่มแล้ว — ยังไม่มีระบบจดจำเสียง'],
    ['cancelled', 'too_short', 'กดสั้นเกินไป'],
    ['cancelled', 'signal_preempt', 'หยุดเพราะมีการแจ้งเตือนสำคัญ'],
  ])('shows the %s/%s voice-turn result and expires it after three seconds', async (state, reason, message) => {
    localStorage.setItem('voice-turn-sentinel', 'unchanged')
    await mountPttCard()
    await sendEvent('voice-turn', {
      requestId: 7,
      state,
      reason,
      monotonicMs: 123456,
      transcript: 'private event data must not appear',
    })

    expect(container!.textContent).toContain(message)
    expect(container!.textContent).not.toContain('private event data')
    expect(localStorage.getItem('voice-turn-sentinel')).toBe('unchanged')
    expect(localStorage.length).toBe(1)
    await act(async () => { vi.advanceTimersByTime(2999) })
    expect(container!.textContent).toContain(message)
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(container!.textContent).not.toContain(message)
  })

  it('does not show unsupported voice-turn states or reasons', async () => {
    const { voiceTurnMessage } = await import('../app/cards/voicePttHelpers')
    expect(voiceTurnMessage({ state: 'failed', reason: 'internal_error' })).toBeNull()
    expect(voiceTurnMessage({ state: 'unavailable', reason: 'model_unavailable' })).toBeNull()
    expect(voiceTurnMessage({ state: 'idle', reason: null })).toBeNull()
  })

  it('unlistens from voice-turn when the card unmounts', async () => {
    await mountPttCard()
    expect(handlers.get('voice-turn')?.size).toBe(1)

    await unmount()
    expect(handlers.get('voice-turn')?.size).toBe(0)
  })
})
