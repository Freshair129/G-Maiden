---
title: "FEAT-G-VOICE — Two-Way Voice Conversation"
doc_id: "FEAT-G-VOICE"
status: "active"
version: "0.2.0"
updated: "2026-10-05"
owner: "Boss"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
---

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

## 10. DL-006 Lineage Contract (approved design; runtime not implemented)

### 10.1 Sources and transport

| Source | Transport | Fields/contract | Current status |
| --- | --- | --- | --- |
| Player microphone | Transient local capture after a future PTT hotkey | Raw PCM only for the active turn; `Alt+M` remains the existing mute toggle | Not implemented |
| GSI | Local HTTP `POST /gsi` on `127.0.0.1:3000` → `game-tick` | `clock_time`, `game_state`, `hero`, `level`, `hp_percent`, `mana_percent`, K/D/A, gold, net worth, GPM/XPM and scores; select fields only | Implemented upstream |
| G-Memory | In-process `MemoryContext` read; no external GET | Bounded aggregates and `UNKNOWN` values; never raw JSONL | Planned dependency |
| Brain | Existing G-Master backend boundary: Claude CLI or Anthropic `POST /v1/messages`, then local Ollama fallback | Redacted text prompt only; no raw audio, raw G-Log, or hidden player identifiers | Partial upstream |

Cloud STT is not authorized by this contract. The first implementation must use local STT or fail closed; adding a cloud STT endpoint requires a separate privacy/consent decision because audio cannot be field-redacted.

### 10.2 Computation and output

```text
turn_latency = capture_time + stt_time + router_time + tts_time
target turn_latency <= 2,000 ms                  # non-critical path
critical G-Signal event => cancel current turn  # always wins
```

The output is a transient `VoiceTurn` containing `request_id`, redacted transcript,
response text, backend label, and latency metadata. Response audio goes through the
existing Audio Engine at a non-critical priority; optional subtitles go to G-Sensory.
No transcript or microphone buffer is persisted.

### 10.3 Fallback and evidence

- STT failure → discard the buffer and return a local, non-persistent error state.
- Cloud/Claude failure → Ollama; Ollama failure → no generated response. G-Signal remains independent.
- Acceptance requires a hand-calculated round-trip fixture, an interrupt test proving the
  current audio is cancelled, bilingual STT/response fixtures, and a filesystem/network
  check proving that raw audio and transcripts are not persisted or sent by default.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| — | 2026-07-19 | link/metadata sweep (G1.5): wikilink/symbol-link fixes only — no content change |
| 0.2.0 | 2026-10-05 | Added the DL-006 source, transport, latency, privacy, fallback, and evidence contract; runtime remains planned. |
