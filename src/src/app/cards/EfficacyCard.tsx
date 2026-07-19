import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { C } from '../theme'
import { Card, Stat, armRate } from '../primitives'
import type { EfficacySummary } from '../types'

// Silent-arm efficacy study result (RWANG TASK 2). Read-only — shows the
// user their OWN warned-vs-silent death rate, computed entirely on-device by
// `efficacy_summary` from the local match logs. Only rendered when the user
// has opted into `efficacyStudy`.
export const EfficacyCard: React.FC = () => {
  const [data, setData] = useState<EfficacySummary | null>(null)
  const [err, setErr] = useState(false)
  const refresh = () => {
    setErr(false)
    void invoke<EfficacySummary>('efficacy_summary').then(setData).catch(() => setErr(true))
  }
  useEffect(() => { refresh() }, [])

  const armed = data?.armed
  const silent = data?.silent
  const delta = armed && silent && armed.rate !== null && silent.rate !== null ? armed.rate - silent.rate : null

  return (
    <Card title="ผลการศึกษาประสิทธิภาพเสียงเตือน G-Signal">
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 6, lineHeight: 1.55 }}>
        เปรียบเทียบอัตราการตายหลังการเตือนแก๊งค์ — ระหว่างแมตช์ที่ <b style={{ color: C.txt }}>ได้ยินเสียงเตือน</b> กับแมตช์ที่ถูกสุ่ม
        <b style={{ color: C.txt }}> ปิดเสียงเตือนไว้</b> (silent arm) เพื่อวัดผลจริง — คิดต่อ 1 เหตุการณ์เตือน ไม่ใช่ต่อแมตช์ ข้อมูลทั้งหมดอยู่ในเครื่องนี้เท่านั้น ไม่ส่งออกไปไหน.
      </div>
      {err && <div style={{ fontSize: 12, color: C.bad, marginTop: 10 }}>อ่านข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง</div>}
      {!err && !data && <div style={{ fontSize: 12, color: C.mut, marginTop: 10 }}>กำลังโหลด…</div>}
      {armed && silent && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
          <Stat label="ได้ยินเสียงเตือน (armed)" value={`${armed.events} ครั้ง · ${armRate(armed)}`} color={C.ice} />
          <Stat label="ปิดเสียงเตือน (silent)" value={`${silent.events} ครั้ง · ${armRate(silent)}`} color={C.warn} />
          {delta !== null && (armed.events > 0 || silent.events > 0) && (
            <Stat label="ผลต่าง" value={`${delta <= 0 ? '' : '+'}${(delta * 100).toFixed(0)}%`} color={delta < 0 ? C.ok : delta > 0 ? C.bad : C.mut} />
          )}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button onClick={refresh}
          style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 11px', fontSize: 12, cursor: 'pointer' }}>
          🔄 รีเฟรช
        </button>
      </div>
    </Card>
  )
}
