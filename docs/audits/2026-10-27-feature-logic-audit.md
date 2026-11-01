---
title: "G-Maiden — Feature Logic Audit 2026-10-27"
doc_id: "AUDIT-FEATURE-LOGIC-20261027"
status: draft
version: "0.2.0"
updated: "2026-10-28"
owner: "G-Maiden"
related_docs: ["mvp-decisions", "G-SERIES-DATA-LINEAGE", "CR-036-missing-alert-evidence"]
---

# G-Maiden — Feature Logic Audit 2026-10-27

**Historical snapshot:** findings/OPEN labels below describe the audited pre-fix source. Current source/test resolution and remaining live acceptance gates are tracked in [[RESULTS-AUDIT-COMPLETION-20261028]]; retain this original evidence rather than rewriting it as if defects never existed.

## Scope and result

ตรวจ source ของ `D:/gm-overlay-editor-fullscreen` ฐาน `4f19eb83` พร้อม uncommitted CV/overlay corrections ตามรายการฟีเจอร์ใน feature index/MVP และเส้นทาง runtime ที่เปิดจริง แบ่งรีวิวอ่านอย่างเดียวสามขอบเขต: game logic, UI/integration, advice/resources; ผู้ประสานตรวจหลักฐานซ้ำและทำ readonly probes. รายงานนี้ไม่เหมารวมว่า checkout อื่น/production มีสถานะเดียวกัน.

พบ **25 รายการเปิดอยู่: 7 P1 และ 18 P2** รวม defect กับ implementation/quality gaps ตามที่ระบุ หลายข้อเป็นข้อจำกัดที่ backlog ยอมรับว่ายัง partial ไม่ใช่ regression ใหม่. ยังไม่สรุปว่าทุกฟีเจอร์ถูกต้องจาก unit tests ผ่าน. Source fingerprint: `aa3be294a24bd863ba9331fc4156c55e52f31e6e72738991b5eea05e921a7df0`. Full source hashes/structured findings/probe outputs อยู่ใน local `src-tauri/target/feature-logic-audit-20261027/`.

## Original announcer runtime

ผู้ใช้ยืนยันว่า `ann-pack` (`pack_mrijgajn`) คือเสียงน้าค่อมเดิม ตรวจ15 WAVที่decodeได้และSHA256ตรงกับแพ็กเดิมทั้งหมด ครอบคลุม13/24events. เปิด isolated local debug build ที่ `D:/G-Maiden/src-tauri/target/ann-original-test-20261027-1651/g-maiden.exe` แล้ว `/announcer/install` ตอบok/activated=true; หน้าคลังเสียงแสดงANN-PACKใช้อยู่15clips/13events. ทดลองกดpreviewจากแพ็กเดิม ไม่มีการสร้างคลิปANNใหม่หรือยิงfakeGSI. Candidateมีเฉพาะoriginalpack ไม่มีlegacyflat/defaultAIclipfallback จึงปล่อยANNที่ไม่มีคลิปให้เงียบ. ไม่ได้ยืนยันเอกลักษณ์ผู้พูดด้วยacousticbiometrics; ใช้แพ็กที่ผู้ใช้ระบุและfileparity. เสียงMaiden/G-Signalเป็นอีกเส้นทางตามเดิม.

นี่เป็นการตั้งค่า **ตัวทดสอบlocal**; releaseStoreauthorization/fallbackpolicyไม่ได้ถูกแก้หรือปลอมpurchase/receipt. รอบแรกถูกหยุดด้วยEscapeและactivationยังไม่ผ่าน; รอบresumeเปิดใหม่คงทำงานเกิน15sและactivateผ่าน. ไม่อนุมานว่าprocessก่อนหน้าcrashเพราะอาจถูกผู้ใช้ปิด. ตอนตรวจUIใหม่อยู่Standby/GSIoffline ไม่ใช่หลักฐานlive-matchของรอบนี้.

## Evidence levels

- `READONLY PROBE`: เรียกproductionTSผ่านesbuildbundleจริง หรือextractbodyของpureRustfunctionsแบบตรงตัวใส่type-onlyharness; ไม่มีแก้source และไม่ใช่integrated/liveacceptance.
- Visibility: rosterรู้Axe, CV=null, missingว่าง → `visible`; positive control missing6000ms → `missing`/6s.
- Memory: sessionfilenameparser=None/eligible0/invalid=trueหลังcutoff; numericlegacyที่ใหม่กว่าcutoffeligible1.
- Announcer: pregame−90ให้match_start, horn0ว่าง; misseddeath/respawnแล้วkillหนึ่งครั้งให้killing_spree; batched totals2ให้first_blood.
- Native: listenerPID14868, `/health`404, packactivationสำเร็จและUIEquippedann-pack. ไม่ได้ยิงliveprovider/OAuth/payment/updateinstall หรือsimulateeventsเข้าGSI.
- Rust413ผ่าน/7ignoredและfrontend316ผ่าน/36filesเป็นผลก่อนauditรอบนี้ ไม่ได้rerunเต็มเพื่ออ้างว่า25findingsถูกแก้. Doc graphรอบนี้ผ่าน215tests; strictfindingsเดิม14รายการมีchecklistครบและuncovered0. NativeCV/liveภาพรอบก่อนเป็นboundedหลักฐาน ไม่ใช่whole-matchaccuracy/acousticlatency/CPU/RAM/FPSacceptance.

## Findings

### F01 [P1] ฐาน build ไม่รวม GSI auto-port/health จึง Sync ข้ามแอปไม่ได้ — OPEN

หลักฐาน: [src-tauri/src/gsi.rs:1087](../../src-tauri/src/gsi.rs#L1087) · `NATIVE ENDPOINT + SOURCE`

เซิร์ฟเวอร์ใน worktree นี้ bind เฉพาะ3000 และไม่มี GET /health ขณะที่ G-AnnStudio รุ่นในเครื่องตรวจ /health ก่อนทุก Sync; probe บน PID14868 ตอบ404. D:/G-Maiden/src-tauri/src/gsi.rs มี3000–3010และ /health อยู่แล้ว แต่เป็นอีก checkout/working tree.

แนวแก้/verification: รวม baseline ที่ถูกต้องแบบเลือกขอบเขต พร้อม protocol/port-conflict/Studio Sync tests; รักษา161 dirty paths ใน checkoutหลัก

### F02 [P2] เสียงที่เล่นกับชื่อแพ็ก/แบนเนอร์ใน log อาจเป็นคนละแหล่ง — OPEN

หลักฐาน: [src-tauri/src/audio.rs:227](../../src-tauri/src/audio.rs#L227) · `SOURCE + NATIVE CONFIG`

เมื่อ active pack ไม่มีคลิป หรือ releaseปฏิเสธแพ็ก local, resolver ใช้ default; gsi.rs621–643 และ voice_api/commands.rs532 ยังตั้งชื่อ/ภาพจาก active pointer. จึงรายงาน ann-pack ทั้งที่เล่น default AI ได้.

แนวแก้/verification: คืน provenance ของคลิปที่เลือกจริง; กำหนด selected-pack-only สำหรับ ANN ที่ผู้ใช้ไม่ต้องการ fallback โดยไม่ลด Store authorization

### F03 [P1] รู้ชื่อฮีโร่แล้วถูกแสดงเป็น visible แม้ไม่มี CV observation — OPEN

หลักฐาน: [src/src/live/buildHeroes.ts:130](../../src/src/live/buildHeroes.ts#L130) · `READONLY PROBE`

known roster + CV=null + missingว่าง ให้ state=visible. หลัง missing-state หมดอายุ companion.ts1092 ล้าง missing แต่ยังเก็บรายชื่อ ทำให้สถานะที่ไม่รู้อ้างเป็นเห็นอยู่. Probe actual TS ให้ Axe visible โดยไม่มี CV.

แนวแก้/verification: แยก identity ออกจาก presence; ใช้หลักฐานสด/coverage/readiness และคง unknown เมื่อไม่มีข้อมูล

### F04 [P1] G-Revive แปลงภัยคุกคามที่ยังไม่รู้เป็นคำแนะนำปลอดภัย — OPEN

หลักฐาน: [src-tauri/src/revive.rs:59](../../src-tauri/src/revive.rs#L59) · `SOURCE`

from_tick ใช้ allies_alive=4, base_under_threat=false ทั้งที่ยังไม่มี CV threat; เหตุผลและ prompt บอกปลอดภัย/ไม่ต้องซื้อเกิด แม้กำลังถูกตีฐาน. เป็น known MVP-019 partial input ที่ยังมีผลผิดในเส้นทาง live.

แนวแก้/verification: ใช้ unknown threat/insufficient evidence; ห้ามแปลงการไม่มีข้อมูลเป็น safe

### F05 [P1] ติดตั้งอัปเดตและ relaunch ระหว่างแมตช์ได้ — OPEN

หลักฐาน: [src-tauri/src/lib.rs:116](../../src-tauri/src/lib.rs#L116) · `SOURCE`

install_pending_update ไม่ตรวจ live session; useAppUpdate.ts77–81 เรียก relaunch หลังติดตั้ง. การดาวน์โหลดที่เริ่มก่อนเข้าเกมก็ข้ามเข้าแมตช์ได้.

แนวแก้/verification: Rust admission ก่อนติดตั้งและก่อน commit/relaunch; UI deferred state ไม่ใช่ guardเพียงจุดเดียว

### F06 [P1] ถอน cloud consent แล้ว request บาง interleaving ยังส่งและรับผลได้ — OPEN

หลักฐาน: [src-tauri/src/master.rs:393](../../src-tauri/src/master.rs#L393) · `SOURCE INTERLEAVING`

อ่าน consent ก่อน route แล้วอ่าน generation แยกที่396. ถ้า opt-out จบระหว่างสองอ่าน จะถือ routeเก่าแต่generationใหม่; cloud closure434 ไม่ตรวจซ้ำก่อนส่ง และผลตรวจgenerationผ่าน. เป็น source-level sequencing proof ไม่ได้ยิง provider จริง.

แนวแก้/verification: atomic request context + revocation generation; ตรวจ admissionก่อน provider launchและก่อน publish/cache พร้อม deterministic race testโดยไม่ใช้ network

### F07 [P1] Governor ยังไม่วัดทรัพยากรรวมตามสัญญา — OPEN

หลักฐาน: [src-tauri/src/governor.rs:491](../../src-tauri/src/governor.rs#L491) · `SOURCE REQUIREMENT GAP`

RAM วัด GetCurrentProcess เท่านั้นและใช้MiB; CPU job ไม่รวม Ollama/model processที่เปิดแยก. UIจึงอาจไม่สะท้อน whole-app limits; threshold400MiB ต่างจาก400000000bytes. Startup unavailableครั้งเดียวอาจเป็นfirst sample ไม่ใช่หลักฐานว่าตั้งjobล้มเหลว.

แนวแก้/verification: aggregate membership/accountingรวมWebView2/feeder/active external models; ใช้หน่วยbytesและเก็บ live budgets แยกจากunit tests

### F08 [P2] ล้าง Memory แล้ว log ชื่อแบบใหม่ถูกตัดออกตลอด — OPEN

หลักฐาน: [src-tauri/src/memory.rs:167](../../src-tauri/src/memory.rs#L167) · `READONLY PROBE`

log.rs106–114 สร้าง match-{session_id}-e{epoch}.jsonl แต่ filterหลัง clear รับเฉพาะUnixsecondsชื่อเดิม. Function harness แสดงชื่อsessionถูกตัดทิ้ง ขณะที่legacyที่ใหม่กว่าcutoffผ่าน.

แนวแก้/verification: ใช้เวลาเริ่มsessionจากข้อมูลที่เชื่อถือได้; รักษา forget cutoff ไม่ปล่อยlogเก่ากลับมาเพียงเพราะชื่ออ่านไม่ได้

### F09 [P2] shared previous tick ทำให้ kill banner และ auto-advice ไม่เกิด — OPEN

หลักฐาน: [src/src/app/Overlay.tsx:423](../../src/src/app/Overlay.tsx#L423) · `SOURCE`

persona effect เขียน prev.current เป็นtickปัจจุบัน ก่อน kill effect479และ auto-advice581อ่าน จึงเทียบค่าปัจจุบันกับตัวเอง. การ์ดkillและlevel/death adviceไม่เห็นedge.

แนวแก้/verification: derive transition snapshotครั้งเดียวหรือแยกprevious refs; mounted multi-tick regressionของทั้งสองฟีเจอร์

### F10 [P2] เดาเหยื่อที่ถูกฆ่าจากรายชื่อฮีโร่หาย — OPEN

หลักฐาน: [src/src/app/Overlay.tsx:451](../../src/src/app/Overlay.tsx#L451) · `SOURCE`

ทั้งpersona และ kill banner486 ใช้ missing.find(...) หรือ missing[0] เมื่อไม่มี last_victim_hero. การหายจากmapไม่ใช่หลักฐานว่าเป็นเหยื่อ.

แนวแก้/verification: ไม่มีvictim IDที่ยืนยันได้ให้ใช้คำทั่วไป/unknown; ห้ามเอาmissing listมาระบุเหยื่อ

### F11 [P2] เปลี่ยน backend/model แต่คำตอบ request เก่ายังเข้ามาได้ — OPEN

หลักฐาน: [src-tauri/src/runtime.rs:968](../../src-tauri/src/runtime.rs#L968) · `SOURCE`

backend/model setters ไม่เพิ่มrequest generation; masterตรวจเฉพาะconsent/session. MasterCard44invalidateเฉพาะepoch จึงรับคำตอบprovider/modelเดิมหลังเปลี่ยนค่า.

แนวแก้/verification: invalidate/cancelและตรวจconfig generationทั้งproducer/consumerเมื่อbackend/modelเปลี่ยน

### F12 [P2] throttle30วินาทีไม่กันคำขอพร้อมกัน — OPEN

หลักฐาน: [src-tauri/src/master.rs:401](../../src-tauri/src/master.rs#L401) · `SOURCE`

cacheถูกunlockก่อนproviderและบันทึกหลังตอบ; manualกับautoหรือหลายtriggerพร้อมกันจึงเห็นcache missและเปิดหลายinference.

แนวแก้/verification: single-flight/request admissionหรือbounded queue; cache/throttleเริ่มจากadmission ไม่ใช่เฉพาะcompletion

### F13 [P2] utterance ledger ไม่เท่ากับเสียงที่เล่นจริง — OPEN

หลักฐาน: [src-tauri/src/lib.rs:410](../../src-tauri/src/lib.rs#L410) · `SOURCE`

manual Askบันทึกutteranceก่อนผู้ใช้กดSpeak(MasterCard72). ANNก็emitหลังenqueue แต่ audio.rs94–98อาจdropเพราะcritical priority หรือ device/decodeล้มเหลว.

แนวแก้/verification: แยก generated/requested/admitted/played; อย่ารายงานgenerated textหรือdropped clipเป็นactually voiced

### F14 [P2] คำบรรยายซื้อเกิดจากความตายครั้งก่อนทับการ์ดครั้งใหม่ — OPEN

หลักฐาน: [src-tauri/src/lib.rs:455](../../src-tauri/src/lib.rs#L455) · `SOURCE`

ตรวจเพียงsession epoch; เมื่อfirst death requestตอบหลังrespawnและตายรอบสอง Overlay271นำข้อความเก่าใส่การ์ดล่าสุดในแมตช์เดียว.

แนวแก้/verification: death episode/request IDและinvalidateหลังrespawn/nextdeathทั้งRustและUI

### F15 [P2] burstปัจจุบันรวมของในstash/backpackโดยไม่แยกใช้งานได้ — OPEN

หลักฐาน: [src-tauri/src/items.rs:76](../../src-tauri/src/items.rs#L76) · `SOURCE`

item_names_fromเดินทุกvalue; self_burst(damage.rs701)ใช้รายการเดียวกับownership. Dagonในstashจึงเพิ่มactive burstที่G-Masterใช้. Existingtestยังคาดหวังให้เก็บstash Dagon.

แนวแก้/verification: แยกowned inventoryสำหรับNWจากeligible combat slots/availabilityสำหรับcombo

### F16 [P2] responseบัญชีเก่ากลับมาทับstateหลังsign-out/switch — OPEN

หลักฐาน: [src/src/profile.ts:20](../../src/src/profile.ts#L20) · `SOURCE`

profile/wallet131–173/StorePage204–208ไม่ตรวจuser/request generationก่อนpublish. ResponseของAอาจใส่name/GID/balance/ownershipในUIของB. ไม่ได้พิสูจน์ว่าserver authorizationถูกข้าม.

แนวแก้/verification: client request isolationและdeferred-response tests; งานaccountต้องตามC3 contractก่อนเปลี่ยนschema/auth/provider

### F17 [P2] OAuth callbackถูกแลกcodeหลายครั้งจากหลายhook — OPEN

หลักฐาน: [src/src/auth.ts:65](../../src/src/auth.ts#L65) · `SOURCE`

แต่ละuseAuthลงlistenเอง; Deck useProfile, Account useProfileและAuthPanelทำให้มีหลายlistenersสำหรับPKCEcodeเดียว. อาจสำเร็จหนึ่งตัวพร้อมแสดงerrorจากตัวอื่น.

แนวแก้/verification: single callback consumer/session service พร้อมmounted fanout regression; ไม่เปลี่ยนidentity/recovery contract

### F18 [P2] unlink/switchSteamแล้วยังเห็นOpenDotaของคนเดิม — OPEN

หลักฐาน: [src/src/companion.ts:1109](../../src/src/companion.ts#L1109) · `SOURCE`

syncIdentityเปลี่ยนaccountIdStateแต่ไม่ล้างod และnullไม่เพิ่มprofileRequestSeq. ข้อมูลเก่าคงอยู่หรือlate responseกลับมาหลังunlink.

แนวแก้/verification: invalidate profile generationและclear derived baselines/insightsทันทีเมื่อidentityเปลี่ยน

### F19 [P2] Previewแพ็กนอกเกมมีเสียงแต่bannerถูกGSI freshnessกันไว้ — OPEN

หลักฐาน: [src/src/app/Overlay.tsx:297](../../src/src/app/Overlay.tsx#L297) · `SOURCE + NATIVE PREVIEW`

VoiceInventory170กับRustlib319–325ส่งuntaggedpreviewและเล่นคลิป แต่Overlay301rejectถ้าไม่มีfreshGSI. เส้นทางoverlay-previewที่มีเทสเป็นคนละevent.

แนวแก้/verification: แยกpreviewrenderจากlivegame gate ให้ใช้preview expiryและไม่ปลอมgame-tick

### F20 [P2] ANN match_start ดังตั้งแต่pregameclockติดลบ — OPEN

หลักฐาน: [src-tauri/src/announcer.rs:157](../../src-tauri/src/announcer.rs#L157) · `READONLY PROBE`

PRE_GAMEถูกนับin_game; clock<=5รับ-90และseedstateแล้ว ไม่ประกาศเมื่อhorn0. Canonicalschemaนิยามclockเริ่ม0. Function harnessให้match_startที่-90และว่างที่0.

แนวแก้/verification: ติดตามclock/lifecycleopening transitionและกันnegativeclock/reconnect

### F21 [P2] ANNไม่ล้างสตรีคเมื่อตายแล้วเกิดระหว่างfeed gap — OPEN

หลักฐาน: [src-tauri/src/announcer.rs:197](../../src-tauri/src/announcer.rs#L197) · `READONLY PROBE`

resetเฉพาะalive->dead ไม่ใช้cumulative deaths. Probeเก็บ2killsก่อนgap ตาย/เกิดในgap แล้วkillถัดไปถูกประกาศkilling_spree.

แนวแก้/verification: invalidate/resetstreakจากdeath counterที่เพิ่มขึ้น พร้อมreconnect/epoch tests

### F22 [P2] ANNเดาfirst bloodจากbatchedscoreที่กำกวม — OPEN

หลักฐาน: [src-tauri/src/announcer.rs:218](../../src-tauri/src/announcer.rs#L218) · `READONLY PROBE`

previous score0+local kill deltaเพียงอย่างเดียวผ่าน แม้currentscoreรวม2และอาจมีคนอื่นฆ่าก่อน. Function harnessยืนยันemitfirst_bloodในกรณีนี้.

แนวแก้/verification: ต้องมีหลักฐานลำดับหรือunambiguousscoretransition; กรณีกำกวมไม่อ้างfirstblood

### F23 [P2] ANN/rodioไม่ประสานpriorityกับSAPIที่กำลังพูด — OPEN

หลักฐาน: [src-tauri/src/audio.rs:391](../../src-tauri/src/audio.rs#L391) · `SOURCE`

play_pathส่งCmdตรง; audio threadตรวจเฉพาะrodio priority ไม่ดูSAPI. เส้นทางกลับกันในtts.rs639ตรวจทั้งคู่ จึงเป็นasymmetric arbitration; ANNอาจทับ/ซ้อนSAPI adviceหรือcritical fallback. ไม่ได้ทำacoustic overlap trials.

แนวแก้/verification: ใช้audio admissionร่วมสำหรับทั้งSAPI/rodioและเก็บoverlap/preemption trials

### F24 [P2] GPU feederนับHTTP failureเป็นpushสำเร็จ — OPEN

หลักฐาน: [gpu-feeder/src/main.rs:96](../../gpu-feeder/src/main.rs#L96) · `SOURCE`

postเขียนTCPแล้วละเลยread/statusและคืนOk. HTTP404/500หรือreadtimeoutไม่เพิ่มfails; loop38จึงresetexitcounterและส่งต่อไปยังlistenerที่ไม่ใช่G-Maidenได้.

แนวแก้/verification: ตรวจstatus/ack/serviceและสัมพันธ์กับselectedport/owned parent; อย่าอนุมานการหยุดfeederจากTCPconnectอย่างเดียว

### F25 [P1] capture cadenceยังไม่ตรงlatency contractที่รวมการรอ — OPEN

หลักฐาน: [src-tauri/src/capture.rs:97](../../src-tauri/src/capture.rs#L97) · `SOURCE REQUIREMENT GAP`

125/250/500ms polling sleepsเป็นเส้นทางจริง; acceptedMVPกำหนดT0ก่อนรอscheduler/acquisitionและ500msเฉพาะwatchdog. Syntheticperfเริ่มหลังacquisitionจึงไม่รับรอง<=300msaudible. ไม่ได้วัดliveacousticครั้งนี้.

แนวแก้/verification: event-driven acquisition/evaluationและlandmarkT0–T3ที่ถูกต้อง; พิสูจน์CPU/RAM/FPSพร้อมlatency ไม่ลดCPUด้วยdelayที่กลบจากmetric

## Feature coverage

`CODE REVIEW OK` หมายถึงไม่พบ defect ใน pathsที่อ่าน ไม่ใช่พิสูจน์ทุกbranch/ทุกsessionหรือรับรองreleasedruntime.

| Feature | Assessment | Boundary |
| --- | --- | --- |
| GSI setup/port health | PARTIAL | ตรวจpayload/สถานะ/repairมีจริง; baseline/autoport/health mismatch F01 |
| Local startup | CODE REVIEW OK | ไม่บังคับบัญชีในApp; cold/offline/revoke native matrixยังไม่ครบ |
| Portrait roster/ID | CODE REVIEW OK + BOUNDED EVIDENCE | temporal/canonicalID/team/session/unknown gatesมีจริง; ภาพหลัก10/10และliveรอบก่อน5/5ไม่ใช่whole-match accuracy |
| Minimap CV | PARTIAL | classifier/negativefilter/allowlistมี; precision/recall/cosmetic/layoutcoverageยังไม่accepted |
| Top HUD alive/dead/ult cues | PARTIAL | chroma/textureheuristics ไม่ใช่authoritativedeath/ultimate readinessทุกcosmetic |
| G-Sentry | CODE REVIEW OK | dedup/temporal/missing/rearm/session/roster-removalถูกตามpathsที่ตรวจ; เฉพาะตัวที่เคยเห็นจริง |
| G-Motion | PARTIAL HEURISTIC | ไม่ใช่learnedpath/heatmap; anonymousdeadcountอาจdiscountคนละตัว เป็นdeclaredtradeoffรอcalibration |
| G-Signal | CODE REVIEW OK / QUALITY GAP | gates/hysteresis/cooldown/belief revisionตามหลักฐานมี; end-to-endlatencyยังติดF25 |
| G-Damage/self-burst | PARTIAL | baseline/standardbuildestimate; F15; ไม่ใช่exactenemydefense/currentpatchverified |
| Selected-target/action damage | LIBRARY ONLY | session/calibration/unknown testsมี; ไม่พบproductioncaller; AssassinateยังUNKNOWNอย่างตั้งใจ |
| Counter-item/NW | PARTIAL | staticlookup/canonicalaliases/unknown->emptyมี; currentpatchrecommendationqualityและราคาไม่accepted |
| G-Revive/respawn | PARTIAL | สูตรdeterministicมี; threatinput/rootcauselineageยังไม่ต่อ; F04/F14 |
| G-Master/Ollama/Claude | PARTIAL | manualroutes/allowlist/defaultoff/sessiontimeoutมี; F06/F11/F12; ไม่ได้เรียกmodel/providerรอบนี้ |
| G-Voice PTT/STT | NOT IMPLEMENTED TARGET | มีspecP0 ไม่พบPTT/microphone/STT/conversationlifecycle; TTSไม่เท่ากับtwo-wayVoice |
| G-Memory | PARTIAL | localreader/snapshot/forgetมี; F08; ไม่มีpost-matchconsumer/UI/death/MMR/stylederivationครบ |
| G-Log/utterance/history | PARTIAL | localJSONL/lifecycle/session/confinedreadมี; F13; fullsessionreview/decisionoutcomeไม่ครบ |
| G-Persona | PARTIAL | gentlelines/NerfCM/presets/interruptมีบางส่วน; F09; adherence/acousticacceptanceยังไม่มี |
| ANN event detector | PARTIAL | baseline/session/milestones/tiers/most_importantมี; F20/F21/F22 |
| ANN original-clip selection | CONFIG VERIFIED LOCALLY | ann-pack15originalWAV/13eventsactiveในisolateddebugcandidate; releaseStorepolicyไม่ได้ถูกเปลี่ยน; F02/F23ยังค้างในproductsource |
| G-Sensory/overlay | PARTIAL | render/editor/layout/fullscreenrestoreมี; F09/F10/F19; DPI/maximized/multimonitor/nativeplacementmatrixยังไม่ครบ |
| Settings/runtime sync | PARTIAL | bootstrap/persistence/migration/readyhandshakeมี; invokeerrorsหลายจุดถูกกลืน ไม่มีapplied-statefailureUIครบ |
| Dashboard/Live/Insights | PARTIAL | own-playerGSIliveและpublicOpenDotaมี; enemyfieldsจำกัดตามแหล่ง; F03/F18; BuildAdvisorยังมีMOCK |
| Governor/GPU feeder | PARTIAL | jobsetup/throttle/owned-childcleanupมี; F07/F24/F25; startupunavailableแรกไม่พิสูจน์sustainedfailure |
| Accounts/GID/Steam | PARTIAL | optionalGoogle/publicSteam/identityมี; F16/F17/F18; liveRLS/recovery/MFAdeploymentอยู่นอกauditนี้ |
| Store/wallet/payments | PARTIAL | catalog/RPC/Functions/UIมี; staleownershipF16; catalogsamplepreviewเป็นstub; payment/entitlementliveproofไม่ได้ทำ |
| Updater | PARTIAL | signedchannelcheckผ่านRustมี; F05; ไม่ได้install/relaunchอัปเดตจริง |
| G-Coach / G-Mind | DEFERRED | specล่วงหน้า/P1นอกMVP; ไม่พบmoduleตามcontract ไม่ใช่regressionใหม่ |
| G-Stream / G-Score | PROPOSED / NOT IMPLEMENTED | streamcohost/adaptivesoundtrackเป็นอนาคต; game scoreHUDไม่ใช่G-Score |

## Qualified limitations, not promoted to confirmed bugs

- G-Motion anonymous death discountอาจลบความเสี่ยงของคนละrotator; sourceระบุheuristictradeoffไว้ ต้องcalibrateไม่เรียกว่าenemy-specificdeathproof.
- Signalใช้per-hero60s cooldownอาจกันทีมใหม่ที่มีสมาชิกเก่า1คน; ยังเป็นpolicytradeoffเมื่อcontractไม่ชี้ว่าควรยกเว้นอย่างไร ไม่ใช้ตัวอย่างforever-blockedที่ไม่reachableหลังrotationwindow18s.
- Multikillเป็นfixed18sspanจากkillแรก; repoคำว่า18swindowยังไม่ชัดว่าต้องrolling. ไม่อ้างกติกาDotaปัจจุบันโดยไม่มีprimaryevidence.
- เปลี่ยนresolutionบนmonitorเดิมไม่invalidategeometryทันที เป็นunsupported-layoutrecoverylimitation; 720p/1440pอยู่นอกacceptedinitial1920×1080matrix จึงไม่สรุปว่าสupported1080pacceptanceล้มเหลว.
- startupCPUgroupunavailableอาจเป็นfirst-sampleที่ยังไม่มีdelta ไม่ใช่หลักฐานjobsetupfailureหรือperformanceผ่าน/ไม่ผ่านต่อเนื่อง.
- Store/auth/RLS/payment/securityproviderdeploymentยังไม่ได้ทำliveaudit; staleUIfindingsไม่เท่ากับserverauthbypass.

## Repair order

1. Reconcile baseline/port/health/Studio compatibility ก่อนใช้candidateเป็นตัวหลัก โดยรักษาunrelateddirtychanges. ทำreviewable narrowpatch ไม่copyทั้งcheckoutทับกัน.
2. แก้unknown/false-safe: presenceไม่เดา, buybackunknown, victimunknown; updaterbackendgameplayguard. Regressionต้องมีunready/expired/gap/death/update-crossing cases.
3. ปิดcloudrevocation/config-generation/single-flightgapsด้วยdeterministicbarrier tests ไม่มีprovidertraffic. Accountscopeต้องผ่านC3contractก่อนเปลี่ยนauth/schema/provider.
4. แก้event/transcriptcorrectness: separateprevioussnapshot, deathrequesttoken, ANNclock/deaths/firstblood, soundarbiter/provenance/admissionack และofflinepreview.
5. แก้Memorytimestampintegrationโดยรักษาforgetbarrier, combat-itemeligibility และidentity-derivedUIinvalidations.
6. หลังcodecorrectnessค่อยทำaggregateprocessmembership/realacousticlatency/CPU/RAM/FPSmatrix รวม PTT/STT/Memoryconsumerงานที่ยังเป็นtarget. Localunit/syntheticpassesไม่ปิดacceptanceเหล่านี้.

รอบนี้แก้เฉพาะruntimeconfigurationของเสียงตามคำสั่ง และเพิ่มaudit/probes; **25findingsยังOPEN ไม่มีproductioncodefix/commit/PR/merge/releaseจากauditนี้**.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-27 | Read-only feature logic audit, bounded production-function probes and resumed original-announcer local activation. |
| 0.2.0 | 2026-10-28 | Preserve historical findings and link the current full-audit completion ledger. |
