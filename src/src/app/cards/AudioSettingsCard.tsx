import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { C } from '../theme'
import { Card } from '../primitives'
import type { VoiceCacheStatus, EventClip } from '../types'

// ─────────────────────────────── AUDIO SETTINGS (unified voice pack + event manager) ───────────────────────────────
const PREVIEW_LINES: Record<string, string> = {
  match_start: 'เริ่มเกมแล้ว ลุยกันเลยค่ะ!',
  danger: 'ถอยก่อนค่ะเพื่อน เลือดเหลือน้อยแล้ว',
  gank: 'ระวังนะคะ ศัตรูหายไปจากแมพหลายตัว อาจมีแก๊งค์',
  revision: 'เอ๊ะ เดี๋ยวก่อน ดูเหมือนจะปลอดภัยแล้วค่ะ',
  first_blood: 'เลือดแรกเป็นของเรา!',
  kill: 'ฆ่าได้สวยค่ะ เก็บไปเรื่อยๆ',
  double_kill: 'สองศพรวด เด็ดมาก!',
  triple_kill: 'ขจัดไปสามแล้ว เริ่มมีกลิ่นแล้วนะ!',
  ultra_kill: 'สี่ศพ หยุดไม่อยู่แล้ว!',
  rampage: 'ห้าศพรวด แรมเพจ!',
  killing_spree: 'กำลังขึ้น คิลลิ่งสปรี!',
  dominating: 'ครองเกมแล้ว โดมิเนตติ้ง!',
  mega_kill: 'เมก้าคิล!',
  unstoppable: 'ไม่มีใครหยุดได้ อันสต็อปเปเบิล!',
  wicked_sick: 'โหดเกินไปแล้ว วิคเก็ดซิค!',
  monster_kill: 'มอนสเตอร์คิล!',
  godlike: 'ระดับเทพ ก็อดไลก์!',
  beyond_godlike: 'เหนือกว่าเทพ บียอนด์ก็อดไลก์!',
  death: 'ตายแล้วเหรอคะ ไม่เป็นไรเดี๋ยวกลับมาใหม่',
  respawn: 'กลับมาแล้ว ค่อยๆนะคะ',
  levelUp: 'ขึ้นเลเวลแล้วค่ะ สวยมาก',
  hpLow: 'เลือดน้อยมากแล้ว ระวังตัวด้วย!',
  manaLow: 'มานาเหลือน้อยแล้วค่ะ ระวังด้วย',
  advice: 'ลองดูคำแนะนำนี้นะคะ',
}
const EVENT_CATEGORIES: { label: string; color: string; events: string[] }[] = [
  { label: 'แจ้งเตือน', color: '#ff6b6b', events: ['danger', 'gank', 'revision', 'hpLow', 'manaLow'] },
  { label: 'คิล / มัลติคิล', color: '#ffd93d', events: ['first_blood', 'kill', 'double_kill', 'triple_kill', 'ultra_kill', 'rampage'] },
  { label: 'สตรีค', color: '#ff8c42', events: ['killing_spree', 'dominating', 'mega_kill', 'unstoppable', 'wicked_sick', 'monster_kill', 'godlike', 'beyond_godlike'] },
  { label: 'สถานะ', color: '#6bcb77', events: ['match_start', 'death', 'respawn', 'levelUp', 'advice'] },
]
const EVENT_LABELS: Record<string, string> = {
  danger: 'อันตราย', gank: 'แก๊งค์', revision: 'ยกเลิกเตือน', hpLow: 'เลือดต่ำ', manaLow: 'มานาต่ำ',
  first_blood: 'เลือดแรก', kill: 'คิล', double_kill: 'ดับเบิล', triple_kill: 'ทริปเปิล', ultra_kill: 'อัลตร้า', rampage: 'แรมเพจ',
  killing_spree: 'สปรี', dominating: 'ครองเกม', mega_kill: 'เมก้า', unstoppable: 'หยุดไม่ได้',
  wicked_sick: 'โหดมาก', monster_kill: 'มอนสเตอร์', godlike: 'ก็อดไลก์', beyond_godlike: 'เหนือเทพ',
  match_start: 'เริ่มเกม', death: 'ตาย', respawn: 'ฟื้น', levelUp: 'เลเวลอัป', advice: 'คำแนะนำ',
}
export const AudioSettingsCard: React.FC = () => {
  const [st, setSt] = useState<VoiceCacheStatus | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [clips, setClips] = useState<EventClip[]>([])
  const [playing, setPlaying] = useState<string | null>(null)
  const refresh = () => { void invoke<VoiceCacheStatus>('voice_cache_status').then(setSt).catch(() => {}) }
  useEffect(refresh, [])
  const counts = st?.counts ?? {}
  const allEvents = Object.keys(PREVIEW_LINES)
  const total = st?.total ?? 0
  const covered = allEvents.filter((ev) => (counts[ev] ?? 0) > 0).length
  const pct = Math.round((covered / allEvents.length) * 100)

  const toggleExpand = (ev: string) => {
    if (expanded === ev) { setExpanded(null); setClips([]); return }
    setExpanded(ev)
    void invoke<EventClip[]>('list_event_clips', { event: ev }).then(setClips).catch(() => setClips([]))
  }
  const playClip = (path: string) => {
    setPlaying(path)
    void invoke('play_clip', { path }).catch(() => {})
    setTimeout(() => setPlaying(null), 2000)
  }
  const playEvent = (ev: string) => {
    setPlaying(ev)
    void invoke('speak_event', { event: ev, fallback: PREVIEW_LINES[ev] ?? '', voice: null, rate: null }).catch(() => {})
    setTimeout(() => setPlaying(null), 2000)
  }

  if (!st) return <Card title="Audio Settings"><div style={{ fontSize: 12.5, color: C.mut, paddingTop: 8 }}>กำลังสแกน…</div></Card>
  return (
    <Card title="Audio Settings">
      {/* ── Pack header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(143,212,255,0.12)', border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎙️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.txt }}>Voice Pack Set01 <span style={{ fontSize: 10, color: '#0c1018', fontWeight: 600, background: C.ice, borderRadius: 4, padding: '1px 6px', marginLeft: 6 }}>hotfix</span></div>
            <div style={{ fontSize: 12, color: C.mut }}>{total} clips · {covered}/{allEvents.length} events ({pct}%)</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={refresh} title="สแกนใหม่" style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>⟳</button>
          <button onClick={() => void invoke('open_voice_cache_dir').catch(() => {})} title="เปิดโฟลเดอร์ voice-cache" style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>📂</button>
        </div>
      </div>

      {/* ── Coverage bar ── */}
      <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 6, height: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.ok : C.ice, borderRadius: 6, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 10.5, color: C.mut, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>{pct === 100 ? 'ครบทุก event แล้ว!' : `ยังขาด ${allEvents.length - covered} event — ใช้ SAPI fallback`}</span>
        <span style={{ color: C.ice }}>{st.dir}</span>
      </div>

      {/* ── Event categories ── */}
      <div style={{ marginTop: 14 }}>
        {EVENT_CATEGORIES.map((cat) => (
          <div key={cat.label} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: cat.color, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 3, borderRadius: 2, background: cat.color }} />
              {cat.label}
              <span style={{ color: C.mut, fontWeight: 400 }}>({cat.events.filter(e => (counts[e] ?? 0) > 0).length}/{cat.events.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {cat.events.map((ev) => {
                const n = counts[ev] ?? 0
                const has = n > 0
                const isExpanded = expanded === ev
                return (
                  <div key={ev}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: isExpanded ? 'rgba(143,212,255,0.08)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}
                      onClick={() => toggleExpand(ev)}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: has ? C.ok : 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: C.txt, flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: has ? C.ice : C.mut }}>{ev}</span>
                        <span style={{ color: C.mut, marginLeft: 6, fontSize: 11 }}>{EVENT_LABELS[ev] ?? ''}</span>
                      </span>
                      <span style={{ fontSize: 11, color: has ? C.ok : C.mut, fontFamily: 'monospace', minWidth: 30, textAlign: 'right' }}>{has ? `${n} clip${n > 1 ? 's' : ''}` : 'SAPI'}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); playEvent(ev) }}
                        title={has ? 'เล่น clip สุ่ม' : 'เล่นเสียง SAPI'}
                        style={{ background: 'transparent', color: playing === ev ? C.ok : (has ? C.ice : C.mut), border: `1px solid ${C.line}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                      >{playing === ev ? '⏹' : '▶'}</button>
                      <span style={{ fontSize: 10, color: C.mut, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>
                    {isExpanded && (
                      <div style={{ margin: '2px 0 6px 25px', padding: '8px 12px', background: 'rgba(18,20,28,0.6)', borderRadius: 8, border: `1px solid ${C.line}` }}>
                        {clips.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {clips.map((clip) => (
                              <div key={clip.path} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                <button
                                  onClick={() => playClip(clip.path)}
                                  style={{ background: 'transparent', color: playing === clip.path ? C.ok : C.ice, border: `1px solid ${C.line}`, borderRadius: 5, padding: '2px 7px', fontSize: 11, cursor: 'pointer' }}
                                >{playing === clip.path ? '⏹' : '▶'}</button>
                                <span style={{ color: C.txt, fontFamily: 'monospace', fontSize: 11 }}>{clip.name}</span>
                                <span style={{ fontSize: 10, color: C.mut, padding: '1px 5px', background: clip.source === 'user' ? 'rgba(91,227,167,0.12)' : 'rgba(143,212,255,0.08)', borderRadius: 4 }}>
                                  {clip.source === 'user' ? 'user' : 'default'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: C.mut }}>ไม่มี clip — จะใช้ SAPI TTS พูดว่า "<span style={{ color: C.txt, fontStyle: 'italic' }}>{PREVIEW_LINES[ev] ?? ''}</span>"</div>
                        )}
                        {clips.length > 0 && clips[0].source === 'default' && (
                          <div style={{ fontSize: 10.5, color: C.mut, marginTop: 6 }}>💡 วาง clip ใน <code style={{ color: C.txt }}>{ev}/</code> เพื่อ override default pack</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Bottom actions ── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
        <button onClick={() => void invoke('open_voice_cache_dir').catch(() => {})}
          style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 9, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>
          📂 เปิดโฟลเดอร์เสียง
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: C.mut, marginTop: 6, lineHeight: 1.5 }}>
        สร้างแพ็คเอง: <b style={{ color: C.txt }}>G-AnnStudio</b> → map event → กด "ส่ง G-Maiden" แล้วกด ⟳ · วาง WAV/MP3 ลง <code style={{ color: C.txt }}>{`{event}/{n}.wav`}</code>
      </div>
    </Card>
  )
}
