# FEAT-G-VOICE — Two-Way Voice Conversation

> **Module:** G-Voice · **Priority:** Companion P0 · **Phase:** 4
> **PRD:** [[product-requirements|PRD]] §3A G-Voice · **SRS:** [[software-requirements-specification|SRS]] §3.7

> **สถานะ (2026-07): ยังไม่ได้ทำ (spec ล่วงหน้า — Phase 4).** โค้ดจริงยัง**ไม่มี** mic
> capture / STT / Whisper / cpal เลย (grep ยืนยัน) และยังไม่มี Piper — TTS ปัจจุบันเป็น
> **Windows SAPI อย่างเดียว** ([`tts.rs`](file:///g:/G-Maiden/src-tauri/src/tts.rs), ยืนอยู่แทน Piper ที่วางแผนไว้ใน TDD). Hotkey
> `Alt+M` **ไม่ใช่** trigger ของ G-Voice — มันคือ **mute toggle** ([`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)). เอกสารด้านล่าง
> เป็นดีไซน์อนาคต ไม่ใช่พฤติกรรมปัจจุบัน; เขียนเป็นแบบวางแผน (planned).

---

## 1. Purpose

ให้ผู้เล่นสนทนาด้วยเสียงสองทางกับ Maiden แบบ push-to-talk.
ไม่ใช่แค่รับแจ้งเตือนทางเดียว — ผู้เล่นถามคำถามเชิงกลยุทธ์ได้ระหว่างเล่น.
**G-Signal มีสิทธิ์ interrupt G-Voice ได้เสมอ** เมื่อเกิดเหตุวิกฤต.

## 2. Flow (planned)

หมายเหตุ: ยังไม่มี push-to-talk key ที่ผูกกับ G-Voice; `Alt+M` ปัจจุบันคือ mute
(ต้องเลือก hotkey ใหม่เมื่อสร้างฟีเจอร์นี้จริง) และ TTS จะเป็น SAPI จนกว่า Piper จะ land.

```
Player holds <push-to-talk key, TBD> → mic capture (STT) [ยังไม่ได้ทำ]
  → text prompt + GSI context + G-Memory context
  → Brain Router (Cloud LLM / Local SLM)
  → response text
  → TTS (SAPI วันนี้ · Piper ในอนาคต)
  → audio playback (preemptible by G-Signal)
```

## 3. Input

| Source | Data |
| --- | --- |
| Microphone | Raw audio (push-to-talk hold — hotkey TBD; **ไม่ใช่** `Alt+M` ซึ่งเป็น mute) [ยังไม่ได้ทำ] |
| GSI | Current game state (context for LLM) |
| G-Memory | Player history (ฮีโร่ถนัด, เทรนด์, จุดมักตาย) |

## 4. Output

- TTS audio response via Audio Engine (narration queue)
- Transcript text → G-Sensory overlay (optional subtitle)

## 5. STT/TTS Contract (planned)

STT ทั้งหมดในตารางนี้ยัง**ไม่ได้ทำ** (ไม่มีโค้ด mic/STT). TTS ปัจจุบันคือ SAPI
อย่างเดียว — Piper เป็นแผน (ดู [`tts.rs`](file:///g:/G-Maiden/src-tauri/src/tts.rs)).

| Component | Technology | Latency |
| --- | --- | --- |
| STT | Cloud STT (Google/Whisper) or local Whisper.cpp — **ยังไม่ได้ทำ** | ~500ms |
| LLM | Brain Router (Claude / SLM) | ~500–1500ms |
| TTS | **Windows SAPI วันนี้** · Piper (local ONNX) เป็นแผนอนาคต | ~80–200ms |
| **Total** | | **~1–2s** (non-critical, เมื่อสร้างครบ) |

## 6. Persona Behavior

- ตอบแบบ Maiden: อ่อนโยน, วิเคราะห์, มี personality
- ภาษา: Thai + English (bilingual context-aware)
- *"ตอนนี้ทีมเรานำอยู่ 3k gold ค่ะ ถ้าจะ push ฉันว่าไปเลนบนก่อนดีกว่า"*
- ถ้าไม่แน่ใจ: *"ฉันไม่แน่ใจเท่าไร... แต่จากที่เห็น ลองดูแบบนี้ไหมคะ"*

## 7. Constraints

- **Non-critical path:** ไม่มี hard latency budget
- **G-Signal priority:** G-Signal interrupt ตัด voice conversation ได้ทันที
- **Privacy:** STT audio ไม่เก็บถาวร — process แล้วทิ้ง
- **Offline:** fallback ไป local Whisper.cpp + local SLM เมื่อ cloud ไม่ได้
- **Resource:** STT/TTS ไม่ควรเพิ่ม CPU >1% ขณะ idle

## 8. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Hotkey trigger | **G-Sensory** (global hotkey system) |
| Game context | GSI Server |
| Player memory | **G-Memory** |
| LLM inference | Brain Router |
| Audio playback | Audio Engine (shared with G-Signal) |
| → Interrupt by | **G-Signal** (critical alerts override) |

## 9. Acceptance Criteria

- [ ] push-to-talk (hotkey TBD — ไม่ใช่ `Alt+M`) captures audio correctly
- [ ] STT → LLM → TTS roundtrip ≤2s (cloud available)
- [ ] G-Signal interrupt cuts voice response immediately
- [ ] bilingual (Thai/English) recognition and response
- [ ] offline fallback: local STT + local SLM works
- [ ] audio not persisted after processing (privacy)
- [ ] response contextually relevant (uses GSI + G-Memory)
