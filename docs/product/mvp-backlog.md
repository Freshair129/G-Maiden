---
title: "G-Maiden MVP Backlog"
doc_id: "mvp-backlog"
status: "draft"
version: "0.3.6"
updated: 2026-10-18
owner: "Boss"
related_docs: ["roadmap", "mvp-execution-dag", "software-requirements-specification", "G-SERIES-DATA-LINEAGE", "FEAT-G-VOICE", "FEAT-G-MEMORY", "FEAT-G-COACH", "EXEC-PLAN-CR-034-iam-remediation"]
---

# G-Maiden MVP Backlog

Backlog สำหรับทำให้ผู้เล่นใช้งาน Companion ได้ครบหนึ่งแมตช์และกลับมาใช้งานต่อได้ แบ่งเป็น **52 tasks ในแผน MVP** ซึ่งมีงานบัญชี/Terms แบบมีเงื่อนไข และ **10 tasks หลัง MVP หรือแยกสายงาน** ลำดับ milestone อยู่ใน [[roadmap]] ทุก task ยังไม่ปิดจากการเขียนแผนนี้

แผนทำงานขนานอยู่ที่ [[mvp-execution-dag]] และไฟล์ `docs/product/mvp-execution-dag.json` โดยคง task แม่ทั้ง 62 ID นี้ไว้ รายการ 001, 011, 048, 051 แยกขั้น A/B เพื่อไม่ให้ evidence หรือ readiness ถูกปิดก่อน prerequisite จริง; task แม่ DONE เมื่อทุกขั้นที่ใช้ผ่านแล้ว Wave เป็นคิวตาม dependency ไม่ใช่กำหนดส่งหรือการเริ่มงานอัตโนมัติ

## วิธีใช้ backlog

- **P0:** ต้องปิดก่อนปล่อยความสามารถนั้นใน MVP; **P1:** จำเป็นต่อขอบเขต MVP ที่วางไว้แต่ทำหลังฐาน P0; **P2:** เลื่อนออกจาก MVP
- **READY:** เริ่มวิเคราะห์/จัดทำผลลัพธ์ของ task ได้; **TODO:** รอ dependency; **DECISION:** ต้องมีข้อสรุปจาก owner ก่อนงานที่ขึ้นต่อ; **CONDITIONAL:** ทำเมื่อ policy ที่เลือกใช้ความสามารถนั้น; **DEFERRED:** อยู่นอก MVP ปัจจุบัน
- **S/M/L:** ขนาดสัมพัทธ์ S = ขอบเขตแคบหนึ่งชั้น, M = เชื่อมสองชั้น, L = หลายชั้นหรือมีความไม่แน่นอน ควรแตก checklist เพิ่มหลัง design โดยคง ID แม่; ไม่ใช่จำนวนวันหรือกำหนดส่ง
- บทบาทในแต่ละ epic เป็นผู้รับผิดชอบที่เสนอ ยังไม่ได้มอบหมายบุคคล ให้ใส่ assignee, issue/PR, evidence และวันปิดเมื่อเริ่มทำ
- Dependency ที่ระบุเป็นขั้นต่ำ ทุก implementation ต้องมี baseline `MVP-001`, environment `MVP-002` และ contract ที่เกี่ยวข้องพร้อมก่อนเริ่ม
- จับหนึ่ง task ต่อ PR ที่แคบเมื่อทำได้ แยก docs/design, implementation และ acceptance หากเป็น C-3/HIGH; ไม่ต้องสร้าง GitHub Issues หรือ dispatch งานจากการบันทึกไฟล์นี้

### Definition of Done ร่วม

1. มี requirement/source reference และ acceptance ใน task; reproduce อาการที่เป็น source hypothesis ก่อนแก้ พร้อม RCA ตามกระบวนการ repo
2. งาน code มี regression cases และผล native/WebView หรือ live ตามผลกระทบ ไม่ปิดด้วย unit test อย่างเดียวเมื่อ acceptance ต้องใช้เกม/อุปกรณ์
3. รัน gate ที่ตรง CI และ suite ของพื้นที่ที่แก้ภายใต้ timeout เมื่อเข้าสู่งาน implementation/verification; เก็บ exact SHA, environment, command, exit code และ artifact hash ถ้ามี
4. ข้อมูลผิด/ขาด/stale และ error state มีทางออก ไม่มีการใส่ mock เพื่อให้ดูสำเร็จ ไม่มีข้อมูลผู้เล่นออกเครือข่ายนอก contract
5. เอกสาร, Changelog, doc graph/ledger สอดคล้องกัน
6. Owner รับผลตาม acceptance; จึงเปลี่ยนเป็น DONE พร้อมลิงก์ evidence งานบัญชี/legal/deploy/release ใช้ approval เฉพาะที่กติกากำหนด

มติ MVP-003–006 ถูกบันทึกใน [[mvp-decisions]] ตามคำสั่ง Owner ให้ Codex ตัดสินใจ; รับ verified baseline MVP-001/002. DONE ของงาน contract หมายถึงเลือกข้อกำหนดแล้ว ไม่ใช่รับรองฟีเจอร์ที่ยังต้องพัฒนา. MVP-045 เป็น NOT_APPLICABLE สำหรับ desktop account/download gate; MVP-043/044 ยัง applicable เพราะมี optional account surface.

## E0 ฐานพัฒนาและข้อกำหนด

**Milestone:** M0 · **บทบาทที่เสนอ:** Product owner + integration engineer + QA

**ผลลัพธ์:** source baseline เดียวและขอบเขตที่พัฒนา/ตรวจรับได้จริง

**หลักฐาน:** source `25316ba8`, main `2d969ac6`, แพตช์ auth `56f9fbd1`, [[software-requirements-specification]], [[G-SERIES-DATA-LINEAGE]] และ [CR-034 execution plan](../operations/EXEC-PLAN-CR-034-iam-remediation.md)

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-001 | P0 / M | DONE | MVP-002 สำหรับขั้น B | **รวม baseline จาก working branch และ main.** ขั้น A ตรวจ/รวม source ใน worktree แยกทำขนานกับ environment ได้; ขั้น B รอ MVP-002 แล้วตรวจ regression บน merged source/lockfile; ผลลัพธ์มี SHA เดียว, ไม่มี patch ตกหล่นหรือเขียนทับงานขนาน และหลักฐาน regression ของส่วนที่รวม |
| MVP-002 | P0 / S | DONE | — | **ฟื้น development environment.** แก้ dependency junction ที่ชี้ G: เดิมด้วยการติดตั้งตาม lockfile, จัด pinned Rust/Node/pnpm ให้ตรง repo; เปิด dev app และสร้าง native no-bundle ได้โดยไม่เปลี่ยน dependency version เพื่อกลบปัญหา |
| MVP-003 | P0 / S | DONE | — | **ล็อก Companion MVP scope.** Owner ยืนยัน Voice/Memory, ขอบเขต summary, OS/game modes/heroes/layouts ที่รองรับ และรายการเลื่อน; ถ้าลดเป็น alert assistant ต้องแก้ PRD/SRS/คำสัญญาผลิตภัณฑ์ก่อน ไม่มีการนับฟีเจอร์ที่เลื่อนว่าเสร็จ |
| MVP-004 | P0 / M | DONE | MVP-003 | **กำหนด access/offline policy ของ local core และ account actions.** ทำตาราง cold start, signed-out, network loss, revoke, new device, Terms change, update/recovery; local core ไม่ต้องมี account, entitlement, or network, while protected account actions retain server authorization. |
| MVP-005 | P0 / M | DONE | MVP-003 | **กำหนด data contract ของ AI.** ทำ field-by-field allowlist/denylist พร้อมต้นทางและ consent; CV/raw G-Log/Memory ไม่ออก cloud, live stats ที่ไม่ผ่าน policy ไม่ส่ง; แก้ความขัดกันระหว่าง SRS/ADR/Privacy UI ให้ได้ contract เดียวและเก็บ approval ก่อนเปลี่ยน egress |
| MVP-006 | P0 / M | DONE | MVP-003 | **กำหนด acceptance matrix.** ระบุเครื่อง/OS/GPU/จอ/DPI/minimap/game mode, label set, precision/recall/false alerts ต่อแมตช์, latency landmarks, Voice STT/response targets และวิธีนับ CPU/RAM ทั้งระบบ; ตัวเลขคุณภาพต้องตกลงก่อนดูผลวัด ไม่ลด hard NFR เพื่อให้ผ่าน |
| MVP-007 | P1 / M | TODO | MVP-003, MVP-004, MVP-005, MVP-006 | **ทำ product contracts ให้ตรง baseline.** Reconcile PRD/SRS, feature map/ledger, AGENTS/CLAUDE และ release entry links; แยก implemented/connected/verified, แก้ Alt+M ที่เป็น mute และ local critical path ที่ไม่ต้องพึ่ง SLM; ทุกคำว่า ready มี evidence อ้างกลับได้ |

## E1 เปิดแอปและตั้งค่า

**Milestone:** M1 · **บทบาทที่เสนอ:** Desktop/Rust + frontend + QA

**หลักฐาน:** [App](../../src/src/App.tsx#L33), [Control settings](../../src/src/app/Control.tsx#L171), [CommandDeck](../../src/src/CommandDeck.tsx#L805), [runtime readiness](../../src/src/runtimeReadiness.ts#L18), [GSI server](../../src-tauri/src/gsi.rs#L599), [setup](../../src-tauri/src/setup.rs)

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-008 | P0 / L | TODO | MVP-001, MVP-004; MVP-043–045 for protected account paths | **ปรับ entry/runtime ตาม access policy.** Current source renders the deck signed-out and starts GSI/capture without account or network; updater is stable-only. Remaining acceptance: release-mode cold/offline checks and proof that protected account operations still fail closed server-side. |
| MVP-009 | P0 / M | TODO | MVP-001, MVP-002 | **ย้าย settings initialization ไป startup.** โหลด/validate settings หนึ่งจุดก่อนเริ่ม gameplay และ sync Control/Overlay/native; cold restart โดยไม่เข้าหน้า Settings คืน voice, sensitivity, persona, backend/model, privacy และ layout ครบ ไม่มี default cloud call ก่อน hydrate |
| MVP-010 | P0 / M | TODO | MVP-001, MVP-002 | **ทำ GSI setup และ port health.** แยก config exists/config valid/listening/waiting/live, แจ้ง port 3000 conflict ที่กระทบ GSI/OAuth, มี retry และเลือก/ซ่อม Dota path ที่ควบคุมขอบเขตได้; negative cases แสดงวิธีแก้โดยไม่ใช้ terminal |
| MVP-011 | P0 / M | TODO | MVP-009, MVP-010; ขั้น B รอ MVP-016, MVP-017, MVP-024 | **แทน readiness สมมติด้วยผลจริง.** ขั้น A ทำ contract/UI ที่แสดง unknown เมื่อยังไม่มี producer; ขั้น B ต่อ capture coverage/audio health จริงก่อนปิดงาน; ตรวจ resources, live GSI, overlay preview และ audible confirmation; null ไม่เป็น pass, overlay ไม่ pass ตายตัว และ Lite mode ชัด |
| MVP-012 | P0 / M | TODO | MVP-008, MVP-009, MVP-010, MVP-011 | **ตรวจ first-run และ restart ใน release mode.** บนเครื่องสะอาด/โปรไฟล์ใหม่ ทำ install→setup→deck→ปิดเปิด; ผ่าน/ขาด config, port ชน, ไม่มีเสียง, ไม่มีโมเดล และ offline แสดงสถานะตาม contract; เก็บภาพและ native logs ที่ไม่เผยข้อมูลผู้เล่น |

## E2 ข้อมูลเกมและคำเตือนที่เชื่อถือได้

**Milestone:** M2 · **บทบาทที่เสนอ:** Rust/CV + gameplay data + QA

**หลักฐาน:** [GSI parser/watchdog](../../src-tauri/src/gsi.rs#L236), [capture loop](../../src-tauri/src/capture.rs#L473), [minimap geometry](../../src-tauri/src/cv/region.rs), [Motion](../../src-tauri/src/motion.rs), [Revive](../../src-tauri/src/revive.rs#L50), [Damage](../../src-tauri/src/damage.rs), [data provenance](../../src-tauri/data/provenance.json)

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-013 | P0 / M | TODO | MVP-001, MVP-002 | **Validate GSI envelope และ fields.** JSON เสีย, null, partial และค่าผิดช่วงไม่ถูกแปลงเป็น tick ศูนย์ที่เปลี่ยนแมตช์; reject/unknown ตาม schema, ไม่ refresh last-valid timestamp และไม่ reset game/log ด้วย invalid payload |
| MVP-014 | P0 / M | TODO | MVP-013, MVP-006 | **ทำ freshness เป็นสถานะร่วม.** เมื่อ Dota ยังเปิดแต่ GSI หยุด ทุก consumer เห็น stale/degraded เหมือนกัน; หยุดข้อสรุปที่ใช้ own-state เก่า ส่วน CV-only ที่ยังเชื่อถือได้ทำตาม contract; feed กลับมาแล้ว recover โดยไม่สร้างจบแมตช์ปลอม |
| MVP-015 | P0 / L | TODO | MVP-013, MVP-014 | **สร้าง match/session identity และ lifecycle กลาง.** ใช้ game match ID เมื่อเชื่อถือได้และ local session ID เมื่อไม่มี; แยก draft/live/disconnect/end/abandon, มี session epoch ให้ events/cache/requests; reconnect ต่อ session ที่ถูกต้องและแมตช์ใหม่ไม่รับ state เก่า |
| MVP-016 | P0 / M | TODO | MVP-014, MVP-015 | **เพิ่ม capture retry/recovery.** Init failure แสดง Lite พร้อม retry ที่ไม่สร้าง thread ซ้อน; ACCESS_LOST/device reset/monitor move กู้คืนหรือ degraded ตามจริง และ reset started latch อย่างปลอดภัย; main voice/GSI ยังใช้ได้ระหว่างรอ |
| MVP-017 | P0 / L | TODO | MVP-006, MVP-016 | **กำหนดและตรวจ capture coverage.** รองรับ geometry/DPI/minimap side ตาม matrix หรือแจ้ง unsupported; Alt-Tab/desktop/เกมไม่อยู่ foreground ต้องไม่กลายเป็น minimap ปลอดภัย; readiness และ roster coverage มีหลักฐานจากภาพจริงทุก layout ที่ประกาศ |
| MVP-018 | P0 / M | TODO | MVP-014, MVP-017 | **แยก unknown, no coverage, clear และ danger.** Empty detections ไม่ยืนยัน safe; แสดงอายุข้อมูล/coverage และ label risk เป็น heuristic score จนผ่าน calibration; hysteresis/revision ยังคงทำงานและไม่ invent KDA/items ของอีก 9 คน |
| MVP-019 | P0 / M | TODO | MVP-013, MVP-015 | **แก้ buyback unknown และ mode assumptions.** Allies/base threat/game mode ที่ไม่ทราบต้องเป็น unknown ไม่ใช้ 4 คน/บ้านปลอดภัยโดยปริยาย; ไม่มีข้อมูลพอให้รายงานเฉพาะ timer/cost/affordability ที่ทราบ; ไม่พูดว่าเก็บเงินได้อย่างมั่นใจ และ narrative หมดอายุเมื่อเกิดใหม่ |
| MVP-020 | P1 / M | TODO | MVP-003, MVP-005 | **ตรวจ static gameplay data และข้ออ้าง damage.** ระบุ patch/source/date/coverage ที่พิสูจน์ได้ใน provenance, ตรวจ hero/ability/item ที่อยู่ MVP; own burst แสดง assumptions เกราะ/MR/skill build, unsupported เป็น unknown; target lethality ไม่เปิดใช้จนมี live target contract ครบ |
| MVP-021 | P0 / L | TODO | MVP-006, MVP-018, MVP-020 | **สร้างและวัด quality baseline.** ใช้ local labeled replay แยกชุด tuning กับ held-out validation วัด precision/recall/false alerts/coverage ราย scenario ตาม thresholds ที่ตกลง; เปรียบเทียบ default/tuned โดยไม่แต่ง probability; ส่วน live acceptance ส่งต่อ MVP-049 |

## E3 เสียง เหตุการณ์ และ Overlay

**Milestone:** M3 · **บทบาทที่เสนอ:** Rust audio + frontend + QA

**หลักฐาน:** [announcer](../../src-tauri/src/announcer.rs), [GSI event producer](../../src-tauri/src/gsi.rs#L247), [Overlay transitions](../../src/src/app/Overlay.tsx#L263), [audio device](../../src-tauri/src/audio.rs#L66), [TTS](../../src-tauri/src/tts.rs)

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-022 | P0 / M | TODO | MVP-015 | **ทำ event owner และ deduplication.** กำหนด stable event ID/session/priority ใน producer เดียวสำหรับ kill/death/respawn/level/mana; frontend/native ไม่ dispatch เสียงซ้ำ, banner และ pack clip อ้าง event เดียวกัน และ replay duplicate ไม่พูดซ้ำ |
| MVP-023 | P0 / M | TODO | MVP-022 | **แก้ transition consumers.** Kill banner และ auto-advice ใช้ previous tick/event ที่ไม่ถูก persona effect เขียนทับ; ครบ kill/level/death edge, reset streak/cooldown/transients ตอนเปลี่ยน session; delayed callback ไม่สร้าง UI ของเกมเก่า |
| MVP-024 | P0 / M | TODO | MVP-009, MVP-022 | **ทำ audio health และ device recovery.** เริ่มโดยไม่มี output device แล้วเสียบใหม่กลับมาพูดได้, เปลี่ยน device/mute/unmute ไม่ทำ volume สูญหาย; UI อ่านสถานะจาก native มี retry; queue ไม่เล่นคำเตือนเก่าหลัง recover |
| MVP-025 | P0 / L | TODO | MVP-006, MVP-022, MVP-024 | **ปิด critical audio path.** Prewarm danger/revision ให้พร้อมก่อน arming; cache miss/voice change มี fallback ที่วัดได้, ตรวจ HP warning ที่ยังพึ่ง WebView แล้วย้าย critical decision เข้า Rust ตาม ADR-03; วัด interrupt/revision และ audible onset ภายใต้โหลด |
| MVP-026 | P1 / M | TODO | MVP-023, MVP-024, MVP-025 | **ตรวจ pack/persona/overlay ครบ event contract.** ครบ 24 event/fallback, preview ใช้ path จริง, active pack เปลี่ยนเสียง+banner ถูกต้อง, Silent/mute/signal toggle ไม่เขียนทับกัน; overlay position/click-through และ selected persona สอดคล้องกับคำพูดจริง |

## E4 คำแนะนำและขอบเขต Cloud

**Milestone:** M3 · **บทบาทที่เสนอ:** Rust AI integration + privacy/security reviewer + frontend

**หลักฐาน:** [advice invocation](../../src-tauri/src/lib.rs#L417), [prompt/cache](../../src-tauri/src/master.rs#L51), [counter data](../../src-tauri/src/counter_advice.rs), [SLM](../../src-tauri/src/slm.rs), [Privacy UI](../../src/src/app/Control.tsx#L571)

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-027 | P0 / M | TODO | MVP-005, MVP-009 | **บังคับ outbound allowlist ใน backend.** แยก local/cloud context; CV-derived hero identities, raw logs, memory และ field ที่ไม่ได้อนุญาตไม่เข้า provider prompt; manual ask ไม่เท่ากับ opt-in ทุก field; ตรวจ serialized requests ทั้ง CLI/API และ local-only ไม่มี fallback ออก cloud |
| MVP-028 | P0 / M | TODO | MVP-009, MVP-027 | **ตรวจ backend/model readiness และ fallback.** UI/native ใช้ชื่อ Ollama model เดียวกัน มี availability/error/cost/timeout state; เครื่องไม่มี Claude/Ollama ยังใช้ alerts และ deterministic fallback ได้; offline ไม่ค้างรอจนคำตอบหมดความหมาย |
| MVP-029 | P0 / M | TODO | MVP-015, MVP-028 | **ผูก request/cache กับ context.** ใช้ request ID, session epoch, hero/backend และ freshness ที่เหมาะสม; cancel/discard เมื่อจบเกม เปลี่ยนบัญชี/โมเดลหรือบริบทตาย/เกิดที่เกี่ยวข้อง; cache 30s ไม่คืนคำตอบของคน/แมตช์ก่อน และจำกัดงานซ้อน |
| MVP-030 | P1 / M | TODO | MVP-023, MVP-029 | **ต่อ auto-advice กับ events และ budget.** Milestones/death streak ยิงครั้งเดียวตาม cooldown, quota และ opt-in; high-priority warning ชนะ, ค่า budget เสียมีพฤติกรรมที่ระบุ, ปิด auto แล้วไม่มี request ใหม่; acceptance ใช้ real effect integration |
| MVP-031 | P0 / M | TODO | MVP-008, MVP-011, MVP-020, MVP-025, MVP-027, MVP-029 | **ตรวจ manual advice ตั้งแต่ปุ่มถึงเสียง.** ตาม own-state ล่าสุดและข้อมูลที่อนุญาต, มี backend/source/age/unknown ที่จำเป็นต่อผู้ใช้; timeout/429/no-model/cancel แสดงทางออก, คำแนะนำไม่ข้าม session และไม่มี fake enemy stats/kill guarantee |

## E5 หลังจบเกม ความจำ และการปรับโมเดล

**Milestone:** M4 · **บทบาทที่เสนอ:** Rust/data + frontend + QA

**หลักฐาน:** [G-Log](../../src-tauri/src/log.rs), [History builder](../../src/src/live/buildHistory.ts), [Debrief](../../src/src/deck/Debrief.tsx), [Memory](../../src-tauri/src/memory.rs), [tuning](../../src-tauri/src/tuning.rs), [[FEAT-G-MEMORY]], [[FEAT-G-COACH]]

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-032 | P0 / M | TODO | MVP-015 | **บันทึกจบ session และผลแมตช์ตามหลักฐาน.** Log มี stable identity, complete/partial/reason, final own stats และ outcome เมื่อมี source ที่เชื่อถือได้; crash/disconnect ไม่ปลอม win/loss, reconnect ไม่สร้างแมตช์ซ้ำ; ไม่เปลี่ยน JSONL เป็น SQLite โดยไม่มีเหตุจำเป็น |
| MVP-033 | P1 / L | TODO | MVP-003, MVP-032, MVP-020 | **ทำ summary ที่ใช้ได้จริง.** History แสดง hero/time/duration/own stats/outcome ที่มี แทนการใช้ขนาดไฟล์เป็น KDA; debrief เลือก session ที่ถูกต้องและสรุปสูงสุด 3 จุดพร้อม timestamp/event evidence; ข้อมูลไม่พอให้งดข้อสรุป ไม่เดาสาเหตุการตาย |
| MVP-034 | P0 / M | TODO | MVP-032, MVP-005 | **ทำ Memory aggregates ที่ตรง source.** ต่อ result writer เข้ากับ reader เดิม, บันทึก schema/source/freshness/coverage; favorite hero/GPM/XPM/win rate คำนวณเฉพาะข้อมูลที่มีและไม่รวม partial อย่างผิดความหมาย; MMR/death hotspots/style ที่ไม่มี source คง unknown |
| MVP-035 | P0 / M | TODO | MVP-034 | **ทำหน้าดูและลืมความจำ.** เชื่อม get_player_memory/delete_player_memory, อธิบายขอบเขต local device และการแยก memory จาก log archive; forget สำเร็จแล้ว restart/recompute ไม่ดึงข้อมูลก่อน cutoff กลับมา, malformed marker fail closed; กำหนด semantics เมื่อเปลี่ยนบัญชีไม่ให้สับสนว่าเป็น cloud sync |
| MVP-036 | P0 / M | TODO | MVP-005, MVP-027, MVP-029, MVP-034, MVP-035 | **ใช้ Memory ในคำแนะนำ local จริง.** G-Master/G-Voice local path รับ bounded aggregates กับ unknown; แสดงตัวอย่างคำตอบที่อ้างข้อมูลถูกต้อง; cloud path ไม่ serialize memory แม้เป็น aggregate จนมี policy ใหม่ที่อนุมัติ และ forget มีผลต่อ request/cache ถัดไป |
| MVP-037 | P1 / M | TODO | MVP-021, MVP-032 | **ทำ tuning workflow ที่ตรวจสอบและย้อนกลับได้.** ใช้ replay_fit/validation/persistence เดิม, แสดงแหล่ง profile และผลเทียบ baseline; FULL evidence ขั้นต่ำตาม existing validator, ไม่ apply partial/non-improving fit; มี reset/rollback และพิสูจน์โหลด profile ที่อนุมัติในแมตช์ถัดไป |

## E6 G-Voice สนทนาสองทาง

**Milestone:** M5; design spike เริ่มหลัง M0 · **บทบาทที่เสนอ:** Rust audio/STT + AI integration + frontend + QA

**หลักฐาน:** [[FEAT-G-VOICE]], [[software-requirements-specification]] §3.7, [audio](../../src-tauri/src/audio.rs), [runtime commands](../../src-tauri/src/lib.rs)

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-038 | P0 / L | TODO | MVP-003, MVP-005, MVP-006 | **ออกแบบและประเมิน local STT.** เลือก mic/STT dependency และ model จาก Thai/English corpus, วัด cold/warm latency/RAM พร้อม license/size/resource delivery; ระบุ PTT key ใหม่ที่ไม่ชน Alt+M, privacy/retention และ lifecycle; ไม่ใช้ cloud STT หรือดาวน์โหลด model เงียบ ๆ เพื่อเลี่ยงงบ ดู [[MVP-038-local-stt-evaluation]] — กำหนด protocol แล้ว แต่ยังไม่มีผลวัดหรือ candidate ที่เลือก |
| MVP-039 | P0 / M | TODO | MVP-038, MVP-024 | **ทำ PTT/mic lifecycle.** กดค้างเริ่มรับเสียง ปล่อยหยุด, มี listening indicator/device selection/permission error; ไม่ always-on, hotkey focus/เกม/อุปกรณ์หลุดไม่ค้างอัด และปิดแอปแล้วปล่อย device |
| MVP-040 | P0 / L | TODO | MVP-039 | **เชื่อม local STT และผลที่ไม่แน่ใจ.** Audio buffer มีขนาด/อายุจำกัด, Thai/English transcription ผ่าน corpus และ thresholds จาก MVP-006; silence/low confidence ขอพูดใหม่โดยไม่สร้างคำถามมั่ว, cancel ล้าง transient audio และไม่ส่ง audio ออกเครือข่าย |
| MVP-041 | P0 / L | TODO | MVP-040, MVP-029, MVP-036 | **ต่อ conversation turn.** PTT→STT→latest permitted context→local/cloud route ตาม policy→text/TTS, มี turn ID, single-flight/backpressure และ cancel; คำตอบสั้นตาม persona, Memory ใช้เฉพาะ local branch, no-model/timeout ยังมีทางออกชัดเจน |
| MVP-042 | P0 / M | TODO | MVP-041, MVP-025, MVP-031 | **ตรวจ Voice interruption และ privacy.** G-Signal ขัดคำตอบได้ตามงบ, interrupted turn ไม่กลับมาพูดข้อมูลเก่า; offline/mic unplug/STT error/end-match ผ่าน matrix, transcript/audio cleanup ทำจริง, วัด response ตาม contract ≤2s และรายงาน cold/warm แยก; ถ้าทำไม่ได้ต้องแก้ design/requirement ผ่าน owner |

## E7 Account และเส้นทางเว็บที่ MVP ยังใช้งาน

**Milestone:** M1 ตาม access decision · **บทบาทที่เสนอ:** Account/security + frontend/web + owner/legal ตามขอบเขต

**หลักฐาน:** แพตช์บน main `56f9fbd1`, [auth](../../src/src/auth.ts), [runtime](../../src-tauri/src/runtime.rs), [IAM runtime](../../supabase/functions/_shared/iam_runtime.ts), [Google predicate](../../supabase/functions/_shared/entitlement.ts), [landing routes](../../landing/src/main.tsx), [CR-034 plan](../operations/EXEC-PLAN-CR-034-iam-remediation.md)

งาน E7 เป็น C-3/HIGH เมื่อเปลี่ยน authentication/authorization/provider/schema ต้องต่อจาก approved CR-034 decision และ threat model/RLS/rollback ที่เกี่ยวข้อง การตรวจประวัติ deploy ไม่แทน live verification

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-043 | P0 / M | CONDITIONAL | MVP-001, MVP-002, MVP-004 | **ตรวจ auth remediation หลัง integration.** ทดสอบ local sign-out เมื่อ remote ล่ม, account switch และ delayed auth refresh; local credential cleanup กับ remote revoke แสดงคนละผลอย่างถูกต้อง. Sign-out must not lock the local gameplay runtime; protected account actions continue to rely on server authorization. |
| MVP-044 | P0 / L | CONDITIONAL | MVP-004, MVP-043 | **ปิด Google-session/revocation contract.** ตรวจ sign-in method ของ session และ revocation ทุก privileged endpoint ที่ยังใช้; admin AAL2 ต้องมีทาง enrollment/operation ที่อนุมัติหรือไม่เปิด surface นั้น; probe RLS/role/session กับ production ต้องมีขอบเขตและ approval ไม่ใช้ linked-provider metadata เป็นหลักฐานแทน session method |
| MVP-045 | P0 / M | NOT_APPLICABLE | MVP-004 | **Local desktop ไม่ต้องมี Terms/account/download gate.** Protected account services continue to enforce their own server authorization; do not add a local receipt or download gate through this task. |

หาก account ยังเปิดให้ใช้แบบ optional งาน E7 ที่เกี่ยวข้องยังต้องผ่านก่อน expose เส้นทางนั้น การเลือก local core ไม่ได้ทำให้ auth ที่ยังมองเห็นอยู่ได้รับการยกเว้นโดยอัตโนมัติ

## E8 ตรวจรับและส่งมอบ MVP

**Milestone:** M6; baseline/instrumentation เริ่มได้ก่อน · **บทบาทที่เสนอ:** QA + release engineer + owner

**หลักฐาน:** [updater](../../src/src/useAppUpdate.ts), [governor](../../src-tauri/src/governor.rs), [perf harness](../../tests/perf/README.md), [CI](../../.github/workflows/ci.yml), [[releases/README]], [[release-channel-architecture]]

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-046 | P0 / M | TODO | MVP-004, MVP-015 | **ทำ update ที่ไม่ขัดแมตช์.** ตรวจ/ดาวน์โหลดได้ตาม policy แต่ install/relaunch รอจบเกม; สถานะผิดพลาด/retry/channel/locked-user recovery ชัด, ทดสอบ signed manifest/platform และ rollback; ไม่เพิ่ม path ที่ bypass signature |
| MVP-047 | P0 / M | TODO | MVP-012, MVP-026, MVP-038, MVP-040 | **ตรวจ resource packaging และ clean install.** Model/labels/default voice/cache/GPU sidecar และ STT resources ที่เลือกมีครบหรือ provision ด้วยขั้นตอนที่ตกลง; รอ STT integration จริงก่อนปิด packaging; ตรวจ Windows/WebView prerequisite, install/upgrade/uninstall/data retention; missing/corrupt asset ให้ actionable error |
| MVP-048 | P0 / L | TODO | MVP-002, MVP-006; ผลสุดท้ายหลัง MVP-025, MVP-042 | **วัดและแก้ NFR ทั้งระบบ.** เริ่ม baseline เร็ว, วัด acquisition→audible onset รวม cold/cache-miss/interrupt/throttle; วัด process tree, peak RAM, STT/SLM และ PresentMon Dota FPS แบบ A/B บน matrix; ผ่าน ≤250ms p50/ทุก sample ≤300ms, whole-app process group CPU≤10% normalized by logical CPU capacity ต่อ sample 1 วินาที, RAM≤400MB, FPS drop≤3% หรือกลับไปแก้ design; SKIP ไม่ใช่ PASS |
| MVP-049 | P0 / L | TODO | MVP-006, MVP-012, MVP-021, MVP-026, MVP-031, MVP-033, MVP-035, MVP-037, MVP-042, MVP-046, MVP-047 | **รัน player journey และ fault matrix.** Fresh install→match→summary→restart→next match รวม GSI loss, malformed payload, alt-tab, capture/device/network failure, unknown data, crash/reconnect และ live alert accuracy; มี expected/actual, defect IDs, exact build และ local evidence ทุก scenario |
| MVP-050 | P0 / M | TODO | MVP-005, MVP-027, MVP-035, MVP-041 | **ตรวจ privacy/no-egress ที่ runtime.** เก็บ outbound destinations/payload fields ของ CLI/API/Ollama/account paths ด้วยข้อมูลทดสอบที่ไม่ระบุตัวบุคคล; local-only, non-consented fields, CV/raw logs/Memory และ transient mic data ไม่มี egress ที่ห้าม; forget/retention/diagnostic redaction ผ่าน |
| MVP-051 | P0 / M | TODO | MVP-001, MVP-002, MVP-006 | **ทำ verification matrix และ CI coverage.** Rust/clippy/eslint/tsc/Vitest/native smoke รวม landing/Deno/SQL เมื่อพื้นที่นั้นอยู่ใน scope; suites มี timeoutและแยก headless/live/manual gates, required check ชี้ exact SHA; doc graph/ledger ใช้ผลจริง ไม่มี disable check เพื่อผ่าน |
| MVP-052 | P0 / M | TODO | MVP-001–051 ทุกงานที่อยู่ใน scope; MVP-043–045 ต้องผ่านถ้า exposed | **ปิด acceptance และเตรียม release decision.** รวบรวม scope matrix ที่ไม่มี P0/P1 required ค้าง, known limitations, installer hash, CI/native/live/NFR/privacy evidence และ rollback; งาน conditional ที่ไม่ใช้ต้องมี scope decision อ้างกลับได้; owner ตรวจ Go/No-Go และอนุมัติช่องทาง; bump/tag/candidate/promote เฉพาะเมื่อสั่ง release และ main CI ของ SHA นั้น green |

## E9 หลัง MVP และงานคนละผลิตภัณฑ์

**สถานะ:** ไม่อยู่ใน critical path ของ player MVP เว้นแต่ scope decision ระบุเพิ่ม ห้ามนำงานกลุ่มนี้กลับมาเป็นเงื่อนไขเปิด MVP โดยไม่มีเหตุผลและการตัดสินใจ

| ID | P / Size | สถานะ | Depends on | งานและเงื่อนไขกลับมาทำ |
| --- | --- | --- | --- | --- |
| MVP-053 | P2 / L | DEFERRED | MVP-052 + economy/legal decision | **Store/payment/credits go-live.** ตรวจ provider/webhook/idempotency/reconciliation/refund และ consent ครบก่อนเปิด package; ไม่มีการเปิดชำระเงินจาก roadmap นี้ |
| MVP-054 | P2 / L | DEFERRED | MVP-020 + target-data contract | **Live target damage/kill window.** ต่อ enemy HP/armor/MR/level ที่สังเกตได้จริงเข้า snapshot merger; stale/missing ไม่ให้ kill call และมี accuracy evidence ก่อนประกาศ capability |
| MVP-055 | P2 / L | DEFERRED | MVP-017 + roster/OCR scope | **Draft portraits และ OCR เต็มรูปแบบ.** จัดทรัพยากร/coverage/license และ live consumers; ไม่ตั้ง MVP ให้ต้องได้ roster 10 คนหรือ enemy economy ก่อนมีข้อมูลที่เชื่อถือได้ |
| MVP-056 | P2 / L | DEFERRED | MVP-026 + voice-quality evidence | **Piper ขั้นสูงและ audio slot splicing.** พิสูจน์คุณภาพไทย/latency/packaging ดีกว่าชุดเสียงที่ MVP ใช้อยู่ โดยไม่เพิ่ม hot-path stall |
| MVP-057 | P2 / L | DEFERRED | MVP-027, MVP-029 + provider decision | **G-Mind หลาย cloud providers.** เพิ่ม provider เมื่อมีเหตุผลเรื่องคุณภาพ/ต้นทุนและ contract/payload parity ครบ ไม่เปลี่ยน G-Signal path |
| MVP-058 | P2 / L | DEFERRED | MVP-033, MVP-034 + data sources | **G-Coach วิเคราะห์ลึกและ Memory ขั้นสูง.** Death causes/positioning/MMR/style ต้องมีแหล่งข้อมูลและ evidence; ยกระดับจาก summary ขั้นต่ำโดยไม่อนุมานสิ่งที่สังเกตไม่ได้ |
| MVP-059 | P2 / L | DEFERRED | MVP-052 + feature-specific decisions | **G-Stream/G-Score/marketplace.** แตกเป็น feature specs และ task ชุดใหม่ก่อน implementation; privacy/redaction/music rights/resource budget ต้องครบ |
| MVP-060 | P2 / L | DEFERRED | MVP-044 + C-3/HIGH approval | **GID Shield/recovery/public profiles.** Threat model, private RLS, consent/rate limits, recovery/rollback และ owner approval ก่อน schema/provider/UI; ไม่ผูกกับ MVP local gameplay |
| MVP-061 | P1 / M | DEFERRED | G-Orchestra owner decision | **ขอบเขตเข้าถึง G-Orchestra management server.** อยู่คนละผลิตภัณฑ์; กำหนด loopback/caller authorization/Origin และตรวจ mutation endpoints ก่อนเปิดใช้ในเครือข่าย ไม่ deploy ร่วม player app และไม่บังคับ player MVP รอหากไม่ expose |
| MVP-062 | P2 / M | DEFERRED | MVP-052 + explicit launch decision | **Public campaign และการขยายการแจกจ่าย.** ทำเมื่อเจ้าของเลือกแผนหลัง MVP ผ่าน พร้อม scope, dates, and release evidence ที่ได้รับอนุมัติ |

## แผนที่ flow ไปยัง task

| Flow | Tasks ที่ปิดช่องว่าง |
| --- | --- |
| Download/install/access/offline | MVP-004, MVP-008, MVP-043–047 |
| Boot/settings/setup/readiness | MVP-009–012 |
| Draft/live feed/invalid/stale/session | MVP-013–015, MVP-017–018 |
| Capture init/alt-tab/layout/recovery | MVP-016–018 |
| Risk/alerts/buyback/damage | MVP-018–021, MVP-025 |
| Persona/announcer/banner/voice devices | MVP-022–026 |
| Manual/auto advice, cloud/local fallback | MVP-027–031 |
| End/disconnect/log/history/debrief | MVP-015, MVP-032–033 |
| Memory view/use/forget | MVP-034–036 |
| Replay/tuning/next-match profile | MVP-021, MVP-037 |
| PTT/STT/conversation/interruption | MVP-038–042 |
| Auth/Terms/session revoke | MVP-043–045 |
| Update/resources/performance/privacy/release | MVP-046–052 |
| Economy/advanced companion/tooling/campaign | MVP-053–062 |

## ชุดงานแรกที่หยิบได้

1. `MVP-001` และ `MVP-002` เริ่มได้ทันที; บันทึกผลและข้อจำกัดก่อนแก้ product code
2. เตรียม decision records ของ `MVP-003–006` ให้ owner ลงข้อสรุป; งาน setup/settings ที่ไม่ขึ้นกับ access decision ทำต่อได้เมื่อ baseline พร้อม
3. `MVP-009`, `MVP-010`, `MVP-013` เป็น implementation slices แรกหลัง prerequisites ครบ
4. ต่อ `MVP-011`, `MVP-014–015`, `MVP-019`, `MVP-022–024` ตาม dependency ไม่เปิดงานกระจัดกระจายทุก epic พร้อมกัน
5. เปิด design spike `MVP-038` และ performance/CI baseline `MVP-048`, `MVP-051` เมื่อ M0 พร้อม เพื่อพบปัญหา resource แต่ต้น

## แบบบันทึกเมื่อเริ่มหรือปิด task

```text
Task ID / issue:
Assignee / reviewer:
Approved contract / policy decision:
Source baseline SHA:
Scope / non-goals:
Dependencies and their evidence:
Acceptance scenarios (expected -> actual):
Implementation PR / exact SHA:
Verification commands, environment, exit codes:
Native/WebView/live evidence and artifact hashes:
Known limitations / rollback:
Owner acceptance / date:
Status:
```

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.3.6 | 2026-10-18 | Removed obsolete handoff wording; desktop startup stays local and protected account services keep separate server authorization. |
| 0.3.5 | 2026-10-18 | Refreshed account-optional access planning and removed retired distribution paths. |
| 0.3.4 | 2026-10-18 | Recorded desktop local-core startup implementation and remaining release-mode/offline/revoke acceptance. |
| 0.3.5 | 2026-10-18 | Refreshed account-optional access planning and removed retired distribution paths. |
| 0.3.3 | 2026-10-16 | Removed retired local review integration and related references. |
| 0.3.2 | 2026-10-12 | Aligned MVP-048 CPU acceptance with the approved 10% whole-app process-group budget and one-second sampling decision. |
| 0.3.1 | 2026-10-11 | Linked MVP-038's candidate-neutral evaluation protocol and kept the task open until measurements and a candidate decision exist. |
| 0.3.0 | 2026-10-10 | บันทึก delegated decisions MVP-003–006 และรับ baseline MVP-001/002; desktop account/download gate 045 ไม่อยู่ใน scope ตาม mvp-decisions |
| 0.2.0 | 2026-10-10 | เพิ่ม execution DAG/waves; แยก baseline/readiness/performance/CI เป็นขั้น A/B โดยคง parent IDs; เพิ่ม producer, access และ STT packaging dependencies ที่จำเป็นต่อการทำงานขนาน |
| 0.1.0 | 2026-10-10 | แตก roadmap M0–M6 เป็น 52 MVP tasks และ 10 deferred/separate-product tasks พร้อม priority, size, status, dependencies, source links และ acceptance; คง Voice/Memory ตาม SRS และบันทึก policy/security/release gates |
