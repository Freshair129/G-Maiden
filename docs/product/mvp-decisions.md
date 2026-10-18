---
title: "G-Maiden MVP — Scope, Access, Data and Quality Decisions"
doc_id: "mvp-decisions"
status: "accepted"
version: "0.3.3"
updated: 2026-10-18
owner: "Boss"
approved_by: "Boss — explicit owner instruction in conversation"
approved_date: "2026-10-13"
approval_basis: "Owner instructions: ปรับ cpu ไม่เกิน 10%; หยุดเปิดแอปหากตั้ง CPU Job Object ไม่สำเร็จ"
related_docs: ["roadmap", "mvp-backlog", "mvp-execution-dag", "software-requirements-specification", "FEAT-G-VOICE", "FEAT-G-MEMORY"]
---

# มติสำหรับเริ่มพัฒนา MVP

**อำนาจตัดสินใจ:** Owner สั่ง “ตัดสินใจเลย” หลังได้รับข้อเสนอ access/privacy และ scope/quality ในบทสนทนานี้ วันที่ 2026-10-10. Codex เลือกและบันทึกมติด้านผลิตภัณฑ์/วิศวกรรมตามการมอบหมายนี้; ไม่อ้างว่าเป็นการรับรองจากที่ปรึกษากฎหมายหรือการอนุมัติ release.

มตินี้ปิดงานกำหนด contract MVP-003–006 และรับ baseline MVP-001/002 ที่ผ่านการตรวจแล้ว. Implementation และ live acceptance ยังคงต้องทำตาม [[mvp-backlog]]; ไม่มีการนับฟีเจอร์ว่าใช้งานได้จากการยอมรับเอกสาร.

## MVP-003 — ขอบเขต

- **Companion MVP:** คง Voice P0 + Memory P0, GSI/CV/Signal, overlay/audio, manual advice, local history และ summary. Summary ไม่เกิน 3 จุดต่อ complete session พร้อม event/timestamp; partial session ไม่เดา win/loss หรือ death cause.
- Windows x64: เป้าหมายตรวจรับ Windows 10 build 19045 และ Windows 11 build 26100. รุ่นอื่นยังไม่มีคำรับรองจนมี evidence ของตน; เป้าหมายนี้ไม่ใช่ผล compatibility test.
- Initial game matrix: live 5v5 All Pick, Ranked/Unranked. Turbo/custom/spectator/replay เป็น unsupported สำหรับข้อสรุปที่ขึ้นกับโหมด; ไม่ใส่ค่า default ให้ดูเหมือนรู้โหมด.
- Initial CV matrix: 1920×1080, 16:9, จอหลักหนึ่งจอ, 100% DPI, default HUD/minimap ล่างซ้าย, borderless-fullscreen. 1440p/DPI อื่น/ultrawide/multi-monitor/custom minimap ต้องผ่าน calibration และ evidence ก่อนขยาย certified matrix. GSI-only Lite mode ยังมี local core; empty/no coverage ไม่เท่ากับ safe.
- Own-player fields ใช้เฉพาะ GSI ที่ valid; อีก 9 คนไม่สมมติ KDA/items. CV รับรองเฉพาะ hero classes ที่ผ่านเกณฑ์ราย class และบันทึก model/labels hashes; ยอมรับ coverage แบบค่อยเพิ่ม แต่ก่อน release ต้องแสดงรายการ supported/unknown จริง.
- คง Alt+M เป็น mute; PTT เลือก **Ctrl+Alt+V** เป็นค่าเริ่มต้นใน MVP-038 พร้อมตรวจ hotkey conflict และ remap ได้. ไม่มี always-on mic.
- MVP-053–062 เลื่อนตาม backlog; Store/payment, GID Shield/recovery/public profiles, deep Coach และ public campaign อยู่หลัง MVP.

## MVP-004 — Access/offline และขอบเขต account

| Input | มติ |
| --- | --- |
| account_gate_required | false |
| account_surface_exposed | true |

Local core เริ่มได้ใน release/dev โดยไม่มีบัญชี, Google session, entitlement หรือ network. บัญชีเป็น optional และ Google เป็น primary sign-in เดียว; GID/Steam ไม่ใช่ credential/recovery. Account-only operations ยังตรวจ identity/สิทธิ์บน server. MVP-043/044 ยัง applicable เพราะ account surface ยังเปิดอยู่.

| State | พฤติกรรมที่ต้องพัฒนา/ตรวจรับ |
| --- | --- |
| cold start / signed-out / cold offline | เริ่ม local setup/core; account/cloud แสดง unavailable ตามจริง |
| network loss | local safety/voice/overlay/logs ต่อได้; account actions ที่ต้องตรวจสดรอ network; cloud ข้ามไป local backend หรือ unavailable |
| mismatch / revoke / account switch | แยกและล้าง account session/cache; ปิด protected account actions; local gameplay/history ไม่ถูก lock ตาม grant |
| sign-out | รักษา credential cleanup/request invalidation ของ auth fixes; ล้างเฉพาะ account state และกลับสู่ local core |
| new device | local setup ใหม่; Google ตรวจ server สำหรับ account; ไม่ sync raw match/CV/Memory |
| current Terms changed/missing | account services ที่มี requirements ฝั่ง server ทำงานตาม policy ของตน; local core ไม่ถูกล็อกด้วย account Terms |
| updater | local core ใช้ signed stable channel ที่มีอยู่; updater state แยกจาก account state; update install ต้องรอ safe gameplay state |

**Terms/legal boundary:** local desktop startup does not implement a Terms receipt or require account Terms acceptance. This decision does not change server-side Terms, Store/account authorization, or RLS policies. Any future account-facing legal flow must have its own product, security, and legal review before implementation. MVP-045 is not applicable to local startup; protected account services retain their existing server checks.

ก่อน MVP-008 ต้องมี design/threat review: แยก local-runtime state ออกจาก account authorization; callback/revoke ที่แข่งกันห้ามเปิด account ของคนอื่น; tests ครอบคลุมทุกแถว, migration และ rollback ผ่าน PR/revert. ไม่เพิ่ม blanket runtime-unlock ที่ใช้เปิด protected account operations. มตินี้อนุมัติ product target; threat/RLS review และหลักฐาน implementation ยังต้องเสร็จก่อนรับงาน.

## MVP-005 — AI data contract

Cloud game-context **off by default**. การ sign-in, เลือก Claude/Auto, กรอก API key หรือกด Ask ไม่ใช่ consent. ใช้ opt-in แยกสำหรับ context ของคำแนะนำ และเก็บ preference ในเครื่อง; ไม่สร้าง legal/marketing/data-contribution receipt. ปิด opt-in แล้วต้องยกเลิก future sends และทิ้ง response/cache ที่ไม่ตรง consent/session.

| Field / route | มติ |
| --- | --- |
| static Maiden persona / fixed instruction | อนุญาต; ไม่มีข้อมูลผู้เล่น |
| coarse game phase, own hero/level/KDA/NW/gold/HP%/mana%, team score | อนุญาตเฉพาะ opt-in ที่ระบุ fields เหล่านี้และ purpose ให้ชัด |
| exact clock, own items, self-burst scalar | ไม่อยู่ใน initial cloud allowlist |
| raw GSI/GameTick, match ID, enemy roster/identity/position/CV detections/crops/images | ไม่ส่ง cloud รวม counter text ที่ derive จาก CV |
| raw G-Log/history/replay, G-Memory aggregates, local paths/diagnostics | local only |
| email/GID/Google UUID/token/Steam IDs, private security/contact data | ไม่อยู่ใน prompt |
| microphone audio และ transcript/free-form utterance | local only; Voice route ใช้ local interpretation/answer |
| Anthropic key | authentication header ของ provider เท่านั้น; ไม่อยู่ใน prompt/log |

ประกอบ cloud prompt จาก purpose-built allowlist object ไม่ serialize GameTick ทั้งก้อน. แยก local Ollama context ที่ใช้ CV/Memory ได้จาก cloud context. เมื่อ consent off: Auto ข้าม Claude; forced Claude ไม่ส่งและแสดง local alternative/unavailable. ไม่มี silent cloud fallback จาก local Voice/Memory.

Consent toggle, match/session generation และ backend เป็นส่วนหนึ่งของ request/cache key; late response จากบริบทเก่าถูก discard. Runtime traffic acceptance ของ MVP-050 ต้องพิสูจน์ denylist ทั้ง manual/auto/CLI/API/error/retry/cancel paths.

## MVP-006 — เกณฑ์ก่อนเริ่มวัด

Reference tier: 6 physical cores / 12 logical processors, RAM 16 GB, DXGI GPU และจอ 1080p ≥60 Hz; บันทึก SKU/driver/OS/audio/model จริงทุก receipt. เลือกเครื่องใน tier นี้ก่อนวัด ห้ามใช้จำนวน core สมมติเป็นผลวัด.

| Metric | เกณฑ์ที่เลือก |
| --- | --- |
| hero-presence precision / recall | ≥95% / ≥90% |
| hero-identity precision / recall | ≥95% / ≥85% ต่อ certified class; pooled score ไม่แทนราย class |
| independent label evidence | ≥50 appearance episodes/class ใน ≥5 held-out matches; holdout ≥20 whole matches; รายงาน 95% CI และ disagreement |
| high-danger false audible alerts | ≤1 ต่อ 30 นาที; แยก sensitivity และนับหลัง dedup |
| actionable danger recall | ≥90% ของ labeled episodes; false-safe calls = 0 |
| fresh GSI | valid-source age ≤2.0 s; invalid payload ไม่ refresh freshness |
| live matrix | ≥10 sessions ต่อ required OS/mode/geometry cell |
| local STT | English WER ≤15%, Thai CER ≤20%, intent/critical-slot accuracy ≥90%; ≥100 held-out utterances/ภาษา แยก speaker/session และ quiet/game-audio |
| Voice response | PTT release → first audible answer ≤2.0 s ทุก accepted turn ใน ready/warm state; completion ≥95% ต่อภาษา. Cold model preparation ≤10 s แสดง preparing ชัด; ห้ามนำ timeout/reject ออกจากรายงานเพื่อทำเลขผ่าน |
| danger preemption | 100 overlap trials ทุก trial preempt stale Voice/advice และยังผ่าน G-Signal hard latency |
| G-Signal latency | p50 ≤250 ms, ทุก measured sample ≤300 ms; ≥300 samples/scenario/profile และ live audible probe |
| CPU | whole-app process group normalized by logical CPU capacity, ทุก 1 s sample ≤10% |
| RAM | peak aggregate Working Set ≤400,000,000 bytes (400 MB); รวม host/WebView2/feeder/STT/SLM และ external model PIDs ที่ใช้งาน |
| FPS impact | ≤3% แต่ละ paired overlay off/on run; ≥3 pairs ×60 s, same device/segment/settings |

**Latency landmarks:** T0 = fresh GSI POST arrival หรือเวลาที่ critical capture acquisition cycle ถึงกำหนด ก่อนรอ scheduler/acquisition/inference; T1 = Rust decision; T2 = audio admission; T3 = loopback first audible sample. วัด T3−T0 รวม wait/acquisition ไม่ขยับ T0 ไปหลัง poll/frame-ready เพื่อกลบ delay; รายงาน upstream observation age แยก. ใช้ event-driven evaluation; 500 ms เป็น watchdog/freshness cadence เท่านั้น. p99/headless estimated budget ไม่แทน hard max/live acoustic proof.

Label guide: episode เริ่มเมื่อ threat actionable ตาม observed evidence และจบเมื่อ threat คลาย/หมดความครอบคลุม; ไม่ใช้ death อย่างเดียวเป็น ground truth. กำหนด attribution window ±8 s รอบ labeled risk sample, ให้ผู้ label adjudicate disagreement ก่อน tuning และแยก matches ทั้งก้อนระหว่าง train/tune/holdout.

Resource runs: warm-up 2 min แล้ว idle/live-CV/Voice+Signal phase ละ10 min ×3 runs, 1 s sampling, host ไม่มี builds/local model reviews ร่วม. ถ้า model ที่เลือกเกิน hard RAM/CPU budget ให้ลดขนาด/เปลี่ยน implementation หรือเปิด explicit SRS change; ห้ามยกเว้น model process หรือเพิ่มเพดานโดยปริยาย. Memory/Voice feasibility เป็นงาน spike ก่อนเลือก package.

Required cell ที่ไม่มี OS/device/label/audio evidence เป็น SKIP/INDETERMINATE และไม่ผ่าน. Unsupported layout/mode ต้องสื่อสารชัด ไม่แต่ง safety assertion; complete/partial/unknown states มี source/freshness/coverage. Thresholds นี้ล็อกก่อนดู acceptance results; การเปลี่ยนต้องสร้าง decision version ใหม่พร้อมเหตุผล.

### Decision v0.2.0 — CPU budget

ตามคำสั่ง Owner วันที่ 2026-10-12 ปรับเพดาน CPU ของ MVP จาก 2.5% เป็น 10% ต่อ sample 1 วินาที โดย normalize CPU ของ Windows Job Object process group ตาม logical CPU capacity. Governor ตั้ง OS hard cap 10% ก่อน Tauri สร้าง WebView2; app-created children ที่ไม่ใช้ breakaway flag สืบทอด job ตาม Windows default, ส่วน WebView2 process membership ยังต้องยืนยันบน Windows. หากสร้าง/configure/assign job ไม่สำเร็จ แอปต้องบันทึกข้อผิดพลาดและออกด้วย exit code 1 ก่อนสร้าง Tauri/WebView หรือ sidecar; ห้ามเปิดแอปในสถานะที่ไม่มี whole-app hard-cap guarantee. หาก runtime accounting query ล้มเหลวหลัง setup สำเร็จ UI แสดง unavailable (`—`) และคง capture throttle แม้ OS hard cap ยังคงตั้งอยู่; payload/UI ปัจจุบันไม่มี field แยกสถานะ query นี้. Capture throttle เมื่อ CPU >10% และคืน cadence หลัง ≤8% ต่อเนื่อง 3 samples เป็น soft mitigation เสริม; ทั้ง hard cap และ throttle ยังไม่ใช่หลักฐานว่า live CPU/FPS/G-Signal latency acceptance ผ่าน.

### Decision v0.2.1 — process containment and cleanup

ตั้ง `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` บน unnamed Job Object ก่อน assign host process. `PROCESS_JOB` เก็บ handle ที่แอปสร้างไว้ตลอดอายุโปรเซสและโค้ดไม่ได้ duplicate/inherit handle; เมื่อ setup สำเร็จ `gpu-feeder` ซึ่ง spawn ผ่าน `Command` โดยไม่ใช้ breakaway flag อยู่ใน job ตาม Windows default. เมื่อ handle สุดท้ายปิด Windows จะยุติสมาชิก job; normal Tauri exit ยัง kill exact owned feeder ก่อนคืน control. มติ fail-closed ทำให้ startup ปัจจุบันไม่สร้าง feeder หาก setup ล้มเหลว; feeder ที่เหลือจากรุ่นก่อนซึ่งเคยเปิด degraded mode อาจอยู่นอก job และค้างหลัง host abnormal exit. WebView2 membership และ crash cleanup ยังไม่มี live acceptance receipt; guarantee ใช้กับ process ที่อยู่ใน job ภายใต้ membership/handle-lifetime assumptions นี้.

### Decision v0.3.0 — Fail closed when CPU cap setup fails

Owner ตัดสินใจวันที่ 2026-10-13 ว่าเมื่อ Job Object initialization/configuration/assignment ล้มเหลว ให้ปฏิเสธการเปิดแอป: บันทึกข้อผิดพลาดและออกด้วย exit code 1 ก่อนสร้าง Tauri/WebView หรือ sidecar. หาก setup สำเร็จแต่ runtime accounting query ล้มเหลว ให้แสดง CPU unavailable และคง capture throttle; OS hard cap ยังทำงาน. UI จึงต้องแยกเฉพาะกรณี runtime query failure ที่เกิดหลังแอปเริ่มแล้ว.

## Baseline และ dispatch

รับผล verification ของ MVP-001/002 ภายใต้คำสั่งมอบหมายตัดสินใจ: integrated source commit `c63bad098d6e12e6f073e832dce045dbbeacd687`, tree `d687254de6c4cfc976e06e4f60e0f4dc8e038009`; Rust 315 passed/5 ignored, desktop Vitest 284 passed, ESLint/tsc/clippy/native no-bundle ผ่าน. Evidence อยู่ที่ `D:/gm-mvp-001-evidence/MVP-001-B-evidence.md`; binary SHA-256 `970D6C0D5DE02B5BDAE86BF26145969E129AAA6A4BCC244B37405AAA98008BA1`. เป็น baseline engineering receipt ไม่ใช่ผล live MVP acceptance.

MVP-007 reconcile PRD/SRS/AGENTS/CLAUDE ตามมตินี้. งาน code ที่แยกไฟล์ได้ เช่น MVP-009 startup settings และ MVP-013 valid GSI สามารถเริ่มจาก verified baseline พร้อมอ่าน contract นี้. งาน access/egress code ใช้ design/threat review และ dependency เฉพาะของตน. Generated docs/registry รวมโดย integrator; owner ยัง merge PR และอนุมัติ release workflow.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-10 | Codex ตัดสินตาม Owner delegation: Companion scope, optional-account local core, cloud opt-in allowlist และ fixed acceptance matrix; รับ verified baseline โดยคง legal/release gates |
| 0.2.0 | 2026-10-12 | Owner เปลี่ยน CPU budget เป็น ≤10% ต่อ sample 1 วินาที พร้อมคง acceptance measurement และเพิ่ม governor hysteresis. |
| 0.2.1 | 2026-10-12 | Clarified unavailable-cap state, pending startup policy, and kill-on-close membership/handle assumptions. |
| 0.3.0 | 2026-10-13 | Owner chose fail-closed startup when the CPU Job Object cannot initialize; updated process and feeder lifecycle contract. |
| 0.3.1 | 2026-10-16 | Remove retired local review integration and related references. |
| 0.3.2 | 2026-10-18 | Clarified local startup and account Terms boundaries. |
| 0.3.3 | 2026-10-18 | Removed the obsolete desktop handoff activation flag; local startup remains account-independent. |
