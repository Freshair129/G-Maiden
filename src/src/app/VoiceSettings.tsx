import React from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import type { Settings, VoiceInfo, Sensitivity } from './types'
import { C } from './theme'
import { Card, Row, Toggle } from './primitives'
import { AudioSettingsCard } from './cards/AudioSettingsCard'

type VoiceSettingsProps = {
  settings: Settings
  voices: VoiceInfo[]
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

export const VoiceSettings = React.memo(function VoiceSettings({ settings: s, voices, set }: VoiceSettingsProps) {
  return (
          <>
            <Card title="Alerts (G-Signal)">
              <Row label="เตือนเมื่อ HP ต่ำ"><Toggle on={s.alertEnabled} onChange={(v) => set('alertEnabled', v)} /></Row>
              <Row label={`ขีดเตือน HP: ${s.alertThreshold}%`}>
                <input type="range" min={10} max={50} value={s.alertThreshold} onChange={(e) => set('alertThreshold', Number(e.target.value))} style={{ width: 150 }} disabled={!s.alertEnabled} />
              </Row>
              <Row label="เสียงพูด (Maiden)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => void invoke('speak', { text: 'G-Maiden voice test. ทดสอบเสียงค่ะ เลือดน้อยแล้ว ถอยก่อน', voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})} disabled={!s.voiceEnabled}
                    style={{ background: 'transparent', color: s.voiceEnabled ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 11px', fontSize: 12, cursor: s.voiceEnabled ? 'pointer' : 'not-allowed' }}>
                    🔊 ทดสอบเสียง
                  </button>
                  <Toggle on={s.voiceEnabled} onChange={(v) => set('voiceEnabled', v)} />
                </div>
              </Row>
              <Row label="เลือกเสียง">
                <select value={s.voiceName} onChange={(e) => set('voiceName', e.target.value)} disabled={!s.voiceEnabled || voices.length === 0}
                  style={{ background: 'rgba(18,20,28,0.86)', color: s.voiceEnabled ? C.txt : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, maxWidth: 240 }}>
                  <option value="">— ระบบเลือกเอง —</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>{v.name} ({v.culture}, {v.gender === 'Female' ? 'หญิง' : v.gender === 'Male' ? 'ชาย' : v.gender})</option>
                  ))}
                </select>
              </Row>
              <Row label={`ความเร็ว: ${s.voiceRate > 0 ? '+' : ''}${s.voiceRate}`}>
                <input type="range" min={-5} max={5} step={1} value={s.voiceRate} onChange={(e) => set('voiceRate', Number(e.target.value))} disabled={!s.voiceEnabled} style={{ width: 150 }} />
              </Row>
              <Row label={`ระดับเสียง: ${s.volume}%${s.volume === 0 ? ' (ปิดเสียง)' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => set('volume', s.volume === 0 ? 80 : 0)}
                    style={{ background: 'transparent', color: s.volume === 0 ? C.bad : C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 8px', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>
                    {s.volume === 0 ? '🔇' : s.volume <= 30 ? '🔈' : s.volume <= 70 ? '🔉' : '🔊'}
                  </button>
                  <input type="range" min={0} max={100} step={5} value={s.volume} onChange={(e) => set('volume', Number(e.target.value))} style={{ width: 130 }} />
                </div>
              </Row>
              <Row label="พูดเสริมตามเหตุการณ์">
                <Toggle on={s.personaLines} onChange={(v) => set('personaLines', v)} />
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                Windows SAPI · ติดตั้งเสียงไทยใน Windows Settings · Time & Language · Speech เพื่อให้ Maiden พูดไทยชัดขึ้น
                {voices.length > 0 && voices.every((v) => !v.culture.startsWith('th')) && (
                  <span style={{ color: C.warn }}> · ตอนนี้ยังไม่มี Thai voice → จะใช้เสียง {voices[0]?.gender === 'Female' ? 'อังกฤษ' : 'อังกฤษ'} อ่านข้อความไทย</span>
                )}
              </div>
            </Card>

            <Card title="G-Signal — แบนเนอร์แจ้งเตือน">
              <Row label="แบนเนอร์เตือนแก๊งค์ (gank)"><Toggle on={s.gankVisuals} onChange={(v) => set('gankVisuals', v)} /></Row>
              <Row label="แบนเนอร์ฆ่า / สตรีค (kill banner)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => { void emit('preview-kill', { streak: 5, victim: 'npc_dota_hero_lina' }); void invoke('speak_event', { event: 'mega_kill', fallback: 'เมก้าคิล!', voice: null, rate: null }).catch(() => {}) }}
                    title="โชว์ตัวอย่างแบนเนอร์บน overlay (ต้องเปิด overlay อยู่)"
                    style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 11px', fontSize: 12, cursor: 'pointer' }}>▶ ดูตัวอย่าง</button>
                  <Toggle on={s.killVisuals} onChange={(v) => set('killVisuals', v)} />
                </div>
              </Row>
              <Row label="ความไวเตือนแก๊งค์">
                <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
                  {(['low','med','high'] as Sensitivity[]).map((lv) => (
                    <button key={lv} onClick={() => set('signalSensitivity', lv)}
                      style={{ background: s.signalSensitivity === lv ? 'rgba(143,212,255,0.16)' : 'transparent', color: s.signalSensitivity === lv ? C.ice : C.mut, border: 'none', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
                      {lv === 'low' ? 'ตึง (≥85%)' : lv === 'med' ? 'สมดุล (≥65%)' : 'ไว (≥50%)'}
                    </button>
                  ))}
                </div>
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                แบนเนอร์ขึ้นกลาง-บนของจอเมื่อ G-Signal เตือนแก๊งค์ (ไม่บังมินิแมพ).
              </div>
            </Card>

            <Card title="G-Persona Presets">
              <Row label="เลือกโหมดบุคลิก (Preset)">
                <select value={s.personaPreset || 'coach'} onChange={(e) => {
                  const p = e.target.value as 'coach' | 'silent' | 'caster' | 'meme'
                  set('personaPreset', p)
                  if (p === 'silent') {
                    set('personaLines', false)
                  } else {
                    set('personaLines', true)
                  }
                }} style={{ background: 'rgba(18,20,28,0.86)', color: C.txt, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, maxWidth: 240 }}>
                  <option value="coach">Serious Coach (ปกติ + จริงจัง)</option>
                  <option value="silent">Silent Companion (เตือนภัยวิกฤตเท่านั้น)</option>
                  <option value="caster">Chatty Caster (พูดคุยบ่อย + สบายๆ)</option>
                  <option value="meme">Meme Partner (ปกติ + มีม/ติดตลก)</option>
                </select>
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                {s.personaPreset === 'coach' && 'Serious Coach: พูดแจ้งเตือนทั่วไปด้วยน้ำเสียงและคำแนะนำที่เป็นงานเป็นการ เหมาะสำหรับผู้เล่นที่ต้องการโฟกัส'}
                {s.personaPreset === 'silent' && 'Silent Companion: ซ่อนการพูดคุยเล่นและเสียงประกาศทั่วไปทั้งหมด จะส่งเสียงเตือนเฉพาะเหตุการณ์อันตรายวิกฤต (G-Signal) และแจ้งเตือนด่วนเท่านั้น'}
                {s.personaPreset === 'caster' && 'Chatty Caster: พากย์เกมอย่างต่อเนื่อง สบายๆ และเป็นกันเอง คอยอัปเดตสถานะและคำแนะนำสม่ำเสมอ'}
                {s.personaPreset === 'meme' && 'Meme Partner: แทรกมุกตลกเบาสมอง และคำล้อเลียนความเร็วการเดินของ Maiden (Nerf CM) เมื่อทำกิจกรรมต่างๆ ในเกม'}
              </div>
            </Card>

            <AudioSettingsCard />
          </>
  )
})
