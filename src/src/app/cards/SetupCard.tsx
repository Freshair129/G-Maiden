import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { C } from '../theme'
import { Card } from '../primitives'
import type { GsiStatus, SetupStatus } from '../types'

export const SetupCard: React.FC = () => {
  const [st, setSt] = useState<SetupStatus | null>(null)
  const [health, setHealth] = useState<GsiStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    try {
      const [next, running] = await Promise.all([
        invoke<SetupStatus>('detect_gsi_setup'),
        invoke<boolean>('detect_dota_running'),
      ])
      setSt(next)
      setHealth((previous) => previous ? { ...previous, dota_running: running } : null)
    } catch { /* command unavailable */ }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    let active = true
    let stop: (() => void) | null = null
    void listen<GsiStatus>('gsi-status', (event) => { if (active) setHealth(event.payload) })
      .then((unlisten) => { if (active) stop = unlisten; else unlisten() })
      .catch(() => {})
    return () => { active = false; stop?.() }
  }, [])
  const install = async () => {
    setBusy(true)
    try { setSt(await invoke<SetupStatus>('install_gsi_config')) } finally { setBusy(false) }
  }
  if (!st) return (
    <Card title="Setup (GSI)"><div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังตรวจสอบ Steam / Dota 2…</div></Card>
  )
  const ok = st.installed
  const dot = <span style={{ width: 9, height: 9, borderRadius: 99, background: ok ? C.ok : C.warn, display: 'inline-block', marginRight: 8, boxShadow: ok ? `0 0 8px ${C.ok}` : 'none' }} />
  const serverText = !health ? 'กำลังตรวจ listener…'
    : health.server_state === 'listening' ? 'listener พร้อม'
      : health.server_state === 'port_conflict' ? 'พอร์ต 3000 ถูกใช้งาน — GSI และ Google OAuth callback ใช้พอร์ตนี้ร่วมกัน'
        : health.server_state === 'bind_error' ? 'เปิดพอร์ต 3000 ไม่สำเร็จ — ตรวจโปรแกรมที่ใช้พอร์ต แล้วลองตรวจอีกครั้ง'
          : 'กำลังเริ่ม listener…'
  const feedText = health?.gsi_active ? 'ได้รับข้อมูล GSI ล่าสุด · live'
    : health?.dota_running ? 'เปิด Dota 2 แล้ว แต่ยังรอข้อมูล GSI — หลังติดตั้งหรือซ่อม config ให้ปิดแล้วเปิดเกมใหม่'
      : 'รอเปิด Dota 2 หลังติดตั้ง config'
  return (
    <Card title="Setup (GSI)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
        <div style={{ fontSize: 13, color: ok ? C.txt : C.warn }}>{dot}{ok ? 'GSI config ถูกต้อง' : st.cfg_present ? 'GSI config ไม่ถูกต้อง' : 'ยังไม่ได้ติดตั้ง GSI config'}</div>
        <div style={{ display: 'flex', gap: 7 }}>
        <button onClick={() => void refresh()} disabled={busy}
          style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}>
          ตรวจซ้ำ
        </button>
        <button onClick={install} disabled={busy || !st.dota_cfg_dir}
          style={{ background: ok ? 'transparent' : 'rgba(143,212,255,0.16)', color: st.dota_cfg_dir ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 13px', fontSize: 12, cursor: st.dota_cfg_dir && !busy ? 'pointer' : 'not-allowed' }}>
          {busy ? 'กำลังติดตั้ง…' : st.cfg_present && !st.cfg_valid ? 'ซ่อม GSI config' : ok ? 'ติดตั้งซ้ำ' : 'ติดตั้ง GSI config'}
        </button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.55 }}>
        {st.steam_path && <div>Steam: <span style={{ color: C.txt }}>{st.steam_path}</span></div>}
        {st.dota_cfg_dir && <div style={{ wordBreak: 'break-all' }}>Dota 2 cfg: <span style={{ color: C.txt }}>{st.dota_cfg_dir}</span></div>}
        <div style={{ marginTop: 6 }}>{st.message}</div>
        <div style={{ marginTop: 4 }}>พอร์ต GSI: <span style={{ color: health?.server_state === 'port_conflict' || health?.server_state === 'bind_error' ? C.warn : C.txt }}>{serverText}</span></div>
        <div>ข้อมูลเกม: <span style={{ color: health?.gsi_active ? C.ok : C.mut }}>{feedText}</span></div>
        {health?.server_state === 'port_conflict' && <div style={{ marginTop: 4, color: C.mut }}>ปิด G-Maiden ที่เปิดซ้ำหรือโปรแกรมที่ใช้พอร์ต 3000 แล้ว listener จะลองเชื่อมต่อใหม่อัตโนมัติทุก 3 วินาที</div>}
        {!ok && st.dota_cfg_dir && <div style={{ marginTop: 4, color: C.mut }}>💡 หลังติดตั้งหรือซ่อม: ปิดแล้วเปิด Dota 2 เพื่อโหลด config ใหม่.</div>}
      </div>
    </Card>
  )
}
