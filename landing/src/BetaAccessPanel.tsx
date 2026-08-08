// SPEC-2026-08-09 Phase 1: the 4-state access panel under the GID card.
// Terms link targets the canonical legal documents; the served copy moves to a
// hosted legal route when the retired landing mirrors return.
import { useState } from 'react'
import { useGmadAccess, type TermsOptIns } from './gmadAccess'

const TERMS_URL =
  'https://github.com/Freshair129/G-Maiden/blob/main/docs/product/closed-beta-terms-of-use-draft.md'
const PRIVACY_URL =
  'https://github.com/Freshair129/G-Maiden/blob/main/docs/product/closed-beta-privacy-notice-draft.md'

function TermsForm({ version, busy, onAccept }: {
  version: string | null
  busy: boolean
  onAccept: (optIns: TermsOptIns) => void
}) {
  const [terms, setTerms] = useState(false)
  const [age, setAge] = useState(false)
  const [diagnostics, setDiagnostics] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm opacity-80">
        อ่าน{' '}
        <a className="underline" href={TERMS_URL} target="_blank" rel="noreferrer">เงื่อนไขการใช้งาน</a>
        {' '}และ{' '}
        <a className="underline" href={PRIVACY_URL} target="_blank" rel="noreferrer">ประกาศความเป็นส่วนตัว</a>
        {version ? ` (ฉบับ ${version})` : ''} ก่อนยืนยัน
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>ยอมรับเงื่อนไขการใช้งาน Closed Beta ฉบับปัจจุบัน</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
        <span>ยืนยันว่ามีอายุถึงเกณฑ์ที่เงื่อนไขกำหนด</span>
      </label>
      <label className="flex items-start gap-2 text-sm opacity-80">
        <input type="checkbox" checked={diagnostics} onChange={(e) => setDiagnostics(e.target.checked)} />
        <span>ยินยอมแชร์ข้อมูลวิเคราะห์ปัญหา (ไม่บังคับ)</span>
      </label>
      <button
        type="button"
        className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        disabled={!terms || !age || busy}
        onClick={() => onAccept({ diagnostics_opt_in: diagnostics })}
      >
        {busy ? 'กำลังบันทึก…' : 'ยอมรับและไปต่อ'}
      </button>
    </div>
  )
}

export default function BetaAccessPanel({ signedIn }: { signedIn: boolean }) {
  const { access, busy, error, refresh, acceptTerms, requestDownload } = useGmadAccess(signedIn)
  if (!signedIn || !access) return null
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      {access.kind === 'signed_in_no_terms' ? (
        <TermsForm version={access.termsVersion} busy={busy} onAccept={(o) => void acceptTerms(o)} />
      ) : access.kind === 'terms_outdated' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">เงื่อนไขการใช้งานมีฉบับใหม่{access.termsVersion ? ` (${access.termsVersion})` : ''} — ต้องยอมรับก่อนดาวน์โหลดหรือใช้งานต่อ</p>
          <TermsForm version={access.termsVersion} busy={busy} onAccept={(o) => void acceptTerms(o)} />
        </div>
      ) : access.kind === 'queued' ? (
        <p className="text-sm opacity-90">อยู่ในคิว Closed Beta — เราจะแจ้งเตือนเมื่อสิทธิ์ดาวน์โหลดของ GID นี้เปิด</p>
      ) : access.kind === 'granted' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm opacity-90">สิทธิ์ดาวน์โหลดพร้อมแล้ว{access.releaseId ? ` — รุ่น ${access.releaseId}` : ''}</p>
          <button
            type="button"
            className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            disabled={busy}
            onClick={() => void requestDownload()}
          >
            {busy ? 'กำลังเตรียมลิงก์…' : 'ดาวน์โหลด G-Maiden'}
          </button>
          <p className="text-xs opacity-60">ตัวติดตั้งไม่ใช่สิทธิ์การใช้งาน — สิทธิ์จริงตรวจตอนล็อกอิน Google ในแอป</p>
        </div>
      ) : access.kind === 'paused' ? (
        <p className="text-sm opacity-90">รอบแจกจ่ายถูกพักชั่วคราว — กลับมาเช็คอีกครั้งภายหลัง</p>
      ) : access.kind === 'revoked' ? (
        <p className="text-sm opacity-90">บัญชีนี้ไม่มีสิทธิ์ Closed Beta ที่ใช้งานได้</p>
      ) : (
        <button type="button" className="text-sm underline" onClick={() => void refresh()}>
          โหลดสถานะไม่สำเร็จ — ลองอีกครั้ง
        </button>
      )}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  )
}
