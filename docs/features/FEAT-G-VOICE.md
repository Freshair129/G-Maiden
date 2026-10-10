---
title: "FEAT-G-VOICE — Two-Way Voice Conversation"
doc_id: "FEAT-G-VOICE"
status: "active"
version: "0.3.0"
updated: "2026-10-10"
owner: "Boss"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
---

# FEAT-G-VOICE — Two-Way Voice Conversation

> **Module:** G-Voice · **Priority:** Companion P0 · **Phase:** 4
> **PRD:** [[product-requirements|PRD]] §3A G-Voice · **SRS:** [[software-requirements-specification|SRS]] §3.7

> **สถานะ (2026-10-10): `PLANNED` — Voice เป็น Companion P0 ใน MVP แต่ runtime ยังไม่มีไมค์/STT/two-way path; ห้ามนับว่าเสร็จจากการคง scope ไว้.**
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

ใช้ `Ctrl+Alt+V` เป็น PTT ค่าเริ่มต้นใน MVP; implementation ต้องตรวจ collision กับ global shortcuts และรองรับ remap. `Alt+M` คงเป็น mute toggle. ไม่มี always-on mic. TTS ปัจจุบันเป็น SAPI จนกว่า Piper จะ land.

```
Player holds Ctrl+Alt+V → transient local mic capture → local STT [ยังไม่ได้ทำ]
  → local transcript + valid local GSI context + bounded local G-Memory context
  → local interpretation/answer (local SLM or local rules)
  → response text
  → TTS (SAPI วันนี้ · Piper ในอนาคต)
  → audio playback (preemptible by G-Signal)
```

## 3. Input

| Source | Data |
| --- | --- |
| Microphone | Transient raw audio only while PTT is held (`Ctrl+Alt+V` default); **ไม่ใช่** `Alt+M` ซึ่งเป็น mute; local only |
| GSI | Valid current local GameTick; use only fields with fresh source timestamps |
| G-Memory | Bounded local aggregates with explicit `UNKNOWN` for absent sources; never cloud context |

## 4. Output

- TTS audio response via Audio Engine (narration queue)
- Transcript text → G-Sensory overlay (optional subtitle)

## 5. STT/TTS Contract (planned)

STT ทั้งหมดในตารางนี้ยัง**ไม่ได้ทำ** (ไม่มีโค้ด mic/STT). MVP บังคับ local STT และ local interpretation/answer; cloud STT/LLM ใช้กับ Voice ไม่ได้. TTS ปัจจุบันคือ SAPI อย่างเดียว — Piper เป็นแผน (ดู [`tts.rs`](file:///g:/G-Maiden/src-tauri/src/tts.rs)).

| Component | Technology | Latency |
| --- | --- | --- |
| STT | Local STT candidate to be selected/benchmarked in MVP-038 — **ยังไม่ได้ทำ** | measured in MVP-038 |
| Interpretation/answer | Local model/rules only for Voice — **ยังไม่ได้ทำ** | measured end-to-end |
| TTS | **Windows SAPI วันนี้** · Piper (local ONNX) เป็นแผนอนาคต | ~80–200ms |
| **Total** | | PTT release → first audible ≤2,000ms for every accepted ready/warm turn; cold model preparation is reported separately (MVP-006) |

## 6. Persona Behavior

- ตอบแบบ Maiden: อ่อนโยน, วิเคราะห์, มี personality
- ภาษา: Thai + English (bilingual context-aware)
- *"ตอนนี้ทีมเรานำอยู่ 3k gold ค่ะ ถ้าจะ push ฉันว่าไปเลนบนก่อนดีกว่า"*
- ถ้าไม่แน่ใจ: *"ฉันไม่แน่ใจเท่าไร... แต่จากที่เห็น ลองดูแบบนี้ไหมคะ"*

## 7. Constraints

- **Non-critical path:** ไม่มี hard latency budget
- **G-Signal priority:** G-Signal interrupt ตัด voice conversation ได้ทันที
- **Privacy:** STT audio ไม่เก็บถาวร — process แล้วทิ้ง
- **Local-only:** Voice STT, transcript, free-form utterance, GSI/Memory context และ interpretation/answer อยู่ในเครื่องเสมอ; cloud fallback forbidden.
- **Resource:** STT/TTS ไม่ควรเพิ่ม CPU >1% ขณะ idle

## 8. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Hotkey trigger | **G-Sensory** (global hotkey system) |
| Game context | GSI Server |
| Player memory | **G-Memory** |
| Local interpretation/answer | Local model/rules only; no cloud route |
| Audio playback | Audio Engine (shared with G-Signal) |
| → Interrupt by | **G-Signal** (critical alerts override) |

## 9. Acceptance Criteria

- [ ] `Ctrl+Alt+V` PTT captures audio correctly; hotkey collision is reported and remap works; `Alt+M` remains mute
- [ ] local STT: English WER ≤15%, Thai CER ≤20%, intent/critical-slot accuracy ≥90% on ≥100 held-out utterances per language, split by speaker/session and quiet/game-audio
- [ ] PTT release → first audible answer ≤2.0s for every accepted ready/warm turn; completion ≥95% per language; cold preparation ≤10s with visible preparing state
- [ ] G-Signal interrupt cuts voice response immediately
- [ ] bilingual (Thai/English) recognition and response
- [ ] local path works without network; missing/unready local model shows unavailable without cloud fallback
- [ ] audio and transcript are not persisted or sent to network; verify filesystem and outbound traffic
- [ ] response contextually relevant (uses GSI + G-Memory)

## 10. DL-006 Lineage Contract (MVP policy alignment; runtime not implemented)

### 10.1 Sources and transport

| Source | Transport | Fields/contract | Current status |
| --- | --- | --- | --- |
| Player microphone | Transient local capture after `Ctrl+Alt+V` PTT | Raw PCM only for active turn; `Alt+M` remains the mute toggle; audio is never uploaded | Not implemented |
| GSI | Local HTTP `POST /gsi` on `127.0.0.1:3000` → `game-tick` | `clock_time`, `game_state`, `hero`, `level`, `hp_percent`, `mana_percent`, K/D/A, gold, net worth, GPM/XPM and scores; select fields only | Implemented upstream |
| G-Memory | In-process `MemoryContext` read; no external GET | Bounded aggregates and `UNKNOWN` values; never raw JSONL | Planned dependency |
| Voice interpretation | Local model/rules only | Transcript and free-form question stay in process; local bounded context only; no Claude/Anthropic/Ollama network call from Voice | Not implemented |

Cloud STT and cloud interpretation for Voice are forbidden by the accepted [[mvp-decisions]] contract. This boundary is stricter than generic G-Master cloud advice: audio, transcript/free-form question, and G-Memory never enter cloud requests. Changing it requires a new explicit privacy decision.

### 10.2 Computation and output

```text
warm_turn_latency = PTT release → first audible answer
target warm_turn_latency <= 2,000 ms             # measured per accepted warm turn
capture/model preparation is reported separately # cold preparation ≤10s, visible state
critical G-Signal event => cancel current turn  # always wins
```

The output is a transient in-process `VoiceTurn` containing `request_id`, transcript,
response text, local backend label, and latency metadata. Response audio goes through the
existing Audio Engine at a non-critical priority; optional subtitles go to G-Sensory.
Transcript and microphone buffer are not persisted or sent to a network provider.

### 10.3 Fallback and evidence

- STT failure → discard the buffer and return a local, non-persistent error state.
- Local STT/model unavailable → return a local, non-persistent unavailable state; never route Voice content to Claude or another cloud provider. G-Signal remains independent.
- Acceptance requires a hand-calculated round-trip fixture, an interrupt test proving the
  current audio is cancelled, bilingual STT/response fixtures, and a filesystem/network
  check proving that raw audio and transcripts are not persisted or sent by default.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| — | 2026-07-19 | link/metadata sweep (G1.5): wikilink/symbol-link fixes only — no content change |
| 0.2.0 | 2026-10-05 | Added the DL-006 source, transport, latency, privacy, fallback, and evidence contract; runtime remains planned. |
| 0.3.0 | 2026-10-10 | Aligned P0 Voice with accepted MVP contract: Ctrl+Alt+V PTT, local STT/answer only, no cloud utterance or Memory egress, and measured latency/quality acceptance. |
