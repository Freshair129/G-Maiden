---
title: "RCA: G-Damage Magic Resistance Unit Mismatch"
doc_id: "RCA-2026-10-04-G-DAMAGE-MAGIC-RESISTANCE"
status: "active"
version: "1.0.1"
updated: "2026-10-04"
owner: "Boss"
source_of_truth: true
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["G-SERIES-DATA-LINEAGE", "FEAT-G-DAMAGE", "engineering-spec"]
---

# RCA — G-Damage Magic Resistance Unit Mismatch

## Summary

การตรวจ data lineage ของ G-Damage พบว่า contract ของค่า magic resistance ใช้หน่วยไม่ตรงกันระหว่างฟังก์ชันคำนวณกับค่า baseline ของ `self_burst`. RCA นี้ยืนยัน root cause จาก source code และ regression test แล้ว และ fix runtime ใน scope นี้เรียบร้อยแล้ว

## Symptom

G-Damage ระบุ baseline เป้าหมายว่า “ต้านเวท 25%” แต่ค่า baseline ที่ส่งเข้า `magic_multiplier()` คือ `0.25` ขณะที่ฟังก์ชันตีความ input เป็นเปอร์เซ็นต์ เช่น `25.0`.

ผลที่เกิดขึ้นใน self-burst path:

```text
actual code:   magic_multiplier(0.25) = 1 - 0.25 / 100 = 0.9975
intended 25%:  magic_multiplier(25.0) = 1 - 25.0 / 100 = 0.75
```

ดังนั้น magical damage ใน self-burst อาจถูกประเมินสูงกว่าความหมายที่ prompt ระบุไว้ประมาณ `0.9975 / 0.75 = 1.33x` สำหรับ baseline นี้

## Evidence

1. [`magic_multiplier`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L33) รับพารามิเตอร์ชื่อ `magic_resistance_pct` และคำนวณ `1.0 - magic_resistance_pct / 100.0` จึงใช้หน่วยเปอร์เซ็นต์ `[0, 100]`.
2. [`BASELINE_TARGET_MAGIC_RES`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L456) ตั้งค่าเป็น `0.25` แต่ comment ระบุว่าเป็น “25% base magic resistance”.
3. [`self_burst`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L465) ส่งค่า baseline นี้เข้า `burst_damage_with`, ซึ่งเรียก `magic_multiplier` ก่อนรวมผล damage.
4. G-Master แสดงข้อความว่า combo damage คิดกับ “ต้านเวท 25%” ใน [`master.rs::build_prompt`](file:///g:/G-Maiden/src-tauri/src/master.rs#L51) จึงยืนยัน semantic intent ว่าต้องการ 25% ไม่ใช่ 0.25%.
5. Existing unit coverage ทดสอบ `magic_multiplier(25.0) == 0.75` ที่ [`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L519) แต่ไม่มี integration fixture ที่ตรวจ `self_burst` กับ baseline constant.

ขอบเขตที่ยืนยันได้: ปัญหาอยู่ใน self-burst estimate ที่ป้อน G-Master. Target-side lethality (`can_i_kill`) ยังไม่ต่อเข้า runtime และจึงไม่ใช่ source ของอาการนี้ในเกมปัจจุบัน

## Root Cause

**ไม่มี canonical unit contract ที่ boundary ของ damage API.** ชื่อพารามิเตอร์และ unit test กำหนดให้ resistance เป็น percentage `[0, 100]` แต่ constant ของ caller ใช้ fraction `[0, 1]`. Rust `f64` ไม่สามารถป้องกันความสับสนนี้ได้ และไม่มี integration test ที่ตรวจ caller-to-formula path.

Root cause นี้เป็น code/document contract defect ไม่ใช่ปัญหาจาก network, GSI transport, OpenDota, หรือโมเดล LLM

## Why the issue escaped detection

- Unit test ตรวจฟังก์ชันคณิตศาสตร์แบบ isolated ด้วย input `25.0` แต่ไม่ตรวจ `self_burst()` ซึ่งใช้ `0.25`.
- เอกสารเดิมระบุ “25%” ในเชิงความหมาย แต่ไม่ได้ระบุหน่วย input ของ function/constant เป็น `[0,100]` หรือ `[0,1]` ใน field-level contract.
- G-Master เป็น non-critical path และ output เป็น natural-language advice จึงไม่มี deterministic receipt ตรวจค่าความเสียหายกับ expected fixture.
- Target-side G-Damage ยังไม่ live ทำให้ไม่มี end-to-end lethality test ที่บังคับให้หน่วยของ defense values สอดคล้องกันทั้ง pipeline.

## Impact

| Surface | Impact |
| --- | --- |
| G-Damage self-burst | Magical component can be overstated for the soft-target baseline. |
| G-Master advice | Prompt may present an inflated `~X dmg` estimate. |
| G-Signal critical path | No current impact; target-side G-Damage is not wired to G-Signal. |
| Privacy/network | No impact; the mismatch is local arithmetic. |

## Proposed prevention

1. เลือก canonical unit เป็น percentage `[0, 100]` เพราะ function signature และ existing test ใช้ convention นี้อยู่แล้ว.
2. แก้ caller baseline ให้ใช้ `25.0` หรือ normalize ที่ boundary เพียงจุดเดียว; ไม่กระจาย conversion เข้าแต่ละ damage type.
3. เพิ่ม regression test ระดับ integration สำหรับ `self_burst` ที่ตรวจ magical ability/item contribution กับ baseline 25%.
4. ตั้งชื่อ field/parameter ให้มี suffix `_pct` หรือสร้าง unit wrapper เมื่อ target-side G-Damage ถูกต่อจริง.
5. เพิ่ม field-level fixture ใน [[G-SERIES-DATA-LINEAGE]] ระบุ unit, valid range, formula, and fallback สำหรับ armor/magic resistance.
6. หลังแก้โค้ด ให้รัน RCA-approved fix gate: targeted damage regression, full `cargo test`, `cargo clippy --all-targets -- -D warnings`, และ G-Master prompt fixture.

## Fix boundary

แก้ `BASELINE_TARGET_MAGIC_RES` เป็น canonical percentage `25.0` ใน `src-tauri/src/damage.rs` และเพิ่ม `self_burst_applies_baseline_magic_resistance_as_percentage` เพื่อบังคับ caller-to-formula contract. ไม่เปลี่ยน target-side lethality หรือ G-Signal wiring.

## Fix verification

- RED: test ได้ `797.999...` effective damage จาก Dagon 5 เพราะ baseline เดิมคือ `0.25`.
- GREEN: หลังแก้เป็น `25.0`, targeted test ได้ `600.0` effective damage และผ่าน.

## RCA completion criteria

- [x] Symptom ระบุด้วย expected/actual calculation.
- [x] Evidence ชี้ source code และ test ที่เกี่ยวข้อง.
- [x] Root cause ระบุ unit contract defect อย่างเฉพาะเจาะจง.
- [x] Escape path ระบุ test/documentation gap.
- [x] Prevention และ fix boundary ระบุแล้ว.
- [x] Runtime fix และ regression verification — baseline เป็น `25.0`; targeted regression ผ่าน.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-10-04 | Documented confirmed G-Damage magic-resistance unit mismatch, impact, escape path, and prevention. |
| 1.0.1 | 2026-10-04 | Implemented the approved self-burst baseline fix and recorded RED/GREEN regression evidence. |
