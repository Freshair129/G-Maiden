import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { C } from '../theme'
import { Card } from '../primitives'
import type { GsiStatus, SetupStatus } from '../types'
import { buildGsiSetupHealth } from '../gsiSetupHealth'
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
  const setupHealth = buildGsiSetupHealth(st, health)
  const ok = setupHealth.stages.configValid.state === 'ok'
  const dot = <span style={{ width: 9, height: 9, borderRadius: 99, background: ok ? C.ok : C.warn, display: 'inline-block', marginRight: 8, boxShadow: ok ? `0 0 8px ${C.ok}` : 'none' }} />
  return (
    <Card title="Setup (GSI)">
      {st ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, gap: 8, flexWrap: 'wrap' }}>
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
      </div> : <div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังตรวจสอบ Steam / Dota 2…</div>}
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.55 }}>
        {selectedPath && <div style={{ wordBreak: 'break-all' }}>Dota 2 ที่เลือก: <span style={{ color: C.txt }}>{selectedPath}</span></div>}
        {st?.steam_path && <div>Steam: <span style={{ color: C.txt }}>{st.steam_path}</span></div>}
        {st?.dota_cfg_dir && <div style={{ wordBreak: 'break-all' }}>Dota 2 cfg: <span style={{ color: C.txt }}>{st.dota_cfg_dir}</span></div>}
        <div style={{ marginTop: 6 }}>{st?.message}</div>
        {pathError && <div role="alert" style={{ marginTop: 4, color: C.warn }}>{pathError}</div>}
        {Object.entries(setupHealth.stages).map(([key, stage], index) => (
          <div key={key} style={{ color: stage.state === 'ok' ? C.ok : stage.state === 'blocked' ? C.warn : C.mut }}>
            {index + 1}. {stage.text}
          </div>
        ))}
        <div role={setupHealth.oauthCallback.state === 'blocked' ? 'alert' : undefined}
          style={{ marginTop: 4, color: setupHealth.oauthCallback.state === 'blocked' ? C.warn : C.mut }}>
          {setupHealth.oauthCallback.text}
        </div>
        {setupHealth.remediation.map((text) => <div key={text} style={{ marginTop: 4 }}>{text}</div>)}
      </div>
    </Card>
  )
}
