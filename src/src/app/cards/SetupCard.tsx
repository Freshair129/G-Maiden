import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { C } from '../theme'
import { Card } from '../primitives'
import type { GsiStatus, SetupStatus } from '../types'
import {
  chooseDotaInstallPath,
  detectGsiSetup,
  installGsiConfig,
  saveDotaInstallPath,
  savedDotaInstallPath,
} from '../gsiSetup'

const buttonStyle: React.CSSProperties = {
  background: 'transparent', color: C.ice, border: `1px solid ${C.line}`,
  borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
}

export const SetupCard: React.FC = () => {
  const [st, setSt] = useState<SetupStatus | null>(null)
  const [health, setHealth] = useState<GsiStatus | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(() => savedDotaInstallPath())
  const [pathError, setPathError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = async (path = selectedPath) => {
    try {
      const [next, running] = await Promise.all([
        detectGsiSetup(path),
        invoke<boolean>('detect_dota_running'),
      ])
      setSt(next)
      setHealth((previous) => previous ? { ...previous, dota_running: running } : null)
      setPathError('')
    } catch { /* command unavailable */ }
  }
  useEffect(() => {
    let active = true
    void Promise.all([
      detectGsiSetup(savedDotaInstallPath()),
      invoke<boolean>('detect_dota_running'),
    ]).then(([next, running]) => {
      if (!active) return
      setSt(next)
      setHealth((previous) => previous ? { ...previous, dota_running: running } : null)
    }).catch(() => {})
    return () => { active = false }
  }, [])
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
    try { setSt(await installGsiConfig(selectedPath)); setPathError('') }
    catch (error) { setPathError(`ติดตั้ง GSI config ไม่สำเร็จ: ${String(error)}`) }
    finally { setBusy(false) }
  }
  const choosePath = async () => {
    setBusy(true)
    try {
      const path = await chooseDotaInstallPath(selectedPath)
      if (!path) return
      await saveDotaInstallPath(path)
      setSelectedPath(path)
      await refresh(path)
    } catch (error) {
      setPathError(`เลือกหรือบันทึกโฟลเดอร์ Dota 2 ไม่สำเร็จ: ${String(error)}`)
    } finally { setBusy(false) }
  }
  const clearPath = async () => {
    setBusy(true)
    try {
      await saveDotaInstallPath(null)
      setSelectedPath(null)
      await refresh(null)
    } catch (error) { setPathError(`เปลี่ยนตำแหน่ง Dota 2 ไม่สำเร็จ: ${String(error)}`) }
    finally { setBusy(false) }
  }
  if (!st) return (
    <Card title="Setup (GSI)"><div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังตรวจสอบ Steam / Dota 2…</div></Card>
  )
  const ok = st.installed
  const dot = <span style={{ width: 9, height: 9, borderRadius: 99, background: ok ? C.ok : C.warn, display: 'inline-block', marginRight: 8, boxShadow: ok ? `0 0 8px ${C.ok}` : 'none' }} />
  const serverText = !health ? 'กำลังตรวจ listener…'
    : health.server_state === 'listening' ? `127.0.0.1:${health.gsi_port ?? 3000} · listener พร้อมรับข้อมูล`
      : health.server_state === 'port_conflict' ? 'พอร์ต 3000–3010 ถูกใช้งาน — กำลังลองใหม่'
        : health.server_state === 'bind_error' ? 'เปิดพอร์ต GSI ไม่สำเร็จ — listener จะลองใหม่'
          : 'กำลังเริ่ม listener…'
  const feedText = health?.gsi_freshness === 'stale'
    ? `Dota เปิดอยู่แต่ feed GSI ล้าสมัย${health.gsi_age_ms === null ? '' : ` ${(health.gsi_age_ms / 1000).toFixed(1)} วินาที`} — หยุดใช้ own-state จนกว่าจะได้รับข้อมูลใหม่`
    : health?.gsi_active ? 'ได้รับข้อมูล GSI ล่าสุด · live'
    : health?.dota_running ? 'เปิด Dota 2 แล้ว แต่ยังรอข้อมูล GSI — หลังติดตั้งหรือซ่อม config ให้ปิดแล้วเปิดเกมใหม่'
      : 'รอเปิด Dota 2 หลังติดตั้ง config'
  return (
    <Card title="Setup (GSI)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: ok ? C.txt : C.warn }}>{dot}{ok ? 'GSI config ถูกต้อง' : st.cfg_present ? 'GSI config ไม่ถูกต้อง' : 'ยังไม่ได้ติดตั้ง GSI config'}</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <button onClick={() => void refresh()} disabled={busy} style={{ ...buttonStyle, cursor: busy ? 'wait' : 'pointer' }}>ตรวจ config ซ้ำ</button>
          <button onClick={() => void choosePath()} disabled={busy} style={{ ...buttonStyle, cursor: busy ? 'wait' : 'pointer' }}>เลือกโฟลเดอร์ Dota 2</button>
          <button onClick={install} disabled={busy || !st.dota_cfg_dir}
            style={{ ...buttonStyle, background: ok ? 'transparent' : 'rgba(143,212,255,0.16)', cursor: st.dota_cfg_dir && !busy ? 'pointer' : 'not-allowed' }}>
            {busy ? 'กำลังติดตั้ง…' : st.cfg_present && !st.cfg_valid ? 'ซ่อม GSI config' : ok ? 'ติดตั้งซ้ำ' : 'ติดตั้ง GSI config'}
          </button>
          {selectedPath && <button onClick={() => void clearPath()} disabled={busy}
            style={{ ...buttonStyle, color: C.mut, cursor: busy ? 'wait' : 'pointer' }}>ใช้ตำแหน่ง Steam อัตโนมัติ</button>}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.55 }}>
        {selectedPath && <div style={{ wordBreak: 'break-all' }}>Dota 2 ที่เลือก: <span style={{ color: C.txt }}>{selectedPath}</span></div>}
        {st.steam_path && <div>Steam: <span style={{ color: C.txt }}>{st.steam_path}</span></div>}
        {st.dota_cfg_dir && <div style={{ wordBreak: 'break-all' }}>Dota 2 cfg: <span style={{ color: C.txt }}>{st.dota_cfg_dir}</span></div>}
        <div style={{ marginTop: 6 }}>{st.message}</div>
        {pathError && <div role="alert" style={{ marginTop: 4, color: C.warn }}>{pathError}</div>}
        {!st.dota_cfg_dir && <div style={{ marginTop: 4 }}>เลือกโฟลเดอร์ Dota 2 beta ที่มี `game\bin\win64\dota2.exe` อยู่ด้านใน ระบบจะเขียนเฉพาะ GSI config ในโฟลเดอร์เกมนี้</div>}
        <div style={{ marginTop: 4 }}>พอร์ต GSI: <span style={{ color: health?.server_state === 'port_conflict' || health?.server_state === 'bind_error' ? C.warn : C.txt }}>{serverText}</span></div>
        <div>ข้อมูลเกม: <span style={{ color: health?.gsi_freshness === 'stale' ? C.warn : health?.gsi_active ? C.ok : C.mut }}>{feedText}</span></div>
        {(health?.server_state === 'port_conflict' || health?.server_state === 'bind_error') && <div style={{ marginTop: 4 }}>ปิด G-Maiden ที่เปิดซ้ำหรือตรวจแอปที่ใช้พอร์ต 3000–3010; listener จะลองใหม่อัตโนมัติทุก 3 วินาที โดยไม่ต้องใช้ terminal</div>}
        {health?.dota_restart_required && <div role="alert" style={{ marginTop: 4, color: C.warn }}>เปลี่ยนพอร์ต GSI อัตโนมัติเป็น {health.gsi_port} แล้ว — ปิดแล้วเปิด Dota 2 เพื่อโหลด config ใหม่</div>}
        {!ok && st.dota_cfg_dir && <div style={{ marginTop: 4 }}>หลังติดตั้งหรือซ่อม: ปิดแล้วเปิด Dota 2 เพื่อโหลด config ใหม่</div>}
      </div>
    </Card>
  )
}
