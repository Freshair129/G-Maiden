---
title: "FEAT: G-Persona — Tone & Verbosity Presets"
doc_id: "FEAT-G-PERSONA"
status: "draft"
version: "0.2.0"
updated: "2026-11-06"
owner: "Boss"
source_of_truth: true
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["FEAT-G-MASTER", "FEAT-G-SIGNAL", "mvp-decisions"]
---

# FEAT-G-PERSONA — Tone & Verbosity Presets

> **Module:** G-Persona · **Priority:** Companion P2 · **Phase:** 7–8
> **PRD:** [[product-requirements|PRD]] §3A G-Persona · **SRS:** [[software-requirements-specification|SRS]] §3.11

---

## 1. Purpose

ปรับโทนเสียงและความถี่การพูดของ Maiden ได้ตาม preference ผู้เล่น
โดย **ไม่ลบล้างพฤติกรรมบังคับ** (Belief Revision, Interrupt, Nerf CM self-awareness).

## 2. Preset Dimensions

> **สถานะ (2026-11): §2a/§2b/§4/§5 เป็น design-only; §2c คือขอบเขต v1 ที่อนุมัติแล้วแต่ยังไม่ implement**
> **(เดิม 2026-07): §2/§4/§5 เป็น design-only (Phase 7-8) — ยังไม่ได้ wire.** backend ยัง
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

### 2c. v1 scope — four presets (Owner-approved 2026-11-06)

ตัวเลือกใน UI/`set_persona_preset` ปัจจุบันเป็น **preset เดียว 4 ค่า** (`coach` / `silent` / `caster` / `meme`) ไม่ใช่เมทริกซ์ verbosity × tone เต็ม v1 ต่อ preset เข้ากับพฤติกรรมจริงดังนี้ ส่วน §4 (config สองมิติ `verbosity`/`tone`/`custom_name`/`language`) และตัวกรองข้อความ `apply_tone()` ยังเป็น design-only นอก v1

| Preset | แมปกับ §2 | พฤติกรรมของคำแนะนำ non-critical (G-Master) |
| --- | --- | --- |
| `coach` (default) | verbosity 3 · tone 1 | prompt เดิม แต่เน้นสถิติ ลด humor |
| `silent` | verbosity 1 | **ไม่สร้างและไม่พูด/แสดง** คำแนะนำ non-critical |
| `caster` | verbosity 3 · tone 2 | สไตล์แคสเตอร์ สรุปสถานการณ์เป็นประโยคสั้น |
| `meme` | verbosity 3 · tone 3 | เพิ่ม humor เรื่อง Nerf CM ตามบุคลิกหลัก |

กติกา v1 (ต้องเป็นจริงทุกข้อ):

1. Preset เปลี่ยนเฉพาะ **ข้อความ prompt ที่ส่งให้ G-Master** (ส่วนโทน) และการ **ระงับ** คำแนะนำ non-critical เมื่อเป็น `silent` — ไม่ใส่ข้อมูลเกมเพิ่ม ไม่ขยายข้อมูลที่ส่งออก cloud (ยังอยู่ใต้ allowlist ใน [[mvp-decisions]])
2. **G-Signal ไม่อ่าน preset**: เสียงเตือน/Belief Revision/interrupt (§3) ทำงานเหมือนเดิมทุก preset รวมถึง `silent` และ G-Signal ยังเป็น Rust ล้วนไม่พึ่ง SLM/WebView
3. Preset ที่ไม่รู้จักถือเป็น `coach`
4. เปลี่ยน preset ระหว่างเกมมีผลกับคำแนะนำ **ถัดไป**: คำแนะนำที่ cache ไว้ภายใต้ preset อื่นต้องไม่ถูกนำมาใช้ซ้ำ
5. การระงับตอน `silent` ต้องบังคับใช้ที่ backend (Rust) ไม่ใช่เฉพาะใน Overlay เพื่อให้ผลตรงกับคำอธิบายในหน้า Voice settings
6. ไม่เพิ่มเวลาใน G-Signal critical path

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

**v1 (4 presets — ต้องผ่านก่อนเปลี่ยนสถานะเป็น active):**

- [ ] `silent`: backend ไม่สร้าง/ไม่ส่งคำแนะนำ non-critical; G-Signal ยังเตือนตามปกติ (unit test)
- [ ] `coach` / `caster` / `meme`: prompt ที่ส่ง G-Master ต่างกันตาม preset และยังมี persona หลักครบ (unit test บน builder ของ prompt)
- [ ] preset ไม่รู้จัก → `coach` (unit test)
- [ ] เปลี่ยน preset ทำให้ advice ที่ cache ไว้ภายใต้ preset เดิมไม่ถูกใช้ซ้ำ (unit test)
- [ ] ไม่มีไฟล์ G-Signal อ่าน preset (grep/test ยืนยัน) และไม่มีการเปลี่ยนใน G-Signal latency path
- [ ] hot-switch: เปลี่ยน preset ระหว่างเกมได้โดยไม่ restart
- [x] Belief Revision ทำงาน (immutable — ทำแล้ว)
- [x] G-Signal interrupt ทำงาน (immutable — ทำแล้ว)

**ยังเป็น design-only (นอก v1):**

- [ ] verbosity 4 (verbose): continuous narration ≥1 comment per 30s *(planned)*
- [ ] tone 1 (serious): ตัวกรองตัด humor ทุกข้อความ *(planned)*
- [ ] tone 3 (playful): Nerf CM jokes ในข้อความที่ไม่ได้มาจาก G-Master *(planned)*
- [ ] config สองมิติตาม §4 *(planned)*

Native/live acceptance (เสียงจริงใน Dota) แยกจากการตรวจ unit/source และยังไม่มีหลักฐาน

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07 | Design-only draft of tone & verbosity presets; immutable behaviors implemented. |
| 0.2.0 | 2026-11-06 | Add frontmatter; define v1 scope for the four shipped presets (G-Master prompt tone + `silent` suppression, G-Signal unaffected) and split v1 vs design-only acceptance (#134, Owner-approved). |
