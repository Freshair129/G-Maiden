---
title: "FEAT: G-Damage — Real-time Lethality Engine"
doc_id: "FEAT-G-DAMAGE"
status: "draft"
version: "0.2.0"
updated: "2026-06-23"
owner: "Boss"
source_of_truth: true
prd_system: "SYSTEM-03::G-Signal"
complexity: "C-3"
context_tier: "H2"
risk: "MEDIUM"
related_docs: ["FEAT-G-SIGNAL", "FEAT-G-MASTER", "FEAT-G-MOTION", "FEAT-G-SENSORY"]
---

# FEAT-G-DAMAGE — Real-time Lethality Engine

> **Module:** G-Damage · **Priority:** Core · **Phase:** 3 (feeds G-Signal)
> **SRS:** §3.3, §3.4 · **Eng Spec:** §2.3 · **TDD:** §3
> **สถานะโค้ดปัจจุบัน:** `src-tauri/src/damage.rs` v0.6.0 — มีฝั่ง **defensive** + สูตรแกน, ยังขาดฝั่ง offensive/ไอเทม/CV

---

## 1. Purpose

เครื่องคำนวณ **ความตาย (lethality)** แบบเรียลไทม์สองทิศทาง — สิ่งที่สมองคนคำนวณไม่ทันในเสี้ยววินาที
(armor reduction × magic resist × เลือดปัจจุบัน × บัฟ) แต่ CPU ทำได้ <1ms:

- **Defensive (มีแล้ว):** "ศัตรูเบิร์สต์ฆ่าเราได้ไหม?" → ป้อน G-Signal เตือนถอย
- **Offensive (ของใหม่ — หัวใจฟีเจอร์นี้):** "คอมโบเรากดตอนนี้ ฆ่ามันได้ไหม?" → ป้อน G-Signal/G-Master บอก "กดเลย!"

**ความต่างจากคู่แข่ง:** Valve Death Summary บอก *หลังตาย* (reactive). G-Damage บอก *ก่อนกด* (predictive).
ไม่มีคู่แข่งรายใดทำ offensive lethality สด — เป็น moat ที่ Valve ทำให้ทั้ง playerbase ไม่ได้ (กระทบ competitive integrity).

## 2. Input

| Source | Data | สถานะ |
| --- | --- | --- |
| GSI (ฝั่งเรา) | hero, level, abilities, items, talents, hp, mana | ✅ แม่น 100% |
| G-Master | ไอเทม/Net Worth ศัตรูที่สอดแนมได้ | ✅ มี (ต่อท่อ) |
| CV (`src-tauri/src/cv/`) | แถบเลือดศัตรู (current HP %) | ⚠️ ต้องเพิ่ม HP-bar detector |
| Hero DB | base stats + ability damage tables ทุกฮีโร่ | ⚠️ มี 8 ฮีโร่ ต้องครบ 124 |

## 3. The Two-Sided Problem (หลักการสำคัญที่สุด)

ความตาย = **ดาเมจเรา (Output)** vs **เลือดจริงศัตรู (Effective HP)** — สองข้างนี้ "รู้ได้" ไม่เท่ากัน:

| ข้าง | ต้องรู้ | แหล่ง | ความแน่นอน |
| --- | --- | --- | --- |
| **Output (เรา)** | สกิล/เลเวล/ไอเทม/talent/มานา/คูลดาวน์ | GSI ฝั่งเรา | **แน่นอน 100%** |
| **Target (ศัตรู)** | current HP | CV อ่านแถบเลือด | ประมาณ (±5%) |
| | armor / magic res | เลเวล + ไอเทมที่สอดแนม (G-Master) | ประมาณ |
| | บัฟชั่วคราว (Aphotic Shield, Glimmer, blink) | มักมองไม่เห็น | **ไม่แน่นอน — irreducible** |

> **กฎเหล็ก:** ส่งออกเป็น **confidence ไม่ใช่ boolean**. ความไม่แน่นอนฝั่ง target ต้องโชว์ตรง ๆ
> ผ่าน **Belief Revision** (ดู §6) — ห้ามแกล้งมั่นใจ 100% แล้วโกหกผู้เล่น.

## 4. Logic

```
// OFFENSIVE — can_i_kill (ของใหม่)
on tick(my_state, target):
  combo = available_abilities(my_state)        // เช็คคูลดาวน์ + มานา ก่อน!
  if combo.is_empty(): return                  // ไม่มีสกิลพร้อม ไม่ต้องคำนวณ

  my_burst = burst_damage(my_state, combo, items)   // *** ต้องนับไอเทม ***
              .vs(target.armor_est, target.magic_res_est)

  target_ehp = cv_hp_bar(target) ?? estimate_hp(target.level, target.items)
  margin = my_burst.total - target_ehp
  confidence = compute_confidence(cv_quality, buff_uncertainty, item_scout_age)

  if margin > 0 && confidence >= KILL_CONFIDENCE (0.7):
    emit KillWindow { target, margin, confidence, combo, ttl_ms }
      → G-Signal ("กดเลย!") / G-Master overlay

// DEFENSIVE — is_lethal (มีแล้วใน damage.rs:179, คงไว้)
on tick: if enemy_burst >= my_hp → G-Signal ("ถอย!")
```

## 5. Output

```rust
pub struct KillWindow {
    pub target: HeroRef,
    pub margin: f64,          // burst - effective_hp (บวก = ฆ่าได้)
    pub confidence: f64,      // 0.0–1.0 — ป้อน belief revision
    pub combo: Vec<String>,   // สกิลที่ใช้ ตามลำดับ
    pub burst: BurstResult,   // breakdown เต็มสำหรับ overlay/debrief
    pub ttl_ms: Option<u32>,  // หน้าต่างยังจริงอีกกี่ ms — None ใน P-D1 (ต้องมี cooldown/regen tracking ใน P-D2)
}
```

**ฟังก์ชันหลัก (P-D1 implemented):**

```rust
pub const KILL_CONFIDENCE: f64 = 0.7;
pub const DEFAULT_EHP_UNCERTAINTY: f64 = 0.15;
pub fn kill_confidence(burst: f64, ehp: f64, uncertainty: f64) -> f64;  // P(burst >= true_ehp)
pub fn can_i_kill(attacker, attacker_level, target_current_hp,
                  target_armor, target_magic_res, ehp_uncertainty) -> KillWindow;
```

→ ส่งเข้า **G-Signal** (offensive prompt) และ **G-Sensory** (overlay margin bar)

## 6. Belief Revision Integration (จุดที่เปลี่ยนจุดอ่อนเป็นจุดเด่น)

ฝั่ง target ไม่มีวันแม่น 100% → ใช้พฤติกรรมที่ FEAT-G-SIGNAL §6 บังคับไว้แล้ว:

1. `confidence ≥ 0.7` → *"กดได้! เลือดมันเหลือนิดเดียว!"*
2. ถ้าเฟรมถัดมาเจอบัฟ/เลือดเด้ง (เช่น CV เห็น shield, หรือ HP เพิ่มผิดคาด):
   → interrupt → *"เอ๊ะ! เดี๋ยวก่อน! มันมี Shield รอคูลดาวน์ก่อนนะ!"*
3. Log ทั้ง prediction + outcome ลง **G-Log** เพื่อ calibrate threshold รอบหน้า

**นี่คือ moat ที่ลอกไม่ได้:** คู่แข่งที่เป็น "ตาราง stats" ทำท่าแก้คำพูดแบบนี้ไม่ได้ เพราะไม่มีปาก/persona.

## 7. Constraints

| Constraint | Target | หมายเหตุ |
| --- | --- | --- |
| Damage computation | ≤1ms | คณิตล้วน ไม่มี I/O |
| CV HP-bar read | อยู่ใน budget ของ G-Sensory capture loop | ใช้ pipeline เดิม ไม่เพิ่ม capture |
| End-to-end (เมื่อป้อน G-Signal) | p99 ≤300ms | ผูกกับ GATE P3 ของ G-Signal |
| ไม่มี LLM/network | ทั้ง path | rule-based เท่านั้น (เหมือน G-Signal) |
| Confidence floor | KILL_CONFIDENCE = 0.7 | ปรับได้ผ่าน G-Log calibration |

## 8. รายการช่องโหว่ในโค้ดปัจจุบันที่ต้องอุด (จาก `damage.rs` v0.6.0)

| # | ช่องโหว่ | บรรทัด | ผลกระทบ |
| --- | --- | --- | --- |
| 1 | `burst_damage` **ไม่นับไอเทมเลย** | `damage.rs:92` | Dagon/Aghs/แดเมจไอเทม หาย → คำนวณต่ำกว่าจริงมาก |
| 2 | `estimate_ability_level` **เดา** เลเวลสกิล | `damage.rs:142` | ควรอ่านจาก GSI ฝั่งเราจริง |
| 3 | ฮาร์ดโค้ด "ตี 2 ที" | `damage.rs:126` | ไม่ตรงกับ attack speed/ระยะจริง |
| 4 | Hero DB มีแค่ 8 ฮีโร่ | `damage.rs:205` | ต้องครบ 124 (generate จาก dotaconstants) |
| 5 | ยังไม่มีฝั่ง offensive | — | เพิ่ม `can_i_kill()` ใช้สูตรเดิมกลับทาง |
| 6 | ยังไม่อ่าน current HP ศัตรู | `cv/` | เพิ่ม HP-bar detector |

## 9. Implementation Plan (phased)

- **P-D1 — Offensive core:** เพิ่ม `can_i_kill()` + `KillWindow` (สูตรเดิม กลับทาง, target = ศัตรู). ส่ง confidence แบบ static ไปก่อน. *Unit-testable ทันที ไม่ต้องรอ CV.*
- **P-D2 — Item-aware damage:** ต่อท่อไอเทมฝั่งเรา (GSI) + ฝั่งศัตรู (G-Master) เข้า `burst_damage`. อุดช่องโหว่ #1–3.
- **P-D3 — Full hero DB:** generate 124 ฮีโร่จาก dotaconstants แทน hardcode (#4).
- **P-D4 — CV HP-bar:** เพิ่ม enemy HP-bar detector ใน `cv/` → current HP %. ยกระดับ confidence.
- **P-D5 — Belief revision wiring:** ต่อ confidence → G-Signal interrupt + G-Log calibration loop.

## 10. Goals / Non-Goals

### Goals
- บอก "ฆ่าได้ไหม / จะตายไหม" แบบเรียลไทม์ พร้อม confidence ที่ซื่อสัตย์
- ใช้เฉพาะข้อมูลที่ผู้เล่นเห็นบนจออยู่แล้ว (แถบเลือด, ไอเทมที่สอดแนม) → อยู่ในกรอบ fair-play

### Non-Goals
- ❌ ไม่ทำ auto-cast / auto-combo (นั่นคือ cheat — เราแค่ "บอก" ไม่ "กดแทน")
- ❌ ไม่เดาบัฟที่มองไม่เห็นแบบมั่นใจ → ลด confidence แทน
- ❌ ไม่ทำ draft/build advice (นั่นคือ G-Master)

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| ก้ำกึ่ง "assist เกินไป" (ท่าที Valve/ชุมชน) | เฟรมเป็น "ออโต้คณิตที่โปรทำในหัว" + ใช้ข้อมูลบนจอเท่านั้น; เฝ้า ToS ของ Valve |
| Confidence ต่ำแต่ฟันธง → ผู้เล่นเชื่อแล้วตาย | KILL_CONFIDENCE floor + belief revision + G-Log calibration |
| CV อ่านแถบเลือดพลาด | fallback เป็น estimate_hp; ระบุ confidence ต่ำลงเมื่อ CV quality ต่ำ |

## 12. Acceptance Criteria

- [ ] `can_i_kill()` คืน `KillWindow` ถูกต้องตามสูตร (unit test เทียบค่ามือคำนวณ)
- [ ] `burst_damage` นับไอเทม (Dagon/Aghs/แดเมจไอเทม) ได้ถูกต้อง
- [ ] อ่านเลเวลสกิล/มานา/คูลดาวน์จาก GSI จริง (ไม่เดา) — คอมโบ "พร้อมยิงไหม" ถูกต้อง
- [ ] Hero DB ครบ 124 ฮีโร่
- [ ] CV อ่าน current HP ศัตรูได้ ±5% ใน budget capture เดิม
- [ ] ส่ง **confidence ไม่ใช่ boolean**; confidence ต่ำ → trigger belief revision
- [ ] ฝั่ง defensive (`is_lethal`) เดิมยังทำงานปกติ (ไม่ regress)
- [ ] ทำงาน offline ทั้งหมด (ไม่พึ่ง cloud)

## Changelog
| Version | Date | Summary |
|---|---|---|
| 0.1.0 | 2026-06-XX | G-Damage defensive engine (`damage.rs`) ใน v0.6.0 |
| 0.2.0 | 2026-06-23 | เพิ่ม spec ฝั่ง offensive lethality + two-sided problem + belief-revision wiring + ช่องโหว่ที่ต้องอุด |
