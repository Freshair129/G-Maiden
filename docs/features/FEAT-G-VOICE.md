# FEAT-G-VOICE — Two-Way Voice Conversation

> **Module:** G-Voice · **Priority:** Companion P0 · **Phase:** 4
> **PRD:** §3A G-Voice · **SRS:** §3.7

---

## 1. Purpose

ให้ผู้เล่นสนทนาด้วยเสียงสองทางกับ Maiden แบบ push-to-talk.
ไม่ใช่แค่รับแจ้งเตือนทางเดียว — ผู้เล่นถามคำถามเชิงกลยุทธ์ได้ระหว่างเล่น.
**G-Signal มีสิทธิ์ interrupt G-Voice ได้เสมอ** เมื่อเกิดเหตุวิกฤต.

## 2. Flow

```
Player holds Alt+M → mic capture (STT)
  → text prompt + GSI context + G-Memory context
  → Brain Router (Cloud LLM / Local SLM)
  → response text
  → TTS (Piper / SAPI)
  → audio playback (preemptible by G-Signal)
```

## 3. Input

| Source | Data |
| --- | --- |
| Microphone | Raw audio (push-to-talk via `Alt+M` hold) |
| GSI | Current game state (context for LLM) |
| G-Memory | Player history (ฮีโร่ถนัด, เทรนด์, จุดมักตาย) |

## 4. Output

- TTS audio response via Audio Engine (narration queue)
- Transcript text → G-Sensory overlay (optional subtitle)

## 5. STT/TTS Contract

| Component | Technology | Latency |
| --- | --- | --- |
| STT | Cloud STT (Google/Whisper) or local Whisper.cpp | ~500ms |
| LLM | Brain Router (Gemini / SLM / Template) | ~500–1500ms |
| TTS | Piper (local ONNX) / Windows SAPI fallback | ~80–150ms |
| **Total** | | **~1–2s** (non-critical) |

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

- [ ] push-to-talk (`Alt+M` hold) captures audio correctly
- [ ] STT → LLM → TTS roundtrip ≤2s (cloud available)
- [ ] G-Signal interrupt cuts voice response immediately
- [ ] bilingual (Thai/English) recognition and response
- [ ] offline fallback: local STT + local SLM works
- [ ] audio not persisted after processing (privacy)
- [ ] response contextually relevant (uses GSI + G-Memory)
