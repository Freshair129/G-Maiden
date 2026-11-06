---
title: "CR-042 — G-Voice Slice 1b: PTT settings card"
doc_id: "CR-042-g-voice-ptt-settings-ui"
status: "accepted"
approved_by: "Boss (explicit approval in chat, 2026-11-07: อนุมัติตามร่าง)"
approved_date: "2026-11-07"
version: "0.1.1"
updated: "2026-11-07"
owner: "Boss"
complexity: "C-2"
risk: "LOW"
related_docs: ["CR-041-g-voice-ptt-turn-lifecycle", "FEAT-G-VOICE", "05-sitemap-ia", "02-tokens", "04-components"]
---

# CR-042 — G-Voice Slice 1b: การ์ดตั้งค่า PTT

> **สถานะ:** accepted 2026-11-07 — Boss อนุมัติตามร่าง.
> **Risk: LOW** — UI อย่างเดียว ใช้ Tauri command/event ที่ [[CR-041-g-voice-ptt-turn-lifecycle]] กำหนดแล้ว; ไม่เพิ่ม IPC,
> ไม่แตะ backend, ไม่เปิดไมค์. ขึ้นกับ Slice 1a (PR #150) จึงเป็น PR ซ้อนบน branch นั้น.

## 1. เหตุผล

CR-041 §2 ระบุ Slice 1b เพียงหนึ่งบรรทัด (แสดง binding, remap, collision error, unavailable) แต่ไม่กำหนดตำแหน่ง,
วิธีจับปุ่ม, ข้อความ และ acceptance. เอกสารนี้เติมส่วนนั้นให้ Codex ทำได้โดยไม่ต้องเดา.

## 2. ตำแหน่ง

- Settings › **เสียง & เตือน** (`Control` category ที่ render [`VoiceSettings`](../../src/src/app/VoiceSettings.tsx)) — เพิ่มการ์ด
  **“G-Voice · Push-to-talk”** เป็นการ์ดแรกของหมวด
- การ์ดใหม่อยู่ในไฟล์ใหม่ `src/src/app/cards/VoicePttCard.tsx`; `VoiceSettings.tsx` แก้เพียงการ mount การ์ด
- **R1/R2 ([[05-sitemap-ia]] §2.2):** ต้องไม่ทำให้เกิด page-level scroll ที่ deck ขนาดเริ่มต้น 1920×1080 / 100% DPI.
  ถ้าหมวดล้น ให้แยกหมวดเป็น `DeckTabs` `[การแจ้งเตือน | G-Voice]` แทนการเพิ่ม scroll
- **R3:** การ์ดใหม่ใช้ `--g-*` tokens เท่านั้น ห้ามใช้ palette `C` หรือ hex ใหม่. ไม่ย้าย/แก้ส่วนเดิมของ `VoiceSettings` ที่ยังใช้ `C`
  (บันทึกเป็นหนี้แยก ไม่แก้ใน CR นี้)

## 3. เนื้อหาการ์ด

| ส่วน | พฤติกรรม |
| --- | --- |
| ปุ่มปัจจุบัน | แสดง accelerator จาก `get_voice_ptt_status()` เป็น keycap แยกตัว (เช่น `Ctrl` `Alt` `V`) |
| Status chip | `registered=true` → “พร้อมรับปุ่ม” (`--g-ok`); `registration_failed` → “ลงทะเบียนปุ่มไม่ได้ — มีโปรแกรมอื่นใช้อยู่ ลองเปลี่ยนปุ่ม” (`--g-warn`) |
| ข้อจำกัดปัจจุบัน | บรรทัดคงที่: “ยังไม่มีระบบจดจำเสียงในเครื่อง — กดแล้ว Maiden จะยังไม่ฟัง (ไม่เปิดไมโครโฟน)” (`--g-text-mute`) |
| ผลการกดล่าสุด | subscribe event `voice-turn`; แสดง chip สั้น 3 วินาทีตาม state/reason (ตาราง §4); ไม่แสดงหรือเก็บข้อมูลอื่นนอก 4 field |
| ปุ่ม “เปลี่ยนปุ่ม” | เข้าโหมดจับปุ่ม (§5) |
| ปุ่ม “คืนค่าเริ่มต้น” | เรียก `set_voice_ptt_shortcut("Ctrl+Alt+V")`; ซ่อนเมื่อค่าปัจจุบันเป็นค่าเริ่มต้นอยู่แล้ว |
| คำเตือน Dota | “แอปตรวจปุ่มที่ผูกไว้ในเกมไม่ได้ — เลือกปุ่มที่ไม่ได้ใช้ใน Dota 2” |
| ปุ่มสงวน | แสดงรายการ `Ctrl+Alt+S`, `Alt+↑`, `Alt+↓`, `Alt+M` ว่าเลือกไม่ได้ |

## 4. ข้อความ (ไทย)

| ที่มา | ข้อความ |
| --- | --- |
| `invalid_accelerator` | “ปุ่มนี้ใช้ไม่ได้ — ต้องมี Ctrl หรือ Alt และตามด้วย A–Z, 0–9 หรือ F1–F12” |
| `reserved_conflict` | “ปุ่มนี้ G-Maiden ใช้อยู่แล้ว” |
| `registration_failed` | “ลงทะเบียนปุ่มไม่ได้ — มีโปรแกรมอื่นใช้อยู่ ปุ่มเดิมยังใช้งานได้” |
| `settings_write_failed` | “บันทึกการตั้งค่าไม่สำเร็จ ปุ่มเดิมยังใช้งานได้” |
| invoke ล้มเหลว/ไม่รู้จัก code | “เปลี่ยนปุ่มไม่สำเร็จ ปุ่มเดิมยังใช้งานได้” |
| `voice-turn` `unavailable`/`stt_not_installed` | “รับปุ่มแล้ว — ยังไม่มีระบบจดจำเสียง” |
| `voice-turn` `cancelled`/`too_short` | “กดสั้นเกินไป” |
| `voice-turn` `cancelled`/`signal_preempt` | “หยุดเพราะมีการแจ้งเตือนสำคัญ” |
| `voice-turn` state/reason อื่น | ไม่แสดง chip |

## 5. โหมดจับปุ่ม

1. กด “เปลี่ยนปุ่ม” → การ์ดแสดง “กดปุ่มที่ต้องการ… (Esc เพื่อยกเลิก)” และ focus อยู่ในการ์ด (`aria-live="polite"`)
2. รับ `keydown` ภายในหน้าต่าง (ไม่ใช่ global hook), `preventDefault()`; แปลงด้วย pure function
   `acceleratorFromKeyEvent(e)` → string รูปแบบเดียวกับ CR-041 §3 (`Ctrl+Alt+V`, `Ctrl+Shift+F9`) หรือ `null` ถ้ายังเป็นแค่ modifier
3. ได้ accelerator แล้ว แสดงเป็น preview พร้อมปุ่ม “บันทึก” และ “ยกเลิก”; ตรวจ reserved/รูปแบบฝั่ง UI ก่อนเพื่อแสดงข้อความทันที
   แต่ backend ยังเป็นผู้ตัดสินสุดท้าย
4. “บันทึก” → `set_voice_ptt_shortcut(accelerator)`; ระหว่าง pending ปิดปุ่ม (ห้ามส่งซ้ำ); สำเร็จ → อ่าน status ใหม่;
   ล้มเหลว → ข้อความ §4 และคงปุ่มเดิมที่แสดงไว้
5. `Esc`, “ยกเลิก”, เปลี่ยนหมวด/หน้า หรือไม่มีการกดภายใน 10 วินาที → ออกจากโหมดโดยไม่เปลี่ยนค่า
6. ระหว่างจับปุ่ม ถ้าผู้ใช้กดปุ่ม PTT ปัจจุบัน global shortcut จะยังทำงานและส่ง `voice-turn` ตามปกติ — ยอมรับได้ใน slice นี้

## 6. Acceptance criteria

Vitest (เขียนก่อนแล้วให้ผ่าน), รันจาก `src/`:

- [ ] `acceleratorFromKeyEvent`: Ctrl+Alt+V, Ctrl+Shift+F9, Alt+1 ถูก; modifier เดี่ยวคืน `null`; ไม่มี Ctrl/Alt หรือ Win/Meta ให้ผลที่ UI แสดงว่าใช้ไม่ได้
- [ ] render status: registered → chip พร้อม; `registration_failed` → chip เตือน; ข้อความข้อจำกัด STT แสดงเสมอ
- [ ] remap สำเร็จ: เรียก `set_voice_ptt_shortcut` ครั้งเดียวด้วย accelerator ที่จับได้ แล้วอ่าน status ใหม่; ปุ่มถูกปิดระหว่าง pending
- [ ] remap ล้มเหลวแต่ละ error code → ข้อความ §4 และยังแสดงปุ่มเดิม
- [ ] Esc / timeout 10 s / unmount ออกจากโหมดโดยไม่เรียก invoke
- [ ] event `voice-turn` map เป็น chip ตาม §4 และหายใน 3 s; unlisten เมื่อ unmount
- [ ] ไม่มี hex/`C` ใหม่ในไฟล์การ์ด (ตรวจด้วยเทสต์หรือ lint rule ที่มีอยู่)
- [ ] `npx tsc --noEmit`, eslint, `vitest run` ทั้งชุดผ่าน; ไม่แก้ backend

**การยอมรับด้วยตา (บังคับก่อน merge):** PR เปิดเป็น draft; แนบภาพหน้าจอ Settings › เสียง & เตือน ที่ deck 1920×1080
ในสถานะ ready, กำลังจับปุ่ม, error และ chip หลังกด PTT; Boss ต้องดูและอนุมัติก่อน merge. Unit test ไม่ใช่หลักฐานด้านภาพ.

## 7. เอกสารที่ต้องอัปเดตพร้อม implementation

- [[05-sitemap-ia]] §6 Hotkeys: เพิ่มแถว `Ctrl+Alt+V` = G-Voice PTT (remap ได้ที่ Settings › เสียง & เตือน)

## 8. นอกขอบเขต

ไมค์, STT, คำตอบ, subtitle บน overlay, การย้าย `VoiceSettings` เดิมไปใช้ `--g-*`, การตรวจ bind ใน Dota.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | Draft Slice 1b PTT settings card contract: placement, capture flow, Thai copy, tokens and acceptance including visual review. |
| 0.1.1 | 2026-11-07 | Boss approved the draft as written; implementation may start. |
