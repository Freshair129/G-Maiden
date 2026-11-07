import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  acceleratorFromKeyEvent,
  DEFAULT_VOICE_PTT_SHORTCUT,
  validateVoicePttAccelerator,
  voicePttErrorMessage,
  voiceTurnMessage,
} from './voicePttHelpers'

type PttStatus = {
  accelerator: string
  registered: boolean
  error_code?: string
}

type VoiceTurnEvent = {
  requestId: number
  state: string
  reason: string | null
  monotonicMs: number
}

type VoicePttCardProps = {
  micEnabled: boolean
  onMicEnabledChange: (enabled: boolean) => void
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  border: '1px solid var(--g-hairline)',
  borderRadius: 'var(--g-r-panel)',
  background: 'var(--g-instrument)',
  color: 'var(--g-text)',
}

const buttonStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid var(--g-hairline)',
  borderRadius: 'var(--g-r-sm)',
  background: 'var(--g-instrument-2)',
  color: 'var(--g-ice-300)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  padding: '7px 11px',
}

function Keycaps({ accelerator, label }: { accelerator: string; label: string }) {
  return (
    <div aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {accelerator.split('+').map((key, index) => (
        <span key={`${index}-${key}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {index > 0 && <span aria-hidden="true" style={{ color: 'var(--g-text-mute)' }}>+</span>}
          <kbd style={{
            border: '1px solid var(--g-hairline)',
            borderRadius: 'var(--g-r-sm)',
            background: 'var(--g-instrument-2)',
            color: 'var(--g-text)',
            font: '600 11px/1 var(--g-font-mono)',
            padding: '6px 8px',
          }}>{key}</kbd>
        </span>
      ))}
    </div>
  )
}

export function VoicePttCard({ micEnabled, onMicEnabledChange }: VoicePttCardProps) {
  const [status, setStatus] = useState<PttStatus | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [turnChip, setTurnChip] = useState<{ message: string; revision: number } | null>(null)
  const turnRevision = useRef(0)
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    void invoke<PttStatus>('get_voice_ptt_status')
      .then((nextStatus) => { if (active) setStatus(nextStatus) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    void listen<VoiceTurnEvent>('voice-turn', ({ payload }) => {
      if (!active) return
      const message = voiceTurnMessage(payload)
      if (message) setTurnChip({ message, revision: ++turnRevision.current })
    }).then((dispose) => {
      if (active) unlisten = dispose
      else dispose()
    }).catch(() => {})
    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (!turnChip) return
    const timer = window.setTimeout(() => setTurnChip(null), 3000)
    return () => window.clearTimeout(timer)
  }, [turnChip])

  useEffect(() => {
    if (!capturing || preview) return
    const timeout = window.setTimeout(() => {
      setCapturing(false)
      setPreview(null)
      setCaptureError(null)
    }, 10_000)
    return () => window.clearTimeout(timeout)
  }, [capturing, preview])

  useEffect(() => {
    if (!capturing) return
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      if (event.key === 'Escape') {
        setCapturing(false)
        setPreview(null)
        setCaptureError(null)
        return
      }
      if (preview) return
      if (['Control', 'Alt', 'Shift', 'Meta', 'OS', 'Super'].includes(event.key)) return

      const accelerator = acceleratorFromKeyEvent(event)
      if (!accelerator) {
        setPreview(null)
        setCaptureError(voicePttErrorMessage('invalid_accelerator'))
        return
      }
      setPreview(accelerator)
      setCaptureError(validateVoicePttAccelerator(accelerator))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [capturing, preview])

  const beginCapture = () => {
    setActionError(null)
    setPreview(null)
    setCaptureError(null)
    setCapturing(true)
    cardRef.current?.focus()
  }

  const cancelCapture = () => {
    if (saving) return
    setCapturing(false)
    setPreview(null)
    setCaptureError(null)
  }

  const saveShortcut = async (accelerator: string) => {
    if (saving) return
    setSaving(true)
    setActionError(null)
    try {
      const savedAccelerator = await invoke<string>('set_voice_ptt_shortcut', { accelerator })
      setStatus((current) => current
        ? { ...current, accelerator: savedAccelerator, registered: true, error_code: undefined }
        : { accelerator: savedAccelerator, registered: true })
      setCapturing(false)
      setPreview(null)
      setCaptureError(null)
      try {
        setStatus(await invoke<PttStatus>('get_voice_ptt_status'))
      } catch {
        // A successful remap remains reflected while status refresh is unavailable.
      }
    } catch (error) {
      setActionError(voicePttErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const statusMessage = !status
    ? 'กำลังอ่านสถานะ…'
    : status.registered
      ? 'พร้อมรับปุ่ม'
      : status.error_code === 'registration_failed'
        ? 'ลงทะเบียนปุ่มไม่ได้ — มีโปรแกรมอื่นใช้อยู่ ลองเปลี่ยนปุ่ม'
        : null
  const statusTone = status?.registered ? 'var(--g-ok)' : 'var(--g-warn)'

  return (
    <section ref={cardRef} tabIndex={-1} aria-label="G-Voice · Push-to-talk" style={cardStyle}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ color: 'var(--g-text)', fontSize: 15, fontWeight: 700, margin: 0 }}>G-Voice · Push-to-talk</h3>
          <p style={{ color: 'var(--g-text-dim)', fontSize: 11, lineHeight: 1.45, margin: '5px 0 0' }}>
            กดปุ่มค้างเพื่อเริ่ม Voice turn
          </p>
        </div>
        {statusMessage && (
          <span role="status" style={{
            border: '1px solid var(--g-hairline)',
            borderRadius: 'var(--g-r-pill)',
            color: statusTone,
            flex: '0 0 auto',
            fontSize: 10.5,
            fontWeight: 600,
            lineHeight: 1.35,
            padding: '5px 9px',
          }}>{statusMessage}</span>
        )}
      </header>

      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ color: 'var(--g-text-dim)', fontSize: 12 }}>ปุ่มปัจจุบัน</span>
        {status
          ? <Keycaps accelerator={status.accelerator} label={`ปุ่มปัจจุบัน: ${status.accelerator}`} />
          : <span style={{ color: 'var(--g-text-mute)', fontSize: 12 }}>—</span>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginLeft: 'auto' }}>
          <button type="button" style={buttonStyle} disabled={saving} onClick={beginCapture}>เปลี่ยนปุ่ม</button>
          {status && status.accelerator !== DEFAULT_VOICE_PTT_SHORTCUT && (
            <button type="button" style={buttonStyle} disabled={saving} onClick={() => void saveShortcut(DEFAULT_VOICE_PTT_SHORTCUT)}>
              คืนค่าเริ่มต้น
            </button>
          )}
        </div>
      </div>

      <label htmlFor="g-voice-mic-enabled" style={{
        alignItems: 'center',
        background: 'var(--g-instrument-2)',
        border: '1px solid var(--g-hairline)',
        borderRadius: 'var(--g-r-sm)',
        color: 'var(--g-text)',
        display: 'flex',
        fontSize: 12,
        gap: 12,
        justifyContent: 'space-between',
        padding: '9px 11px',
      }}>
        <span>อนุญาตให้ใช้ไมโครโฟนขณะกด PTT</span>
        <input
          id="g-voice-mic-enabled"
          aria-label="อนุญาตให้ใช้ไมโครโฟนขณะกด PTT"
          type="checkbox"
          role="switch"
          checked={micEnabled}
          onChange={(event) => onMicEnabledChange(event.currentTarget.checked)}
          style={{ accentColor: 'var(--g-ice-300)', flex: '0 0 auto', margin: 0 }}
        />
      </label>
      <p style={{ color: 'var(--g-text-dim)', fontSize: 10.5, lineHeight: 1.45, margin: 0 }}>
        เสียงอยู่ในเครื่องและถูกลบทันทีเมื่อปล่อยปุ่ม ไม่บันทึก ไม่ส่งออก
      </p>

      {capturing && !preview && (
        <div aria-live="polite" style={{ color: 'var(--g-ice-300)', fontSize: 12, fontWeight: 600 }}>
          กดปุ่มที่ต้องการ… (Esc เพื่อยกเลิก)
        </div>
      )}

      {preview && (
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Keycaps accelerator={preview} label={`ปุ่มตัวอย่าง: ${preview}`} />
          <button
            type="button"
            style={buttonStyle}
            disabled={saving || Boolean(captureError)}
            onClick={() => void saveShortcut(preview)}
          >บันทึก</button>
          <button type="button" style={buttonStyle} disabled={saving} onClick={cancelCapture}>ยกเลิก</button>
        </div>
      )}

      {captureError && <p role="alert" style={{ color: 'var(--g-warn)', fontSize: 11.5, margin: 0 }}>{captureError}</p>}
      {actionError && <p role="alert" style={{ color: 'var(--g-warn)', fontSize: 11.5, margin: 0 }}>{actionError}</p>}
      {turnChip && (
        <span role="status" style={{
          alignSelf: 'flex-start',
          border: '1px solid var(--g-hairline)',
          borderRadius: 'var(--g-r-pill)',
          color: 'var(--g-ice-300)',
          fontSize: 11.5,
          padding: '5px 9px',
        }}>{turnChip.message}</span>
      )}

      <p style={{ color: 'var(--g-text-mute)', fontSize: 11, lineHeight: 1.5, margin: 0 }}>
        ยังไม่มีระบบจดจำเสียง — เสียงชั่วคราวจะถูกทิ้งโดยไม่ส่งไปประมวลผล
      </p>
      <p style={{ color: 'var(--g-text-dim)', fontSize: 10.5, lineHeight: 1.45, margin: 0 }}>
        แอปตรวจปุ่มที่ผูกไว้ในเกมไม่ได้ — เลือกปุ่มที่ไม่ได้ใช้ใน Dota 2
      </p>
      <p style={{ color: 'var(--g-text-mute)', fontSize: 10.5, lineHeight: 1.45, margin: 0 }}>
        ปุ่มสงวน: Ctrl+Alt+S · Alt+↑ · Alt+↓ · Alt+M
      </p>
    </section>
  )
}
