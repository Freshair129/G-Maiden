---
title: "G-Maiden MVP Roadmap"
doc_id: "roadmap"
status: "active"
version: "1.3.0"
updated: "2026-10-12"
owner: "Boss"
related_docs: ["software-requirements-specification", "product-requirements", "mvp-backlog", "mvp-execution-dag", "G-SERIES-DATA-LINEAGE", "releases/README"]
---

# G-Maiden MVP Roadmap

เป้าหมายคือผู้เล่นติดตั้ง G-Maiden แล้วใช้งานได้ครบวงจร **เปิดแอป → ตั้งค่า → เล่นหนึ่งแมตช์ → รับคำแนะนำที่เชื่อถือได้ → สรุปหลังเกม → กลับมาเล่นครั้งถัดไป** โดยไม่ต้องแก้ไฟล์หรือใช้ terminal เอง

**Closed Beta ถูกยกเลิกตามคำสั่งเจ้าของโปรดักต์ในบทสนทนานี้** เพราะความพร้อมของผลิตภัณฑ์ยังไม่ถึงเป้าหมาย แผนปัจจุบันเน้นพัฒนาและตรวจรับ MVP ภายในก่อน ไม่มีวันเปิด Beta หรือวัน release ที่ตกลงแล้ว การเลื่อน milestone ใช้ผลตรวจรับ ไม่ผูกกับเลขเวอร์ชัน

แผนนี้กำหนด milestones ส่วน task และ acceptance criteria อยู่ที่ [[mvp-backlog]]; ลำดับ execution, conditional dependencies, waves และการจองไฟล์/เครื่องอยู่ที่ [[mvp-execution-dag]] การมี task ใน backlog ไม่เปลี่ยนสถานะ implementation เป็น done และไม่แทนการอนุมัติ policy, legal, account security หรือการ release

มติด้าน scope/access/privacy/quality ถูกเลือกและบันทึกใน [[mvp-decisions]] ตาม Owner delegation วันที่ 2026-10-10. Local core เป็น account-optional; cloud context off by default พร้อม opt-in แยก. Companion Voice/Memory ยังอยู่ใน MVP และ acceptance thresholds ล็อกก่อนวัด; legal/release gates ยังคงใช้ตามขอบเขตของตน.

## ฐานข้อมูลสำหรับแผน

- Source review วันที่ 2026-10-10: working HEAD `25316ba8` และ remote main `2d969ac6`; ณ ตอนตรวจมี commit เฉพาะฝั่ง working 11 และ main 5 ต้องรวม baseline ก่อนเริ่มแก้
- Main มีแพตช์ `56f9fbd1` แก้ sign-out และ entitlement failure states แล้ว งานนี้ต้องนำมารวมและตรวจ regression ไม่เขียนซ้ำจากเอกสารเก่า
- [[software-requirements-specification|SRS]] เป็นข้อกำหนด; [[G-SERIES-DATA-LINEAGE]] และ source เป็นหลักฐาน implementation ล่าสุด ประวัติ deploy ไม่ใช่ผลตรวจ production ปัจจุบัน
- ระบบที่มีฐานแล้ว: GSI, DXGI/CV, Signal/interrupt/revision, overlay, voice packs, Claude/Ollama, local JSONL, signed updater, tuning persistence และ memory reader/forget cutoff
- ช่องว่างสำคัญ: startup settings, readiness จริง, stale/unknown data, event ownership, privacy ของ cloud prompt, recovery, match lifecycle, memory consumers และ G-Voice แบบสองทาง

## ขอบเขต MVP ที่ใช้วางแผน

ใช้ **Companion MVP ตาม SRS** เป็นฐาน จึงคง G-Voice และ G-Memory ซึ่งเป็น P0 ไว้ในแผน หากจะปล่อยเพียงผู้ช่วยแจ้งเตือนก่อน ต้องตัดสินและแก้ขอบเขตอย่างชัดเจนใน `MVP-003` ไม่ถือว่า Voice/Memory ผ่านโดยปริยาย

| ความสามารถ | ผลลัพธ์ขั้นต่ำของ MVP |
| --- | --- |
| ติดตั้งและเริ่มใช้งาน | แก้การติดตั้ง GSI ได้ ตรวจ port/model/audio/capture ได้ และเข้าใจสถานะ waiting/ready/degraded |
| Gameplay signals | ข้อมูลมี freshness/coverage; unknown ไม่กลายเป็น safe; critical path อยู่ใน Rust และทำงานเมื่อ cloud หาย |
| Overlay และเสียง | แสดงข้อมูลตามจริง ไม่บังการเล่น เหตุการณ์ไม่ซ้ำ เคารพ mute/priority และคืนค่าตั้งเมื่อเปิดใหม่ |
| G-Master | ถามคำแนะนำได้ตามบริบทล่าสุด มี local fallback หรือแจ้ง unavailable ชัดเจน ไม่ใช้คำตอบข้ามแมตช์ |
| G-Voice | Push-to-talk + local STT ไทย/อังกฤษ + คำตอบสั้นที่ถูก G-Signal ขัดได้; Alt+M ยังคงเป็น mute |
| สรุปหลังเกม | มี match/session identity, เวลาและเหตุการณ์สำคัญ พร้อมข้อปรับปรุงสูงสุด 3 ข้อที่มีหลักฐาน; ข้อมูลไม่พอให้แสดงตามจริง |
| G-Memory | ใช้ local aggregates ที่หาได้จริงในคำแนะนำ มีหน้าดู/ลืม และข้อมูลที่ยังหาไม่ได้แสดง unknown |
| Recovery และ update | รองรับเน็ต/เสียง/capture ขัดข้อง แยกจบเกมกับหลุด และไม่ relaunch กลางแมตช์ |

MFA/phone recovery/public profile, payment/credits, marketplace, G-Stream/G-Score, multi-cloud, advanced Piper และ target-side kill prediction ที่ไม่มีต้นทางข้อมูล อยู่ในรายการหลัง MVP รายการที่ยังปรากฏใน UI ต้องระบุสถานะหรือถอดจากเส้นทาง MVP ตาม scope ที่อนุมัติ ไม่แสดงว่าใช้งานได้แล้ว

## การตัดสินใจที่ต้องปิดใน M0

| Decision | ข้อเสนอสำหรับการตัดสินใจ | Task |
| --- | --- | --- |
| ขอบเขตผลิตภัณฑ์ | คง Companion MVP พร้อม Voice/Memory; ล็อก hero/game mode/platform ที่รองรับและฟีเจอร์ที่เลื่อน | MVP-003 |
| Access และ offline | พิจารณาให้ local core เปิดใช้ได้โดยไม่พึ่งบริการบัญชี; ถ้ายังคงบัญชีบังคับ ต้องนิยาม cold offline, revoke, new-device และ Terms ให้ครบ | MVP-004 |
| ข้อมูลเข้า AI | CV/raw logs/memory อยู่ local; ระบุทุก field ที่ cloud รับได้ตามนโยบายและความยินยอม การล็อกอินไม่เท่ากับยินยอมส่งข้อมูลเกม | MVP-005 |
| คุณภาพและขอบเขตวัดผล | กำหนด supported matrix, alert accuracy/false-positive thresholds, start/end ของ latency และวิธีนับ resource ทั้งระบบ โดยไม่ลดข้อกำหนดเดิมเงียบ ๆ | MVP-006 |

ข้อเสนอเหล่านี้ยังไม่ใช่ approval ให้เปลี่ยน auth หรือส่งข้อมูลเพิ่ม งาน C-3/HIGH ต้องมี threat model, private storage/RLS, rollback และ approval ตามกติกาที่เกี่ยวข้องก่อน implementation

## Milestones

| Milestone | ผลลัพธ์ | Backlog หลัก | เกณฑ์ออกจาก milestone |
| --- | --- | --- | --- |
| **M0 ฐานพัฒนาและขอบเขตเดียวกัน** | รวม source ที่ค้าง ฟื้น dev environment และตกลง policy/acceptance | MVP-001–007 | baseline SHA เดียว, build environment พร้อม, scope/access/privacy/quality decisions มีผู้รับผิดชอบและข้อสรุป |
| **M1 เปิดแอปแล้วพร้อมใช้** | access ตรงกับแผนใหม่, settings ใช้ตั้งแต่ boot, setup/readiness ซื่อตรง | MVP-008–012; MVP-043–045 ตาม access policy | release-mode cold start และ restart สำเร็จโดยไม่เปิด Settings; ผู้ใช้เห็นและแก้ prerequisite ที่ขาดได้ |
| **M2 ข้อมูลและคำเตือนเชื่อถือได้** | validate GSI, stale/unknown handling, match identity, CV coverage, buyback/data correctness | MVP-013–021 | invalid/stale/unsupported state ไม่ผลิตคำยืนยันผิด; มีผล replay accuracy ตามเกณฑ์ที่ตกลง |
| **M3 คำแนะนำและเสียงครบ flow** | event owner เดียว, audio recovery, interrupt, cloud allowlist, AI cancellation/fallback | MVP-022–031 | เหตุการณ์เดียวไม่ซ้ำ, ไม่มีคำตอบเก่าข้ามบริบท, local-only และเสียงเตือนยังทำงานเมื่อ AI ใช้ไม่ได้ |
| **M4 จบเกมแล้วจำและเรียนรู้ได้** | ปิด session, summary ที่มีหลักฐาน, local memory consumers/forget, tuning workflow | MVP-032–037 | หนึ่งแมตช์เชื่อมถึง summary/memory ได้; incomplete ถูกระบุ; forget ไม่ย้อนคืนข้อมูลเก่าเมื่อเปิดใหม่ |
| **M5 สนทนากับ Companion ได้จริง** | PTT/local STT/response lifecycle และ preemption | MVP-038–042 | ทดสอบคำถามไทย/อังกฤษตามชุดที่ตกลง; mic lifecycle, timeout, interrupt และ privacy ผ่าน |
| **M6 ตรวจรับ MVP และเตรียมส่งมอบ** | safe update, installer/resources, NFR, fault scenarios, CI/evidence | MVP-046–052 | required acceptance ไม่มี FAIL/SKIP ค้าง และเจ้าของอนุมัติ artifact/ช่องทางส่งมอบก่อน release |

MVP-038 การออกแบบและประเมิน local STT เริ่มหลัง M0 ได้ เพื่อค้นความเสี่ยงด้าน latency/RAM ก่อนลงมือ M5; MVP-048 การวัด performance และ MVP-051 การเตรียม CI เริ่มเก็บ baseline ตั้งแต่ต้น ไม่รอท้ายโครงการ

### การทำงานขนาน

ใช้ [[mvp-execution-dag]] เป็น execution plan: **57 nodes ใน 14 logical waves W00–W13**, ผู้ทำงานสูงสุด 3 slots และผู้ประสาน integration 1 slot; task แม่ยังเป็น 52 MVP tasks เดิม

- M1/M2/M3 พัฒนาเหลื่อมกันได้: settings/setup เริ่มก่อน ส่วนการปิด readiness/first-run ต้องรอ capture coverage และ audio health จริงจากงานใน M2/M3
- Performance/CI แยกขั้นเตรียม baseline กับ final evidence; local STT design เริ่มเร็วเพื่อพบความเสี่ยง RAM/latency แต่ไม่ปิดฟีเจอร์ก่อน runtime ทำงานจริง
- Consumer เริ่มจาก integrated SHA ที่มี predecessor ผ่านแล้ว พร้อม file/resource lease; ไม่ต้องรอ unrelated tasks ใน milestone ก่อนหน้า
- ก่อน final evidence ต้องผ่าน GATE-RC และตรึง source/artifact เดียวกัน; การแก้หลัง freeze ต้องสร้าง revision ใหม่และตรวจหลักฐานของ revision นั้น

Milestone เป็นผลลัพธ์สำหรับตรวจรับ ไม่ใช่ global barrier ที่บังคับทุก task ให้เรียง M0→M6 การกำหนดวันที่และ assignee ทำหลัง scope/capacity พร้อม; S/M/L ใน backlog เป็นขนาดงานสัมพัทธ์ ไม่ใช่จำนวนวัน

## ลำดับหยิบงานชุดแรก

1. `MVP-001` รวม baseline และ `MVP-002` ฟื้นสภาพ build environment
2. `MVP-003–006` ปิด scope, access, privacy และ acceptance contracts พร้อม `MVP-007` ทำเอกสารให้ตรงกัน
3. `MVP-009` ย้าย settings initialization และ `MVP-010–011` ทำ setup/readiness จริง
4. `MVP-013–015` ปิด invalid/stale tick และ match lifecycle; ต่อด้วย `MVP-019` แก้ buyback unknown
5. `MVP-022–024` จัด event ownership, transition และ audio recovery

`MVP-008` ที่แตะ access gate เริ่มหลัง policy และ security prerequisites ของมันครบ ไม่มีการถอดเฉพาะ frontend gate แล้วปล่อย native/backend ใช้นโยบายเก่า

## เกณฑ์ Go หรือ No Go

| มิติ | หลักฐานขั้นต่ำ |
| --- | --- |
| Fresh install | installer บนเครื่องสะอาด → setup → เล่นได้ โดยไม่ใช้เครื่องมือพัฒนา |
| Restart | settings/backend/voice/layout ถูกคืนโดยไม่เข้า Settings |
| Match lifecycle | draft/live/death/respawn/end/disconnect/next match ถูกต้อง; request/audio/cache ไม่ข้าม session |
| Data correctness | malformed/partial/stale/unknown/unsupported ไม่แสดงเป็นค่าจริงหรือคำยืนยันว่าปลอดภัย |
| Quality | ชุด replay และแมตช์จริงที่มี label ผ่าน precision/recall/false-alert thresholds จาก MVP-006 |
| Resilience | cloud หาย, timeout, อุปกรณ์เสียงหาย, Alt-Tab, capture init/recovery และ port conflict มีพฤติกรรมที่ตรวจรับได้ |
| Companion | Voice รับคำถามและถูก interrupt ได้; Memory ถูกใช้จริงและลืมได้; summary อ้างกลับไปเหตุการณ์ได้ |
| Privacy | ตรวจ outbound payload/traffic ของทุก backend; local-only ไม่เกิด egress; CV/raw G-Log/memory ไม่เข้า cloud |
| NFR | G-Signal p50 ≤250 ms และทุก sample ที่วัดต้อง ≤300 ms; CPU ≤10% ต่อ sample 1 วินาที (MVP decision v0.2.0), RAM ≤400 MB, Dota FPS drop ≤3% บนเครื่องและ mode ที่ตกลง |
| Release | CI และหลักฐาน native/WebView/live ผูกกับ exact commit + installer hash; signing/update/rollback ผ่าน; owner อนุมัติส่งมอบ |

Latency ต้องรวม acquisition scheduling → decision → audible onset; เงื่อนไข missing >5 วินาทีรายงานแยก ไม่ตัดช่วงที่ช้าออกเพื่อให้ผ่าน ส่วน local STT/SLM ต้องรายงาน footprint และ peak แยกพร้อมยอดรวม ถ้าขัดงบ RAM ให้กลับไปแก้ design หรือผ่านกระบวนการเปลี่ยน requirement ไม่ยกเว้นเอง

Headless benchmark, unit tests, source code หรือ historical receipts อย่างเดียวไม่ปิด live acceptance; missing prerequisite เป็น SKIP ไม่ใช่ PASS การ release ใช้ workflow/signing ที่มีอยู่ โดยเลือกช่องทางตาม MVP-004 และ MVP-052 ไม่เปิด Closed Beta กลับมาโดยอัตโนมัติ

## เอกสารและประวัติ

- [[mvp-backlog]] — task register และเกณฑ์รับงาน
- [[mvp-execution-dag]] — execution DAG, parallel waves, leases และ integration/evidence gates
- [[G-SERIES-DATA-LINEAGE]] — แหล่งข้อมูลและช่องว่าง runtime รายโมดูล
- [[FEAT-G-VOICE]], [[FEAT-G-MEMORY]], [[FEAT-G-COACH]] — ข้อกำหนด Companion
- [[releases/README]] — release process, approval และการเก็บหลักฐาน
- [[roadmap-legacy]] — ประวัติ roadmap รุ่นก่อน
- [Roadmap ก่อนปรับเป็น MVP ณ 25316ba8](https://github.com/Freshair129/G-Maiden/blob/25316ba8c0e336881b13f24baa5bec080f5eecb9/docs/product/roadmap.md) — เก็บ phase/version history เดิมใน Git; ไม่ใช้รายการ Now/Next เดิมจัดลำดับงานใหม่

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | roadmap ฉบับปัจจุบัน (untracked) |
| 0.1.1 | 2026-07-19 | link/metadata sweep (G15-T2): `[[PROJECT_FEATURE_MAP]]` converted to plain backtick path text (PROJECT_FEATURE_MAP.md is outside docs/, not a doc-graph slug) |
| 0.1.2 | 2026-07-19 | link/metadata sweep (G15-T5): symbol-link `CREATE_NO_WINDOW` to its `setup.rs` definition |
| 0.1.3 | 2026-07-23 | Recorded the public landing shift from Closed Beta queue/download to a GID-first, roadmap-first Open Beta release funnel. |
| 0.1.4 | 2026-07-24 | Clarified ownership boundaries between the feature roadmap, `PROJECT_FEATURE_MAP.md`, and the release-governance documents under `docs/releases/`. |
| 1.0.0 | 2026-10-10 | เปลี่ยนเป็นแผน MVP M0–M6 จาก source gap review; บันทึกการยกเลิก Closed Beta, scope decisions, dependencies และ acceptance; เชื่อม task backlog โดยเก็บประวัติเดิมใน Git |
| 1.1.0 | 2026-10-10 | เชื่อม execution DAG 14 waves และชี้ชัดว่า milestone ทำเหลื่อมกันได้; readiness รอ health producers และ final evidence ใช้ frozen artifact เดียวกัน |
| 1.2.0 | 2026-10-10 | ผูก roadmap กับ delegated MVP decisions และ optional-account/local-core data contract |
| 1.3.0 | 2026-10-12 | Updated the CPU acceptance budget to 10% per one-second sample per MVP decision v0.2.0. |
