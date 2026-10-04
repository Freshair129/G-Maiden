---
title: "FEAT: G-Damage — Real-time Lethality Engine"
doc_id: "FEAT-G-DAMAGE"
status: "draft"
version: "0.3.1"
updated: "2026-10-04"
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
> **SRS:** [[software-requirements-specification|SRS]] §3.3, §3.4 · [[engineering-spec|Eng Spec]] §2.3 · [[technical-design-document|TDD]] §3
> **สถานะโค้ดปัจจุบัน:** [`src-tauri/src/damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs) — defensive ([`is_lethal`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L256)) + offensive ([`can_i_kill`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L334), P-D1) + item/ability-level engine ([`burst_damage_with`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L136), P-D2a) + JSON hero/item DB (P-D3) + source-neutral [`TargetCombatSnapshot`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L345) normalization/fail-closed wrapper (DL-002) พร้อม unit coverage. **ต่อสายจริงแล้ว (บางส่วน):** [`self_burst()`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L465) ใช้ hero/level/item_names จริงจาก GSI ป้อน [`burst_damage_with()`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L136) แล้วถูกเรียกจาก [`master::build_prompt`](file:///g:/G-Maiden/src-tauri/src/master.rs#L51) (`master.rs:72`) — โผล่เป็นบรรทัด "พลังคอมโบโดยประมาณ ~X dmg" ใน advice ของ **G-Master** จริงในเกม. Baseline magic resistance ใช้ canonical percentage `[0, 100]` โดย 25% ส่งเป็น `25.0`; มี regression test ครอบ caller-to-formula path แล้ว. **ยังขาด:** live target-side source/wiring — [`is_lethal`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L256)/[`can_i_kill`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L334)/[`KillWindow`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L309) ยังไม่ต่อเข้า G-Signal หรือ Tauri command ใด ๆ, ability-level array จาก GSI (P-D2b), CV HP-bar (P-D4), belief-revision wiring (P-D5) — โมดูลยังมี `#![allow(dead_code)]` ครอบส่วนที่ยังไม่ถูกเรียก

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
| CV ([`src-tauri/src/cv/`](file:///g:/G-Maiden/src-tauri/src/cv/)) | แถบเลือดศัตรู (current HP %) | ⚠️ ต้องเพิ่ม HP-bar detector |
| Hero DB | base stats + ability damage tables ทุกฮีโร่ | ⚠️ base stats ครบ 127 ตัว, ability tables curate แล้ว 8/127 |

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

// DEFENSIVE — is_lethal (มีแล้วใน damage.rs:240, คงไว้ — ยังไม่ต่อเข้า G-Signal command จริง)
on tick: if enemy_burst >= my_hp → G-Signal ("ถอย!")
```

## 4.1 Target-side data contract (DL-002)

**สถานะ contract:** accepted for implementation planning on 2026-10-04. The source-neutral
normalization boundary is now implemented and unit-tested in `damage.rs`; runtime source
integration still requires the separate C-3/HIGH review.

Target-side G-Damage จะคำนวณได้ต่อเมื่อมีข้อมูลครบและยังสดพอเท่านั้น. ห้ามใช้ LLM, OpenDota,
G-Master narrative, หรือค่าที่เดาเองเป็น authority ของตัวเลขศัตรู.

### Field authority and canonical units

| Field | Canonical unit | Authoritative source | Freshness budget | Required for `KillWindow` |
| --- | --- | --- | --- | --- |
| `target_id` | internal hero id หรือ `Unknown` | minimap CV identity / approved roster source | 500 ms | yes |
| `current_hp` | absolute HP interval `[low, high]` | future enemy HP-bar CV | 500 ms | yes |
| `max_hp` | absolute HP | approved local visual/stat source | 5 s | yes when converting HP-bar ratio |
| `level` | integer level, validated against current patch | future local scoreboard OCR or approved visual source | 5 s | yes |
| `armor` | raw armor points, not percent | hero base stats at level + verified visible modifiers | 5 s | yes |
| `magic_resistance_pct` | percentage `[0, 100]`; `25.0` means 25% | hero base resistance + verified visible modifiers | 5 s | yes |
| `observed_at_ms` | monotonic milliseconds | capture/OCR observation | n/a | yes |
| `source_confidence` | `0.0..=1.0` | source adapter | n/a | yes |

Current runtime does not provide the target-side sources: minimap CV supplies identity/position only,
`ocr.rs` has no bundled model or caller, and GSI is local-player-only. Therefore this contract does
not claim that target data is currently available. `TargetCombatSnapshot` accepts only a complete
local snapshot, and `to_kill_input(now_ms)` returns `None` for missing, contradictory, stale, or
low-confidence data. `can_i_kill_from_snapshot(...)` is the source-safe wrapper; the lower-level
`can_i_kill_with(...)` remains available for deterministic formula tests and approved adapters.

### Normalization and confidence formula

The adapter must preserve uncertainty instead of collapsing an approximate HP bar into a false exact
number:

```text
hp_estimate = (hp_low + hp_high) / 2
ehp_uncertainty = (hp_high - hp_low) / (hp_high + hp_low)
freshness_factor = max(0, 1 - age_ms / ttl_ms)
completeness_factor = present_required_fields / required_fields
target_data_confidence = source_confidence * freshness_factor * completeness_factor
```

`hp_low <= hp_estimate <= hp_high` is required. The existing G-Damage call then receives
`target_current_hp = hp_estimate`, raw `armor`, canonical `magic_resistance_pct`, and
`ehp_uncertainty`; its existing `kill_confidence()` remains the separate probability that burst
exceeds the uncertain effective HP.

### Fail-closed and fallback rules

1. Missing `target_id`, HP interval, level, armor, or magic resistance → do not call
   `can_i_kill_with()` and do not emit a `KillWindow`.
2. `target_data_confidence < 0.70`, stale fields, contradictory observations, or Lite mode →
   target-side G-Damage is `UNKNOWN`; G-Signal must not say “กดเลย!”.
3. An estimate may appear in a clearly labelled non-actionable G-Master narrative only after a
   separate approval; it must never feed the G-Signal critical path.
4. Unknown item/buff/patch state lowers confidence or blocks the action result; it must not be
   silently converted to zero resistance or zero armor.
5. When the source disappears, the last snapshot expires at its field TTL; no indefinite cache is
   valid for a kill decision.

### Privacy, anti-cheat, and transport boundary

- Capture and OCR are read-only local screen processing. No process injection, memory read, or game
  write is permitted.
- Raw frames, OCR text, and CV detections remain local. They are not sent to Claude, Ollama, OpenDota,
  Supabase, or any other network endpoint.
- The target snapshot is an in-memory local contract. Any future local G-Log record may contain only
  the decision, confidence, freshness, and source-quality metadata approved by the privacy contract;
  never raw pixels or raw OCR payloads.
- `POST /gsi`, OpenDota `GET`, and cloud brain responses are not authoritative target-stat sources.

### Acceptance evidence before runtime wiring

| Case | Expected result |
| --- | --- |
| Complete fresh fixture with bounded HP interval | normalized snapshot and deterministic input to `can_i_kill_with()` |
| HP interval `[600, 1000]` | `hp_estimate = 800`, `ehp_uncertainty = 0.25` |
| Missing HP or defense field | no `KillWindow`, no offensive G-Signal alert |
| Field older than TTL | snapshot expires; no stale kill decision |
| `magic_resistance_pct = 25.0` | formula uses `1 - 25/100`, never fraction `0.25` |
| Conflicting CV/OCR observations | lower confidence or `UNKNOWN`, never silent overwrite |
| DXGI Lite mode / capture unavailable | target-side path disabled without affecting GSI-only safety path |
| Network disabled | target-side local contract remains deterministic; no egress |

Implementation is gated into separate slices: source-region/CV proof and OCR/visual-source proof
remain blocked by missing approved local sources; the normalization adapter and fixtures are now
implemented; G-Damage/G-Signal wiring remains pending until those source proofs exist. Each slice
must retain the fail-closed behavior above.

**Local evidence (2026-10-04):** Rust unit tests cover HP interval normalization, the freshness /
completeness confidence formula, missing/invalid/stale rejection, and the canonical `25.0%` magic
resistance path. These tests prove the adapter boundary only; they do not prove live enemy source
availability, CV accuracy, OCR accuracy, or G-Signal acceptance.

## 5. Output

```rust
// ตรงกับ damage.rs:281 (P-D1)
pub struct KillWindow {
    pub can_kill: bool,       // true เมื่อ confidence >= KILL_CONFIDENCE
    pub margin: f64,          // burst - effective_hp (บวก = ฆ่าได้)
    pub confidence: f64,      // 0.0–1.0 — ป้อน belief revision
    pub combo: Vec<String>,   // ชื่อสกิลที่ contribute (ตาม DB order)
    pub burst: BurstResult,   // breakdown เต็มสำหรับ overlay/debrief
    pub ttl_ms: Option<u32>,  // หน้าต่างยังจริงอีกกี่ ms — None ใน P-D1 (ต้องมี cooldown/regen tracking ใน P-D2)
}
```

**ฟังก์ชันหลัก (P-D1 implemented):**

```rust
pub const KILL_CONFIDENCE: f64 = 0.7;
pub const DEFAULT_EHP_UNCERTAINTY: f64 = 0.15;
pub fn kill_confidence(burst: f64, ehp: f64, uncertainty: f64) -> f64;  // P(burst >= true_ehp)
pub fn can_i_kill(attacker: &HeroData, attacker_level: u32, target_current_hp: f64,
                  target_armor: f64, target_magic_res: f64, ehp_uncertainty: f64) -> KillWindow;
// P-D2: item/ability-level aware variant
pub fn can_i_kill_with(attacker, attacker_level, ability_levels, items,
                       target_current_hp, target_armor, target_magic_res, ehp_uncertainty) -> KillWindow;
// DL-002: complete/fresh snapshot only; None means target data is not actionable
pub fn can_i_kill_from_snapshot(attacker, attacker_level, ability_levels, items,
                                snapshot, now_ms) -> Option<KillWindow>;
```

→ ส่งเข้า **G-Signal** (offensive prompt) และ **G-Sensory** (overlay margin bar)

## 6. Belief Revision Integration (จุดที่เปลี่ยนจุดอ่อนเป็นจุดเด่น)

ฝั่ง target ไม่มีวันแม่น 100% → ใช้พฤติกรรมที่ [[FEAT-G-SIGNAL]] §6 บังคับไว้แล้ว:

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

## 8. รายการช่องโหว่ในโค้ดปัจจุบันที่ต้องอุด (จาก [`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs) v0.6.0)

| # | ช่องโหว่ | สถานะ | หมายเหตุ |
| --- | --- | --- | --- |
| 1 | `burst_damage` ไม่นับไอเทม | ✅ **P-D2a** | [`burst_damage_with()`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L136) + item DB (Dagon/แดเมจไอเทม); Aghs ยังไม่ครอบ |
| 2 | [`estimate_ability_level`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L217) เดาเลเวลสกิล | ✅ **P-D2a** | รับ `ability_levels` จริงได้แล้ว, estimate เป็น fallback |
| 3 | ฮาร์ดโค้ด "ตี 2 ที" | ⏳ P-D4 | ต้องมี attack-speed timing |
| 4 | Hero DB มีแค่ 8 ฮีโร่ | 🟡 **P-D3** | base stats ครบ 127 ตัว (JSON); ability tables curate แล้ว 8/127 |
| 5 | ฝั่ง offensive ([`can_i_kill`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L334)) | ✅ **P-D1** | + confidence model |
| 6 | อ่าน current HP ศัตรู | ⏳ P-D4 | HP-bar detector ใน [`cv/`](file:///g:/G-Maiden/src-tauri/src/cv/) |

## 9. Implementation Plan (phased)

- ✅ **P-D1 — Offensive core:** [`can_i_kill()`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L334) + [`KillWindow`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L309) + [`kill_confidence()`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L291) (23 tests). DONE `b7ed1c6`.
- ✅ **P-D2a — Item/ability engine:** [`burst_damage_with()`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L136) รับ items + ability levels จริง; item DB + [`loadout_from_names()`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L444). DONE.
- ⏳ **P-D2b — GSI wiring:** พาร์ส `items`/`abilities` arrays ใน [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs) (ตอนนี้ดึงแค่ summary) → ป้อนเข้า `*_with()`; เกราะศัตรูจาก G-Master.
- 🟡 **P-D3 — JSON-backed DB:** DB ย้ายออกจาก Rust ไป [`data/heroes.json`](file:///g:/G-Maiden/src-tauri/data/heroes.json) + [`data/items.json`](file:///g:/G-Maiden/src-tauri/data/items.json) (โหลดผ่าน `include_str!`); generator [`tools/gen-herodb/`](file:///g:/G-Maiden/tools/gen-herodb/) ดึง base stats ครบ 127 จาก dotaconstants. เหลือ curate ability tables (8/127) — งานข้อมูลล้วน ไม่ต้องแก้ logic.
- ⏳ **P-D4 — CV HP-bar + attack timing:** enemy HP-bar detector → current HP %; attack-speed → จำนวนตีจริง.
- ⏳ **P-D5 — Belief revision wiring:** ต่อ confidence → G-Signal interrupt + G-Log calibration loop.

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
- [ ] Hero DB ครบทั้ง roster (127 ตัว; base stats ครบแล้ว, ability tables 8/127)
- [ ] CV อ่าน current HP ศัตรูได้ ±5% ใน budget capture เดิม
- [ ] ส่ง **confidence ไม่ใช่ boolean**; confidence ต่ำ → trigger belief revision
- [ ] ฝั่ง defensive (`is_lethal`) เดิมยังทำงานปกติ (ไม่ regress)
- [ ] ทำงาน offline ทั้งหมด (ไม่พึ่ง cloud)

## Changelog
| Version | Date | Summary |
|---|---|---|
| 0.1.0 | 2026-06-XX | G-Damage defensive engine ([`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs)) ใน v0.6.0 |
| 0.2.0 | 2026-06-23 | เพิ่ม spec ฝั่ง offensive lethality + two-sided problem + belief-revision wiring + ช่องโหว่ที่ต้องอุด |
| 0.2.1 | 2026-07-19 | symbol-link coverage extension (G1.5) |
| 0.2.2 | 2026-10-04 | แก้ self-burst magic-resistance unit mismatch และเพิ่ม regression coverage สำหรับ baseline 25%. |
| 0.3.0 | 2026-10-04 | Approved the DL-002 target-side data contract, source authority, confidence formula, fail-closed rules, and acceptance evidence. |
| 0.3.1 | 2026-10-04 | Implemented the source-neutral target snapshot normalization, TTL/confidence gate, and fail-closed lethality wrapper with Rust unit coverage; live CV/OCR sources remain blocked. |
