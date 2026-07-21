import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, LogOut, ShieldCheck } from 'lucide-react'
import { useBetaEnrollment } from './beta'
import { landingSupabase } from './beta'

type Batch = { id: string; label: string; release_id: string; gid_start: string; gid_end: string; status: string; created_at: string; published_at: string | null }
type RosterRow = { user_id: string; status: string; registered_at: string; profiles: { gid_code: string; generation: string } }
type ControllerData = { roster: RosterRow[]; roster_total: number; batches: Batch[] }

const emptyDraft = { label: '', release_id: '', artifact_path: '', gid_start: '', gid_end: '' }

function errorMessage(error: unknown) {
  return (error as { message?: string })?.message || 'ไม่สามารถเชื่อมต่อ Admin Controller ได้'
}

export default function OpsPage() {
  const beta = useBetaEnrollment()
  const [data, setData] = useState<ControllerData | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data: result, error: invokeError } = await landingSupabase.functions.invoke<ControllerData>('admin-gmad-controller', { body })
    if (invokeError || !result) throw invokeError || new Error('empty controller response')
    return result
  }, [])

  const refresh = useCallback(async () => {
    setBusy(true)
    setError('')
    try { setData(await invoke({ action: 'list', page: 0, page_size: 50 })) }
    catch (caught) { setError(errorMessage(caught)) }
    finally { setBusy(false) }
  }, [invoke])

  useEffect(() => {
    if (beta.isSignedIn) void refresh()
  }, [beta.isSignedIn, refresh])

  const createDraft = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      await invoke({ action: 'create_draft', ...draft })
      setDraft(emptyDraft)
      setNotice('สร้าง batch draft แล้ว')
      await refresh()
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setBusy(false) }
  }

  const mutate = async (action: 'publish' | 'set_status', batchId: string, status?: 'paused' | 'closed') => {
    setBusy(true); setError(''); setNotice('')
    try {
      await invoke(action === 'publish' ? { action, batch_id: batchId } : { action, batch_id: batchId, status })
      setNotice(action === 'publish' ? 'เผยแพร่ batch และ snapshot สิทธิ์แล้ว' : `เปลี่ยนสถานะเป็น ${status} แล้ว`)
      await refresh()
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setBusy(false) }
  }

  return <main className="ops-page">
    <header className="ops-header"><a href="/" className="font-podium">G-MAIDEN / OPS</a>{beta.isSignedIn && <button type="button" onClick={() => void beta.signOut()}><LogOut size={16} /> ออกจากระบบ</button>}</header>
    <section className="ops-shell">
      <p className="ops-kicker">GMAD BETA CONTROLLER</p>
      <h1 className="thai-display">คุมคิวและสิทธิ์ดาวน์โหลด</h1>
      {!beta.isSignedIn ? <button className="ops-primary" onClick={() => void beta.register()} disabled={busy}>เข้าสู่ระบบ Google เพื่อเปิด Controller</button> : null}
      {beta.isSignedIn && !data && !busy ? <p className="ops-error">{error || 'กำลังตรวจสิทธิ์ผู้ดูแล'}</p> : null}
      {data && <>
        <div className="ops-summary"><span><strong>{data.roster_total}</strong> ผู้ลงทะเบียน</span><span><strong>{data.batches.length}</strong> batches</span><span><ShieldCheck size={15} /> admin session verified by server</span></div>
        <section className="ops-grid">
          <form className="ops-panel" onSubmit={createDraft}>
            <h2>สร้าง GMAD batch</h2><p>กรอกขอบเขต GID; server จะ validate และ snapshot ผู้มีสิทธิ์เมื่อ publish</p>
            {Object.entries(draft).map(([key, value]) => <label key={key}>{key.replaceAll('_', ' ')}<input required value={value} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
            <button className="ops-primary" disabled={busy} type="submit">สร้าง Draft</button>
          </form>
          <section className="ops-panel"><h2>Roster</h2><div className="ops-table">{data.roster.map((row) => <div key={row.user_id}><code>{row.profiles.gid_code}</code><span>{row.profiles.generation} · {row.status}</span><time>{new Date(row.registered_at).toLocaleString('th-TH')}</time></div>)}</div></section>
        </section>
        <section className="ops-panel"><h2>GMAD batches</h2><div className="ops-table">{data.batches.map((batch) => <div key={batch.id} className="ops-batch"><span><strong>{batch.label}</strong><small>{batch.release_id} · {batch.gid_start} — {batch.gid_end}</small></span><span className={`ops-status status-${batch.status}`}>{batch.status}</span><span>{batch.status === 'draft' && <button disabled={busy} onClick={() => void mutate('publish', batch.id)}>Publish</button>}{batch.status === 'published' && <button disabled={busy} onClick={() => void mutate('set_status', batch.id, 'paused')}>Pause</button>}{batch.status === 'paused' && <button disabled={busy} onClick={() => void mutate('set_status', batch.id, 'closed')}>Close</button>}</span></div>)}</div></section>
      </>}
      {busy && <p className="ops-notice"><LoaderCircle className="animate-spin" size={16} /> กำลังประมวลผล</p>}
      {notice && <p className="ops-notice">{notice}</p>}{error && <p className="ops-error" role="alert">{error}</p>}
    </section>
  </main>
}
