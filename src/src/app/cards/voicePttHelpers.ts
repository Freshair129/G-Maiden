export const DEFAULT_VOICE_PTT_SHORTCUT = 'Ctrl+Alt+V'

const RESERVED_SHORTCUTS = new Set(['Ctrl+Alt+S', 'Alt+Up', 'Alt+Down', 'Alt+M'])

const ERROR_MESSAGES: Record<string, string> = {
  invalid_accelerator: 'ปุ่มนี้ใช้ไม่ได้ — ต้องมี Ctrl หรือ Alt และตามด้วย A–Z, 0–9 หรือ F1–F12',
  reserved_conflict: 'ปุ่มนี้ G-Maiden ใช้อยู่แล้ว',
  registration_failed: 'ลงทะเบียนปุ่มไม่ได้ — มีโปรแกรมอื่นใช้อยู่ ปุ่มเดิมยังใช้งานได้',
  settings_write_failed: 'บันทึกการตั้งค่าไม่สำเร็จ ปุ่มเดิมยังใช้งานได้',
}

const GENERIC_ERROR_MESSAGE = 'เปลี่ยนปุ่มไม่สำเร็จ ปุ่มเดิมยังใช้งานได้'

export function voicePttErrorMessage(error: unknown): string {
  const code = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : ''
  return ERROR_MESSAGES[code] ?? GENERIC_ERROR_MESSAGE
}

export function voiceTurnMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const event = payload as { state?: unknown; reason?: unknown }
  if (event.state === 'unavailable' && event.reason === 'mic_disabled') {
    return 'ยังไม่ได้อนุญาตให้ G-Voice ใช้ไมโครโฟน'
  }
  if (event.state === 'unavailable' && event.reason === 'no_input_device') {
    return 'ไม่พบอุปกรณ์ไมโครโฟน'
  }
  if (event.state === 'unavailable' && event.reason === 'input_open_failed') {
    return 'เปิดไมโครโฟนไม่สำเร็จ — ตรวจ Windows Settings › Privacy › Microphone'
  }
  if (event.state === 'unavailable' && event.reason === 'mic_permission_denied') {
    return 'Windows ไม่อนุญาตให้ใช้ไมโครโฟน — ตรวจ Privacy › Microphone'
  }
  if (event.state === 'failed' && event.reason === 'input_device_lost') {
    return 'ไมโครโฟนหลุดการเชื่อมต่อระหว่างใช้งาน'
  }
  if (event.state === 'unavailable' && event.reason === 'stt_not_installed') {
    return 'รับปุ่มแล้ว — ยังไม่มีระบบจดจำเสียง'
  }
  if (event.state === 'cancelled' && event.reason === 'too_short') return 'กดสั้นเกินไป'
  if (event.state === 'cancelled' && event.reason === 'signal_preempt') {
    return 'หยุดเพราะมีการแจ้งเตือนสำคัญ'
  }
  return null
}

export function acceleratorFromKeyEvent(event: KeyboardEvent): string | null {
  if (event.metaKey || event.key === 'Meta' || event.key === 'OS' || event.key === 'Super') return null
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS', 'Super'].includes(event.key)) return null
  if (!(event.ctrlKey || event.altKey)) return null

  let key: string
  if (/^[a-z]$/i.test(event.key)) key = event.key.toUpperCase()
  else if (/^\d$/.test(event.key)) key = event.key
  else if (/^F(?:[1-9]|1[0-2])$/i.test(event.key)) key = event.key.toUpperCase()
  else if (event.key === 'ArrowUp') key = 'Up'
  else if (event.key === 'ArrowDown') key = 'Down'
  else return null

  const modifiers = [
    ...(event.ctrlKey ? ['Ctrl'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
  ]
  return [...modifiers, key].join('+')
}

export function validateVoicePttAccelerator(accelerator: string): string | null {
  if (RESERVED_SHORTCUTS.has(accelerator)) return ERROR_MESSAGES.reserved_conflict
  const parts = accelerator.split('+')
  const modifiers = parts.slice(0, -1)
  const key = parts[parts.length - 1] ?? ''
  if (
    modifiers.length === 0 ||
    modifiers.length > 3 ||
    new Set(modifiers).size !== modifiers.length ||
    modifiers.some((modifier) => !['Ctrl', 'Alt', 'Shift'].includes(modifier)) ||
    !(modifiers.includes('Ctrl') || modifiers.includes('Alt'))
  ) return ERROR_MESSAGES.invalid_accelerator
  if (!/^(?:[A-Z]|\d|F(?:[1-9]|1[0-2]))$/.test(key)) return ERROR_MESSAGES.invalid_accelerator
  return null
}
