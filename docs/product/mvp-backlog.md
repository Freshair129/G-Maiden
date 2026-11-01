---
title: "G-Maiden MVP Backlog"
doc_id: "mvp-backlog"
status: "draft"
version: "0.3.12"
updated: "2026-11-01"
owner: "Boss"
related_docs: ["roadmap", "mvp-execution-dag", "software-requirements-specification", "G-SERIES-DATA-LINEAGE", "FEAT-G-VOICE", "FEAT-G-MEMORY", "FEAT-G-COACH", "EXEC-PLAN-CR-034-iam-remediation", "FEAT-G-PARTY", "CR-037-party-gsi-own-stat-sharing", "2026-11-01-g-party-gsi-sharing"]
---

# G-Maiden MVP Backlog

Backlog สำหรับทำให้ผู้เล่นใช้งาน Companion ได้ครบหนึ่งแมตช์และกลับมาใช้งานต่อได้ แบ่งเป็น **52 tasks ในแผน MVP** ซึ่งมีงานบัญชี/Terms แบบมีเงื่อนไข และ **10 tasks หลัง MVP หรือแยกสายงาน** ลำดับ milestone อยู่ใน [[roadmap]] ทุก task ยังไม่ปิดจากการเขียนแผนนี้

แผนทำงานขนานอยู่ที่ [[mvp-execution-dag]] และไฟล์ `docs/product/mvp-execution-dag.json` โดยคง task แม่ทั้ง 62 ID นี้ไว้ รายการ 001, 011, 048, 051 แยกขั้น A/B เพื่อไม่ให้ evidence หรือ readiness ถูกปิดก่อน prerequisite จริง; task แม่ DONE เมื่อทุกขั้นที่ใช้ผ่านแล้ว Wave เป็นคิวตาม dependency ไม่ใช่กำหนดส่งหรือการเริ่มงานอัตโนมัติ

## Owner-directed extension: G-Party (2026-11-01)

Owner สั่งพัฒนา own-GSI sharing ระหว่างสมาชิกที่ยินยอมเพื่อดู HP/MP/alive/respawn โดยไม่ camera-select. Scope/consent อยู่ใน [[CR-037-party-gsi-own-stat-sharing]], [[FEAT-G-PARTY]] และ [[mvp-decisions]] MVP-005A; transport/protocol เป็น assistant implementation decisions และ native/live/resource acceptance ยัง pending.

ใช้ task **GP-001–006** ใน [[2026-11-01-g-party-gsi-sharing]] สำหรับ docs/relay/native/UI/integration/qualification. เป็นส่วนขยายแยก ไม่ renumber/ปิด/เปลี่ยน priority ของ 62 MVP parent task และไม่เปลี่ยน execution DAG เดิม. ไม่มี release/deployment หรือการอนุญาต AI/raw-data egress เพิ่มจากงานนี้.

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

มติ MVP-003–006 ถูกบันทึกใน [[mvp-decisions]] ตามคำสั่ง Owner ให้ Codex ตัดสินใจ; รับ verified baseline MVP-001/002. DONE ของงาน contract หมายถึงเลือกข้อกำหนดแล้ว ไม่ใช่รับรองฟีเจอร์ที่ยังต้องพัฒนา. MVP-045 เป็น NOT_APPLICABLE สำหรับ legacy desktop handoff; MVP-043/044 ยัง applicable เพราะมี optional account surface.

**อนุมัติขอบเขตเอกสาร (2026-10-19):** Owner สั่งให้ Codex ปรับ backlog และรับรองการแก้เอกสารในขอบเขตการเทียบ design flows กับ source code นี้โดยอัตโนมัติ. Crosswalk ใน branch นี้ pin กับ source baseline `origin/main` `621c83d6`; การอนุมัติครอบคลุมเฉพาะการแก้ข้อความ/หลักฐานเอกสาร ไม่ปิด MVP-007 หรือ MVP-008 และไม่แทน C-3 security, legal, provider, live-runtime, release หรือ product-code approval.

### ผลเทียบ flow กับ source code — snapshot origin/main `621c83d6` (2026-10-19)

| Artifact | สิ่งที่ source ยืนยันได้ | ผลต่อ backlog |
| --- | --- | --- |
| Wireframe / sitemap | P03 ใช้ [AudioSettingsCard](../../src/src/app/cards/AudioSettingsCard.tsx) ผ่าน [Control.tsx](../../src/src/app/Control.tsx#L362); [App.tsx](../../src/src/App.tsx#L40) mount CommandDeck โดยตรง; [StorePage](../../src/src/StorePage.tsx#L218) และ [TopupModal](../../src/src/TopupModal.tsx#L184) มี purchase/top-up call path แต่ live provider acceptance ยังไม่ยืนยัน; [useAppUpdate](../../src/src/useAppUpdate.ts#L80) และ [lib.rs](../../src-tauri/src/lib.rs#L116) ยังไม่มี in-game install guard | แก้ source map และ label ให้แยก target / wired path / runtime-verified; ห้ามนับ path ที่เรียกได้ว่า provider หรือ gameplay acceptance ผ่าน |
| Wireflow / userflow | เอกสารชุดนี้ระบุเป็น target/simulator; viewer ไม่เรียก native auth, game, payment หรือ updater; install-when-out-of-game เป็นเป้าหมาย UX แต่ยังไม่บังคับใน handler ปัจจุบัน | ใช้เป็น UX contract; เพิ่ม code anchor และ runtime evidence ก่อนปิด flow ที่มี side effect |
| Execution flow | [mvp-execution-dag.md](mvp-execution-dag.md), [JSON](mvp-execution-dag.json) และ [mvp-decisions](mvp-decisions.md) ปัจจุบันตรงกัน: MVP-003–006 = DONE, MVP-007/008 = NOT_STARTED; DAG เป็นแผนงาน ไม่ใช่ runtime execution flow ของแอป | สถานะเอกสารสอดคล้องกัน; อย่าใช้ DAG เป็นหลักฐานว่าฟีเจอร์/runtime หรือ acceptance เสร็จ |
| System diagram | [gsi.rs](../../src-tauri/src/gsi.rs#L44) รับ GameTick/own-player/session state; [`enemy_deaths_from_score`](../../src-tauri/src/gsi.rs#L145) คำนวณ enemy-death count จาก score; [capture.rs](../../src-tauri/src/capture.rs#L845) เก็บ detections ใน Motion history, ดึง missing จาก Sentry ([capture.rs](../../src-tauri/src/capture.rs#L855)), ประเมิน risk ([capture.rs](../../src-tauri/src/capture.rs#L856)) และส่งเข้า Signal ([capture.rs](../../src-tauri/src/capture.rs#L891)); [motion.rs](../../src-tauri/src/motion.rs#L179) เก็บ sightings 5 นาที, [`heading_multiplier`](../../src-tauri/src/motion.rs#L281) ประเมินทิศก่อนหาย; [signal.rs](../../src-tauri/src/signal.rs#L28) กำหนด sensitivity และ [`evaluate`](../../src-tauri/src/signal.rs#L102) ใช้ hysteresis. PRD/TDD และ system diagram ใน AGENTS แยก GSI context จาก enemy positions ที่มาจาก CV; SRS ไม่ได้อ้าง enemy positions จาก GSI | เอกสารระบบตรงกับ source snapshot; end-to-end latency ยังไม่วัด. MVP-007 คง TODO จนกว่าจะทำ full coverage บน integrated SHA และปิด native/runtime, provider acceptance, updater guard และ product decision สำหรับ hotkey target |
| Feature map / ledger | [PROJECT_FEATURE_MAP.md](../../PROJECT_FEATURE_MAP.md) ระบุ G-Motion เป็น partial และอธิบาย heading-aware heuristic; manifest เดิมยก heatmap/route prediction เป็น in-code, ไม่ map Motion tests และปล่อย GSI FR ไว้ doc-only | แก้ feature title/refs แยก behavior ปัจจุบันจาก target; map `motion::tests` และ GSI implementation/tests; รัน doc-graph เพื่อ regenerate ledger โดยไม่อ้างว่า code path เท่ากับผล runtime |
| AGENTS / CLAUDE | ใน `origin/main`, system diagram ของ AGENTS วาง GSI ก่อน Sentry โดยไม่แสดง DXGI/minimap CV; CLAUDE มี path `AudioSettings.tsx` ที่ถูกแทนที่แล้ว; release workflow ในเอกสารระบุ `workflow_dispatch` อยู่แล้ว | แก้ system diagram/code map ใน AGENTS และ AudioSettingsCard refs ใน CLAUDE; ไม่เปลี่ยน claim release หรือสถานะ runtime ที่ไม่มีหลักฐาน |
| Release / Beta | [Release Governance](../releases/README.md) และ beta-roadmap บันทึก Closed Beta cancellation; channel/entitlement infrastructure ยังคงอยู่ และ workflow files เป็น `workflow_dispatch` | ระบุโปรแกรม tester ที่ยกเลิกแยกจาก retained `closed-beta` channel/infrastructure; ชี้ authority ของ operational workflow และไม่ตีความ component/deployment เป็น approval ให้ rollout |
| Alt+M / local critical path | [lib.rs](../../src-tauri/src/lib.rs#L801) ผูก Alt+M กับ mute; SRS ปัจจุบันกำหนด Ctrl+Alt+V เป็น PTT และ Alt+M เป็น mute เช่นเดียวกับ design target | ไม่มี SRS discrepancy ใน source snapshot นี้; PTT ยังเป็น requirement target ไม่ใช่ implementation proof. Local path คือ CV → Sentry → Motion → Signal → audio; latency ยังไม่ผ่านการวัด end-to-end |

### Route/decision/side-effect coverage ของ wireflow และ userflow — snapshot 2026-10-19

| Flow | Source ปัจจุบัน | ผลเทียบและช่องว่าง |
| --- | --- | --- |
| UF01 / F01 — เริ่มใช้, GSI, readiness | [App.tsx](../../src/src/App.tsx#L40) mount `CommandDeck`; [Control.tsx](../../src/src/app/Control.tsx#L500) แสดง `SetupCard` ในหมวด system; [SetupCard.tsx](../../src/src/app/cards/SetupCard.tsx#L7) เรียกติดตั้ง GSI config | **บางส่วน:** setup path มีจริง; ไม่พบ first-run gate component หรือ mount ใน source baseline นี้. Branch readiness/CV-Lite และผลลัพธ์ first-run ในแบบยังไม่ใช่ flow ที่ source บังคับหรือแสดงครบ |
| UF02 / F02 — match/live/debrief | [CommandDeck.tsx](../../src/src/CommandDeck.tsx#L578) มี Live/Build tabs; [capture.rs](../../src-tauri/src/capture.rs#L845) ต่อ minimap detection → G-Sentry → G-Motion → G-Signal; [companion.ts](../../src/src/companion.ts#L839) โหลด G-Log ในเครื่อง | **บางส่วน:** live surfaces และ local log path มี; summary ≤3 ข้อ, complete/partial timeline และ no-tick outcome เป็น target ที่ยังไม่มีหลักฐานว่าทำครบ |
| UF03 / F03 — voice inventory/preview/equip/editor | [CommandDeck.tsx](../../src/src/CommandDeck.tsx#L585) mount `VoicePacksPage`; [VoicePacksPage.tsx](../../src/src/VoicePacksPage.tsx#L46) มี inventory/items; [VoiceInventory.tsx](../../src/src/VoiceInventory.tsx#L205) rescan, [equip](../../src/src/VoiceInventory.tsx#L142) และ [preview](../../src/src/VoiceInventory.tsx#L170) | **บางส่วน:** inventory, equip และ preview มี; mapping editor ใน P03 และ Save/Discard/Stay ยังไม่อยู่ใน mounted route ที่ตรวจพบ |
| UF04 / F04 — store/economy | [CommandDeck.tsx](../../src/src/CommandDeck.tsx#L586) mount 4 store tabs; [StorePage.tsx](../../src/src/StorePage.tsx#L218) เรียก purchase; [wallet.ts](../../src/src/wallet.ts#L208) เรียก `purchase_item` RPC และ [TopupModal.tsx](../../src/src/TopupModal.tsx#L184) เริ่ม top-up; [WalletTab.tsx](../../src/src/WalletTab.tsx#L97) ดึง recent OpenDota match ID และ [MatchShareCard.tsx](../../src/src/MatchShareCard.tsx#L51) ส่งผ่าน [match-share-submit](../../supabase/functions/match-share-submit/index.ts#L65) | **ขัดกับ source snapshot:** แบบระบุปุ่มซื้อ/เติมเงิน disabled และไม่มี faucet side effect แต่ source มี purchase/top-up และ user-triggered match-share paths. Function lookup กับ OpenDota และเก็บ HMAC ref ไม่ใช่ raw G-Log. Call path ไม่ยืนยัน provider settlement, catalog rollout หรือ live acceptance |
| UF05 / F05 — account/Google/Steam | [AccountPage.tsx](../../src/src/AccountPage.tsx#L34) มี account/wallet/ledger/security tabs; [AuthPanel.tsx](../../src/src/AuthPanel.tsx#L40) เริ่ม Google sign-in; [SteamLink.tsx](../../src/src/SteamLink.tsx#L41) มี Steam link; [AccountSecurity.tsx](../../src/src/AccountSecurity.tsx#L53) ขอ sign-out sessions อื่น | **ตรงบางส่วน:** optional account surface มีและ app entry ไม่ถูก gate; security UI อ่าน provider state และรองรับ sign-out sessions อื่น แต่ไม่พบ factor enrollment หรือ recovery flow; provider/callback runtime ยังไม่ตรวจรับ; ขอบเขต C-3 ยังคงมีผลกับการเพิ่ม/เปลี่ยน auth policy และ recovery |
| UF06 / F06 — settings/privacy/cloud | [nav.ts](../../src/src/deck/nav.ts#L37) นิยาม 7 หมวด; [Control.tsx](../../src/src/app/Control.tsx#L184) เปลี่ยน settings state ทันที; [MasterCard.tsx](../../src/src/app/cards/MasterCard.tsx#L96) มี cloud-context opt-in; [master.rs](../../src-tauri/src/master.rs#L427) สร้าง cloud allowlist และบังคับ consent | **บางส่วน:** หมวดและ local settings มี แต่ไม่มี transaction Save/Cancel/Stay; consent toggle มีจริงและปิดเป็นค่าเริ่มต้น แต่การตรวจรับการส่ง context/provider ยังไม่ครบ; contract ลบข้อมูลทุก scope ไม่เท่ากับคำสั่งลบ G-Log รายไฟล์ |
| UF07 / F07 — history/recovery | [CommandDeck.tsx](../../src/src/CommandDeck.tsx#L624) mount overview/history; [HistoryPage](../../src/src/CompanionPages.tsx#L213) แสดงรายการและ pagination; [buildHistory.ts](../../src/src/live/buildHistory.ts#L20) แปลง log | **บางส่วนและมี mismatch:** มี log ในเครื่องเมื่ออ่านได้ แต่หน้าไม่มีเลือก session/detail/timeline/completeness; เมื่อ logs ว่างหรือคำสั่งใช้ไม่ได้ `buildHistory` คง MOCK fallback ไว้ จึงไม่รับประกัน empty/error ตาม target |
| UF08 / F08 — updater | [useAppUpdate.ts](../../src/src/useAppUpdate.ts#L47) auto-check; [install](../../src/src/useAppUpdate.ts#L80) เรียก install แล้ว relaunch; [lib.rs](../../src-tauri/src/lib.rs#L116) ดาวน์โหลดและติดตั้ง pending update | **ขัดกับ target:** มี check/install path แต่ไม่พบ in-game guard หรือขั้นเลื่อนจนพ้นเกม; ปุ่มปัจจุบันติดตั้งและ relaunch ทันที |

ตารางนี้ครอบคลุม route หลักของ UF01–UF08 บน source snapshot เท่านั้น; ไม่ได้ยืนยัน 88 viewer states, ทุก error branch, usability, native/runtime, provider settlement หรือ integrated SHA. รายละเอียดหน้าที่เป็น target และสถานะ viewer ระบุไว้ใน [[10-wireframes]], [[11-wireflows]] และ [[12-user-flows]].

### Transition registry เทียบกับ handler ที่ mount — `origin/main` `621c83d6` (2026-10-19)

สถานะ `wired` หมายถึงมี handler ใน route ที่ mount; `partial` หมายถึงมีทางเข้าหรือ action บางส่วนแต่ guard/state/return ตามแบบยังไม่ครบ; `target` หมายถึงไม่พบ action/CTA ของ transition นั้นใน route ปัจจุบัน; `viewer-only` หมายถึงสถานะตัวอย่างในแบบ ไม่ใช่ callback หรือผล runtime. การมี handler ไม่ยืนยัน native, provider หรือ gameplay acceptance.

| Registry IDs | สถานะ | หลักฐาน source และช่องว่างเทียบแบบ |
| --- | --- | --- |
| I-P01..P07 / Ctrl+1..7 | **wired / partial** | [PAGES](../../src/src/shortcuts.ts#L72) เป็น registry เดียวของ 7 หน้า; [NAV](../../src/src/deck/nav.ts#L32) สร้าง rail จาก registry และ [CommandDeck](../../src/src/CommandDeck.tsx#L452) ผูกคลิก/คีย์ลัดเข้ากับ `setTab`. ไม่มี unsaved-change guard; `liveTab`, `insightsTab`, `storeTab` อยู่ใน parent จึงคง subtab เมื่อสลับหน้า แต่ `HistoryPage` ถูก unmount และ pager กลับหน้าแรกเมื่อกลับเข้า |
| H-PROFILE | **partial** | [CommandDeck profile menu](../../src/src/CommandDeck.tsx#L520) เปิดและนำไป Account/Voice/Settings; ปิดเมื่อเลือกปลายทาง. ไม่พบ handler สำหรับ Escape/outside-close หรือคืน focus ตาม registry; global Escape ปิด palette/sheet/context menu แต่ไม่ปิด profile menu |
| J-POWER | **partial** | [Power menu](../../src/src/CommandDeck.tsx#L466) มี tray, quit และ drag handlers จริง ([tray](../../src/src/CommandDeck.tsx#L474), [quit](../../src/src/CommandDeck.tsx#L481)). ไม่พบ Escape/outside-close transition ตามแบบ |
| D-SETUP / D-VOICE / D-HISTORY / E-AI / B-AI / F-ALERTS / V-AUDIO / L-SETUP | **target** | [GMaidenFungDashboard](../../src/src/deck/FungDashboard.tsx#L10) ไม่รับ navigation callback; [VoicePacksPage](../../src/src/VoicePacksPage.tsx#L46), [HistoryPage](../../src/src/CompanionPages.tsx#L213) และ Live/Build body ไม่มี CTA ไปยังปลายทางเหล่านี้. หน้าปลายทางเปิดได้จาก global rail/Settings categories แต่ไม่ใช่ contextual transition ที่ registry ระบุ |
| D-LIVE / L-HOME | **partial** | Dashboard แสดง phase จากข้อมูลจริงและมี readiness/debrief views; P02 Live เปิดจาก rail ได้ ([CommandDeck](../../src/src/CommandDeck.tsx#L559)). ไม่พบ D-LIVE CTA จาก Dashboard ไป P02 หรือ L-HOME callback เฉพาะ; กลับ Dashboard ได้จาก global rail |
| L-BUILD / B-LIVE | **wired** | [CommandDeck Live tabs](../../src/src/CommandDeck.tsx#L578) สลับ Live/Build ด้วย `setLiveTab` ภายใน P02 โดยไม่สร้าง page route เพิ่ม |
| V-IMPORT / V-RETRY | **partial** | [VoiceInventory](../../src/src/VoiceInventory.tsx#L104) โหลด state และมี Rescan หลัง state พร้อม; error ตอน initial load แสดงข้อความแต่ไม่มีปุ่ม retry. Backend มี archive-import command แต่ไม่พบ import CTA ใน consumer P03; Store/AnnStudio เป็นคนละเส้นทาง |
| V-EQUIP | **wired** | [Equip](../../src/src/VoiceInventory.tsx#L142) เรียก `voice_api_action` แล้วเปลี่ยน active state หลัง backend ตอบ; แสดง error และคง state เดิมเมื่อ action ล้มเหลว |
| V-EDIT / V-CANCEL / V-SAVE | **target** | Consumer [VoicePacksPage](../../src/src/VoicePacksPage.tsx#L46) มี inventory/items เท่านั้น; ไม่พบ mapping editor หรือ Save/Discard/Stay route ใน P03. Backend editing commands ไม่ได้ทำให้ editor UI ของ consumer mount อยู่ |
| V-MORE / V-STORE | **wired** | [VoicePacksPage](../../src/src/VoicePacksPage.tsx#L67) มี “หาแพ็กเพิ่ม” ไป P04; กลับ Voice ได้จาก global rail และ local packs อยู่ใน P03 |
| T-VOICE / T-ACCOUNT / T-HOME | **partial** | P04 มี cross-link ไป Voice หลัง activate item และไป Account จาก sign-in CTA ([CommandDeck](../../src/src/CommandDeck.tsx#L601)); กลับ Dashboard ได้ผ่าน rail. ไม่มี dedicated T-HOME action ใน Store; route กลับหน้าหลักอาศัย global navigation |
| N-HISTORY / N-OVERVIEW | **partial** | [Insights tabs](../../src/src/CommandDeck.tsx#L624) สลับ Overview/History ได้; [HistoryPage](../../src/src/CompanionPages.tsx#L213) มีรายการและ pager แต่ไม่มีเลือก session/detail/timeline/completeness; page index รีเซ็ตเมื่อ component unmount |
| N-ACCOUNT / Q-STEAM | **partial** | Account/Steam surfaces ทำงานผ่าน [AccountPage](../../src/src/AccountPage.tsx#L24) และ [SteamLink](../../src/src/SteamLink.tsx#L10), แต่ History ไม่มี CTA ไป Account; เข้าได้จาก profile menu หรือ global rail |
| N-SYSTEM / N-RETRY | **target** | History มี empty message และ pager เท่านั้น; ไม่พบ error-to-System CTA หรือ retry handler ใน [HistoryPage](../../src/src/CompanionPages.tsx#L262). GSI setup/log อยู่ใน Settings/System คนละ route |
| Q-GOOGLE / Q-LOCAL | **partial** | [AuthPanel](../../src/src/AuthPanel.tsx#L40) เริ่ม Google sign-in และแสดง auth error; local core ใช้ได้เพราะ [App](../../src/src/App.tsx#L40) mount CommandDeck โดยตรง แต่ไม่มีปุ่ม Q-LOCAL โดยเฉพาะ |
| Q-OK / Q-ERROR | **viewer-only** | registry ระบุไว้ชัดว่าเป็น callback fixture ใน viewer. AuthPanel มีผล sign-in/error แบบ dynamic จริง แต่ viewer state ไม่ใช่หลักฐานว่า OAuth callback/runtime ผ่าน |
| Q-SECURITY / Q-LOGIN | **partial** | [AccountPage tabs](../../src/src/AccountPage.tsx#L24) เปิด Security/Account; [AccountSecurity](../../src/src/AccountSecurity.tsx#L39) อ่าน session, factor, device และ activity state และขอ sign-out sessions อื่นได้. ไม่พบ factor enrollment หรือ recovery-contact setup UI |
| Q-OUT / Q-REVOKE | **partial** | Sign out อยู่ใน [AuthPanel](../../src/src/AuthPanel.tsx#L32), unlink Steam ใน [SteamLink](../../src/src/SteamLink.tsx#L32), และ revoke other sessions ใน AccountSecurity. ไม่พบ entitlement panel, first-run gate component หรือ mount ใน source baseline นี้ |
| S-CAT-* | **wired** | [SETTINGS_CATS](../../src/src/deck/nav.ts#L37) มี General, Overlay, Voice, AI, Modules, Privacy และ System; [CommandDeck](../../src/src/CommandDeck.tsx#L635) สลับหมวดและแสดง Control category ตาม prop |
| S-GSI / S-SAVE / S-FAIL | **partial** | GSI ตรวจ/ติดตั้งได้ใน [SetupCard](../../src/src/app/cards/SetupCard.tsx#L7) ภายใต้ System; settings state เปลี่ยนทันทีผ่าน [Control](../../src/src/app/Control.tsx#L184), จึงไม่มี transaction Save/Cancel/Stay. General มี updater check error state แต่ไม่ใช่สถานะบันทึก settings; ไม่พบ generic save-failure flow ตามแบบ |
| S-PRIVACY / S-AI | **partial** | Privacy/AI categories มีจริง; AI controls อยู่ใน Control/MasterCard และ consent toggle มี backend guard ([MasterCard](../../src/src/app/cards/MasterCard.tsx#L96), [master.rs](../../src-tauri/src/master.rs#L427)). ยังไม่ใช่ flow บันทึก/ถอน consent แบบมี transaction ตาม wireflow |
| S-VOICE / S-HOME | **wired / partial** | Settings มี Voice category และ global rail ไป P03/P01 ได้; ไม่มี deep-link จาก Voice category ไป inventory หรือ return-to-origin handler เฉพาะ. การกลับทำผ่าน navigation ปกติ |

ข้อสังเกตระดับ transition: source ปัจจุบันมี navigation และ action หลายตัวที่ viewer แสดงเป็น target แต่ยังขาด contextual CTA/return guard; จึงให้คง route ใน design docs เป็น target จนมี handler และ acceptance ตรง flow. รายการนี้เป็น static source review เท่านั้น ไม่ใช่ screenshot audit หรือ native UAT.

รายการนี้เป็นผล static source review บน `origin/main` `621c83d6` ณ วันที่ระบุ ไม่ใช่หลักฐาน live provider, native UAT, game session, release binary หรือ SHA ที่ integrate แล้ว.

## E0 ฐานพัฒนาและข้อกำหนด

**Milestone:** M0 · **บทบาทที่เสนอ:** Product owner + integration engineer + QA

**ผลลัพธ์:** source baseline เดียวและขอบเขตที่พัฒนา/ตรวจรับได้จริง

**หลักฐาน:** source `25316ba8`, main `2d969ac6`, แพตช์ auth `56f9fbd1`, [[software-requirements-specification]], [[G-SERIES-DATA-LINEAGE]] และ [CR-034 execution plan](../operations/EXEC-PLAN-CR-034-iam-remediation.md)

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-001 | P0 / M | DONE | MVP-002 สำหรับขั้น B | **รวม baseline จาก working branch และ main.** ขั้น A ตรวจ/รวม source ใน worktree แยกทำขนานกับ environment ได้; ขั้น B รอ MVP-002 แล้วตรวจ regression บน merged source/lockfile; ผลลัพธ์มี SHA เดียว, ไม่มี patch ตกหล่นหรือเขียนทับงานขนาน และหลักฐาน regression ของส่วนที่รวม |
| MVP-002 | P0 / S | DONE | — | **ฟื้น development environment.** แก้ dependency junction ที่ชี้ G: เดิมด้วยการติดตั้งตาม lockfile, จัด pinned Rust/Node/pnpm ให้ตรง repo; เปิด dev app และสร้าง native no-bundle ได้โดยไม่เปลี่ยน dependency version เพื่อกลบปัญหา |
| MVP-003 | P0 / S | DONE | — | **ล็อก Companion MVP scope.** Owner ยืนยัน Voice/Memory, ขอบเขต summary, OS/game modes/heroes/layouts ที่รองรับ และรายการเลื่อน; ถ้าลดเป็น alert assistant ต้องแก้ PRD/SRS/คำสัญญาผลิตภัณฑ์ก่อน ไม่มีการนับฟีเจอร์ที่เลื่อนว่าเสร็จ |
| MVP-004 | P0 / M | DONE | MVP-003 | **กำหนด access/offline หลังยกเลิก Closed Beta.** ทำตาราง cold start, signed-out, network loss, revoke, new device, Terms change, update/recovery; เลือก local core optional account หรือ retained gate พร้อม owner/legal/security approval ที่จำเป็น ระบุ migration/rollback และ channel ปลายทาง ไม่มี blanket bypass |
| MVP-005 | P0 / M | DONE | MVP-003 | **กำหนด data contract ของ AI.** ทำ field-by-field allowlist/denylist พร้อมต้นทางและ consent; CV/raw G-Log/Memory ไม่ออก cloud, live stats ที่ไม่ผ่าน policy ไม่ส่ง; แก้ความขัดกันระหว่าง SRS/ADR/Privacy UI ให้ได้ contract เดียวและเก็บ approval ก่อนเปลี่ยน egress |
| MVP-006 | P0 / M | DONE | MVP-003 | **กำหนด acceptance matrix.** ระบุเครื่อง/OS/GPU/จอ/DPI/minimap/game mode, label set, precision/recall/false alerts ต่อแมตช์, latency landmarks, Voice STT/response targets และวิธีนับ CPU/RAM ทั้งระบบ; ตัวเลขคุณภาพต้องตกลงก่อนดูผลวัด ไม่ลด hard NFR เพื่อให้ผ่าน |
| MVP-007 | P1 / M | TODO | MVP-003, MVP-004, MVP-005, MVP-006 | **reconcile product contract และ diagram กับ code บน integrated SHA เดียว.** ครอบคลุม wireframe/sitemap, wireflow, userflow, execution DAG (.md/.json), system diagram/TDD และ PRD/SRS; map ทุก route, decision, side effect, data source และ owner/state กลับไปยัง code anchor; จัดประเภท target / present / wired / live-verified และเก็บ historical snapshot. Static review บน `origin/main` `621c83d6` อัปเดต PRD/TDD, design-system sitemap/stack, feature ledger, AGENTS/CLAUDE code refs, backlog crosswalk และเพิ่ม wireframe/wireflow/user-flow artifacts; SRS มี Alt+M mute/Ctrl+Alt+V PTT contract อยู่แล้ว. GSI own-player/session/death-count context แยกจาก enemy minimap CV; G-Motion ใช้ 5-minute history/heading heuristic; G-Signal ใช้ local voice/audio. Route หลัก UF01–UF08 มี source crosswalk ในตารางด้านบน แต่ uncovered states และ code gaps ยังเปิดอยู่. Static docs/doc-graph เป็นเพียง source-snapshot evidence. งานยัง TODO จนกว่า uncovered states จะถูกตรวจ, F04 purchase/top-up/faucet paths จะถูกตัดสินเทียบ deferred target, provider/update gates จะผ่านตาม scope และ native/live acceptance จะเกิดบน integrated SHA พร้อม owner acceptance; ห้ามนับไฟล์ component, call path หรือ release channel ว่า runtime/rollout ผ่าน |

## E1 เปิดแอปและตั้งค่า

**Milestone:** M1 · **บทบาทที่เสนอ:** Desktop/Rust + frontend + QA

**หลักฐาน:** [App](../../src/src/App.tsx#L40), [Control settings](../../src/src/app/Control.tsx#L184), [CommandDeck entry](../../src/src/CommandDeck.tsx#L561), [GSI server](../../src-tauri/src/gsi.rs#L589), [setup](../../src-tauri/src/setup.rs)

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-008 | P0 / L | TODO | MVP-001, MVP-004; MVP-043–045 ถ้าคง account gate | **ปรับ entry/runtime ตาม access policy ที่เลือกและตรวจใน release build.** MVP-004 ตั้ง account_gate_required=false; ใน source baseline นี้ App.tsx mount CommandDeck โดยตรง และไม่พบ GmadFirstRunGate component หรือ mount จึงห้ามอ้างไฟล์ gate เป็นหลักฐานว่ามี active gate หรือว่าการย้าย access flow เสร็จแล้ว. ทำ local core startup โดยไม่พึ่ง account/entitlement พร้อมคง server-side authorization สำหรับ protected account actions; ตรวจ signed-out, cold offline, network loss, revoke, account switch, new device และ Terms/version ตาม contract. ปิดได้เมื่อ frontend/native/channel/runtime matrix และ security gate ที่ใช้จริงผ่านบน integrated SHA; ห้ามถอด guard ฝั่งเดียวหรืออนุมาน approval จากเอกสาร |
| MVP-009 | P0 / M | DONE | MVP-001, MVP-002 | **ย้าย settings initialization ไป startup.** โหลด/validate settings หนึ่งจุดก่อนเริ่ม gameplay และ sync Control/Overlay/native; cold restart โดยไม่เข้าหน้า Settings คืน voice, sensitivity, persona, backend/model, privacy และ layout ครบ ไม่มี default cloud call ก่อน hydrate |
| MVP-010 | P0 / M | TODO | MVP-001, MVP-002 | **ทำ GSI setup และ port health.** แยก config exists/config valid/listening/waiting/live, แจ้ง port 3000 conflict ที่กระทบ GSI/OAuth, มี retry และเลือก/ซ่อม Dota path ที่ควบคุมขอบเขตได้; negative cases แสดงวิธีแก้โดยไม่ใช้ terminal |
| MVP-011 | P0 / M | TODO | MVP-009, MVP-010; ขั้น B รอ MVP-016, MVP-017, MVP-024 | **แทน readiness สมมติด้วยผลจริง.** ขั้น A ทำ contract/UI ที่แสดง unknown เมื่อยังไม่มี producer; ขั้น B ต่อ capture coverage/audio health จริงก่อนปิดงาน; ตรวจ resources, live GSI, overlay preview และ audible confirmation; null ไม่เป็น pass, overlay ไม่ pass ตายตัว และ Lite mode ชัด |
| MVP-012 | P0 / M | TODO | MVP-008, MVP-009, MVP-010, MVP-011 | **ตรวจ first-run และ restart ใน release mode.** บนเครื่องสะอาด/โปรไฟล์ใหม่ ทำ install→setup→deck→ปิดเปิด; ผ่าน/ขาด config, port ชน, ไม่มีเสียง, ไม่มีโมเดล และ offline แสดงสถานะตาม contract; เก็บภาพและ native logs ที่ไม่เผยข้อมูลผู้เล่น |


**หลักฐานปิด MVP-009 (Owner อนุมัติ 2026-10-20; integrated base SHA 6de1871ac227be05ab168d7616cae997b62baf24):** Cold-start แอป Tauri ในโปรไฟล์แยก; Dashboard แสดง volume 35% ก่อนเปิด Settings. หลัง restart, Settings UI และ native settings.json ตรงกัน: voice rate +2/volume 35, sensitivity high, persona Meme Partner, backend Ollama/model qwen3.5:9b, cloud opt-in/calibration/efficacy ปิด และ overlay position right/opacity 65%. DevTools Network บนการเริ่มด้วยค่าเริ่มต้นและ renderer reload หลัง cold-start แสดงเฉพาะ local ipc.localhost/secret_get; ไม่พบ external/provider request. Source ยืนยัน [native restore ก่อน GSI](../../src-tauri/src/lib.rs#L930), [Control hydrate และ emit](../../src/src/app/settings.tsx#L91), [Overlay hydrate](../../src/src/App.tsx#L25) และ [รับ settings update](../../src/src/app/Overlay.tsx#L194). GSI ยัง offline เพราะ Docker ใช้ port 3000; รอบนี้ยืนยัน settings startup/persistence.

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

**หลักฐาน:** [advice invocation](../../src-tauri/src/lib.rs#L417), [prompt/cache](../../src-tauri/src/master.rs#L51), [counter data](../../src-tauri/src/counter_advice.rs), [SLM](../../src-tauri/src/slm.rs), [Privacy UI](../../src/src/app/cards/MasterCard.tsx#L96)

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
| MVP-038 | P0 / L | TODO | MVP-003, MVP-005, MVP-006 | **ออกแบบและประเมิน local STT.** เลือก mic/STT dependency และ model จาก Thai/English corpus, วัด cold/warm latency/RAM พร้อม license/size/resource delivery; ระบุ PTT key ใหม่ที่ไม่ชน Alt+M, privacy/retention และ lifecycle; ไม่ใช้ cloud STT หรือดาวน์โหลด model เงียบ ๆ เพื่อเลี่ยงงบ |
| MVP-039 | P0 / M | TODO | MVP-038, MVP-024 | **ทำ PTT/mic lifecycle.** กดค้างเริ่มรับเสียง ปล่อยหยุด, มี listening indicator/device selection/permission error; ไม่ always-on, hotkey focus/เกม/อุปกรณ์หลุดไม่ค้างอัด และปิดแอปแล้วปล่อย device |
| MVP-040 | P0 / L | TODO | MVP-039 | **เชื่อม local STT และผลที่ไม่แน่ใจ.** Audio buffer มีขนาด/อายุจำกัด, Thai/English transcription ผ่าน corpus และ thresholds จาก MVP-006; silence/low confidence ขอพูดใหม่โดยไม่สร้างคำถามมั่ว, cancel ล้าง transient audio และไม่ส่ง audio ออกเครือข่าย |
| MVP-041 | P0 / L | TODO | MVP-040, MVP-029, MVP-036 | **ต่อ conversation turn.** PTT→STT→latest permitted context→local/cloud route ตาม policy→text/TTS, มี turn ID, single-flight/backpressure และ cancel; คำตอบสั้นตาม persona, Memory ใช้เฉพาะ local branch, no-model/timeout ยังมีทางออกชัดเจน |
| MVP-042 | P0 / M | TODO | MVP-041, MVP-025, MVP-031 | **ตรวจ Voice interruption และ privacy.** G-Signal ขัดคำตอบได้ตามงบ, interrupted turn ไม่กลับมาพูดข้อมูลเก่า; offline/mic unplug/STT error/end-match ผ่าน matrix, transcript/audio cleanup ทำจริง, วัด response ตาม contract ≤2s และรายงาน cold/warm แยก; ถ้าทำไม่ได้ต้องแก้ design/requirement ผ่าน owner |

## E7 Account และเส้นทางเว็บที่ MVP ยังใช้งาน

**Milestone:** M1 ตาม access decision · **บทบาทที่เสนอ:** Account/security + frontend/web + owner/legal ตามขอบเขต

**หลักฐาน:** แพตช์บน main `56f9fbd1`, [auth](../../src/src/auth.ts), [entitlement](../../src/src/gmadEntitlement.ts), [IAM runtime](../../supabase/functions/_shared/iam_runtime.ts), [Google predicate](../../supabase/functions/_shared/entitlement.ts), [landing routes](../../landing/src/main.tsx), [CR-034 plan](../operations/EXEC-PLAN-CR-034-iam-remediation.md)

งาน E7 เป็น C-3/HIGH เมื่อเปลี่ยน authentication/authorization/provider/schema ต้องต่อจาก approved CR-034 decision และ threat model/RLS/rollback ที่เกี่ยวข้อง การตรวจประวัติ deploy ไม่แทน live verification

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-043 | P0 / M | CONDITIONAL | MVP-001, MVP-002, MVP-004 | **ตรวจ auth remediation หลัง integration.** ทดสอบ local sign-out เมื่อ remote ล่ม, expired grace, account switch, delayed entitlement response และ native lock; local credential cleanup กับ remote revoke แสดงคนละผลอย่างถูกต้อง; ใช้ patch จาก main และแก้เฉพาะ regression ที่พบ |
| MVP-044 | P0 / L | CONDITIONAL | MVP-004, MVP-043 | **ปิด Google-session/revocation contract.** ตรวจ sign-in method ของ session และ revocation ทุก privileged endpoint ที่ยังใช้; admin AAL2 ต้องมีทาง enrollment/operation ที่อนุมัติหรือไม่เปิด surface นั้น; probe RLS/role/session กับ production ต้องมีขอบเขตและ approval ไม่ใช้ linked-provider metadata เป็นหลักฐานแทน session method |
| MVP-045 | P0 / M | NOT_APPLICABLE | MVP-004; legal approval ถ้ายังเก็บ Terms receipt | **ทำ Terms/account/download handoff ที่ยังจำเป็น.** ทุก CTA จาก desktop ไปหน้าที่มีจริง รวม redirect/rewrite/error/back-to-app; receipt version/optional consent แยกตาม legal decision; ถอน Closed Beta CTA/countdown ที่ขัดแผนตาม surface จริง โดยไม่สร้าง ops/payment ใหม่เกิน scope |

หาก account ยังเปิดให้ใช้แบบ optional งาน E7 ที่เกี่ยวข้องยังต้องผ่านก่อน expose เส้นทางนั้น การเลือก local core ไม่ได้ทำให้ auth ที่ยังมองเห็นอยู่ได้รับการยกเว้นโดยอัตโนมัติ

## E8 ตรวจรับและส่งมอบ MVP

**Milestone:** M6; baseline/instrumentation เริ่มได้ก่อน · **บทบาทที่เสนอ:** QA + release engineer + owner

**หลักฐาน:** [updater](../../src/src/useAppUpdate.ts), [governor](../../src-tauri/src/governor.rs), [perf harness](../../tests/perf/README.md), [CI](../../.github/workflows/ci.yml), [[releases/README]], [[release-channel-architecture]]

| ID | P / Size | สถานะ | Depends on | งานและเกณฑ์รับ |
| --- | --- | --- | --- | --- |
| MVP-046 | P0 / M | TODO | MVP-004, MVP-015 | **ทำ update ที่ไม่ขัดแมตช์.** ตรวจ/ดาวน์โหลดได้ตาม policy แต่ install/relaunch รอจบเกม; สถานะผิดพลาด/retry/channel/locked-user recovery ชัด, ทดสอบ signed manifest/platform และ rollback; ไม่เพิ่ม path ที่ bypass signature |
| MVP-047 | P0 / M | TODO | MVP-012, MVP-026, MVP-038, MVP-040 | **ตรวจ resource packaging และ clean install.** Model/labels/default voice/cache/GPU sidecar และ STT resources ที่เลือกมีครบหรือ provision ด้วยขั้นตอนที่ตกลง; รอ STT integration จริงก่อนปิด packaging; ตรวจ Windows/WebView prerequisite, install/upgrade/uninstall/data retention; missing/corrupt asset ให้ actionable error |
| MVP-048 | P0 / L | TODO | MVP-002, MVP-006; ผลสุดท้ายหลัง MVP-025, MVP-042 | **วัดและแก้ NFR ทั้งระบบ.** เริ่ม baseline เร็ว, วัด acquisition→audible onset รวม cold/cache-miss/interrupt/throttle; วัด process tree, peak RAM, STT/SLM และ PresentMon Dota FPS แบบ A/B บน matrix; ผ่าน ≤250ms p50/ทุก sample ≤300ms, CPU≤10%, RAM≤900MB, FPS drop≤3% หรือกลับไปแก้ design; SKIP ไม่ใช่ PASS |
| MVP-049 | P0 / L | TODO | MVP-006, MVP-012, MVP-021, MVP-026, MVP-031, MVP-033, MVP-035, MVP-037, MVP-042, MVP-046, MVP-047 | **รัน player journey และ fault matrix.** Fresh install→match→summary→restart→next match รวม GSI loss, malformed payload, alt-tab, capture/device/network failure, unknown data, crash/reconnect และ live alert accuracy; มี expected/actual, defect IDs, exact build และ local evidence ทุก scenario |
| MVP-050 | P0 / M | TODO | MVP-005, MVP-027, MVP-035, MVP-041 | **ตรวจ privacy/no-egress ที่ runtime.** เก็บ outbound destinations/payload fields ของ CLI/API/Ollama/account paths ด้วยข้อมูลทดสอบที่ไม่ระบุตัวบุคคล; local-only, non-consented fields, CV/raw logs/Memory และ transient mic data ไม่มี egress ที่ห้าม; forget/retention/diagnostic redaction ผ่าน |
| MVP-051 | P0 / M | TODO | MVP-001, MVP-002, MVP-006 | **ทำ verification matrix และ CI coverage.** Rust/clippy/eslint/tsc/Vitest/native smoke รวม landing/Deno/SQL เมื่อพื้นที่นั้นอยู่ใน scope; suites มี timeoutและแยก headless/live/manual gates, required check ชี้ exact SHA; doc graph/ledger ใช้ผลจริง ไม่มี disable check เพื่อผ่าน |
| MVP-052 | P0 / M | TODO | MVP-001–051 ทุกงานที่อยู่ใน scope; MVP-043–045 ต้องผ่านถ้า exposed | **ปิด acceptance และเตรียม release decision.** รวบรวม scope matrix ที่ไม่มี P0/P1 required ค้าง, known limitations, installer hash, CI/native/live/NFR/privacy evidence และ rollback; งาน conditional ที่ไม่ใช้ต้องมี scope decision อ้างกลับได้; owner ตรวจ Go/No-Go และอนุมัติช่องทาง; bump/tag/candidate/promote เฉพาะเมื่อสั่ง release และ main CI ของ SHA นั้น green ไม่ auto-open Beta |

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
| MVP-062 | P2 / M | DEFERRED | MVP-052 + explicit launch decision | **Public campaign และการขยายการแจกจ่าย.** ทำเมื่อเจ้าของเลือกแผนใหม่หลัง MVP ผ่าน; Closed Beta ที่ยกเลิกไม่ถูกเปิดกลับด้วย task นี้ ไม่มีวันนับถอยหลังที่ผูกมัดก่อน approval |

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
3. `MVP-010`, `MVP-013` เป็น implementation slices ถัดไปหลัง prerequisites ครบ
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
| 0.1.0 | 2026-10-10 | แตก roadmap M0–M6 เป็น 52 MVP tasks และ 10 deferred/separate-product tasks พร้อม priority, size, status, dependencies, source links และ acceptance; คง Voice/Memory ตาม SRS และบันทึก policy/security/release gates |
| 0.2.0 | 2026-10-10 | เพิ่ม execution DAG/waves; แยก baseline/readiness/performance/CI เป็นขั้น A/B โดยคง parent IDs; เพิ่ม producer, access และ STT packaging dependencies ที่จำเป็นต่อการทำงานขนาน |
| 0.3.0 | 2026-10-10 | บันทึก delegated decisions MVP-003–006 และรับ baseline MVP-001/002; legacy desktop handoff 045 ไม่อยู่ใน scope ตาม mvp-decisions |
| 0.3.1 | 2026-10-16 | Remove retired local review integration and related dependencies. |
| 0.3.2 | 2026-10-19 | บันทึกขอบเขตการอนุมัติแก้เอกสาร; เพิ่ม static flow-to-code evidence matrix; ทำ MVP-007/008 ให้แยก target, wired, verified และ security/runtime acceptance ชัดเจน |
| 0.3.3 | 2026-10-19 | ปรับสถานะ system-diagram row และ MVP-007 หลัง reconcile PRD/SRS/TDD กับ current source; คง TODO สำหรับ integrated-SHA coverage และ runtime evidence |
| 0.3.4 | 2026-10-19 | ขยาย static source audit ไปยัง feature map/ledger, AGENTS/CLAUDE, release/Beta และ hotkeys; ระบุ requirement conflicts และเก็บ MVP-007 เป็น TODO จนกว่าจะได้ product decision, integrated SHA และ runtime/provider evidence |
| 0.3.5 | 2026-10-19 | เพิ่ม source crosswalk UF01–UF08; บันทึก mismatch ของ store/match-share side effects, empty-history fallback, settings consent/save states และ updater gameplay guard; ยืนยันสถานะ execution DAG กับ JSON/decision record |
| 0.3.6 | 2026-10-19 | บันทึก Owner approval ต่อผล static audit และการแก้เอกสาร โดยคง MVP-007/008 และ runtime/provider/security acceptance ไว้ตามสถานะจริง |
| 0.3.7 | 2026-10-19 | เพิ่มการเทียบ transition registry ทุกกลุ่มกับ handler ที่ mount; ปรับ account-security evidence และแยก wired, partial, target, viewer-only ตาม source ปัจจุบัน |
| 0.3.8 | 2026-10-19 | Pin crosswalk to origin/main, repair stale source anchors and flow claims, and keep MVP-007/008 open pending integrated/runtime acceptance. |
| 0.3.9 | 2026-10-20 | ปิด MVP-009 หลัง isolated native cold-start acceptance บน integrated SHA; บันทึก settings persistence, provider egress ที่ไม่พบ และคิวงานถัดไป |
| 0.3.10 | 2026-10-28 | Align active RAM target with owner-approved800MB aggregate full Working Set (MVP decision v0.4.0); retain accounting and historical evidence. |
| 0.3.11 | 2026-10-28 | Align active MVP RAM ceiling to owner-approved900MB aggregate Working Set; preserve accounting and historical evidence. |
| 0.3.12 | 2026-11-01 | Link owner-directed G-Party GP-001–006 extension while preserving all 62 MVP task IDs/statuses and separate consent/native/live acceptance. |
