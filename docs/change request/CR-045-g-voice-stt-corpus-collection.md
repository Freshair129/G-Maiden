---
title: "CR-045 — G-Voice Slice 3b: consented STT corpus collection"
doc_id: "CR-045-g-voice-stt-corpus-collection"
status: "accepted"
approved_by: "Boss (explicit approval in chat, 2026-11-07: อนุมัติตามร่าง)"
approved_date: "2026-11-07"
version: "0.1.1"
updated: "2026-11-07"
owner: "Boss"
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["CR-044-g-voice-stt-benchmark-harness", "MVP-038-local-stt-evaluation", "FEAT-G-VOICE", "mvp-decisions"]
---

# CR-045 — G-Voice Slice 3b: เก็บชุดเสียงทดสอบ STT แบบยินยอม

> **สถานะ:** accepted 2026-11-07. Boss อนุมัติตามร่าง พร้อมมติตาม §8.1 **Risk: MEDIUM**: เป็นการบันทึกเสียงของคนจริง (ข้อมูลส่วนบุคคล).
> ไม่แตะ runtime ของแอป, ไม่มี network และข้อมูลเสียงทั้งหมดอยู่นอก repo.

## 1. เหตุผลและขอบเขต

[[CR-044-g-voice-stt-benchmark-harness]] ให้เครื่องมือวัดผลแล้ว แต่ [[MVP-038-local-stt-evaluation]] ปิดไม่ได้จนกว่าจะมี corpus จริง
คือ ≥100 utterances ต่อภาษา แยก quiet/game-audio, มี code-switch และ consent พร้อม intent/slot inventory ที่ตรึงก่อนรัน.
ผลลองรันเบื้องต้น (เสียงสังเคราะห์ภาษาอังกฤษ ไม่ใช่ benchmark) ใช้ทดสอบภาษาไทยไม่ได้เลย เพราะเครื่องไม่มีเสียงสังเคราะห์ภาษาไทย.

**In scope:**
- intent/slot inventory (§3)
- ชุดประโยค (prompt set)
- เครื่องมืออัดเสียงในเครื่อง (§4)
- โปรโตคอลอัดและ consent (§5)
- เกณฑ์ตรวจ corpus ก่อนใช้ (§6)

**Out of scope:**
- การตีความ intent ในแอป (MVP-041)
- เลือกผู้ชนะ STT: ทำหลังได้ receipt (Slice 3c)
- เก็บเสียงคนอื่นนอกจากผู้ที่เซ็น consent
- ส่งข้อมูลออกนอกเครื่อง

## 2. Gap analysis

| ข้อกำหนด MVP-038 §4 | ปัจจุบัน | Gap |
| --- | --- | --- |
| ≥100 utterances ต่อภาษา (th, en) + code-switch แยก | ไม่มี | ต้องอัด |
| quiet และ game-audio แยกรายงาน | ไม่มี | ต้องอัดทั้งสองสภาพ และบันทึกวิธีสร้างเสียงเกม |
| ศัพท์ผู้เล่นจริง: ฮีโร่, ไอเทม, ตัวเลข, เวลา | ไม่มี | ต้องเขียน prompt set |
| intent/slot inventory ตรึงก่อนรัน | **ไม่มีที่ใดใน repo** (FEAT-G-VOICE ระบุแค่เกณฑ์ ≥90%) | ต้องนิยามใน CR นี้ |
| แยก tuning/holdout ตาม speaker และ session | ไม่มี | ใช้ session แยก; ถ้ามีผู้พูดคนเดียว ต้องระบุเป็นข้อจำกัด |
| consent, อุปกรณ์ไมค์, ระดับเสียง | template มีแล้ว (CR-044) | ต้องกรอกและเก็บนอก Git |
| เครื่องมืออัดเป็น mono 16 kHz PCM16 | ไม่มี (เครื่องไม่มี ffmpeg/sox) | ต้องมีเครื่องมืออัด |

## 3. Intent และ slot inventory (v1, ตรึงก่อนรัน)

| Intent | ตัวอย่างไทย | ตัวอย่างอังกฤษ | Critical slots |
| --- | --- | --- | --- |
| `enemy_location` | ศัตรูเลนกลางหายไปไหน | where is the enemy mid | `hero` หรือ `lane` |
| `item_advice` | ควรออก BKB ไหม | should I buy BKB now | `item` |
| `skill_advice` | อัปสกิลไหนดี | which skill should I level | – |
| `objective_timing` | รอชานเกิดกี่นาที | when does Roshan respawn | `objective` (`roshan`/`rune`/`tormentor`/`outpost`) |
| `own_status` | เงินเราตอนนี้เท่าไหร่ | how much net worth do I have | `stat` (`gold`/`net_worth`/`level`/`kda`) |
| `matchup_advice` | สู้ Pudge ยังไง | how do I play against Pudge | `hero` |
| `repeat` | พูดอีกที | say that again | – |
| `cancel` | ไม่เป็นไร ยกเลิก | never mind | – |

- ค่า slot ใช้ชื่อมาตรฐานภาษาอังกฤษตัวพิมพ์เล็ก (`hero: "pudge"`, `item: "black_king_bar"`)
- ชื่อเรียกย่อ/ภาษาพูด เช่น "บีเคบี", "รอชาน", "พุดจ์" ต้องอยู่ใน prompt set
- Exact match ของ intent และ critical slots ตาม CR-044 harness

## 4. เครื่องมืออัดเสียง

| หัวข้อ | สัญญา |
| --- | --- |
| ที่อยู่ | `tools/g-voice-stt-bench/recorder/`: หน้า HTML+JS ไฟล์เดียว ไม่มี dependency และไม่มี network; เปิดใน Edge/Chrome จากไฟล์ในเครื่อง |
| การอัด | `getUserMedia` (ขอสิทธิ์ไมค์จาก browser) → `AudioContext` 16 kHz → PCM16 mono WAV; กด Space ค้างเพื่ออัด ปล่อยเพื่อหยุด (เหมือน PTT) |
| ที่เก็บ | ผู้ใช้เลือก directory นอก repo ผ่าน File System Access API; เขียน WAV + `manifest.json` ตาม schema ของ CR-044 ลงที่นั่นโดยตรง ไม่ผ่าน Downloads |
| Prompt | อ่านจาก `prompts.th.json`, `prompts.en.json`, `prompts.code-switch.json` (อยู่ใน repo ได้ เพราะเป็นข้อความที่เราเขียนเอง ไม่ใช่เสียง) แสดงทีละประโยคพร้อม intent/slots |
| ควบคุมคุณภาพ | ฟังซ้ำ/อัดใหม่ได้; เตือนเมื่อเสียงเบาหรือ clip; บันทึก `condition`, `session`, `speaker` (นามแฝง), ชื่ออุปกรณ์ไมค์ |
| เทสต์ | `node --test`: WAV encoder (header, 16 kHz, PCM16), manifest ตรง schema ที่ harness รับ, prompt files ครบจำนวนและ intent/slot อยู่ใน inventory §3, source scan ไม่มี network API |

## 5. โปรโตคอลการอัด

1. **ชุดประโยค:**
   - ไทย ≥100, อังกฤษ ≥100, code-switch ≥40 (รายงานแยก ไม่นับแทนจำนวนต่อภาษา)
   - ครอบคลุมทุก intent ใน §3
2. **สภาพเสียง:**
   - แต่ละ prompt อัดทั้ง `quiet` และ `game-audio`
   - `game-audio` = เปิดเสียงเกม Dota 2 (เล่นจริงหรือ replay) ผ่านลำโพง/หูฟังตามที่เล่นจริง; บันทึกวิธีและระดับเสียงใน manifest
3. **การแบ่ง:**
   - อย่างน้อย 2 session ในวันต่างกัน
   - `holdout` = session ที่ไม่ใช้ปรับแต่ง (ไม่ปรับ normalization/prompt หลังเห็นผล)
   - ถ้ามีผู้พูดคนเดียว ผลจะสรุปได้เฉพาะผู้พูดคนนั้น และต้องเขียนข้อจำกัดนี้ใน receipt/สรุป
4. **Consent:**
   - ผู้พูดทุกคนเซ็น `CONSENT-TEMPLATE.md` ก่อนอัด
   - ไฟล์ consent และเสียงเก็บนอก repo
   - ลบได้เมื่อผู้พูดขอ
5. **ข้อจำกัดที่ต้องรายงาน:** เสียงอ่านจาก prompt ไม่เหมือนการพูดสดในเกม; ผลนี้ใช้คัดผู้สมัคร ไม่ใช่ acceptance ของ live match

## 6. Privacy invariants

1. ไม่มีไฟล์เสียง, transcript หรือ consent ใน Git (`.gitignore` + เทสต์ตรวจ)
2. Recorder ไม่มี network call และไม่โหลด script จากภายนอก
3. ใช้นามแฝงของผู้พูด ไม่ใส่ชื่อจริงใน manifest
4. Receipt ของ harness ที่มี transcript เก็บนอก repo

## 7. Acceptance criteria

**Slice 3b-tool (โค้ด):**
- [ ] recorder + prompt files + เทสต์ผ่าน `node --test`
- [ ] prompt set ครบจำนวน §5.1 และ intent/slot อยู่ใน §3
- [ ] ไม่มีไฟล์ใน `src-tauri/`, `src/`, lockfile, package.json เปลี่ยน
- [ ] doc gate ผ่าน
- [ ] Boss ดู recorder ด้วยตาและลองอัด 1 ประโยค

**Slice 3b-record (คน, ไม่ใช่โค้ด):**
- [ ] Boss อัดครบตาม §5 และเซ็น consent
- [ ] รัน harness กับ C1/C4 (และ C2/C3 ถ้าอนุญาตโหลด) เก็บ receipt นอก repo
- [ ] บันทึกผลสรุป (ไม่มีเสียง/transcript) ลง worksheet ของ MVP-038 ใน PR แยก

## 8. ข้อที่ขอให้ Boss ตัดสิน

1. **Intent/slot inventory §3:** อนุมัติ 8 intents นี้ หรือเพิ่ม/ตัด
2. **เครื่องมืออัด:** หน้า HTML ใน browser (แนะนำ: ไม่มี dependency และเขียนลง directory ที่เลือกได้ตรง) หรือ crate Rust แยกที่ใช้ `cpal`
3. **ผู้พูด:** Boss คนเดียว (ผลจำกัดเฉพาะผู้พูด) หรือหาผู้พูดเพิ่มอย่างน้อย 1 คน
4. **ที่เก็บ corpus นอก repo:** เสนอ `F:\g-voice-stt-corpus\` (ข้าง model ใน `F:\g-voice-stt-models\`)
5. **ขนาด code-switch:** ≥40 ประโยค

### 8.1 มติ (2026-11-07)

1. ใช้ intent/slot inventory v1 ทั้ง 8 intents ตาม §3
2. เครื่องมืออัดเป็นหน้า HTML ใน browser ตาม §4
3. ผู้พูดเริ่มจาก Boss คนเดียว; ผลต้องระบุข้อจำกัดว่าใช้ได้เฉพาะผู้พูดนี้ (§5.3) และเพิ่มผู้พูดภายหลังได้โดยต้องมี consent ของคนนั้น
4. ที่เก็บ corpus คือ `F:\g-voice-stt-corpus\` นอก repo
5. code-switch ≥40 ประโยค

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | Draft Slice 3b: frozen v1 intent/slot inventory, local browser recorder contract, prompt-set sizes, quiet/game-audio and session protocol, consent and privacy invariants; no recording or results yet. |
| 0.1.1 | 2026-11-07 | Boss approved the draft as written; recorded §8 decisions (8-intent inventory, browser recorder, Boss as initial sole speaker, corpus at F:\g-voice-stt-corpus, code-switch ≥40). |
