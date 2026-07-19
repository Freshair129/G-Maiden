import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { C } from '../theme'
import { Card } from '../primitives'
import type { SetupStatus } from '../types'

export const SetupCard: React.FC = () => {
  const [st, setSt] = useState<SetupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    try { setSt(await invoke<SetupStatus>('detect_gsi_setup')) } catch { /* command unavailable */ }
  }
  useEffect(() => { void refresh() }, [])
  const install = async () => {
    setBusy(true)
    try { setSt(await invoke<SetupStatus>('install_gsi_config')) } finally { setBusy(false) }
  }
  if (!st) return (
    <Card title="Setup (GSI)"><div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังตรวจสอบ Steam / Dota 2…</div></Card>
  )
  const ok = st.installed
  const dot = <span style={{ width: 9, height: 9, borderRadius: 99, background: ok ? C.ok : C.warn, display: 'inline-block', marginRight: 8, boxShadow: ok ? `0 0 8px ${C.ok}` : 'none' }} />
  return (
    <Card title="Setup (GSI)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
        <div style={{ fontSize: 13, color: ok ? C.txt : C.warn }}>{dot}{ok ? 'GSI config พร้อมใช้งาน' : 'ยังไม่ได้ติดตั้ง GSI config'}</div>
        <button onClick={install} disabled={busy || !st.dota_cfg_dir}
          style={{ background: ok ? 'transparent' : 'rgba(143,212,255,0.16)', color: st.dota_cfg_dir ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 13px', fontSize: 12, cursor: st.dota_cfg_dir && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? 'กำลังติดตั้ง…' : ok ? 'ติดตั้งซ้ำ' : 'ติดตั้ง GSI config'}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.55 }}>
        {st.steam_path && <div>Steam: <span style={{ color: C.txt }}>{st.steam_path}</span></div>}
        {st.dota_cfg_dir && <div style={{ wordBreak: 'break-all' }}>Dota 2 cfg: <span style={{ color: C.txt }}>{st.dota_cfg_dir}</span></div>}
        <div style={{ marginTop: 6 }}>{st.message}</div>
        {!ok && st.dota_cfg_dir && <div style={{ marginTop: 4, color: C.mut }}>💡 หลังติดตั้ง: เปิด Dota 2 รอบใหม่เพื่อโหลด config.</div>}
      </div>
    </Card>
  )
}
