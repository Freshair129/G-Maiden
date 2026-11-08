---
title: "CR-049 — Event taxonomy SOT (g-events.toml), codegen and pack version contract"
doc_id: "CR-049-event-taxonomy-sot"
status: "accepted"
approved_by: "Boss — \"approve\" in the orchestrator session"
approved_date: "2026-11-09"
version: "0.1.0"
updated: "2026-11-09"
owner: "Boss"
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["ADR-21-event-taxonomy-sot", "gann-event-media-contract", "CR-046-demo-mvp-announcer-gank-slice", "mvp-delivery-plan", "mvp-backlog"]
---

# CR-049: Event taxonomy SOT, codegen และ pack version contract

> **สถานะ:** accepted 2026-11-09. Decision อยู่ใน [[ADR-21-event-taxonomy-sot]]; CR นี้กำหนดขอบเขต ลำดับ PR และ acceptance.
> เลข CR-048 จองไว้ให้ CR เรื่อง GPU minimap CV ที่ยังไม่ push.

## 1. เหตุผล

Taxonomy ของ announcer event ซ้ำกัน 6 ชุดและเพี้ยนกันแล้ว (ADR-21 §Context). เงื่อนไขการตรวจจับ, priority และค่าที่ปรับได้ฝังอยู่ใน `announcer.rs`.
Boss ต้องการไฟล์ที่เปิดดูและแก้ได้เอง โดยไม่ต้องสั่ง AI.

## 2. มติ Owner (2026-11-09)

Boss ตอบ "approve" ต่อ design ที่ Fable รีวิวและปรับแล้ว:

| # | คำถาม | มติ |
| --- | --- | --- |
| 1 | รูปแบบไฟล์ | **TOML** (`src-tauri/events/g-events.toml`) |
| 2 | ทำระหว่าง freeze ถึง M6 ได้ไหม | **ได้ — อนุมัติเป็นข้อยกเว้นรายการนี้** ในฐานะ tech-debt consolidation; ไม่มีพฤติกรรมใหม่ยกเว้น admission ของแพ็กที่ใหม่กว่า (ADR-21 §8) |
| 3 | ย้าย HP-alert defaults (`runtime.rs:1105`) เข้าไฟล์เดียวกันไหม | **ไม่ย้ายใน CR นี้** — HP alert เป็น user setting ที่ UI override อยู่แล้ว; TOML อ้างอิงด้วย `detector` เท่านั้น |
| 4 | cooldown ต่ออีเวนต์ | **ไม่รวม** — เป็นพฤติกรรมใหม่ ต้องมี CR แยก |

ข้อ 3–4 ไม่มีข้อแนะนำใน review; orchestrator เลือกทางที่ไม่เพิ่มพฤติกรรม. Boss เปลี่ยนได้ก่อนเริ่ม PR1.

## 3. ขอบเขต

### อยู่ในขอบเขต
- `g-events.toml` ตาม ADR-21 §1–2 ครอบคลุมทุก id ที่มีใน taxonomy v1.1 ปัจจุบัน
- `[params.announcer]`: `multikill_window_s`, `hp_low_percent`, `mana_low_percent`, `level_up_milestones` ค่าตรงกับโค้ดปัจจุบัน (18 / 20 / 15 / [6,12,18,25])
- `build.rs` codegen + การตรวจตอน build + test เทียบ JSON ที่ commit
- debug override `GMAIDEN_EVENTS_OVERRIDE` เฉพาะ params
- `taxonomy_version` ใน registry ของแพ็ก และ admission matrix ใน `g-ann-package`
- G-Suite ใช้ crate ผ่าน git dependency; ลบสำเนา crate และ `gmaiden-events.ts`

### ไม่อยู่ในขอบเขต
- G-Signal `Sensitivity` thresholds, HP-alert user settings, cooldown ใหม่
- เปลี่ยน logic ใน `announcer.rs step()` (refactor ได้เฉพาะให้อ่านค่าจาก generated constants; พฤติกรรมต้องเท่าเดิม)
- `enemy_missing` เพิ่มเข้า taxonomy ตาม CR-046 D1 ผ่าน #162 เท่านั้น; ถ้า #162 merge ก่อน PR1 ให้ TOML เริ่มที่ v1.2 และรวม `enemy_missing`
- UI editor, Studio export mapping (YAML)

## 4. ลำดับ PR

| PR | Repo | งาน | ขึ้นกับ |
| --- | --- | --- | --- |
| PR0 | G-Suite | แก้ text ที่เพี้ยนใน schema; ลบ `gmaiden-events.ts` และให้ Studio import JSON | – |
| PR1 | G-Maiden | `g-events.toml` + `build.rs` codegen + generated JSON + เขียน test mirror ใหม่ + debug override | – |
| PR2 | G-Maiden | `taxonomy_version` ใน `g-ann-package` + admission matrix + ค่า default 1.1 | PR1 |
| PR3 | G-Suite | git dependency บน `g-ann-package` pin rev; ลบสำเนา crate; Studio ใส่ version ตอน export | PR2 |

## 5. Acceptance

| ID | ตรวจ | ผลที่ต้องได้ |
| --- | --- | --- |
| EVT-AC-001 | build ด้วย TOML ปัจจุบัน | event table, `priority()` และ params ที่ generate ออกมาเท่ากับค่าที่ hardcode ไว้เดิมทุกตัว; test ของ announcer เดิมผ่านโดยไม่แก้ expectation |
| EVT-AC-002 | ใส่ param นอกช่วง / detector ที่ไม่รู้จัก / id ซ้ำ / voice_rank ซ้ำ | build ล้มพร้อมข้อความชี้บรรทัด |
| EVT-AC-003 | แก้ TOML แต่ไม่ regenerate JSON | `cargo test` ล้ม |
| EVT-AC-004 | เปลี่ยน id set โดยไม่ bump version | test ล้ม |
| EVT-AC-005 | release build | ไม่มีโค้ดอ่าน `GMAIDEN_EVENTS_OVERRIDE` (ตรวจ symbol/cfg) |
| EVT-AC-006 | แพ็ก same-major เก่ากว่า / ใหม่กว่า / ต่าง major / ไม่มี field | admit+unmapped log / admit+inert / refuse ไม่เปลี่ยน selection / ถือเป็น 1.1 |
| EVT-AC-007 | Studio export → Maiden import แพ็กเดิม (VRZO rev7) | ยังติดตั้งและเล่นได้เหมือนเดิม |
| EVT-AC-008 | G-Signal latency และ NFR | ไม่เปลี่ยน; codegen เป็น compile-time ไม่มีงานเพิ่มตอนรัน |

Source/unit evidence ไม่ใช่ live match หรือ acoustic acceptance; บันทึกแยก.

## 6. ความเสี่ยง

- **ลด admission ที่เคยปฏิเสธแพ็กที่มี id ไม่รู้จัก**: ยังคงตรวจ hash/pair ทุกไฟล์; id ที่ไม่รู้จักไม่มีทางถูกเล่น
- **G-Suite build ผูกกับ G-Maiden rev**: bump pin เป็น PR ที่ review ได้
- **build.rs ช้าขึ้น**: parse TOML ขนาดเล็ก ไม่มีนัยสำคัญ

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-09 | Accepted by Boss: TOML SOT in G-Maiden, build-time codegen, debug-only override, shared crate via git dependency, taxonomy version contract; freeze exception for this consolidation; HP-alert defaults and cooldown out of scope. |
