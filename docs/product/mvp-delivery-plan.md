---
title: "G-Maiden MVP Delivery Plan (dated projection)"
doc_id: "mvp-delivery-plan"
status: "accepted"
approved_by: "Boss (explicit approval in chat, 2026-11-07: อนุมัติตามร่าง)"
approved_date: "2026-11-07"
version: "0.1.1"
updated: "2026-11-07"
owner: "Boss"
related_docs: ["roadmap", "mvp-backlog", "mvp-execution-dag", "mvp-decisions"]
---

# G-Maiden MVP Delivery Plan: ประมาณการวันที่

> **สถานะ:** accepted 2026-11-07 (มติ §7.1). ตัวเลขทั้งหมดเป็น**ประมาณการจากสมมติฐานใน §2** ไม่ใช่คำมั่น.
> [[roadmap]] กำหนด milestone M0–M6 และเกณฑ์ Go/No-Go; [[mvp-backlog]] เป็นเจ้าของ task, ขนาด และสถานะ; เอกสารนี้เพิ่มเฉพาะ**ช่วงวันที่และลำดับ**.
> ต้องปรับเทียบใหม่หลังวัด throughput จริง 2 สัปดาห์ (§6).

## 1. งานที่เหลือ (จาก backlog v0.4.0 draft, 2026-11-07)

| กลุ่ม | จำนวน | หมายเหตุ |
| --- | --- | --- |
| DONE | 7 | MVP-001–006, 009 |
| IN_PROGRESS | 6 | 010, 011, 016, 039 (M); 048 (L); 051 (M) |
| READY / TODO | 33 | รวม 007, 008, 013, 020, 027, 038 ที่เป็น READY |
| CONDITIONAL | 2 | 043, 044: ไม่นับในประมาณการ จนกว่า Owner ยืนยันว่าเงื่อนไขใช้ (+6 แต้มถ้าใช้) |
| NOT_APPLICABLE / DEFERRED | 11 | ไม่อยู่ใน MVP |

**หน่วยงาน (แต้ม):** S = 1, M = 2, L = 4 ตามขนาดสัมพัทธ์ใน backlog. งาน IN_PROGRESS นับครึ่ง.
**คงเหลือ ≈ 99 แต้ม** = 31 M + 11 L (106) − เครดิตครึ่งหนึ่งของงาน IN_PROGRESS (7).

## 2. สมมติฐาน (Owner ยังไม่ได้ให้ capacity จริง)

1. ทีม = Boss (owner/อนุมัติ/ทดสอบในเกม) + Claude (orchestrator/reviewer) + Codex (writer) โดยมี writer lane ได้สูงสุด 3 ช่องตาม [[mvp-execution-dag]]
2. Throughput ต่อสัปดาห์ (ยังไม่เคยวัดเป็นแต้ม): ต่ำ 6 / กลาง 9 / สูง 12 แต้ม
   - อ้างอิงคร่าวๆ: merged PR เดือน ต.ค. 49 ตัว และ 1–7 พ.ย. 38 ตัว แต่ส่วนใหญ่ไม่ใช่ MVP task ที่ปิด จึงไม่แปลงตรง
3. Scope ถูกตรึง: ไม่นับ owner extensions (G-Party/G-Friends, OBS highlight ฯลฯ) และ DEFERRED. ถ้าเพิ่มงานนอก MVP วันที่เลื่อนตามสัดส่วน
4. งานที่ต้องใช้คน (ดูไม่ได้ด้วย unit test) รวมเป็น buffer **2 สัปดาห์**:
   - live match ที่มี label (MVP-021, 049)
   - clean-install machine (MVP-047)
   - STT corpus โดย Boss (MVP-038, CR-045)
   - owner acceptance (MVP-052)
5. เริ่มนับ 2026-11-09 (จันทร์). ไม่หักวันหยุดยาวปลายปี. ถ้าหยุด ให้บวกจำนวนสัปดาห์ที่หยุด

## 3. ประมาณการวันพร้อม go-live (ผ่าน Go/No-Go ของ roadmap)

| Scenario | แต้ม/สัปดาห์ | สัปดาห์พัฒนา | + buffer | วันที่ประมาณ |
| --- | --- | --- | --- | --- |
| สูง | 12 | ~8.3 | 2 | **2027-01-20** |
| **กลาง (แนะนำใช้วางแผน)** | 9 | 11 | 2 | **2027-02-08** |
| ต่ำ | 6 | ~16.5 | 2 | **2027-03-19** |

Go-live = release ที่ผ่านทุกมิติใน Go/No-Go ของ [[roadmap]] บน exact commit + installer hash และ Owner อนุมัติ. ไม่ใช่วันที่ cut candidate.

## 4. ลำดับและช่วงเวลาเป้าหมาย (scenario กลาง)

| ช่วง | สัปดาห์ | Milestone ที่ปิด | งานหลัก | Critical path / คนที่ต้องใช้ |
| --- | --- | --- | --- | --- |
| 2026-11-09 → 11-22 | 1–2 | M0, เริ่ม M1/M2 | 007 reconcile, 008 access, 010/011 ปิด, 013/014 | Boss: native negative-case ของ setup |
| 2026-11-23 → 12-06 | 3–4 | M1 | 012 first-run/restart, 015 match lifecycle, 016/017 capture | 015 เป็น dependency ของ M2–M4 เกือบทั้งหมด |
| 2026-12-07 → 12-20 | 5–6 | M2 | 018/019/020, 021 quality baseline; 038 STT selection | Boss: แมตช์ที่มี label, อัด corpus STT |
| 2026-12-21 → 2027-01-03 | 7–8 | M3 | 022–026 event/audio, 027–031 AI boundary | 024/025 audio path เป็น dependency ของ Voice |
| 2027-01-04 → 01-17 | 9–10 | M4, M5 | 032–037 summary/memory; 039–042 Voice | 040 ขึ้นกับผล 038 |
| 2027-01-18 → 01-25 | 11 | เริ่ม M6 | 046/047 update/clean install, 050 privacy runtime, 051 CI | Boss: เครื่องสะอาด |
| 2027-01-26 → 02-08 | 12–13 (buffer) | M6 | 048 NFR, 049 player journey/fault matrix, 052 acceptance | Boss: live matches + อนุมัติ release |

Milestone ทำซ้อนกันได้ตาม roadmap. ตารางนี้แสดงช่วงที่**คาดว่าจะปิด**ไม่ใช่ barrier.

## 5. ความเสี่ยงที่ทำให้วันที่เลื่อน

| ความเสี่ยง | ผล | สิ่งที่ลดความเสี่ยง |
| --- | --- | --- |
| STT ไม่ผ่าน RAM 900 MB หรือ latency 2 s (ลองรันเบื้องต้น: STT small ใช้ ~510–545 MB และ warm ~2.0 s ใน STT อย่างเดียว) | M5 เลื่อนหรือต้องเปลี่ยน requirement | เร่ง corpus (CR-045) และตัดสินใจ MVP-038 ภายในสัปดาห์ 6 |
| งานนอก MVP แทรก (extensions, releases) | throughput จริงต่ำกว่าสมมติฐาน | ใช้ scenario ต่ำ หรือ freeze extension |
| ต้องมี live/native evidence ที่ทำได้เฉพาะ Boss | คอขวดที่ Boss | จัด "test session" รายสัปดาห์ |
| MVP-043/044 ถูกยืนยันว่าใช้ | +6 แต้ม (~0.7 สัปดาห์ใน scenario กลาง) | Owner ตัดสิน CONDITIONAL ในสัปดาห์ 1 |
| เอกสาร DAG/roadmap ไม่ตรง backlog | ตัดสินใจผิดลำดับ | ทำ MVP-007 ก่อน |

## 6. การปรับเทียบ

- ทุกสิ้นสัปดาห์บันทึกแต้มที่ปิดจริง (นับเฉพาะ task ที่เปลี่ยนสถานะพร้อม evidence)
- หลัง 2 สัปดาห์ (2026-11-22) แทน throughput สมมติด้วยค่าจริงและออกเวอร์ชันใหม่ของเอกสารนี้
- วันที่ที่ประกาศภายนอกให้ใช้หลังปรับเทียบแล้วเท่านั้น

## 7. ข้อที่ขอให้ Owner ตัดสิน

1. ใช้ scenario กลาง (**2027-02-08**) เป็นเป้าหมายวางแผนภายใน หรือเลือกเป้าหมายอื่น
2. Freeze owner extensions ใหม่จนถึง M6 หรือไม่
3. ยืนยันว่า MVP-043/044 (account/Google session) อยู่ใน MVP หรือไม่
4. ยอมรับสถานะ `IN_PROGRESS` และการเปลี่ยนสถานะใน backlog v0.4.0

### 7.1 มติ (2026-11-07)

1. ใช้ scenario กลาง **2027-02-08** เป็นเป้าหมายวางแผนภายใน (ไม่ใช่วันประกาศภายนอก จนกว่าจะปรับเทียบตาม §6)
2. Freeze owner extensions: **ยังไม่ตัดสิน**. ร่างไม่ได้เสนอคำตอบ จึงไม่ถือว่าอนุมัติ freeze
3. MVP-043/044: **ยังไม่ตัดสิน**. ร่างไม่ได้เสนอคำตอบ จึงยังเป็น CONDITIONAL และไม่นับในประมาณการ
4. ยอมรับสถานะ `IN_PROGRESS` และการเปลี่ยนสถานะใน [[mvp-backlog]] v0.4.0

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | Draft dated projection from backlog v0.4.0: ~99 remaining points, three throughput scenarios (2027-01-20 / 2027-02-08 / 2027-03-19), milestone windows, risks and recalibration rule; all figures are assumptions pending measured throughput. |
| 0.1.1 | 2026-11-07 | Boss approved the draft; record 2027-02-08 as internal planning target and acceptance of backlog v0.4.0 statuses; extension freeze and MVP-043/044 scope remain undecided. |
