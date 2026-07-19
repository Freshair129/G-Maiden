# FEAT-G-PERSONA — Tone & Verbosity Presets

> **Module:** G-Persona · **Priority:** Companion P2 · **Phase:** 7–8
> **PRD:** [[product-requirements|PRD]] §3A G-Persona · **SRS:** [[software-requirements-specification|SRS]] §3.11

---

## 1. Purpose

ปรับโทนเสียงและความถี่การพูดของ Maiden ได้ตาม preference ผู้เล่น
โดย **ไม่ลบล้างพฤติกรรมบังคับ** (Belief Revision, Interrupt, Nerf CM self-awareness).

## 2. Preset Dimensions

> **สถานะ (2026-07): §2/§4/§5 เป็น design-only (Phase 7-8) — ยังไม่ได้ wire.** backend ยัง
> **ไม่มี** verbosity/tone preset, config `{persona:{...}}`, หรือ `apply_tone()` (grep ยืนยัน).
> ส่วนที่ทำแล้วจริงคือ **§3 Immutable Behaviors** (Belief Revision + G-Signal interrupt).

### 2a. Verbosity (ปริมาณการพูด)

| Level | Label | Behavior |
| --- | --- | --- |
| 1 | **Silent** | Critical alerts only (G-Signal). ไม่มี narration, ไม่มี advice |
| 2 | **Minimal** | Alerts + key advice (item timing, major threat) |
| 3 | **Balanced** | Default — alerts + advice + occasional commentary |
| 4 | **Verbose** | Continuous narration, play-by-play style |

### 2b. Tone (สไตล์)

| Level | Label | Behavior |
| --- | --- | --- |
| 1 | **Serious** | Coach mode — stats-focused, minimal humor |
| 2 | **Balanced** | Default — friendly + analytical |
| 3 | **Playful** | Meme-heavy, more Nerf CM jokes, casual tone |

## 3. Immutable Behaviors (ลบไม่ได้ไม่ว่า preset ใด) — **ทำแล้ว**

Belief Revision + G-Signal interrupt เป็นของจริงในโค้ด ([`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs) `SignalEvent::Revision`,
[`capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs) `REVISION_LINE` + `voice_interrupt`, [`tts.rs::cancel`](file:///g:/G-Maiden/src-tauri/src/tts.rs) ตัดเสียงกลางประโยค).

| Behavior | เหตุผล |
| --- | --- |
| **Belief Revision** | Product-critical (SRS §3.3) — Maiden ต้องแก้ไขตัวเองกลางประโยค |
| **G-Signal Interrupt** | Safety — critical alerts ต้องถึงผู้เล่นเสมอ |
| **Nerf CM self-awareness** | Brand identity — อย่างน้อยต้อง reference ได้ |
| **Gentle core tone** | ห้าม toxic / aggressive ไม่ว่า preset ใด |

## 4. Configuration *(design-only — ยังไม่ได้ทำ)*

```json
{
  "persona": {
    "verbosity": 3,      // 1-4
    "tone": 2,           // 1-3
    "custom_name": null,  // optional: rename Maiden
    "language": "th"      // th | en | auto
  }
}
```

## 5. Logic *(design-only — `apply_tone()` / verbosity filter ยังไม่มีใน backend)*

```
on event received (advice, narration, signal):
  if signal.severity == critical:
    always speak (immutable)
  
  if verbosity < required_verbosity(event):
    suppress (don't speak or display)
  
  text = apply_tone(base_text, tone_level)
    // tone 1: strip humor, keep stats
    // tone 3: add Nerf CM jokes, casual language
  
  emit to audio/overlay
```

## 6. Persona Examples

**Verbosity 1 (Silent) + Tone 1 (Serious):**
- G-Signal only: *"ถอยทันที. ศัตรู 3 ตัวเข้ามา."*
- No narration, no advice voice

**Verbosity 4 (Verbose) + Tone 3 (Playful):**
- Continuous: *"โอ้โห last hit สวยมาก~ ถ้าฉันทำได้แบบนี้ Icefrog คงไม่เนิร์ฟฉันหรอกนะ"*
- *"เฮ้ มี rune เกิด! ไปเก็บไหมคะ? ฉันก็อยากไปแต่เดินช้าจัง..."*

## 7. Constraints

- Immutable behaviors ลบไม่ได้ผ่าน UI
- Verbosity/tone เปลี่ยนได้ real-time (ไม่ต้อง restart)
- ไม่กระทบ G-Signal latency
- Custom name ห้ามเปลี่ยน core personality

## 8. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Events to filter | ทุก G-Series module |
| → Controls | Audio Engine (speak/suppress) |
| → Controls | **G-Sensory** (display/suppress) |
| Settings storage | Config file (local) |

## 9. Acceptance Criteria

- [ ] verbosity 1 (silent): เฉพาะ G-Signal alerts เท่านั้น *(planned)*
- [ ] verbosity 4 (verbose): continuous narration ≥1 comment per 30s *(planned)*
- [ ] tone 1 (serious): no humor in output *(planned)*
- [ ] tone 3 (playful): Nerf CM jokes appear *(planned)*
- [x] Belief Revision ทำงาน (immutable — ทำแล้ว)
- [x] G-Signal interrupt ทำงาน (immutable — ทำแล้ว)
- [ ] hot-switch: เปลี่ยน preset ระหว่างเกมได้ทันที *(planned)*
