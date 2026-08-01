import { DEFAULTS, type Settings, type OverlayProfile } from './types'

export const C = { bg: '#08090c', ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6', ok: '#5be3a7', warn: '#ffcf6b', bad: '#ff7b85', line: 'rgba(143,212,255,0.16)' }

export const APP_VERSION = '0.13.1'

export const CHANGELOG: { ver: string; date: string; items: string[] }[] = [
  { ver: '0.7.6', date: '2026-06-28', items: [
    'Audio Settings ใหม่ — รวม Voice Cache + Voice Packs เป็นการ์ดเดียว แสดง clip เป็น "Voice Pack Set01" (default)',
    'Event แบ่งกลุ่มตามหมวด (แจ้งเตือน / คิล / สตรีค / สถานะ) เห็นภาพรวมง่ายขึ้น',
    'กดขยายแต่ละ event ดู clip ทีละไฟล์ + เล่นฟังทีละ clip ได้',
    'Coverage bar แสดง % event ที่มี clip ครอบคลุม',
  ]},
  { ver: '0.7.5', date: '2026-06-27', items: [
    'G-Master on/off toggle + Claude auth dropdown (Plan / API key) + kill-banner settings & preview',
    'Announcer pack manager ใน Voice Packs card',
  ]},
  { ver: '0.7.4', date: '2026-06-26', items: [
    'แพ็คเสียงไทยติดเครื่อง — Maiden พูดเสียงไทยได้ทันทีโดยไม่ต้องลงเพิ่ม (gTTS, 25 clips, 9 events; แทน SAPI ที่ฟังไม่รู้เรื่อง)',
    'Net worth แสดงค่าจริง — คำนวณจาก gold + ราคาไอเทมใน inventory (GSI ไม่ส่ง NW ใน player mode)',
    'G-Signal ความไวปรับได้ — ตึง/สมดุล/ไว (≥85% / ≥65% / ≥50%) ดีฟอลต์ "สมดุล" — แก้ปัญหา "ไม่เคยเตือน"',
    'Overlay UI editor สะอาดขึ้น — chips เล็กลง, hover ที่ชื่อโมดูล = solo focus (โมดูลอื่นจาง), พื้น Dota HUD ref dim ลง',
  ]},
  { ver: '0.7.3', date: '2026-06-25', items: [
    'โหมด overlay ใหม่ "Full" — โมดูลแยกชิ้นวางอิสระ + glass ดีไซน์ Maiden Blue (lite ยังเป็นค่าเริ่มต้น)',
    'G-Meter: แถบบอกระดับความเสี่ยง low/med/high (ไม่บอก %) อยู่ตลอด — เห็นแม้ G-Signal ยังไม่ถึงเกณฑ์',
    'Voice notice toast — โชว์ trigger event บนจอแม้ยังไม่มี voice pack ("(voice)" บอก)',
    'Overlay UI editor — ลาก-วางโมดูลพร้อมแม่เหล็กกริด 5% + พรีวิวซ้อนภาพ Dota HUD reference',
    'Voice Packs tab — ปุ่ม "ทดลองฟัง" + ลิงก์ร้านเสียง (ซื้อผ่านเว็บ)',
    'Calibration mode — บันทึก screenshot/clip ทุก event ลง %LOCALAPPDATA%\\G-Maiden\\calibration\\ สำหรับ agent audit (QA)',
    'แก้ overlay ค้างหลังเล่นยาว — emit throttle 5Hz + slow-frame watchdog + panic hook ลง error.log',
    'เตือนเมื่อ Dota อยู่โหมด Exclusive Fullscreen (overlay ใช้ไม่ได้ ต้อง Borderless)',
    'เปลี่ยน hotkey Alt+S → Ctrl+Alt+S (Alt ชนกับ ping ใน Dota)',
    'GSI status สดจริง (ไม่ค้าง "เชื่อมต่อ" หลังออกเกม) · NW โชว์ "—" เมื่อ GSI ไม่ส่ง',
  ]},
  { ver: '0.7.2', date: '2026-06-23', items: [
    'แก้บั๊ก: หน้าต่าง PowerShell แวบตอนเตือน HP ต่ำ — TTS หา piper.exe ด้วย `where` โดยไม่ซ่อน console ตอนนี้ใส่ CREATE_NO_WINDOW แล้ว (เส้นทางเสียงไม่แวบจออีก)',
  ]},
  { ver: '0.7.1', date: '2026-06-23', items: [
    'แก้บั๊ก: หน้าต่าง PowerShell เด้งวน ๆ ตอนเล่นเกม — Resource Governor (ตรวจ RAM/CPU ทุก 10s) และ SLM (curl) ลืมซ่อน console window ตอนนี้ซ่อนด้วย CREATE_NO_WINDOW แล้ว',
  ]},
  { ver: '0.7.0', date: '2026-06-23', items: [
    'Piper local TTS — neural voice ≤80ms, ไม่ต้องรอ PowerShell cold-start (fallback SAPI)',
    'Overlay advice panel — G-Master ตอบบนหน้าจอโดยตรง 20 วินาที (G5.4)',
    'Enemy-missing badge — แสดงฮีโร่ที่ G-Sentry ตรวจจับว่าหายบนแผนที่ >5s (G2.6)',
    'Local SLM fallback — ถ้า Claude CLI offline ใช้ Aroow-9B ผ่าน ollama (G7.1)',
    'Resource Governor — ตรวจ RAM/CPU ทุก 10s แสดงใน System card (G7.2)',
    'System card — แสดงสถานะ module ทั้งหมด + แจ้งเตือนเมื่อเกิน budget',
  ]},
  { ver: '0.6.0', date: '2026-06-22', items: [
    'แผงสถิติ overlay เลือกเปิด/ปิดเป็นรายการ (นาฬิกา, สกอร์, HP/Mana, K/D/A, ทอง)',
    'ตำแหน่ง overlay กำหนดเองได้ (X/Y slider) + บันทึกโปรไฟล์',
    'ทดสอบ overlay ไม่เปลี่ยนสถานะ Dota/GSI แล้ว',
    'G-Damage engine — ฐานข้อมูล hero + สูตรคำนวณ burst damage (พื้นฐาน)',
  ]},
  { ver: '0.5.0', date: '2026-06-22', items: [
    'rodio audio backend — WAV เล่นในโปรเซส (ไม่ spawn PowerShell), cancel <1ms',
    'Changelog viewer — ดูรายละเอียดเวอร์ชันในแอปได้',
    'ไม่มีหน้าต่าง cmd แวบตอนเล่นเสียงอีกแล้ว',
  ]},
  { ver: '0.4.1', date: '2026-06-21', items: [
    'แก้ไข: แจ้งเตือน HP ต่ำ ตอนนี้แจ้งซ้ำได้ทุกรอบที่ HP ลดลงอีก',
  ]},
  { ver: '0.4.0', date: '2026-06-21', items: [
    'Stat HUD (timer, score, HP bar, K/D/A, gold) ปิดเป็นค่าเริ่มต้น — Dota แสดงอยู่แล้ว',
    'เปิดได้ในตั้งค่าถ้าต้องการ',
  ]},
  { ver: '0.3.0', date: '2026-06-21', items: [
    'Overlay preview — จำลอง overlay โดยไม่ต้องเปิด Dota',
    'ทดสอบเสียง Thai + English ในแผงควบคุม',
  ]},
  { ver: '0.2.0', date: '2026-06-20', items: [
    'แก้ไข: หน้าต่าง CMD ไม่แวบทุก 4 วินาทีแล้ว (CREATE_NO_WINDOW)',
  ]},
  { ver: '0.1.0', date: '2026-06-20', items: [
    'เปิดตัว: GSI server, overlay, แผงควบคุม',
    'Minimap CV pipeline (จับภาพ → ตรวจจับ → แจ้งเตือน gank)',
    'เสียงพูด SAPI + WAV clips, ระบบอัปเดตในแอป',
    'G-Log บันทึกแมตช์ในเครื่อง (JSONL)',
  ]},
]

export const loadSettings = (): Settings => {
  try {
    const raw = JSON.parse(localStorage.getItem('gm-settings') ?? '{}') as Record<string, unknown>
    if (typeof raw.showStats === 'boolean' && raw.showStats) {
      raw.showTimer = raw.showScore = raw.showHeroBar = raw.showKda = raw.showGold = true
    }
    delete raw.showStats
    // Overlay merge: lite retired into the single Full overlay — coerce any
    // persisted 'lite' so returning users get the merged overlay, not the
    // dormant fallback.
    return { ...DEFAULTS, ...(raw as Partial<Settings>), uiMode: 'full' }
  } catch {
    return DEFAULTS
  }
}
export const loadProfiles = (): OverlayProfile[] => {
  try { return JSON.parse(localStorage.getItem('gm-profiles') ?? '[]') } catch { return [] }
}
