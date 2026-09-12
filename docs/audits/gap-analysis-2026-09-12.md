---
title: "G-Maiden: Codebase and Documentation Gap Analysis — 2026-09-12"
doc_id: "gap-analysis-2026-09-12"
status: "historical"
version: "0.1.1"
updated: "2026-09-12"
owner: "Boss"
related_docs:
  - "software-requirements-specification"
  - "product-requirements"
  - "CR-034-gid-iam-production-completion"
  - "EXEC-PLAN-CR-034-iam-remediation"
---

# G-Maiden — Gap Analysis

วันที่ตรวจ: **2026-09-12** · source baseline **a4a75542c857beaac68267b90e16707ad3263a45** · app **0.13.2** · ผู้วิเคราะห์ **RWANG**.

ขอบเขตงานวิเคราะห์: **C-2 / LOW**, เอกสารและ read-only/isolated verification. ความเสี่ยงของการแก้แต่ละเรื่องระบุแยก ไม่ใช่การอนุมัติ implementation. ใช้ [llms-full.txt](../../llms-full.txt) เป็นแผนที่ค้นหา และกลับไปตรวจ source/requirements ทุกข้อสำคัญ.

## 1. ข้อสรุปสำหรับตัดสินใจ

**มีระบบ companion หลักและเส้นทางใช้งานจำนวนมากแล้ว แต่ยังไม่ควรสรุปว่า “ครบ SRS” หรือ “production-ready ทั้งระบบ” จาก code presence หรือ CI สีเขียวเพียงอย่างเดียว.**

การตรวจนี้บันทึก **23 gaps: P1 8 ข้อ, P2 13 ข้อ, P3 2 ข้อ** โดยเป็นรายการที่เลือกตามผลกระทบ ไม่ใช่จำนวน functional requirements ทั้งหมด. ไม่คำนวณเปอร์เซ็นต์ความครบถ้วน เพราะยังไม่มี denominator และเกณฑ์ถ่วงน้ำหนักที่ตกลงกัน.

1. **จัดการ failure-state และ security contract ก่อนขยายการใช้งาน:** sign-out cleanup, expired-grace UI/native mismatch, session-method validation, revocation coverage และ AAL2 enrollment.
2. **แยก developer-tool exposure จาก player runtime:** G-Orchestra มี write/dispatch HTTP routes แต่ server ไม่ระบุ loopback host และไม่เห็น caller-auth guard ใน request handler.
3. **ปิดช่องว่างของหลักฐาน:** per-PR CI ไม่ครอบคลุมทุก workspace/DB boundary; headless perf pass ไม่เท่ากับ live capture/audio/FPS acceptance.
4. **ฟีเจอร์ที่ยังขาดตาม SRS:** Voice สองทาง, persistent Memory และ Coach แบบวิเคราะห์จังหวะตัดสินใจ รวมถึง Motion/Master/Log ที่ยังทำได้บางส่วน.
5. **แก้ความหมายใน docs:** feature ledger ที่ aligned อาจแปลเพียงว่าตรงกับ manifest ที่ map ไม่ครบ; ไม่ได้ยืนยันว่าเอกสารสอดคล้องกับ runtime จริงทั้งหมด.

ไม่พบหลักฐานพอจะประกาศ P0 incident ที่กำลังเกิดใน production. ผลกระทบของ security gaps บางข้อขึ้นกับ provider settings, firewall, deployment และ session จริงซึ่งไม่ได้ตรวจสดในงานนี้.

## 2. วิธีประเมินและขอบเขตหลักฐาน

### Assumptions

- วิเคราะห์ทั้ง desktop, landing/Supabase, release/testing และ G-Orchestra ตามบริบท llms ก่อนหน้า.
- Snapshot Git ยังเป็น baseline เดิม; llms สองไฟล์จากงานก่อนยังเป็น uncommitted artifacts และถูกเก็บไว้.
- ไม่ใช้คำว่า “มีไฟล์แล้ว” แทน “รันสำเร็จ”, ไม่ใช้ mock แทน production evidence และไม่เปลี่ยน approval/task-state ของ CR-034.

### แหล่งเปรียบเทียบ

- Parent: [PRD](../product/product-requirements.md), [SRS](../product/software-requirements-specification.md), [engineering spec](../architecture/engineering-spec.md), ADR-11/13/14/16/18.
- Peer: FEAT-G-* specs, CR-008/016/019/021/022/034, [CR-034 execution plan](../operations/EXEC-PLAN-CR-034-iam-remediation.md), release-channel docs.
- Implementation: native command/HTTP registries, React routing/builders/auth, all 13 Edge Function entrypoints, migration/test inventory และ workflows.
- Historical context: [audit 2026-08-26](gap-analysis-prd-srs-vs-impl-2026-08-26.md). ไม่แก้ย้อนหลังหรือยืมเปอร์เซ็นต์/ผลทดสอบจากรายงานนั้นมาเป็นผลปัจจุบัน.

Evidence classes: **S** = source/contract ตรวจตรง, **P** = isolated execution จาก source จริงด้วย mocks, **H** = เอกสารรายงานอดีต, **U** = ยังไม่มี live verification สำหรับข้อสรุปนั้น. Negative finding หมายถึงไม่พบ runtime path ในขอบเขต source/callers ที่ตรวจ ไม่ได้อ้างว่าไม่มีแนวคิดหรือ prototype ในทุก repo ภายนอก.

Priority ในรายงาน: **P1** แก้หรือมี risk decision ก่อนขยาย release/exposure; **P2** วางแผนปิดเพื่อให้ตรง product contract; **P3** จัดการตาม milestone/การดูแลเอกสาร. Priority นี้ไม่ใช่ SRS backlog priority; G-Voice/G-Memory ยังคงเป็น P0 ตาม SRS แต่ยังไม่ถือเป็น production incident.

## 3. ภาพรวม 12 โมดูลตาม SRS

| โมดูล | สถานะจาก source | ส่วนที่มีแล้ว / ส่วนที่ยังขาด | Gap |
| --- | --- | --- | --- |
| G-Sentry | Implemented with constraints | missing detection จาก CV + confirm gates; source/cadence ต่างจาก GSI wording ใน SRS; ต้องมี capture | GAP-18, GAP-20 |
| G-Motion | Partial | history + heading-aware risk; ไม่มี route/heatmap model ตามตัวอย่าง SRS | GAP-12 |
| G-Signal | Implemented with verification gap | Alert/Revision, interrupt, sensitivity; ยังต้องผูกหลักฐาน live กับ release | GAP-07 |
| G-Master | Partial | Claude/Ollama + own data/counter text; enemy economy ไม่ได้สังเกตจาก own-game GSI | GAP-13, GAP-16 |
| G-Sensory | Implemented with constraints | DXGI/overlay/governor; Lite mode และ device/performance acceptance ต้องชัด | GAP-07, GAP-18 |
| G-Log | Partial | local JSONL, event timeline, replay/fit utility; ไม่มี workflow นำ fit result ไปใช้แบบตรวจสอบย้อนกลับครบวงจร | GAP-14 |
| G-Voice | Missing end-to-end path | เสียงออกและ announcer ไม่ใช่ STT/PTT conversation | GAP-09 |
| G-Memory | Missing product path | logs/OpenDota ไม่ใช่ local persistent player-memory retrieval/injection | GAP-10 |
| G-Coach | Partial foundations | history/insights มีข้อมูล แต่ไม่มี decision-point analysis + top 3 improvements ตาม SRS | GAP-11 |
| G-Mind | Partial / documented deviation | Auto/Claude/Ollama selector; ไม่มีหลาย cloud providers/Gemini ตาม expanded contract | GAP-16 |
| G-Persona | Partial across surfaces | มี presets และ voice behavior; advisor prompt คงที่และยังไม่พิสูจน์ continuous-caster behavior | GAP-17 |
| G-Stream | Missing product path | ไม่พบ stream-wide sensitive-data masking/co-host mode ใน runtime ที่ตรวจ | GAP-22 |

ไม่มีคำว่า implemented ในตารางนี้หมายถึง “live UAT ผ่านใน session นี้”. ฟีเจอร์นอก 12 โมดูล เช่น identity/Terms/store/updater และ G-Orchestra ถูกวิเคราะห์ใน register ด้านล่าง.

## 4. Gap register — ความพร้อมก่อนขยายระบบ

### GAP-01 — Sign-out ผูก local cleanup กับ remote service success

**P1 · runtime failure behavior · S+P · risk แก้ C-3/HIGH.**

- Expected: ผู้ใช้แยกได้ว่า native ถูกล็อก, credential ในเครื่องถูกล้าง และ remote session ถูก revoke สำเร็จหรือไม่.
- Actual: [auth.ts:L124](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src/src/auth.ts#L124) เรียก security service ก่อน local sign-out ใน try เดียว; service reject ทำให้ข้าม client cleanup และ `setSession(null)`. [securitySession.ts](../../src/src/securitySession.ts) ยืนยันว่าล็อก native ก่อนแล้ว.
- Impact: “ออกจากระบบ” ไม่สำเร็จครบขั้นเมื่อ service ล่ม; ไม่ควรเรียกเหตุการณ์นี้ว่า cleanup สำเร็จ หรือสรุปว่า native ยัง unlocked.
- Close: อนุมัติ failure contract แล้วทดสอบจริงระดับ hook/adapter กับ timeout/503, provider error, DPAPI error และ native-lock failure. Local cleanup กับ remote revocation ต้องรายงานแยก; ไม่ลด authorization เพื่อแก้ availability.
- Ownership: ต่อ **CR-034 T10**; root cause/probe อยู่ใน [RCA Case A](../../.brain/rca/2026-09-12-auth-failure-state-gaps.md).

### GAP-02 — Expired grace ทำให้ UI eligible แต่ native locked

**P1 · cross-layer state mismatch · S+P · risk แก้ C-3/HIGH.**

- Expected: UI permission/readiness สะท้อน native authority; within-grace refresh ไม่ทำ UI กระพริบ แต่ expired grace ต้องแสดง unavailable/locked.
- Actual: [lib.rs:L190](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src-tauri/src/lib.rs#L190) คืน stale เมื่อ cache ยังใช้ได้ มิฉะนั้นล็อกและ Err; [gmadEntitlement.ts](../../src/src/gmadEntitlement.ts) กลืน background error เมื่อเคย eligible โดยอาศัย [gmadFirstRun.ts](../../src/src/gmadFirstRun.ts) ที่ไม่รับ native state.
- Impact: deck อาจดูอนุญาตแต่ GSI/capture/overlay ถูกล็อก; เป็น state inconsistency ไม่ใช่หลักฐาน native auth bypass.
- Close: contract tests สำหรับ cold start, valid grace, expired grace, denial, sign-out และ token rotation เชื่อม native decision ถึง rendered state. ระบุ stale-but-allowed ต่างจาก unavailable-and-locked.
- Ownership: เสนอขยาย CR-022/CR-034 ตาม approval; [RCA Case B](../../.brain/rca/2026-09-12-auth-failure-state-gaps.md). Predicate รันจริงแล้ว; native expiry integration ยังไม่ได้รัน.

### GAP-03 — “มี Google identity ผูกอยู่” ไม่เท่ากับ “session นี้ล็อกอินด้วย Google”

**P1 · conditional security contract gap · S+P+U · risk แก้ C-3/HIGH.**

- Expected: CR-034 กำหนด Google เป็น normal primary sign-in; ไม่ให้ linked provider ใช้แทน session-method proof.
- Actual: [entitlement.ts:L27](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/supabase/functions/_shared/entitlement.ts#L27) ตรวจ `app_metadata.provider/providers`; [iam.ts](../../supabase/functions/_shared/iam.ts) เรียก predicate เดียวกัน. Synthetic input `provider=email`, `providers=[email,google]` คืน true.
- Impact: predicate เพียงตัวเดียวไม่พิสูจน์ว่า session มาจาก Google. ไม่ได้ยืนยันว่า production ยังเปิด non-Google login หรือมี session ดังกล่าวอยู่ปัจจุบัน.
- Close: ตกลง session-method/provider contract แล้วทำ negative tests ของบัญชี multi-provider พร้อม controlled provider verification; ไม่มีการเดา claim semantics หรือแก้ Auth provider ในงานนี้.
- Ownership: **CR-034 D2, T7/T8**.

### GAP-04 — Live-session/revocation policy ไม่ครอบคลุม entitlement flow

**P1 · authorization coverage gap · S+U · risk แก้ C-3/HIGH.**

- Expected: ต้องกำหนดชัดว่า revoked session ใช้ queue, Terms, download และ native entitlement ได้อีกหรือไม่ ภายในเวลาเท่าใด.
- Actual: `requireIamContext` พบใน admin controller และ iam-* 3 functions; กลุ่ม mint-gid, check-gmad-queue, accept-closed-beta-terms, get-gmad-desktop-entitlement, request-gmad-download ใช้ getUser/own checks แต่ไม่ใช้ shared live-session query.
- Evidence: [IAM runtime](../../supabase/functions/_shared/iam_runtime.ts), [desktop entitlement entry](../../supabase/functions/get-gmad-desktop-entitlement/index.ts), [download entry](../../supabase/functions/request-gmad-download/index.ts).
- Impact: มี policy สองแนวทาง; ไม่ควรรับรอง immediate revocation ทั้งผลิตภัณฑ์. ไม่กล่าวว่า endpoint เหล่านี้ unauthenticated เพราะยังมี JWT/user/Terms/grant checks.
- Close: capability/session decision matrix ต่อ endpoint + revoke/reuse-token negative tests ใน isolated backend และ controlled UAT. Payment webhook เป็นคนละ provider-auth boundary ไม่ควรนับเป็น endpoint ที่ต้องมี user session.
- Ownership: **CR-034 D3, T3–T5**.

### GAP-05 — AAL2 enforcement มี แต่เส้นทาง enroll/step-up ยังไม่ครบ

**P1 · operability / incomplete dependency · S+H+U · risk แก้ C-3/HIGH.**

- Expected: ผู้มีสิทธิ์สามารถสร้าง/ยืนยัน factor เพื่อไปถึง assurance ที่ action ต้องใช้.
- Actual: [iam_runtime.ts:L199](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/supabase/functions/_shared/iam_runtime.ts#L199) default `requireAal2=true`; [admin-gmad-controller](../../supabase/functions/admin-gmad-controller/index.ts) ไม่ override. [AccountSecurity.tsx](../../src/src/AccountSecurity.tsx) แสดง factors/devices/events แต่ไม่มี enroll/step-up UI; contacts ยังระบุ Phase 2.
- Impact: ผู้มีเพียง AAL1 เข้า privileged action ไม่ได้ตาม policy. เอกสาร 2026-08-28 เคยรายงานไม่มี enrolled factors; จำนวนปัจจุบันไม่ได้ตรวจ.
- Close: owner เลือก unblock strategy โดยรักษา capability boundary และอนุมัติ MFA flow; test enroll/step-up/revoke/normal-user rejection ก่อนเปิดงานที่พึ่ง AAL2. ไม่ตั้ง false ทั่วระบบ.
- Ownership: **CR-034 D1, T1/T6**; recovery/rebind ยังเป็นระยะถัดไป ไม่ได้เสร็จเพราะมี session viewer.

### GAP-06 — G-Orchestra HTTP management ไม่มี caller boundary ที่ชัด

**P1 · conditional developer-host exposure · S+U · risk แก้ C-3/HIGH.**

- Expected: management API ที่เปลี่ยนงาน/dispatch/write knowledge ต้องมีขอบเขตผู้เรียกและการเข้าถึงตาม deployment model.
- Actual: [server.mjs:L33](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/orchestration/server.mjs#L33) ไม่เห็น authentication/Origin gate ใน request handler; POST `/api/cmd` มี dispatch/run/reset และ [listen:L139](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/orchestration/server.mjs#L139) ระบุเพียง port. Printed localhost URL ไม่ได้พิสูจน์การ bind loopback.
- Impact: caller ที่เข้าถึง socket อาจสั่ง mutation ได้; ความ reachable จากเครือข่ายจริงขึ้นกับ OS/firewall และไม่ได้ทดสอบ. Engine governance interlock ตรวจงาน ไม่ใช่หลักฐานยืนยันตัวผู้เรียก HTTP.
- Close: อนุมัติ local-only หรือ remote management contract; ทดสอบ bind, caller auth, mutation authorization และ request-origin ตามรูปแบบที่เลือก. ไม่เปิด server หรือส่งคำสั่ง dispatch เพื่อพิสูจน์ในงานนี้.
- Ownership: **G-Orchestra** แยกจาก native GSI loopback ของ G-Maiden.

### GAP-07 — ยังไม่มี acceptance bundle ครบสำหรับ current release decision

**P1 · verification gap · S+H+U · risk งานตรวจ LOW/MEDIUM, release HIGH.**

- Expected: revision/artifact ที่จะปล่อยมี measured latency, CPU/RAM/process scope, FPS impact, native install/update และ known-issues evidence ที่อ้างกลับได้.
- Actual: [perf harness](../../tests/perf/README.md) headless วัดบาง hops และแทน capture/audio ด้วย budget; [perf workflow](../../.github/workflows/perf-gate.yml) เป็น manual/advisory และ SKIP คืน job success. มี live probes/CPU/FPS harness แต่ไม่ได้รันใน session นี้.
- Impact: root CI green หรือ headless result ไม่ตอบว่าเสียงออกจริงทัน 300ms หรือ FPS drop ผ่านบนเครื่องเป้าหมาย. ไม่สรุปว่า NFR fail เพราะยังไม่วัด.
- Close: ผูก report กับ commit/artifact hash, hardware/Dota/display/audio settings, measured versus skipped hops, CPU/RAM process-tree scope, FPS baseline และ install/update result. Required live evidence ต้องไม่ถูกนับ PASS เมื่อ SKIP.
- Ownership: release owner + QA; ใช้ release-channel evidence workflow เดิม.

### GAP-08 — Per-PR verification ไม่ครอบคลุมขอบเขตทั้ง repository

**P1 · regression-detection gap · S · risk แก้ C-2/MEDIUM.**

- Expected: เมื่อแตะ auth/landing/DB/orchestration ต้องมี checks ที่ตรงกับขอบเขตที่เปลี่ยนก่อน merge.
- Actual: [ci.yml](../../.github/workflows/ci.yml) ทำ desktop/doc graph/Rust/build แต่ไม่ติดตั้งและรัน landing, Deno, SQL/RLS หรือ Orchestra suites ทั้งหมด. [ledger-verify](../../.github/workflows/ledger-verify.yml) เป็น weekly/manual และ `.test.ts` บางกลุ่มเป็น evidence-only ไม่ได้ execute.
- Impact: CI ผ่านพร้อมกับ regression นอก desktop หรือ cross-layer state gap ได้. การเพิ่ม tests ไว้เฉย ๆ ไม่ปิดช่องว่าง.
- Close: ownership/path-to-check matrix ระบุ runner/env ของแต่ละขอบเขต และทดลอง failing relevant test ให้ check ที่เกี่ยวล้มจริง; DB ใช้ isolated fixture ไม่ยิง production. ไม่จำเป็นต้องบังคับทุก suite ทุก docs-only PR.

## 5. Gap register — Product contract และความครบถ้วน

แต่ละแถวมี closure proposal เพื่อวางแผน ไม่ใช่ acceptance หรือการเริ่มเขียนโค้ดแล้ว.

| ID / Priority | Expected -> Actual และผลกระทบ | Evidence | เกณฑ์ปิด / ownership / risk |
| --- | --- | --- | --- |
| **GAP-09 / P2** G-Voice | SRS §3.7/4.2 ต้อง PTT -> STT ไทย/อังกฤษ -> advice -> voice พร้อม critical interrupt; ไม่พบ end-to-end microphone/STT path ใน desktop. Alt+M ใช้ mute อยู่แล้ว จึงมี shortcut contract conflict | [SRS](../product/software-requirements-specification.md), [lib.rs](../../src-tauri/src/lib.rs) global shortcuts/registry, [voice spec](../features/FEAT-G-VOICE.md) | ตกลง hotkey, STT/privacy และ latency class; verify Thai/English recognition, user cancel, critical preemption และไม่มี continuous recording โดยไม่ตั้งใจ. G-Voice; C-3/HIGH |
| **GAP-10 / P2** G-Memory | SRS §3.8 ต้อง local persistent player memory + retrieval/injection; logs และ public OpenDota baselines ไม่ใช่ memory pipeline นี้. ไม่พบ durable summary/retrieval ที่ป้อนเข้าคำตอบ | [master.rs::build_prompt](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src-tauri/src/master.rs#L51), [log.rs](../../src-tauri/src/log.rs), [memory spec](../features/FEAT-G-MEMORY.md) | Local schema, provenance, update/delete/retention, cross-session retrieval และ consent-boundary tests; การมี JSONL อย่างเดียวไม่ปิด. G-Memory; C-3/HIGH |
| **GAP-11 / P2** G-Coach | SRS §3.9 ต้องวิเคราะห์ decision points จาก match log + top 3 improvements; มี Insights/History แต่ไม่พบ engine ที่สร้างข้อสรุประดับจังหวะพร้อมหลักฐาน | [buildInsights.ts](../../src/src/live/buildInsights.ts), [buildHistory.ts](../../src/src/live/buildHistory.ts), [coach spec](../features/FEAT-G-COACH.md) | Golden match fixtures, output อ้าง timestamp/event, unknown handling และทำงานหลังแมตช์ไม่แย่ง gameplay budget. G-Coach; C-2/MEDIUM |
| **GAP-12 / P2** G-Motion | SRS §3.2 ขอ route/heatmap; โค้ดใช้ missing-time + heading heuristic. ไม่สามารถอ้างความน่าจะเป็นเฉพาะตำแหน่งจากตัวอย่าง SRS ว่าเป็นผลโมเดลจริง | [motion.rs](../../src-tauri/src/motion.rs), [motion spec](../features/FEAT-G-MOTION.md) | Owner เลือกยอมรับ heuristic แล้วแก้ contract หรือทำ route model ที่มี authorized data/holdout calibration; preserve uncertainty และไม่สร้าง hidden enemy feed. C-3/HIGH หากทำโมเดลใหม่ |
| **GAP-13 / P2** Enemy economy / lethal advice | SRS §3.4 ต้องเทียบเศรษฐกิจฝ่ายตรงข้าม; prompt มี own stats + counter context. OCR มี module แต่ไม่พบ live caller; model ไม่ bundle. Enemy economy จึงยังไม่ใช่ observed input | [master.rs:L51](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src-tauri/src/master.rs#L51), [gsi.rs::GameTick](../../src-tauri/src/gsi.rs), [ocr.rs](../../src-tauri/src/ocr.rs) | ตัดสิน capability boundary จากข้อมูลที่สังเกตได้จริง; optional capture/OCR ต้องมี accuracy/freshness evidence. Unknown stats ห้ามแทนด้วยตัวเลขเดา. G-Master/G-Damage; C-3/HIGH |
| **GAP-14 / P2** G-Log feedback loop | SRS §3.6 ต้องจูนเกมถัดไป; มี replay_fit แต่ capture เริ่ม Motion::new() ซึ่งใช้ default params. Offline fit ไม่ใช่ automated/adopted calibration lifecycle | [replay_fit.rs](../../tests/perf/src/bin/replay_fit.rs), [capture.rs:L250](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src-tauri/src/capture.rs#L250), [motion.rs](../../src-tauri/src/motion.rs) | กำหนด manual-reviewed หรือ automatic application policy, versioned parameters, holdout improvement, rollback และ local-only provenance. ไม่ต้องเปิด auto-learning หากยังไม่มีหลักฐาน. C-2/MEDIUM หรือ C-3/HIGH ถ้าอัตโนมัติ |
| **GAP-15 / P2** /ops และ web route contract | docs บางชุดอ้าง admin UI; source มี admin function แต่ไม่มี OpsPage/dispatch. มี client /demo,/public-demo แต่ vercel config ไม่มี rewrite จึงยังรับรอง deep link production ไม่ได้ | [landing/main.tsx](../../landing/src/main.tsx), [vercel.json](../../landing/vercel.json), [CR-018](../change%20request/CR-018-ops-route-spa-rewrite.md) | **CR-034 D4/T9** เลือกสร้าง/เลิกอ้าง /ops; ถ้าสร้างต้องมี capability tests. ตรวจ direct-navigation/refresh ของ published routes แยกจาก client render. /ops C-3/HIGH |
| **GAP-16 / P2** G-Mind scope | SRS §3.10 ระบุ cloud provider choice; source มี Auto/Claude/Ollama ไม่ใช่ multi-cloud router. Gemini ถูก SRS note ระบุ deferred แล้ว จึงไม่ใช่ provider failure | [master.rs](../../src-tauri/src/master.rs), [slm.rs](../../src-tauri/src/slm.rs), [mind spec](../features/FEAT-G-MIND.md) | ยืนยัน scope baseline หรือออก approved provider contract + fallback/timeout/privacy tests. ไม่เพิ่ม Gemini เพียงเพื่อให้เช็กลิสต์เต็ม. C-2/MEDIUM |
| **GAP-17 / P2** Persona end-to-end coverage | มี coach/silent/caster/meme presets และ critical-line variants; G-Master ยังใช้ PERSONA_PROMPT และ THROTTLE คงที่. UI copy “พากย์ต่อเนื่อง” ยังต้องมี behavioral acceptance ข้ามทุกเสียง | [Control.tsx:L464](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src/src/app/Control.tsx#L464), [master.rs:L19](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src-tauri/src/master.rs#L19), [tts.rs](../../src-tauri/src/tts.rs) | ตาราง preset x announcer/advice/critical path พร้อม observable frequency/tone; Silent ไม่ปิด critical interrupt/Revision. หรือปรับคำอธิบายให้ตรง scope ปัจจุบัน. C-2/MEDIUM |
| **GAP-18 / P2** Mode/asset readiness | DXGI Lite ไม่มี CV gank chain; draft portraits/OCR/Piper resources ไม่อยู่ใน tracked models แม้มี conditional code. คำว่า implemented ทำให้ผู้ใช้คาดว่าจะใช้ได้ทุกเครื่องไม่ได้ | [capture.rs](../../src-tauri/src/capture.rs), [models](../../models/), [tauri.conf.json](../../src-tauri/tauri.conf.json), [tts.rs](../../src-tauri/src/tts.rs) | Capability matrix ต่อ fresh install/full/Lite/model-missing พร้อม UI reason, resource license/provenance และ packaging test. ไม่ติดตั้ง model เพิ่มในงาน audit. C-2/MEDIUM |
| **GAP-19 / P2** Economy readiness | Wallet/store/functions/SQL มีแล้ว แต่ไม่มี live payment/credit evidence ใน session นี้; match-share scoring/receipt source ระบุ provisional. จึงยังรับรอง paid launch หรือ settlement correctness ไม่ได้ | [match-share-submit](../../supabase/functions/match-share-submit/index.ts), [topup-create](../../supabase/functions/topup-create/index.ts), [billing tests](../../supabase/tests/cr003_wallet_billing.sql), [go-live checklist](../change%20request/CR-003-payment-golive-checklist.md) | Isolated idempotency/concurrency/ledger tests, approved scoring/economics, provider sandbox evidence และ owner-controlled activation. ไม่ส่งเงินจริง/เปิด package เพื่อพิสูจน์. C-3/HIGH |
| **GAP-20 / P2** Docs/ledger semantic drift | AGENTS/feature map/roadmap มี paths/status เก่า; modules.json app=0.7.2; ledger G-Persona เป็น doc-only/aligned ทั้งที่มี code. “aligned” จาก incomplete manifest ไม่พิสูจน์ runtime parity | [ledger](../FEATURE-LEDGER.md), [manifest](../feature-ledger.manifest.yaml), [feature map](../../PROJECT_FEATURE_MAP.md), [llms discrepancies](../../llms-full.txt) | แก้ authoritative claims/mappings/approval provenance แล้ว regenerate; ไม่แก้ generated ledger ตรง ๆ. รักษา historical audits และแยก planned vs implemented. C-2/LOW |
| **GAP-21 / P2** Privacy/data-flow wording | Local G-Log/CV storage, cloud advice prompt, identity backend, explicit match contribution และ landing analytics มีคนละ boundary; absolute “ทุกอย่าง local” ไม่ตรงกับ call sites. ไม่พบหลักฐานว่า raw G-Log ถูก auto-upload | [master.rs::build_prompt](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src-tauri/src/master.rs#L51), [ADR-11](../architecture/adr/ADR-11-optin-data-contribution-flywheel.md), [landing analytics](../../landing/src/main.tsx) | Approved data-flow inventory ระบุ fields/destination/trigger/consent/local-only exclusions และ egress tests ตาม mode; อย่าส่ง token/ข้อมูลผู้เล่นเข้า docs. Docs C-2/LOW; เปลี่ยน egress C-3/HIGH |
| **GAP-22 / P3** G-Stream | SRS §3.12 ขอ broadcast co-host และ sensitive-field masking; ไม่พบ runtime mode ที่ครอบคลุมทั้ง deck/overlay. Privacy local-only ไม่ใช่ screen masking | [stream spec](../features/FEAT-G-STREAM.md), [SRS](../product/software-requirements-specification.md), [overlay](../../src/src/app/Overlay.tsx) | ระบุ fields/surfaces ที่ mask และ test screenshot/state; เลือก milestone ก่อนใช้คำว่า stream-ready. C-2/MEDIUM |
| **GAP-23 / P3** LLM reference assurance | llms เป็น manual snapshot; ยังไม่มี freshness automation และ CodeDoc default model ไม่ติดตั้ง. Link/schema validation ไม่เท่ากับ semantic alignment verdict | [llms verification](../../llms-full.txt), [aligner skill](../../.agents/skills/rwang-codedoc-aligner/SKILL.md) | เริ่มจาก owner/update checklist และ scoped source review ตาม diff; provisioning/model override ต้องประกาศชัด. ไม่จำเป็นต้องสร้าง generator หาก manual review เพียงพอ. C-1/LOW |

## 6. สิ่งที่มีอยู่แล้วและไม่ควรสร้างซ้ำ

- **Release first-run gate, Terms receipts และ private downloads:** มี frontend/native/function/migration paths แล้ว ต้องแก้ failure/coverage ไม่เขียน auth ใหม่ทั้งชุด.
- **Build advisor:** ใช้ real hero/inventory/advice แล้ว; lane/next item ยังแสดง unknown อย่างตั้งใจ ไม่ใช่ข้อผิดพลาดที่ควรเติม mock.
- **Voice packs และ Piper:** 24 event contract, safe archive/path helpers, fallback และ optional Piper code มีอยู่แล้ว; ช่องว่างคือทรัพยากร/acceptance ไม่ใช่เริ่ม TTS จากศูนย์.
- **G-Persona:** มี presets ใน UI/native; ledger doc-only เกิดจาก map/contract scope ไม่ครบ จึงไม่ควรสรุปว่าไม่มี feature.
- **G-Signal offline decision:** เป็น local Rust state machine อยู่แล้ว ไม่จำเป็นต้องใส่ SLM ใน hard path เพื่อทำตาม prose เก่า.
- **Release governance:** manual candidate -> channel manifest -> promotion มีอยู่แล้ว; ช่องว่างคือ evidence/completeness ของ checks ไม่ใช่ต้องแทน pipeline เดิม.
- **Schema/RLS tests และ perf harness:** มีไฟล์ทดสอบและเครื่องมืออยู่แล้ว ต้องรันใน environment ที่เหมาะสมและเชื่อมเข้า gate ไม่ควรอ้างว่าไม่มีการทดสอบเลย.

## 7. ลำดับงานที่เสนอ

ไม่ให้ประมาณระยะเวลาจนกว่าจะตกลง scope/owner และ environment; ลำดับต่อไปนี้เป็น dependency order ไม่ใช่กำหนดส่ง.

| ลำดับ | ผลลัพธ์ที่ต้องได้ | Gap / dependency | Exit criteria |
| --- | --- | --- | --- |
| 1 — Baseline/decision | Owner เลือก CR-034 D1–D4; ระบุ closed-beta/current capability promise และ developer-server exposure model | GAP-03–06, 15; ใช้ state board เดิม | Decision record ที่ระบุ scope/approval โดยไม่ปลอม live status |
| 2 — Failure contracts | เอกสาร + regression cases ของ sign-out และ expired-grace state | GAP-01/02; ต่อ T10 และเสนอขอบเขต CR-022/034 | Approved docs ก่อน code; หลังแก้ต้องมี source-level และ native/WebView integration evidence |
| 3 — Access/deployment assurance | Policy matrix, MFA path, revocation coverage, isolated tests และ controlled live probes | GAP-03–06; D1/D2/D3 และ owner live gate | Negative cases ผ่าน; ผู้ใช้/admin ทำเส้นทางที่อนุญาตได้จริง; ไม่มี blanket bypass |
| 4 — Release evidence | Path-specific CI, NFR/device/install/update evidence, model/mode readiness และ economy go-live decision | GAP-07/08/18/19 | Evidence ผูก exact artifact; SKIP ไม่ปิด required acceptance |
| 5 — Contract reconciliation | แก้ parent/peer docs + ledger mappings, privacy terms และ feature promises | GAP-12–17/20/21 | Facts/intent/status ตรงกัน, graph gate ผ่าน, history ไม่ถูก rewrite |
| 6 — Companion expansion | เลือก Voice/Memory/Coach ที่ต้องการใน milestone ถัดไป | GAP-09–11; memory privacy เป็น dependency ของ context injection | Feature acceptance + latency/resource/egress checks; ไม่ถือว่าทั้งสามอนุมัติจาก audit นี้ |
| 7 — Later scope | Stream mode และ reference-maintenance process ตามความจำเป็น | GAP-22/23 | Claims ตรง capability; ไม่สร้าง automation ที่ยังไม่มีเหตุจำเป็น |

**ไม่เสนอแก้หลายเรื่องพร้อมกันใน PR เดียว.** Security/runtime, developer-tool security, CI, documentation reconciliation และ product expansions ควรมี owner และ review scope แยกชัด.

## 8. ผลตรวจที่รันในงานนี้

### Isolated probes — ใช้ source จริง, mocked dependencies

Node `v24.19.0`; ไม่มี network/account calls:

1. Import `isGoogleIdentity` แล้วส่ง synthetic metadata `provider=email, providers=[email,google]` -> **true**. ยืนยันความหมาย predicate ไม่ใช่ hosted login exploit.
2. Execute callback signOut จาก auth.ts จริงร่วมกับ helper จริง; mock security service ให้ throw -> **native lock ถูกเรียก, provider local sign-out และ setSession(null) ไม่ถูกเรียก**.
3. Import `shouldSurfaceRefreshFailure(true,true)` -> **false**. เทียบกับ Rust expiry Err branch เพื่อระบุ cross-layer gap; ไม่อ้างว่าได้รัน native expiry integration.

สาม probes ผ่าน assertions ของพฤติกรรมที่สังเกตได้. “ผ่าน” หมายถึง reproduce behavior ตรง source ไม่ใช่ app acceptance ผ่าน.

### Documentation verification

รัน `node tools/doc-graph/ci-gate.mjs` หลังเพิ่มรายงานและตรวจลิงก์/line anchors/metadata/version. Generated graph/index outputs ที่เปลี่ยนจากเอกสารใหม่ส่งมอบพร้อมกัน.

| Check | ผลและขอบเขต |
| --- | --- |
| Doc-graph CI wrapper | **PASS, exit 0**; unit suite 215 tests ใน 18 files; encoding/ledger/orphan checks ผ่าน |
| Raw strict graph | **exit 1**; scanner รายงาน 217 violations / 161 scanner-blocking items. ในจำนวนนี้มี severity=error 14 ข้อ ซึ่ง wrapper ยอมรับตาม checklist ครบ 14 และ uncovered=0. ไม่ใช่ graph ที่ปราศจากปัญหา |
| เทียบ baseline graph | รายการ violations ทั้งชุดเท่ากับ HEAD เดิม; audit นี้ไม่เพิ่ม violation. เพิ่มเอกสารจาก 145 เป็น 146 และ nodes จาก 270 เป็น 271 |
| Local source/document references | 81 local links และ 17 line anchors ใน audit + RCA ตรวจ path/ช่วงบรรทัดครบ |
| Gap identifiers | GAP-01 ถึง GAP-23 ครบ ไม่ซ้ำเป็น gap ใหม่จากการอ้างข้ามส่วน |
| Code-Doc Aligner | **INDETERMINATE, process exit 2** ที่ preflight เพราะ default Mellum model ไม่อยู่ใน Ollama; ไม่แทนโมเดลโดยไม่ประกาศและไม่อ้าง semantic alignment ผ่าน |
| Diff scope | เพิ่ม audit/RCA และ regenerate graph artifacts 6 ไฟล์; application source/tests/version และ llms เดิมไม่เปลี่ยนในงานนี้ |

Graph-wrapper PASS เป็น structural gate ภายใต้ข้อยกเว้นเดิม ไม่ได้หักล้าง GAP-20 เรื่อง semantic/registry mapping และไม่ได้แทน live acceptance.

### สิ่งที่ไม่ได้ยืนยัน

ไม่ได้รัน full Rust/Vitest/Deno/SQL suites, live Dota/capture/audio/FPS, actual sign-in/sign-out/revocation, hosted CI, payment sandbox/live, production migrations/provider settings หรือ release updater E2E. ประวัติ production ใน execution plan ลงวันที่ 2026-08-28 และอาจเปลี่ยนแล้ว. งานนี้ไม่มี code fix, deployment, commit หรือ push.

## 9. Review boundary

รายงานนี้ใช้เลือกงานและอนุมัติ scope เท่านั้น. ยังไม่แก้ SRS, feature manifest, CR-034 decision/task-state หรือ production configuration. ก่อนแก้ application code ให้จัดทำ/อนุมัติ docs ที่ปิด contract ของ slice นั้นตาม R5; bugs ที่ยืนยันกลไกแล้วมี RCA ใน `.brain/rca/` ตาม R6.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-12 | วิเคราะห์ 23 gaps จาก source/requirements พร้อม priority, evidence, closure criteria, ownership และ RCA ของสอง auth failure-state cases; ไม่มี application code change. |
| 0.1.1 | 2026-09-12 | Pin historical source line references to the audited commit after local remediation moved/removed source lines; findings remain the original audit snapshot. |
