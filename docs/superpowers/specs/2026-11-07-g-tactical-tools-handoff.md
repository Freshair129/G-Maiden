---
title: "Tactical Tools MVP — Implementation Handoff and Acceptance"
doc_id: "2026-11-07-g-tactical-tools-handoff"
status: "draft"
version: "0.1.0"
updated: "2026-11-07"
owner: "G-Maiden"
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["g-tactical-tools-mvp-srs", "FEAT-G-TACTICAL-TOOLS", "mvp-decisions", "mvp-backlog", "mvp-execution-dag", "GIT-WORKTREE-POLICY"]
---

# Implementation handoff — 3 ฟีเจอร์เพิ่ม

อ่าน [[g-tactical-tools-mvp-srs]] → [[FEAT-G-TACTICAL-TOOLS]] → เอกสารนี้. ผู้ใช้สั่งให้ทำเอกสารและเปิด PR เพื่อให้ agent ที่ทำงานอยู่รับไปพัฒนาต่อ; PR นี้ไม่มอบสิทธิ์ยึด workspace, merge, release หรือเปลี่ยน quality gates. สถานะ implementation ทั้งสามฟีเจอร์ = **NOT STARTED BY THIS PR**. ข้อเสนอรายละเอียดทางวิศวกรรมยังเป็น draft สำหรับ review.

## 1. Baseline และการรับงาน

Source ที่ตรวจคือ `main@0693b2f1ce7151ea0cca198b5e2509f1df3dba2c` วันที่ 2026-11-07. ก่อนลงมือให้ re-read current `AGENTS.md`, `CLAUDE.md`, accepted MVP decisions และ diff ตั้งแต่ baseline. G-Log มี reader/timeline/efficacy บางส่วนอยู่แล้ว; build UI มี own inventory แต่ยังไม่มี typed Next/Then/Situational engine; manual timers เป็นส่วนเพิ่ม. ห้ามใช้ installed 0.13.6 หรือผล audit HG แทนหลักฐาน source/current runtime.

Agent ที่รับงานต้องยืนยัน owner ของ branch/workspace และ active shared-file writers ก่อนแก้. ใช้ checkout/branch ที่เป็นเจ้าของอยู่แล้ว; แยก worktree เฉพาะเมื่อจำเป็นและผ่าน resource admission. ไม่มีการสร้าง controller/registry กลางใหม่. ในวันที่ตรวจ พบงาน Voice slice 2 [PR #153](https://github.com/Freshair129/G-Maiden/pull/153), capture health [PR #127](https://github.com/Freshair129/G-Maiden/pull/127) และ GSI counters [PR #130](https://github.com/Freshair129/G-Maiden/pull/130) ยังเปิดอยู่; เป็น coordination pointers ที่ต้องตรวจสถานะใหม่ ไม่ใช่สั่งให้นำ draft เหล่านี้มาเป็น dependency. งาน replay Task4 และ native/media lanes ที่มี owner เดิมยัง protected.

## 2. Work slices และ dependency

| Slice | งาน/ผลที่ต้องส่ง | Depends on | Acceptance/owner boundary |
| --- | --- | --- | --- |
| TT-00 | ตกลง shared contracts: run/session/revision/origin, presence/freshness, command errors; review rule/cooldown data schema | source/ownership recheck | AT-C02–04; integrator เป็นเจ้าของ shared adapters |
| TT-R1 | warning IDs, audio-start receipts, death observation/coverage และ bounded append ผ่าน G-Log เดิม | TT-00 | AT-R02–05, R09, N03; ประสาน audio/Signal owner |
| TT-R2 | bounded archived reader, joins/summary/cache/delete และ History UI | TT-R1; parser ใช้ fixture พัฒนาได้ก่อน | AT-R01, R06–08, N04–05; review feature slice |
| TT-B1 | reviewed datasets 3 hero-role pairs, recipe validation, inventory completeness adapter และ pure planner | TT-00 + content provenance | AT-B01–06, B08; missing dataset ยังไม่ใช่ shipping-ready |
| TT-B2 | typed bridge + Live Build view, role/patch confirmation และ G-Master separation | TT-B1 | AT-B07, C01, C05, N05 |
| TT-T1 | manual subject/duration model, command validation/dedup, pause/reconnect/reset state machine | TT-00 + trusted clock view | AT-T01–07 |
| TT-T2 | Live Timers controls + readonly overlay projection ผ่าน layout เดิม | TT-T1 | AT-T08, C05, N05 |
| TT-I1 | integration, privacy/resource/native regression และเอกสาร evidence | completed feature slices | AT-C01/C06, N01–06 + repository-required checks |

ส่งมอบผู้ใช้ตามลำดับ R → B → T ได้โดยไม่ต้องรอครบทุก feature แต่แต่ละ slice ต้องผ่าน applicable acceptance และไม่ปล่อย partial data ให้แสดงเป็น complete. Pure modules ทำคนละไฟล์ได้เมื่อ owner ตกลง; shared adapters และ generators มี writer เดียวต่อเวลา. ข้อเสนอนี้ไม่สั่งเริ่ม swarm ใหม่หรือแย่ง agent ที่มีงานอยู่.

## 3. File map: มีอะไรแล้วและต้องแก้อะไร

ชื่อ **new** เป็นข้อเสนอให้ builder เปลี่ยนได้ตาม conventions; ชื่อ existing ตรวจจาก baseline จริง. ไม่ให้เลขบรรทัดเป็น authority เพราะจะเคลื่อนเมื่อ PR อื่น merge.

| Area / existing files | การเปลี่ยนที่ต้องทำ | Scope guard |
| --- | --- | --- |
| `src-tauri/src/runtime.rs`, `gsi.rs` | reuse MatchSessionSnapshot/admission; expose typed presence/quality/clock/inventory views และ run/revision fences | ไม่เปลี่ยน GSI source priority หรือ kill/death semantics โดยไม่มี regression evidence |
| `src-tauri/src/signal.rs`, `capture.rs`, `audio.rs`, `log.rs` | trace actual decision/emission path; carry warning identity; observe native playback lifecycle; enqueue bounded review records | ไม่ย้าย pure Signal ไป WebView/SLM; ไม่เปลี่ยน arbitration, GANN, sensitivity/silent-arm |
| `src-tauri/src/log.rs` | extend archive parser/DTO/health/closure, reuse path confinement/list/delete, streaming bounds | ไม่แทน logger, ไม่เปลี่ยน efficacy window 8 s, ไม่สร้าง exact deaths จาก missing fields |
| **new** `src-tauri/src/tactical_context.rs`, `review.rs` | typed input views, correlation/coverage/summary pure functions | structure เป็น builder choice; domain types authoritative ที่ native |
| `src-tauri/src/counter_advice.rs`, `items.rs`; **new** `build_plan.rs`, `data/build_plans.v1.json`, `data/tactical_items.v1.json` | review static knowledge; planner/recipe validation/dataset provenance | ไม่ parse Thai prose เป็น structured plan; ไม่เพิ่ม online lookup ใน runtime |
| **new** `src-tauri/src/cooldown_timers.rs`, `data/cooldowns.v1.json` | bounded 15-key store, manual duration/commands และ reviewed prefills | ไม่ auto-detect enemy cast, ไม่ persist timer history |
| `src-tauri/src/lib.rs` | register typed commands/events after module contracts stable | shared integrator only; ระวัง Voice PR overlap |
| `src/src/companion.ts`, `live/events.ts`, `live/buildAdvisor.ts`, `live/buildHistory.ts` | typed DTOs, current-session/revision gating, real builders และ truthful empty states | ห้ามเอา demo data เข้า native path |
| `src/src/CompanionPages.tsx`; **new** `live/BuildPlan.tsx`, `live/ManualTimers.tsx`, `insights/WarningReview.tsx` | bounded UI/detail/filter/role/patch/manual controls | UI component split เป็น builder choice; คง 7-page IA |
| `src/src/app/Overlay.tsx` และ existing layout types/store | readonly timer projection/layout option | คง click-through/keep-outs, ไม่มี global hotkey ใหม่ |
| existing Rust test modules, `src/src/live/__tests__` และ proposed synthetic fixtures | tests ตาม matrix ด้านล่าง; no real-user logs/screenshots | fixtures ไม่เป็น live acceptance |
| docs index/feature ledger/generated doc graph และ accepted lineage docs เมื่อ implementation เปลี่ยนจริง | register proposed state ตอนนี้; update actual data lineage/status/evidence ใน implementation PR | ห้าม mark implemented/verified จากสเปกหรือ file existence |

ก่อนเริ่ม TT-R1 ต้อง trace ว่า `audio::play_observed` callback ยืนยันอะไรจริงและ hook ใดเท่ากับ playback-start; ชื่อ function อย่างเดียวไม่ใช่หลักฐาน. ก่อน TT-B1 ต้องตรวจ inventory slot/quantity/presence ใน parser จริง. หาก source ไม่มีข้อมูลให้ลด availability ตาม spec ไม่เดาค่าเพื่อให้ demo ผ่าน.

## 4. Acceptance matrix — Shared

ทุกแถวเป็น **required test specification / NOT RUN** ใน doc PR. U=unit/fixture, C=component, N=installed native, L=real Dota/loopback/resource. Implementation ต้องบันทึก exact SHA, command/protocol, environment/origin และผลจริงเป็นรายแถว; ไม่มีการรับรอง runtime จากจำนวน unit tests.

| ID | Setup / action | Expected result | Layer / FR |
| --- | --- | --- | --- |
| AT-C01 | signed-out, network denied, SLM down; ใช้ทั้ง 3feature; instrument all egress surfaces | local functions ยังใช้ได้; ไม่มี roster/inventory/review/timer/Memory ออก network/provider/Party/telemetry; consent เดิมไม่ถูกขยาย | U+N; TT-C01,C07,N06 |
| AT-C02 | A→B live session/restart/delayed IPC; เปิด archive X ขณะเล่น B→C แล้วเลือก Y หรือลบ X ระหว่าง scan | old live context ถูก reject; อ่าน X ได้แม้ historical epoch ต่างจาก B/C; เปลี่ยน selection/delete แล้ว late X ไม่ทับ Y หรือคืน deleted data | U+C+N; TT-C02 |
| AT-C03 | missing/invalid fields, default zero/empty, source age1999/2000/2001ms, wrong own identity | ≤2000ms valid เฉพาะ admission/presence ผ่าน; missing ไม่ใช่ known zero; stale ไม่สร้าง active output | U+N; TT-C03 |
| AT-C04 | live/replay_test/fixture streams มี session IDs คล้ายกัน; manual mapping ปน | origin/namespace ไม่ปน; replay/fixture ไม่เป็น live denominator; manual mapping ไม่เป็น observed roster | U; TT-C04 |
| AT-C05 | native Control/Overlay ที่ supported resolution/DPI, keyboard/focus, Thai overflow, Dota foreground | 7 หน้าเดิม; content ไม่ล้น; readonly overlayclick-through/keep-outs; no newhotkey; states ไม่ใช้ mock | C+N+L; TT-C05 |
| AT-C06 | flood observation queue, slow/failing writer, UI stall, full review scan ขณะ critical warning | producer ไม่รอ I/O/serialization/consumer; Signal decisions, silent arm, arbitration/GANN เดิมไม่เปลี่ยน; เก็บ lossstatus | U+N+L; TT-C06,C08 |

## 5. Acceptance matrix — G-Review

| ID | Setup / action | Expected result | Layer / FR |
| --- | --- | --- | --- |
| AT-R01 | archived complete/abandoned/disconnected/legacy + current active log | History เข้า detail ได้เฉพาะ archive; status ตรงหลักฐาน; currentlog ไม่ถูกอ่าน/ลบแบบ archive | U+C+N; TT-R01 |
| AT-R02 | emitted-only, admitted-no-start, silent-arm, suppressed, failure, native-start, start-then-cancel, legacy armed=true | correlation ตรง ID; ไม่แปลง armed/admitted/playrequest เป็น audio_started; absentreceipt=unknown; software receipt ไม่ติด label ผู้เล่นได้ยิน | U+N; TT-R02–04 |
| AT-R03 | valid count0→1 at100→101s; initial count3; 1→3; reset; wrongidentity; reconnectgap; same-secondobservations | เฉพาะ validdelta1 ได้ observed clock range [100,101]; ไม่ใช่ actual death bound; jump/gap ไม่แตก exactdeath; equalclock เป็น [a,a] และ unknown ordering | U+N; TT-R05 |
| AT-R04 | observed death clocks [100,101], warning70/90/100/101/102s; audio clock91 ต่างจาก decision90; unknownclock | context รวม 70 ถึง 101; decision90 observed-lead[10,11]s/audio91[9,10]s พร้อม 1s-resolution caveat; 100/101orderuncertain; 102 นอก window; ไม่อ้าง guaranteed actual lead | U; TT-R06 |
| AT-R05 | warning→revision→cancel/start races, orphanrevision, lateprevioussessionrecord | history คงอยู่; reference unresolved ชัด; oldrecord ไม่เข้าของใหม่; revision ไม่เพิ่ม successcount | U+N; TT-R07 |
| AT-R06 | completefixture หลายเหตุการณ์, tie timestamps; partial/legacy ไม่มี matchresult | ≤3summarypoints พร้อม sourceIDs/range; deterministic; partial ไม่มี win/loss/cause/safe inference | U+C; TT-R08 |
| AT-R07 | truncatedtail, malformed/unknownversionrecord, missingfooter, sequencegap, writerfailure | validprefix อ่านได้ภายใน bounds; completenesspartial พร้อม reason; ไม่มี full-sessiondenominator ปลอม | U; TT-R10 |
| AT-R08 | traversal/ADS/UNC/symlinkescape; >16MiBfile, >64KiBline, >500rows; cancel/delete/switch ระหว่าง scan | pathdeny; boundedmemory/read; max1job/cache, 50rows/page; latejob ไม่คืน deleteddata; limit แสดง partial | U+C+N; TT-R11,N04 |
| AT-R09 | compare legacy efficacy/study fixtures ก่อนหลังเพิ่ม review; silent-arm/unknownreceipt/coveragegap | existing8sstudy และ MVP-006labels ไม่เปลี่ยน; new30swindow ไม่กลายเป็น accuracy/causalmetric; eligible/unknowncounts แยก | U+N; TT-R09,C08 |

## 6. Acceptance matrix — G-BuildPlan

| ID | Setup / action | Expected result | Layer / FR |
| --- | --- | --- | --- |
| AT-B01 | identicaltypedinput หลายรอบ/ลำดับ serialization ต่างกัน | identicalcanonicalplan/reasons/provenance; noSLM/networkdependency | U; TT-B01 |
| AT-B02 | no role, unsupportedpair, knownpatchmismatch, unknownpatch ก่อน/หลัง explicitconfirmation | correctawaiting/unavailable/manual_confirmedstates; ไม่ guessrole/patch; new session ล้าง confirmation | U+C+N; TT-B02–03 |
| AT-B03 | required inventory/backpack/stash missing/incomplete/knownempty; neutral slots; courier/transit unknown→admitted; stale→fresh | missing required/stale ถอน activeplan; unknown optional ยัง active พร้อม limited-ownership badge/duplicate caveat; admitted optional นำมานับ; ไม่สับสน missing กับ empty | U+N; TT-B04 |
| AT-B04 | ownedfinal/upgrade/components, duplicatecomponentquantity, solditem, allcorecomplete, >outputlimits | ไม่มี buyduplicate/lower-tier ซ้ำ; component≠final; quantity ใช้ครั้งเดียวใน core; situationalindependent; 1/3/3limits; solditemre-evaluate | U; TT-B05–06 |
| AT-B05 | admittedcurrentenemy, unknownenemy, stale/oldsessionenemy, Timer manualmapping | ใช้เฉพาะ admittedcurrentevidence; absence ไม่เป็นไม่มี threat; ไม่อ่าน unseeninventory หรือ manualtimerroster | U; TT-B07 |
| AT-B06 | repeatidenticaltick/render; input/dataset/session เปลี่ยนระหว่าง worker | recompute เฉพาะ semanticchange; no stale publication; stablepriority/tie-order | U+C; TT-B08 |
| AT-B07 | G-Masteroffline/fails/returnsprosewithitemnames; cloudconsenton/off | typedplan คงอิสระ; ไม่ parseprose เป็น plan; ไม่มี newpromptpayload/เสียง/autopurchase | U+C+N; TT-B09–10 |
| AT-B08 | datasetmissingprovenance/duplicateIDs/recipecycle/badquantity; supported3pairs reviewedfixture | invaliddatasetreject; unsupported แสดง reason; ทุก shippedrule มี patch/source/review; datasetfixture ไม่แทน contentapproval | U+content review; TT-B03,B10 |

## 7. Acceptance matrix — G-Cooldown

| ID | Setup / action | Expected result | Layer / FR |
| --- | --- | --- | --- |
| AT-T01 | 5×3keys, sixthsubject/invalidkind, unknownlevel, duration0/1/1800/1801/noninteger, overflowclock | enforce15keys/types/duration; no guessedlevel; checkedarithmetic; invalidcontext ไม่ start | U+C; TT-T01,T03 |
| AT-T02 | duplicatedcommand, oldrevision, oldrun/session, LRUeviction/retry | no doublestart/restart; oldrevisionreject; responseidempotent ใน window; nativeauthority | U+N; TT-T02 |
| AT-T03 | startgame100s duration60s; pause ที่ 120s wallclock เดิน 30s; reconnectsameepochgame150s | remaining40s ระหว่าง pause; reconnect10s; ไม่ใช้ wallclock; pregameclock ติดลบรับได้ถ้า valid | U+N+L; TT-T04 |
| AT-T04 | sourceage2001ms/disconnect; freshforwardreturns; backwardclock | frozen/unknown-time; forwardrecomputes; backwardinvalid ต้อง restart; stale ไม่ใช้ frontendcountdown ต่อ | U+C+N+L; TT-T05 |
| AT-T05 | deadlinearrives; Cancel ก่อน/หลัง expiry/ขณะ stale | expiryestimated_ready พร้อม manualbadge; Cancelunknown; ไม่มีคำยืนยัน enemy พร้อมจริง | U+C; TT-T06 |
| AT-T06 | editlevel/duration ขณะ running, explicitrestart, enemydeath, unobservedCDR/Refresher | oldassumptions คงจน restart; death ไม่ reset; unsupportedmodifiers มีข้อจำกัด; no auto detection/buyback | U+C; TT-T07,T10 |
| AT-T07 | same-sessionreconnect, newsession, processrestart, hero/subjectremap | reconnect ใช้ trustedclock; newrun/session ล้าง; remapinvalidate เฉพาะ slot; ไม่โหลด state จาก disk/log | U+N; TT-T08 |
| AT-T08 | controlcommands/overlayview ขณะ Dotaactive; expiry พร้อม Signal/Revive | overlayreadonly/click-through; nohotkey/newaudio; timer ไม่เปลี่ยน risk/verdict; nativecontrols ยังใช้ได้ | C+N+L; TT-T09,T11 |

## 8. Cross-feature NFR acceptance

| ID | Required evidence / pass condition | FR |
| --- | --- | --- |
| AT-N01 | ใช้ accepted T0–T3/native acoustic/loopback protocol ที่ exact implementation SHA; G-Signal p50≤250ms และทุก sample≤300ms ขณะเปิด features และ stresswriter/scan; fixtures ไม่นับ | TT-N01,C06 |
| AT-N02 | accepted paired Dota baseline/treatment + whole-app process aggregation: CPU ทุก 1s≤10%, peakWorkingSet≤900,000,000bytes, FPSloss≤3%; ต้องครบ supportedmatrix/sampleprotocol ใน MVP-006 | TT-N02 |
| AT-N03 | injectqueuefull/budgetfull/diskfail/crash/sessionclose-race; boundednonblockingproducer; droppedcounts/footer หรือ missingfooter ทำให้ partial; no cross-sessionwrite | TT-N03 |
| AT-N04 | measuredallocated/readbounds ภายใต้ oversizelines/files/commandflood และ cancellation; max1scan/cache, queue128≤1KiB/event, extension≤512KiB รวม reservedfooter | TT-N04 |
| AT-N05 | native screenshots/state traces ของ empty/stale/partial/unsupported/readyestimate พร้อม DPI/focus/keyboard; ไม่มี demoresults ใน nativepath | TT-N05 |
| AT-N06 | signed-out/offline + tracednetworkdeny ผ่านแอปทุก process/optionalproviders; no new egress ของ protectedcontext; logdelete/Memoryforget ไม่คืน deriveddata ผิดขอบเขต | TT-N06,C07 |

Acceptance นี้เป็นส่วนเพิ่ม ไม่ยกเลิก test matrix/latency/resource/media/CI gates ใน accepted [[mvp-decisions]]. Native/live test ที่ยังไม่มี environment/resourcepermission ต้องรายงาน NOT RUN พร้อม resumecondition; ห้ามลด thresholds หรือแทนด้วย syntheticpass.

## 9. Review, verification และ final disposition

เอกสารรอบนี้ต้องผ่าน `node tools/doc-graph/ci-gate.mjs`, diff review, FR→AT mapping และ required PR checks ที่ exact head. Doc validation ไม่ถือว่า 3features ใช้งานได้. Implementation PR ต้อง run repository-required Rust/frontend checks และ native/live cases ที่เกี่ยวข้องเมื่อผ่าน resource gates; Cargo ใช้ owned F: lane+lock และ process-scopedtarget ตาม policy ไม่ reuseunknown-ownedtarget.

สำหรับแต่ละ implementation slice ให้ส่ง: scope/files และ owner, exactbase/headSHA, datasets/sourceapproval, testmatrix พร้อม PASS/FAIL/NOTRUN, command/evidencepaths, independentreviewfindings, unresolvednative/livegates และ disposition. สถานะที่ใช้ได้คือ implementationcandidate พร้อมข้อจำกัด จนกว่าจะมี fullacceptance; merge และ release ต้องผ่าน ownerauthority เดิม.

**Final disposition ของงานเขียนเอกสาร:** proposed design/handoff สำหรับ PR; code/runtime/data-content validation ยังไม่เริ่ม. Owner/agent รับต่อเริ่ม TT-00 และยืนยัน contentreview ก่อน TT-B1; ไม่ต้องย้ายหรือปิดงาน active เดิมเพื่อให้เอกสารนี้ merge. ผล docgate/PRcheck จริงบันทึกใน PRbody เพื่อไม่สร้าง claim ล่วงหน้าใน spec.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | แบ่งงาน/ownership/file map และ 37 acceptance cases พร้อม source/fixture/native/live distinctions สำหรับให้ agent เดิมรับไปทำต่อ. |
