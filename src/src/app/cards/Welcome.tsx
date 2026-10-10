import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { C } from '../theme'
import { panel, Gem } from '../primitives'
import type { GsiStatus, SetupStatus } from '../types'

// ─────────────────────────────── ONBOARDING (first run welcome) ───────────────────────────────
export const Welcome: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [st, setSt] = useState<SetupStatus | null>(null)
  const [health, setHealth] = useState<GsiStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void (async () => { try { setSt(await invoke<SetupStatus>('detect_gsi_setup')) } catch { /* command unavailable */ } })() }, [])
  useEffect(() => {
    let active = true
    let stop: (() => void) | null = null
    void listen<GsiStatus>('gsi-status', (event) => { if (active) setHealth(event.payload) })
      .then((unlisten) => { if (active) stop = unlisten; else unlisten() })
      .catch(() => {})
    return () => { active = false; stop?.() }
  }, [])
  const install = async () => { setBusy(true); try { setSt(await invoke<SetupStatus>('install_gsi_config')) } finally { setBusy(false) } }
  const refresh = async () => { setBusy(true); try { setSt(await invoke<SetupStatus>('detect_gsi_setup')) } finally { setBusy(false) } }
  const step1Done = st?.installed === true
  const portConflict = health?.server_state === 'port_conflict'
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(8,9,12,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  }
  return (
    <div style={overlay}>
      <div style={{ ...panel(0.94), padding: '28px 34px', width: 540, maxWidth: 'calc(100vw - 32px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <Gem size={36} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>ยินดีต้อนรับสู่ G-Maiden</div>
            <div style={{ fontSize: 12.5, color: C.mut }}>Maiden จะคอยดู Dota 2 ของคุณและบอกเมื่อเลือดต่ำ — ใช้เวลา 30 วินาทีตั้งค่า</div>
          </div>
        </div>

        <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: 99, background: step1Done ? C.ok : 'rgba(143,212,255,0.18)', color: step1Done ? '#0c1018' : C.ice, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{step1Done ? '✓' : '1'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>ติดตั้ง GSI config ใน Dota 2</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>
                {!st ? 'กำลังตรวจสอบ…' : step1Done ? `config ถูกต้องที่ ${st.dota_cfg_dir}` : st.dota_cfg_dir ? st.cfg_present && !st.cfg_valid ? 'พบ config แต่ปลายทางหรือโครงสร้างไม่ถูกต้อง กดซ่อมไฟล์ด้านล่าง' : 'กดปุ่มด้านล่างเพื่อให้ G-Maiden วางไฟล์ให้อัตโนมัติ' : st.message}
              </div>
              {st && !step1Done && st.dota_cfg_dir && (
                <button onClick={install} disabled={busy}
                  style={{ marginTop: 9, background: 'rgba(143,212,255,0.18)', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 15px', fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', fontWeight: 600 }}>
                  {busy ? 'กำลังติดตั้ง…' : st.cfg_present && !st.cfg_valid ? 'ซ่อม GSI config' : 'ติดตั้ง GSI config'}
                </button>
              )}
              {st && !step1Done && st.dota_cfg_dir && <button onClick={() => void refresh()} disabled={busy}
                style={{ marginTop: 8, marginLeft: 7, background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}>ตรวจ config ซ้ำ</button>}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, opacity: step1Done ? 1 : 0.55 }}>
            <div style={{ width: 26, height: 26, borderRadius: 99, background: 'rgba(143,212,255,0.18)', color: C.ice, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>2</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>เปิด Dota 2 แล้วเริ่มแมตช์</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>
                ถ้า Dota 2 เปิดอยู่ก่อนติดตั้ง: ต้องรีสตาร์ทเกมรอบหนึ่งให้ GSI โหลด. overlay จะขึ้นบนเกมพร้อมข้อมูลสด — กด <b style={{ color: C.ice }}>Ctrl+Alt+S</b> ซ่อน/แสดง.
              </div>
            </div>
          </div>

          <div style={{ marginLeft: 38, fontSize: 12, color: C.mut, lineHeight: 1.55 }}>
            <div style={{ color: C.txt, fontWeight: 600 }}>สถานะการเชื่อมต่อ</div>
            <div>{!health ? 'กำลังตรวจพอร์ต GSI…' : health.server_state === 'listening' ? 'listener พร้อมรับ GSI' : health.server_state === 'port_conflict' ? 'พอร์ต 3000 ถูกใช้งาน ซึ่งกระทบทั้ง GSI และ Google OAuth callback' : health.server_state === 'bind_error' ? 'เปิดพอร์ต 3000 ไม่สำเร็จ ตรวจโปรแกรมที่ใช้งานพอร์ตแล้วลองตรวจซ้ำ' : 'กำลังเริ่ม listener…'}</div>
            <div>{health?.gsi_active ? 'ได้รับข้อมูลเกมล่าสุดแล้ว · live' : health?.dota_running ? 'Dota 2 เปิดอยู่แต่ยังไม่ส่งข้อมูล; หลังติดตั้งหรือซ่อม config ให้ปิดแล้วเปิดเกมใหม่' : 'รอเปิด Dota 2'}</div>
            {portConflict && <div>ปิด G-Maiden ที่เปิดซ้ำหรือโปรแกรมที่ใช้พอร์ตนี้ แล้วระบบจะลองเชื่อมต่อใหม่อัตโนมัติทุก 3 วินาที</div>}
          </div>
        </div>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onDone}
            style={{ background: 'transparent', color: C.mut, border: 'none', fontSize: 12, cursor: 'pointer' }}>
            ข้าม (ตั้งค่าเองภายหลัง)
          </button>
          <button onClick={onDone} disabled={!step1Done}
            style={{ background: step1Done ? C.ice : 'rgba(255,255,255,0.08)', color: step1Done ? '#0c1018' : C.mut, border: 'none', borderRadius: 8, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: step1Done ? 'pointer' : 'not-allowed' }}>
            พร้อมแล้ว!
          </button>
        </div>
      </div>
    </div>
  )
}
