---
title: "VRZO synchronized banner validation"
doc_id: vrzo-banner-validation
status: active
version: "0.3.3"
updated: 2026-10-30
owner: G-Maiden
---

# VRZO synchronized banner validation

เอกสารนี้อธิบาย source integration และขั้นตอนตรวจ local candidate; **ยังไม่ใช่หลักฐานรับรองในเกมหรือ release** ดูแบบ [[2026-10-29-vrzo-synced-banner]] (`docs/superpowers/specs/2026-10-29-vrzo-synced-banner.md`) และงบปัจจุบันใน [[mvp-decisions]] (`docs/product/mvp-decisions.md`).

## Identity และ trust

- แพ็กเป้าหมายคือ `pack_vrzo_20261028` v0.2.0; catalog ภายใน `src-tauri/src/vrzo_catalog.json` มี 15 events / 21 clip variants และ hash ของเสียงกับ composite video แต่ละรายการ วิดีโอ bundled จาก Studio v8 เป็นภาพประกอบครบ ไม่ใช่ effect-only stock.
- ใช้ event และ clip ที่ announcer เลือกจริง พร้อม SHA-256 ของ bytes ที่ audio owner ถอดรหัส เทียบกับ catalog ก่อนส่ง visual ID ไป overlay; clip ผิด event, ไม่รู้จัก หรือ hash ไม่ตรง ไม่สร้าง VRZO visual การเทียบ hash ไม่ใช่หลักฐานว่า imported pack ได้ลายเซ็น Store, entitlement หรือสิทธิ์จำหน่าย และไม่เปลี่ยนกฎ trust/installation เดิม.
- วิดีโอ WebM ปิดเสียงเสมอ และเสียงมาจาก rodio; ไม่เปิดเสียง embedded ใน WebM ซ้ำ. Frontend จำกัด URL ให้เลือกจาก asset IDs ที่ bundle ไว้ และ video ที่เล่นไม่ได้ถูกล้าง.
- ข้อความใน asset บางรายการเป็น **draft**; Beyond Godlike 01 เป็น event-title placeholder. Caption ที่ยืนยันแล้วตาม Studio handoff ได้แก่ Double Kill, Rampage, Mega Kill, Unstoppable และ Kill 05; First Blood คง reviewed example ที่ตัด interjection ต้นคลิป ไม่ถือว่า caption อื่นผ่าน review.

## v8 mixed audio และ event ownership

VRZO v8 verifies the selected original WAV snapshot and the bundled mixed WAV snapshot separately, then admits exactly one mono48k PCM16 source through rodio. Mixed bytes must match their catalog hash, format and original duration; failure plays original once, suppresses the v8 visual and logs the reason. Lifecycle carries distinct original/played hashes. Silent video is cancelled even during its natural-completion tail. Native GSI owns gameplay pack events when announcer is enabled; Overlay does not issue a second persona clip. Personal events require player SteamID agreement with the active local Steam login (read-only HKCU ActiveProcess.ActiveUser; provider SteamID is not required); unknown identity is silent, owner changes reseed, and aggregate kill jumps do not establish multi-kill timing. Native acoustic/sync and false-event match acceptance remain unverified.

READY manifest SHA-256: `1868efeb10a211883b798100600e18df6f7aa45e7a1ec0c1d29243a4e56029b5`. Offline intake independently verified21 original, mixed and video hashes, mono48kPCM16 duration parity and silent VP9 alpha stream metadata. This does not establish native acoustic/alpha acceptance.

## Lifecycle และ preview

เมื่อ rodio รับ source เข้าเล่นแล้ว audio owner ออก playback identity และแจ้งผ่าน channel แบบ bounded/nonblocking ไป worker นอก audio thread; การรับ source ไม่พิสูจน์เวลาที่เสียงออก DAC. สถานะที่ไม่เข้าเล่นไม่ควรมี visual start. Overlay ตรวจ playback identity, event/clip, session และขอบเขต preview; visual เก่าหรือเปลี่ยนแพ็ก/เซสชันต้องไม่กลับมาแสดง.

เสียงจบตามปกติอนุญาต silent visual tail ไม่เกิน 3.2 วินาทีและไม่เกิน expiry; cancel, เปลี่ยน scope หรือปิดหน้าต่างล้าง visual; same-scope preemption uses the bounded retirement below. Worker และ event queue มีขอบเขต และการปิด/ยกเลิก WebM ปล่อย element/resources. ระยะเวลานี้เป็นสัญญาใน source ไม่ใช่ผลวัดความตรงของภาพกับเสียงจริง.

เลือก VRZO เป็นแพ็กที่ใช้งาน แล้วเปิด Voice inventory และใช้ **ทดลองแบนเนอร์ VRZO** เลือก event/variant และกด **ทดลองภาพและเสียง**; ตัวเลือกถูกปิดหากไม่ได้ equip VRZO. Preview ใช้เส้นทาง admission เสียงจริงแต่แยก identity จาก event ในแมตช์ จึงไม่ควรเปลี่ยน GSI หรือ match state. เมื่อไม่พบไฟล์/คลิปไม่ตรง catalog ให้แสดง failure แทนการเดา variant.

## Resource accounting และ PID reuse

Candidate แรกพบ CPU-group unavailable เพราะ PID ของ G-Maiden ถูกใช้ซ้ำและ process เก่าระบุ parent PID เดียวกัน ทั้งที่เริ่มก่อน G-Maiden. Source แก้ lineage ให้เทียบเวลาเริ่มของ parent/child และ identity ซ้ำกับ Job/readings; process ที่เข้าถึง identity ไม่ได้ยัง fail closed และลูกจริงนอก Job ยังไม่ผ่าน. ยังต้องยืนยันบน native candidate ใหม่; snapshot lineage อย่างเดียวมองไม่เห็น breakaway ที่ parent ระดับกลางจบไปก่อน จึงไม่อ้างว่าพิสูจน์ครอบคลุมทุก orphan. ไม่หยุดหรือย้าย process ภายนอกและไม่เปลี่ยนงบ.

## บันทึกผล native และในเกม

สถานะ ณ 2026-10-29: **WebView2 alpha, mute/single audible playback, first cold-play timing, live match synchronization, CPU/RAM/FPS impact และ G-Signal latency: NOT_RUN**. การตรวจ catalog/asset hashes, unit tests, jsdom, build หรือ process startup ไม่แทนการเห็นภาพและได้ยินเสียงจริง.

เมื่อมี local candidate และผู้ทดสอบพร้อม ให้บันทึก build hash, OS/WebView2 version, asset/pack identity และสภาวะเกม แล้ว:

1. เลือก preview ให้ครบ 15 events / 21 variants รวม kill 6 แบบและ beyond godlike 2 แบบ ตรวจว่าภาพตรงคลิปและได้ยินเสียงเพียงครั้งเดียว ทั้ง cold play แรกและการเล่นซ้ำ.
2. ตรวจ alpha บน Tauri/WebView2 overlay จริงบนพื้นหลังเกมหลายสี หากภาพทึบหรือ decoder ไม่รองรับให้บันทึก failure และขอ asset format ที่เหมาะสมจาก Studio; ห้ามสรุปผ่านจาก export metadata.
3. ทดสอบเสียงถูกปฏิเสธ, การยกเลิก, preemption, playback ใหม่ระหว่าง tail, การเปลี่ยนแพ็ก/แมตช์ และการปิดหน้าต่าง; สังเกตไม่ให้ visual เก่าหลงเหลือหรือเริ่มจากเสียงที่ไม่ผ่าน admission.
4. วัดเวลา source admission, visual start ที่เห็นจริงและเสียงที่ได้ยินแยกกัน พร้อมวิธีวัด/uncertainty; การส่ง event หรือ callback ไม่พิสูจน์ acoustic/presentation sync. จากนั้นทดสอบ event ที่เกิดจริงในแมตช์และบันทึกขอบเขตที่ได้เห็น.
5. วัด whole-app aggregate Working Set รวม process ที่ MVP กำหนด ภายใต้เพดาน **900,000,000 bytes**, CPU ทุก 1 วินาที, Dota FPS impact และ G-Signal latency ตามขั้นตอนใน MVP decision พร้อมแยกก่อน/หลังและสภาพงานเดียวกัน. ค่า snapshot/peak ของ process เดียวไม่ใช่ aggregate acceptance.

เก็บหลักฐาน local-only โดยไม่ส่งภาพหรือข้อมูลแมตช์ออกจากเครื่อง. Local unsigned build ใช้ทดสอบเท่านั้น; การรวม source หรือเปิด candidate ไม่ได้สร้าง release, Store package หรือ updater manifest.

## การตรวจ candidate หลังแก้เสียงและมินิแมป

Local candidate วันที่ 2026-10-29 ผ่าน Rust 616 tests (7 existing ignored), frontend 523 tests, Clippy, TypeScript, ESLint และ native no-bundle build. Rust attempt แรก timeout ระหว่าง link โดยยังไม่ได้รัน tests; retry ผ่าน แยกหลักฐานทั้งสองรอบไว้ในเครื่อง.

เสียงใช้ Windows MMCSS บนเธรดที่ดึง PCM จริง และมี counters วัดช่วงหยุดดึง sample โดยไม่เขียน log ใน callback. Native Voice preview หนึ่งคลิปยืนยันว่า MMCSS ลงทะเบียนสำเร็จและเล่นจบ โดยไม่พบ consumption gap เกิน 50 ms; ตัวเลขนี้ไม่ใช่การบันทึกเสียงออกลำโพงและไม่รับรองอาการสะดุดระหว่างเกม. CV คืนเวลา CPU ตามเวลางานจริง และนับเวลารอนั้นรวมใน critical deadline เดิม.

**Resource acceptance ยังไม่ผ่าน**: พบ startup transient เกินเพดาน RAM 900,000,000 bytes และ whole-app CPU group unavailable; capture throttling ยังทำงาน. Live minimap 60 FPS, ผลต่อ Dota, เสียงในแมตช์ และ aggregate resource acceptance ยังต้องตรวจซ้ำ. การ merge นี้รวม source สำหรับทดสอบต่อ ไม่ใช่การ release หรือเพิ่มเพดานทรัพยากร.


## VRZO filesystem revision 3 transition contract (historical)

Owner-directed local candidate change,2026-10-30: ID manifest revision3 preserves every sound ID and all63 WAV bytes;21silent1280x560 VP9 alpha files now60fps/CRF32 with one lossless transparent final frame. Native width680px/max72vw. Natural completion permits a3.2s silent tail, including approximately0.7s eased fade; expiry still bounds it.

Same-scope announcer replacement starts the new selected event immediately at normal audio rate/gain. Previous visual plays2x with300ms opacity fade; previous voice receives a sample-accurate150ms fade. Bound to one active plus one outgoing visual/sink; a third arrival removes oldest outgoing. Preparation admission is3slots, at most12MiB PCM. Critical/non-announcer interruption, explicit cancellation, pack revision/session invalidation or live announcer disable hard-stops stale announcer sources. Audio owner validates scoped sources on its50ms control loop, outside the output callback. Draft match_start retains the active-session contract. New audio remains uniquely selected/verified; overlap is a bounded old-source retirement authorized by the owner.

Verified native video byte cache is24MiB/6entries, keyed by admitted revision/path/hash/file metadata. One worker coalesces the latest pending warmup, preloads FirstBlood/DoubleKill/firstKill on activation/startup, then predicts next multikill on relevant events. Pack cache rebuild invalidates snapshots and stale worker insertion. It does not preplay audio or run hidden animations, and byte warmup does not establish decoder readiness. Local-only G-BannerVisual receipts record browser frame/drop/first-frame counters; native playback, visual smoothness and900,000,000-byte resource acceptance must be measured separately. No SQL/release or player-data egress.

Current checks/asset/native evidence: ignored target/vrzo-smooth-20261030 and Studio workspace/vrzo-smooth-v3. Historical v8/v2 receipts remain historical; these local receipts do not establish release or native acceptance.


## VRZO filesystem revision 4 ready-frame contract

This runtime contract supersedes the revision3 video/runtime policy. Release and native acceptance remain separate. Revision4 keeps all IDs and63 WAV bytes;21 silent VP8 alpha videos are960x420/60fps, rendered directly from1280x560 Canvas sources. Apparent width remains680px/max72vw. Video ends with a fully transparent frame after its intended3.2s post-audio tail (including0.7s eased fade).

The Overlay owns at most3 video DOM nodes total: active, optional retiring, and remaining paused warm candidates. Native ID-only hints carry resolved pack generation, on startup/activation, predicted events and Control variant selection. Muted first-frame preparation pauses rather than looping hidden media; admitted playback reuses the prepared node. Scope change destroys stale candidates. Same-generation hints preserve useful paused nodes and evict only an unclaimed lower-priority candidate under capacity pressure. Byte-cache warmup alone is not decoder readiness. The ID protocol allows at most3 simultaneous verified reads and waits at most500ms for a permit, then checks the generation again; no arbitrary webview filesystem path is accepted.

Natural completion permits the queued current=0 lifecycle state while its audio generation and scope still match. Video ended clears normally; native/frontend hard caps allow up to4.2s after completion receipt (3.2s intended tail plus1s bounded decoding grace), under the original15s lifetime. Duplicate completion cannot extend the deadline. Cancellation, critical interruption, pack/session invalidation and expiry remain hard fences. Same-scope replacement retains the old visual2x/300ms opacity fade and old voice150ms fade; incoming image/audio start without waiting for old retirement, at normal rate. At most one active and one outgoing source remain.

Local visual receipts distinguish warmed/cold, wait count, first nontransparent presented frame (frame1 rather than transparent frame0), frame/drop deltas excluding preparation, full media duration and ended/cleared/error. Native acceptance must separately verify FirstBlood, DoubleKill, Rampage, quiet drops, complete fade and rapid differing-event insertion. Target ready first present<=100ms and quiet drops<=1% per clip. Source/asset tests do not establish these native gates or acoustic/whole-match/FPS acceptance. Aggregate RAM ceiling900000000bytes, original Nakhom, local-only data and filesystem-only persistence remain unchanged. Evidence: target/vrzo-ready-20261030 and Studio workspace/vrzo-smooth-v4; native results are recorded there without rewriting failed v3 evidence.

## Local .gann container (2026-10-30)

Owner-authorized local package import is available separately from signed Store installation. `.gann` v1 is an indexed ZIP with `gann.json`, one canonical `ann_<UUID>.json`, ID-named audio/video, and inert authoring stock under `motion/`. Preserve registry config/component/instance/cue IDs and unknown authoring fields. Do not execute imported scripts. No SQL is introduced.

Trusted Control imports a local file, validates bounded paths/counts/sizes and SHA-256 references, admits all native audio/video pairs, preserves a content-addressed original under `voice-cache/containers/<sha256>.gann`, and atomically installs a playback cache under `packs/<announcer_id>/`. Identical reimport is idempotent; a conflicting same-ID package is refused and active selection remains unchanged. A local origin record is not a Store receipt, signature or entitlement. Release runtime inventory/equip/clip validation must explicitly accept admitted local containers without weakening the signed Store path. Events use existing native caches and do not unzip in the audio hot path.

G-AnnStudio opens the same container through its package panel or a file argument, inspects configuration, previews each mapped mixed WAV with its muted WebM, and can save a byte-identical copy. A file association is declared for installed builds; a no-bundle build does not register it in Windows. Existing authoring projects are not overwritten. Evidence and portable source are under Studio `workspace/gann-container-v1`; tests/build/UI results there remain distinct from live-match, acoustic, frame-drop or whole-match resource acceptance.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-29 | Document decoded clip identity, bounded visual lifecycle, pack trust and pending native and live validation. |
| 0.2.0 | 2026-10-29 | Add v8 provenance/fallback, single gameplay owner and personal-event gates. |
| 0.3.0 | 2026-10-29 | Record local regression/native preview evidence and open resource/live acceptance. |
| 0.3.1 | 2026-10-30 | Record larger60fps ID visuals, predictive bounded cache and owner-authorized visual/audio retirement. |
| 0.3.2 | 2026-10-30 | Record revision4 paused decoder preparation, VP8 media and bounded natural-completion grace. |
| 0.3.3 | 2026-10-30 | Add indexed container admission and package preview validation scope. |
