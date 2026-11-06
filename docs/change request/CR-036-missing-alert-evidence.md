---
title: "CR-036 — ยืนยันรายชื่อและหลักฐานก่อนเตือนฮีโร่หาย"
doc_id: CR-036-missing-alert-evidence
status: accepted
approved_by: "Boss (explicit implementation approval in this chat)"
approved_date: "2026-10-27"
version: "0.1.1"
updated: "2026-10-27"
owner: G-Maiden
---

# CR-036 — ยืนยันรายชื่อและหลักฐานก่อนเตือนฮีโร่หาย

ผู้ใช้อนุมัติให้แก้ตามผล audit วันที่ 2026-10-27 โดยเริ่มจากรายชื่อ การแจ้งเตือน และทดสอบ local build

## Implementation plan

1. ยืนยัน portrait หลายเฟรมตาม slot; อ่าน draft และ in-game top bar ได้ เก็บ unknown แทนการเดา ตรวจชื่อซ้ำและกรองเฉพาะ enemy slots ตามทีมจริง รายชื่อไม่ครบไม่เปิดทางให้ classifier ทุกชื่อ
2. นับ minimap sightings หนึ่งครั้งต่อชื่อ/เฟรมและตรวจตำแหน่งต่อเนื่อง ต้องเห็นกลับมาต่อเนื่องก่อน re-arm; ลบ tracks/history ที่ขัดกับ roster
3. ระงับ missing-gank เมื่อก่อนเริ่มเกม เราตาย เกมหยุด/clock ไม่เดิน ภาพไม่ใช่ Dota หรือ capture ขาดช่วง; ต้องเก็บ baseline ใหม่หลังช่วงที่สังเกตไม่ได้ ข้อมูลไม่พอแสดง unknown ไม่อ้าง safe
4. แยก missing snapshot แบบเงียบจาก gank voice; UI ใช้ snapshot สดแทนการสะสมชื่อ 30 วินาที ไม่แสดง danger จากจำนวนชื่ออย่างเดียว
5. แจ้งเสียงเมื่อมีหลักฐานหลายศัตรูที่เคลื่อนที่และหายใกล้กันทั้งเวลา/พื้นที่ หรือข้อมูลตำแหน่งอื่นที่ยืนยันได้; ไม่อ้างว่าเดินเข้าหาผู้เล่นถ้ายังไม่มีตำแหน่งผู้เล่นที่เชื่อถือได้
6. หนึ่งเสียงต่อ absence episode, global cooldown 30s และ per-hero 60s; หมด cooldown อย่างเดียวไม่สร้าง episode ใหม่ Belief Revision เกิดเมื่อมีหลักฐานกลับมาเห็นจริงเท่านั้น ไม่ใช่เพียงค่า risk ลดลงตามเวลา
7. บันทึก suppression reason/coverage และ alert ที่ยิงจริงใน local log แบบจำกัดความถี่ ไม่มี player-data egress

ค่า temporal/cooldown เป็น conservative starting point สำหรับ UAT ไม่ใช่ค่าที่ calibrated จาก labelled dataset แล้ว กรณี cosmetic portrait อ่านไม่ออกต้องเงียบและแสดงรอยืนยัน แทนเดารายชื่อ การตายจากสีเทาเพียงอย่างเดียวยังไม่ใช้เป็นหลักฐานระบุศพใน backend

## Verification

### Follow-up ที่ผู้ใช้อนุมัติ 2026-10-27

บังคับ admission ผ่าน Valve hero ID ที่บันเดิลในแอป ไม่ใช้ class index เป็น identity; ผูก slot/team/session กับ ID ก่อนเข้าตัวติดตามและก่อนส่ง missing event ข้อมูล unknown/ชื่อที่ไม่มี ID/ชื่อซ้ำต้องไม่ผ่าน เพิ่ม local roster evidence log ที่ตรวจย้อนกลับได้ ใช้ภาพ Steam หลายภาพเป็น held-out test พร้อม expected identity รายช่อง รวมกรณีภาพถูกปิดบังและภาพที่ไม่ใช่ HUD; ไม่ลด threshold เพื่อบังคับให้รู้ครบ และไม่ใช้ภาพทดสอบเป็น reference template. ทดสอบ regression ทั้งหมดและเปิด local no-bundle build ให้ผู้ใช้ลอง.

ต้องมี regression สำหรับ duplicate detections, unknown/partial/duplicate/allied roster, early game/dead/pause/capture gap, one-frame reappearance, repeated alerts/expiry-only, snapshot expiry และ positive control ของการเตือนที่มีหลักฐานครบ จากนั้น cargo test, Clippy, frontend lint/typecheck/tests, doc gate และ Tauri no-bundle build ก่อนเปิดให้ผู้ใช้ทดสอบ

ผล local validation ณ 2026-10-27 (รอบแก้ hero ID):

- Registry บันเดิล 127 hero IDs จาก https://www.dota2.com/datafeed/herolist?language=english; class index ไม่ใช้เป็น ID
- Regression RED ยืนยันว่าโค้ดก่อนแก้รับชื่อไม่มี ID และ repeated minimap detections ที่ไม่มี portrait roster ได้; หลังแก้ผ่าน รวม wrong-session/ID-label mismatch/removed identity และ real portrait admission ที่ท้าทายด้วยทุก model label
- Sentry tracks ใช้ HeroId; roster เก็บ ID/slot/team/session และไม่มี manual roster injection command; local roster_confirmed และ enemy_missing.hero_id ใช้ตรวจย้อนกลับ
- แก้ preprocessing mismatch (reference ใช้ luma + Triangle แต่ query เดิมใช้ Rec.601 + nearest); regression ภาพ RGB เดียวกันต้องมี feature ตรงกัน ผ่านหลังแก้ โดยไม่ลด confidence/margin
- เก็บหลักฐาน initial ESLint/Vitest timeout, auth test cascade หลัง cold-import timeout และ transient Rust import error ไว้ใน local target logs; รอบสุดท้ายที่รายงานด้านล่างผ่าน ไม่มีการข้ามเทสหรือแก้ auth production code

- Rust: 410 passed / 7 ignored; Clippy all-targets `-D warnings` ผ่าน
- Frontend: 316 passed / 36 files; TypeScript และ ESLint ผ่าน
- Doc graph: 215 tests ผ่าน; strict findings เดิม 14 รายการอยู่ใน checklist ไม่มี uncovered ใหม่
- Data provenance: manifest 5 artifacts และ 6 tests ผ่าน
- รัน ignored portrait probe แยกด้วยโค้ด Rust จริงบน Steam reference 1920×1080 และ cache 118 portraits (รันซ้ำหลังแอปเติม cache เป็น 126 portraits แล้วผ่านเช่นกัน): หลังใช้ luma/resampling แบบเดียวกันทั้ง reference และ capture ยืนยันถูก 3/10 ช่องใน 20261019153246_1.jpg และ 1/10 ช่องใน 20261018144123_1.jpg; หน้าเมนู 20261018141746_1.jpg เป็น unknown ทั้ง 10 ช่อง ไม่มีชื่อผิดที่ผ่าน admission ในสามภาพนี้ การเห็นซ้ำจากภาพนิ่งไม่ใช่หลักฐาน temporal live-match
- Local Tauri no-bundle build ผ่าน; เปิดไฟล์ที่สร้างเวลา 15:20 วันที่ 2026-10-27 ตรวจ process/path/hash และ listener 127.0.0.1:3000 ตรงกัน พบ GSI Online และ CV roster_confirmed 6 ช่องพร้อม ID ในแมตช์จริง (ศัตรู 4/5); ภาพเกมแสดงยืนยันศัตรู 4/5 และ warning_gate ระบุ roster_incomplete โดยยังไม่เตือนเสียง ไม่ใช่ sustained live-match precision/recall acceptance
- รอบเปิดเก่าเวลา 03:58 ผู้ใช้ยืนยันว่าปิดเอง ไม่จัดเป็น crash; หลักฐาน startup รอบใหม่นี้เป็นคนละ run

ข้อจำกัด: ภาพทดสอบสามภาพนี้ไม่ใช่ precision/recall benchmark; cosmetic, portrait ที่ cache ไม่มี หรือกรอบ HUD ที่ต่างจาก reference อาจทำให้ roster ไม่ครบและงดเสียงทั้งหมด จนยืนยันศัตรูครบ 5 ช่อง ค่าเกณฑ์และความแม่นยำในแมตช์จริงยังรอ UAT ไม่มีการอ้างว่า unit/synthetic smoke ปิด live-match accuracy acceptance แล้ว

### Follow-up: HUD reference coverage (owner approved 2026-10-27)

แผนรอบนี้: ตรวจภาพจริงและแก้ ground truth ที่ระบุผิด (Dawnbreaker/Techies แทน Omniknight/Brewmaster; Crystal Maiden persona และ Legion Commander ในอีกแมตช์), วัดกรอบ portrait ให้ตรงกับ HUD, ใช้ feature ส่วนบนด้านในที่ไม่ทับไอคอน ult/facet แบบเดียวกันทั้ง query/reference และเพิ่ม reference ของ alternate/persona จาก static Dota assets โดยผูกหลายภาพกับ HeroId เดียวกัน Runner-up ต้องเป็นฮีโร่คนละ ID ไม่ใช่ alternate ของตัวเดียวกัน คง threshold 0.75 และ margin 0.12 สำหรับ HUD รวม temporal/session gates เดิม. การเทียบ grayscale อย่างเดียวอ่านภาพหลักครบแต่รับ terrain patch ผิดได้ จึงเพิ่ม RGB NCC corroboration และใช้คะแนนต่ำสุดของ grayscale/RGB ที่ต้องผ่าน 0.75 ทั้งคู่ พร้อม negative regression จากภาพจริง ไม่อาศัย margin หรือจำนวน roster อย่างเดียว.

เพิ่มเครื่องมือ import เฉพาะ static PNG ที่ export จากเกมผ่าน Source2Viewer ลง local cache พร้อม hashes/provenance ไม่มี screenshots เป็น templates และไม่มี player-data egress; ไม่แจกจ่ายภาพ Valve ใน git ตัว runtime โหลดภาพในเครื่อง ไม่มี external process บน capture critical path. Modern public default portraits เติมผ่าน static CDN; cosmetic cache ที่ไม่มีจะยัง unknown. ต้องมี failing real-image regression ที่ยืนยันครบทั้งสองทีมในภาพ 20261019153246_1.jpg, Dire 5/5 ใน held-out ภาพ 20261016184707_1.jpg; ภาพ 20261018144123_1.jpg มี death desaturation และ on-fire frame จึงต้องคงช่องที่ไม่ผ่านเกณฑ์เป็น unknown, menu/blank/ambiguous/unknown rejection และตรวจภาพ gameplay อื่นแยกจากภาพที่ใช้วัดกรอบ จากนั้นรัน test/lint/typecheck/build ก่อนเปิด local build.

ผลรอบ HUD coverage: Rust 413 passed / 7 ignored, ignored real portrait probe 1 passed; Clippy all-targets -D warnings, frontend 316 passed / 36 files, ESLint/TypeScript ผ่าน. Vitest รอบ cold import แรกมี timeout 5s ทำให้ auth tests ล้มต่อเนื่อง 9 รายการ เก็บ failure log แล้ว rerun unchanged suite ผ่านทั้งหมด ไม่มีการข้าม/เปลี่ยน auth tests. Importer 2 tests และ data provenance 6 tests + manifest 5 artifacts ผ่าน.

ภาพหลัก 20261019153246_1.jpg อ่านถูก 10/10 (5/5 ทั้งสองทีม) คะแนน min(grayscale NCC, RGB NCC) 0.8457–0.9764. ภาพ held-out ต่างแมตช์ 20261016184707_1.jpg อ่านถูก 9/10 และ Dire ครบ 5/5; อีกช่องคง unknown. ภาพ 20261018144110/17/23_1.jpg มี dead/desaturated portraits และ on-fire frame; อ่านถูก 7/10 (Dire 4/5), อีก 3 ช่อง unknown ตามเกณฑ์ ต้องไม่ลดเกณฑ์เพื่อบังคับให้ครบในภาพที่มีเอฟเฟกต์รบกวน. หน้าเมนู unknown 10/10. ใช้ Rust production modules โดยตรงตรวจเพิ่ม 336 terrain patches ในภาพ 6 ภาพ ไม่มี patch ที่ผ่าน admission; นี่เป็น bounded spatial challenge ไม่ใช่ precision/recall benchmark และภาพใกล้กันในแมตช์เดียวไม่ใช่ independent matches.

Reference cache ที่เครื่องทดสอบมี 177 static game portraits (รวม variants) และ legacy 126 ภาพ รวมโหลด 303 templates ไม่มี screenshot เป็น reference. Import จาก installed Dota pak01 ผ่าน Source2Viewer 20.1; local-assets.json เก็บชื่อ static source และ SHA-256. ไม่มี Valve image binaries ลง git; เครื่องใหม่ที่ไม่มี cosmetic cache อาจยังอ่านบางช่องไม่ได้. Local no-bundle build และ startup verification บันทึกแยกใน target/hud-coverage-validation.json หลังสร้างเสร็จ; ไม่ใช่ signed release หรือ sustained live-match acceptance.

Startup verification 2026-10-27: เปิด local no-bundle unsigned binary และยืนยัน listener เป็นโปรเซสเดียวกัน, UI GSI Online, DXGI1920x1080 และโหลด303portraittemplates. ยืนยัน portrait_temporal ครบ10/10 และศัตรูครบ5/5 ตรงกับ topbar จาก screenshot live แบบอ่านอย่างเดียว; warning_gate ready=true หลัง warmup และไม่เตือนเสียงเมื่อไม่มี rotation evidence. Match/session identifiers, roster และเวลาสังเกตโดยละเอียดเก็บเฉพาะหลักฐานในเครื่อง ไม่เผยแพร่ใน repository. หลักฐานนี้เป็น bounded live-startup/roster verification ไม่ใช่ sustained whole-match alert/performance acceptance; stderr ยังมี whole-app CPU group unavailable และ slow-frame messages เดิม ต้องไม่อ้างว่าผ่าน performance budgets จากรอบนี้.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-27 | Owner-approved bounded correction of roster admission, warning gates and repeat suppression. |
| 0.1.1 | 2026-10-28 | Remove match identifiers, named roster and precise observation time from publication; retain detailed receipt locally. |
