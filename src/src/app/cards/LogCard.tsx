import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { C } from '../theme'
import { Card, fmtSize, fmtDate } from '../primitives'
import type { MatchLog } from '../types'

export const LogCard: React.FC<{ live: boolean; clockTime: number }> = ({ live, clockTime }) => {
  const [dir, setDir] = useState<string>('')
  const [current, setCurrent] = useState<string | null>(null)
  const [matches, setMatches] = useState<MatchLog[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const clockMinute = Math.floor(clockTime / 60)
  const refreshMatches = () => { void invoke<MatchLog[]>('list_match_logs').then(setMatches).catch(() => setMatches([])) }
  useEffect(() => { void invoke<string>('get_log_dir').then(setDir).catch(() => {}) }, [])
  // Re-check current match path whenever the in-game flag flips or the clock
  // makes a sub-minute jump — covers the start of a new match without polling.
  useEffect(() => {
    void invoke<string | null>('current_match_path').then(setCurrent).catch(() => {})
  }, [live, clockMinute])
  useEffect(() => { if (showHistory) refreshMatches() }, [showHistory, live])

  const totalSize = matches.reduce((acc, m) => acc + m.size, 0)
  const deleteOne = async (name: string) => {
    try { await invoke('delete_match_log', { name }); refreshMatches() } catch { /* surface? */ }
  }
  const deleteAll = async () => {
    if (matches.length === 0) return
    if (!confirm(`ลบประวัติทั้งหมด ${matches.length} แมตช์? ลบแล้วเอากลับไม่ได้.`)) return
    try { await invoke<number>('delete_all_match_logs'); refreshMatches() } catch { /* surface? */ }
  }

  return (
    <Card title="G-Log (local only)">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: live ? C.bad : C.mut, boxShadow: live ? '0 0 8px rgba(255,123,133,0.7)' : 'none' }} />
          {live ? <span style={{ color: C.txt }}>กำลังบันทึก</span> : <span style={{ color: C.mut }}>ไม่ได้บันทึก</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowHistory((v) => !v)}
            style={{ background: showHistory ? 'rgba(143,212,255,0.16)' : 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 11px', fontSize: 12, cursor: 'pointer' }}>
            📋 ประวัติ
          </button>
          <button onClick={() => void invoke('open_log_dir').catch(() => {})}
            style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 11px', fontSize: 12, cursor: 'pointer' }}>
            📂 โฟลเดอร์
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.55 }}>
        {dir && <div style={{ wordBreak: 'break-all' }}>โฟลเดอร์: <span style={{ color: C.txt }}>{dir}</span></div>}
        {current && <div style={{ wordBreak: 'break-all' }}>ไฟล์ปัจจุบัน: <span style={{ color: C.txt }}>{current.split(/[\\/]/).pop()}</span></div>}
        <div style={{ marginTop: 6 }}>ข้อมูลทั้งหมดอยู่บนเครื่องนี้เท่านั้น — ไม่ส่งออกไปไหน.</div>
      </div>

      {showHistory && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.mut }}>
              {matches.length === 0 ? 'ยังไม่มีประวัติ' : `${matches.length} แมตช์ · รวม ${fmtSize(totalSize)}`}
            </span>
            {matches.length > 0 && (
              <button onClick={deleteAll}
                style={{ background: 'rgba(255,123,133,0.08)', color: '#ffd6da', border: '1px solid rgba(255,123,133,0.35)', borderRadius: 7, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer' }}>
                ล้างทั้งหมด
              </button>
            )}
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {matches.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 9px', background: 'rgba(143,212,255,0.04)', borderRadius: 7, fontSize: 11.5 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: C.txt }}>{m.name}</span>
                  <span style={{ color: C.mut, fontSize: 10.5 }}>{fmtDate(m.modified_ms)} · {fmtSize(m.size)}</span>
                </div>
                <button onClick={() => void deleteOne(m.name)}
                  style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 6, padding: '3px 9px', fontSize: 11, cursor: 'pointer' }}
                  title="ลบไฟล์นี้">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
