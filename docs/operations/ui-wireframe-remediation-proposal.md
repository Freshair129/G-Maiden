---
title: "UI wireframe remediation — WF-01 ถึง WF-07"
doc_id: "ui-wireframe-remediation-proposal"
version: "0.3.0b"
status: "accepted"
approved_by: "Boss"
approved_date: "2026-09-13"
updated: "2026-09-13"
owner: "Boss"
attributes:
  domain: "ui-ux"
  change_class: "C-2"
  risk: "MEDIUM"
---

# สเปกแก้ UI ให้ตรง One Canvas

**Boss อนุมัติให้ implementation เมื่อ 2026-09-13 (ข้อความ “approbvve”).** ขอบเขตคือ WF-01–WF-07 จาก
[รายงานตรวจ UI](../audits/ui-wireframe-alignment-2026-09-13.md) บน source `e5012bf`, app `0.13.2`.
Approval นี้ครอบคลุม layout, copy, navigation และ verification ตามสเปกนี้โดยเฉพาะ.

## เป้าหมายและหลักฐาน

ทุกหน้าคง heading และ navigation ใน panel เดียว เข้าถึงเนื้อหาและ action ได้ครบเมื่อข้อมูลยาว
และใช้ material ตาม design system. ตรวจด้วย geometry, interaction และภาพก่อน/หลัง ไม่ใช้การ build ผ่านแทน visual acceptance.

[RCA](../../.brain/rca/2026-09-13-ui-wireframe-drift.md) ยืนยันว่า retained auto-scroll rules
และ full-height children ที่ไม่หักพื้นที่หัวหน้าทำให้ Voice/Account ล้น; Audio category รวมการ์ดเกินพื้นที่;
domain card selector ยังใช้ gradient/shadow เดิม.
หลักฐาน: Voice 1225/720px, Account wallet 868/622px, Audio detail 836/622px ใน
[scroll probes](../../.brain/verification/ui-wireframe-2026-09-13/scroll-probes.json).
ข้อความ account optional, CTA ซ้ำใน DEV และ Insights ไม่มี navigation action มี source evidence ใน audit.

## เอกสาร parent และ peer ที่กำกับงาน

| Authority | สัญญาที่รักษา |
| --- | --- |
| [CR-013](../change%20request/CR-013-one-canvas-sitemap-gstore-ios-settings.md) §2–4 | One Canvas, overflow → tabs/pagination, Settings 7 categories, ตัดการ์ดซ้ำที่ระบุไว้ |
| [Foundations](../design-system/01-foundations.md) §2.1 / [Components](../design-system/04-components.md) | Interior ใช้ instrument matte/hairline; glass อยู่ shell/FAB/pop layers |
| [Layout](../design-system/03-layout.md) / [IA](../design-system/05-sitemap-ia.md) | Authored stage 1420×760, panel 1280×720, 7-page navigation และแท็บที่มีอยู่ |
| [Account/GID](../design-system/08-account-gid.md) | คำอธิบาย privacy และ teaching empty พร้อม CTA ไป Account |
| [CR-022](../change%20request/CR-022-gmad-desktop-first-run-entitlement-account-handoff.md) §5, §8 | Release first-run gate, Google primary, Terms/entitlement, approved process-local grace |
| [UI flow board](../architecture/g-maiden-ui-sitemap-flow-board.md) | ขอบเขต control กับ native overlay และเจ้าของการตั้งค่า |

ใช้ CR-022 รุ่นปัจจุบันเมื่อข้อความ first-run/7-day receipt ใน IA เก่าขัดกัน.
คง bigMode/default scaling ที่ source บันทึกการอนุมัติจาก Boss ไว้ใน
[deck prefs](../../src/src/deck/prefs.ts); ไม่ใช้ข้อความ max-scale เก่าเปลี่ยนพฤติกรรมนั้น.
SVG annotated เดิมเป็น historical Dashboard จึงไม่ใช้เป็น pixel baseline ของทั้ง 7 หน้า.

## Layout ที่เสนอ

### WF-01 — Voice: แบ่งพื้นที่คงที่และ paginate แพ็ก

คง 3 modes ที่ใช้อยู่: `คลังของฉัน | ไอเทม | ตัวแก้ไข` และ `หาแพ็กเพิ่ม →`.
คง header/actions/status notices เหนือพื้นที่เนื้อหา โดยจัดสรรความสูงที่เหลือจริงด้วย flex และ `min-height: 0`.

```text
Voice title / mode tabs / หาแพ็กเพิ่ม                 fixed
Inventory title / Import / Rescan / Folder / Editor   fixed
┌───────────────────────────┬──────────────────────────┐
│ Pack grid — current page  │ Selected pack summary    │
│ จำนวนแถวตามพื้นที่จริง      │ Equip / Preview          │
│                           │ Event coverage region    │
├───────────────────────────┤ (bounded)                │
│ ก่อนหน้า / หน้า x/y / ถัดไป │                          │
└───────────────────────────┴──────────────────────────┘
```

- คำนวณจำนวนแถวจากพื้นที่ grid จริงตาม pattern `rowsThatFit`; ห้ามย่อ font เพื่อเพิ่มจำนวนแถว.
- ทุกแพ็กต้องเข้าถึงผ่าน pagination; clamp หน้าที่เลือกเมื่อ Rescan/Import เปลี่ยนจำนวนแพ็ก.
  การเปลี่ยนหน้ารายการไม่เปลี่ยน active pack; selection/detail ใช้ id เดิมจนแพ็กนั้นหาย.
- Detail summary/actions อยู่ในกรอบเสมอ; description ยาวและ event coverage ใช้พื้นที่ย่อยที่มีขอบเขต
  และเข้าถึงด้วย keyboard. ไม่ให้ aside ขยายความสูงทั้งหน้า.
- Editor แบ่ง subtabs `ติดตั้งและสร้าง | ข้อมูลและไฟล์ | ผูกอีเวนต์` ใต้ pack selector/header ที่คงที่.
  กลุ่มแรกมี Import/Template; กลุ่มสองมี metadata และ asset uploader; กลุ่มสามมี event mapping/preview.
  แสดง paths ในส่วนข้อมูลแทนการกิน header ทุกแท็บ. Metadata จัดสองคอลัมน์; event list/asset list
  ใช้พื้นที่ย่อยที่มีขอบเขต. คงปุ่ม Save/Upload/Preview ให้เข้าถึงได้.
- ย้ายเฉพาะ presentation: form state ยังอยู่ใน AudioSettings parent เพื่อไม่ทำ draft หายเมื่อเปลี่ยน subtab.
  คง read-only built-in pack, author-GID unverified label, loading/error/empty states และ native commands.
- ใช้ instrument tokens กับ wrapper/card ที่แก้ใน Voice; ภาพ cover และ group accent ยังคงเป็นเนื้อหาของแพ็ก.

### WF-02 — Account: หักพื้นที่ header ก่อนแบ่ง body

```text
Account title / Closed Beta explanation               fixed
Entitlement status / required error action             fixed
บัญชี | กระเป๋า | ประวัติธุรกรรม | ความปลอดภัย           fixed
┌──────────────────────────────────────────────────────┐
│ Active tab — receives remaining height only          │
│ Fixed summary/actions + bounded list / pagination    │
└──────────────────────────────────────────────────────┘
```

เพิ่ม content wrapper ที่รับพื้นที่เหลือ; `.account-page` ไม่ scroll ทั้งหน้า.
ปรับ Wallet ให้ทำงานในพื้นที่ของ wrapper โดยไม่บวก 100% height ต่อจาก header.
คง Account ทั้ง 4 tabs และ callbacks เดิม. ข้อมูลยาว เช่น ledger/security activity ใช้ bounded region
ภายใน tab; ห้ามซ่อน error/retry หรือปุ่ม action ด้วย overflow clipping.
การเปลี่ยนต้องไม่ทำให้ Wallet/Ledger ที่เปิดผ่าน G-Store เสีย layout.

### WF-03 และ WF-07 — Settings: Audio 2 subtabs และตัดการ์ดซ้ำ

```text
หมวดเดิม 240px │ เสียง & เตือน
ทั้ง 7 หมวด    │ [เสียงพูด | แบนเนอร์และบุคลิก]
               │ รายละเอียดของ subtab ที่เลือก — one screen
```

- `เสียงพูด`: voice enable, test, voice selector, rate, volume/mute, persona-lines และคำแนะนำ SAPI.
- `แบนเนอร์และบุคลิก`: gank/kill banners, preview, sensitivity และ persona preset/คำอธิบาย.
- คง setting keys, defaults, persistence, Tauri emit/invoke และผลต่อ overlay ตามเดิม.
- ตัด `<AudioSettingsCard />` เฉพาะที่ซ้ำใน Audio settings; หน้า Voice ยังคงจัดการแพ็ก.
- ตัดการ์ด `Live (จาก GSI)` เฉพาะ Settings System; หน้า Live, SetupCard, GSI diagnostics และ Log ยังอยู่.
- Audio detail ทั้งสอง subtabs ต้องไม่ scroll ทั้ง category; จำกัด selector change ให้เฉพาะ layout ที่แก้
  และตรวจหมวดอื่นครบเพื่อไม่ทำเนื้อหาของหมวดอื่นถูกตัด.

### WF-04 — Live / Build / Insights: เปลี่ยนวัสดุการ์ด

เปลี่ยน domain interior cards เป็น `--g-instrument`/`--g-instrument-2`,
ขอบ 1px `--g-hairline*`, `box-shadow: none`, ไม่มี backdrop blur หรือ gradient พื้นการ์ด.
Scope selector อยู่ใน deck domain pages; คงข้อมูล, layout, Typography และ glass ของ shell/FAB/palette.
Native Overlay เป็นคนละ surface และไม่อยู่ในขอบเขตเปลี่ยน material นี้.

### WF-05 — ข้อความ Google และ privacy; หนึ่ง sign-in CTA ใน Account

| ตำแหน่ง | ข้อความ/พฤติกรรมที่เสนอ |
| --- | --- |
| Account lead | “G-Maiden Closed Beta ต้องลงชื่อเข้าใช้ด้วย Google และมีสิทธิ์ใช้งาน การลิงก์ Steam เป็นตัวเลือกสำหรับดูโปรไฟล์และสถิติสาธารณะ” |
| AuthPanel guest hint | “ใช้ Google บัญชีเดียวกับที่ได้รับสิทธิ์ Closed Beta แล้วลิงก์ Steam ได้ภายหลัง” |
| First-run sign-in และ Account sign-in | “ข้อมูลแมตช์ ภาพเกมจาก CV และ G-Log เก็บในเครื่อง ไม่อัปโหลดผ่านระบบบัญชี” |
| EntitlementPanel guest | แสดงสถานะต้องลงชื่อเข้าใช้; ให้ AuthPanel เป็น Google CTA เดียวใน Account |

First-run gate ยังคง Google CTA ของตนเอง. ปัญหา CTA ซ้ำที่ตรวจพบเกิดใน DEV signed-out Account;
ไม่อ้างว่า guest release สามารถผ่าน gate ไปเห็น Account ได้.
คง sign-out failure/retry และ entitlement error/deny/grace ทั้งหมด; ไม่แก้ auth hooks, Rust,
session storage, Terms policy, provider หรือ security schema. ตรวจ call sites ก่อนตัด callback ที่ไม่ใช้.

### WF-06 — Insights empty: ไป Account ได้ทันที

เพิ่มปุ่ม `ไปหน้า Account` ต่อจากคำอธิบายลิงก์ Steam เมื่อยังไม่มีข้อมูลโปรไฟล์.
ใช้ callback จาก CommandDeck ผ่าน navigation เดิม; คลิกแล้ว active nav ต้องเป็น Account
และแสดงบัญชี/Steam linking. ไม่สร้าง auth modal หรือ navigation state อีกชุด.

## ลำดับ implementation หลังอนุมัติ

1. บันทึก approval และปรับ IA เฉพาะส่วนที่ได้รับผลให้ตรง layouts ด้านบน; เพิ่ม regression tests ที่แสดงปัญหาเดิม.
2. แก้ Voice/Account/Audio sizing และ pagination/subtabs, duplicate cards, scoped materials และ copy/CTA.
3. ตรวจ 7 หน้าหลัก/ทุกแท็บ/Settings 7 หมวด บันทึกภาพและ geometry ก่อนปิด WF แต่ละข้อ.
4. อัปเดต audit ด้วยผลจริง, RCA prevention และ doc graph; run CodeDoc และตรวจ diff ก่อนส่งมอบ.

## Acceptance และ verification

| Check | เกณฑ์ผ่าน |
| --- | --- |
| Viewport matrix | 1200×780, 1265×817, 1920×1080 ตาม CR-013; คง current bigMode และ authored stage geometry |
| One Canvas | ไม่มี document/page scroll; header/tabs ไม่เคลื่อนเมื่อ wheel; เนื้อหา/action ทุกชิ้นอยู่ในกรอบหรือเข้าถึงผ่าน tab/pagination/พื้นที่ย่อยที่ระบุไว้ |
| Voice populated | 0, 1, 12 packs และจำนวนข้ามขอบหน้า, long metadata, mapped events, rescan ลดจำนวน; ตรวจทุก pack เข้าถึงได้, page clamp, selected/active ต่างกันถูกต้อง |
| Voice editor | ทุก subtab, built-in read-only/custom editable, draft คงอยู่เมื่อสลับแท็บ, notice/error ไม่บัง actions; native mutation ตรวจใน isolated fixture เท่านั้น |
| Account | guest DEV และ signed-in fixture: ทั้ง 4 tabs, entitlement status/error, empty/populated wallet/ledger/security; G-Store reuse ผ่านด้วย |
| Settings | ทั้ง 7 หมวด; Audio 2 subtabs ไม่มี category scroll, control writes ค่าเดิม, ไม่มี Live/AudioSettingsCard ที่ถูกตัด |
| Materials | computed interior background เป็น opaque token, border 1px, shadow/blur none ใน Live/Build/Insights; shell/pop styling ยังถูกต้อง |
| Copy/navigation | release sign-in มี privacy, DEV Account มี Google CTA เดียว, Insights empty CTA นำไป Account/บัญชีจริง |
| Accessibility | keyboard เปิดแท็บ/เปลี่ยนหน้า/กด CTA ได้, focus ชัด, selected tab มี semantic state และ keyboard เข้าถึง bounded region ได้ |
| Regression gates | Desktop Vitest, TypeScript, ESLint, cargo test, clippy all-targets และ Tauri no-bundle build ตาม repo checklist; doc-graph และ CodeDoc ต้องรายงาน exit ตามจริง |

Fixture ต้องติดป้าย synthetic และ block provider requests; ห้ามนำ browser/mock result ไปอ้างว่า Google,
purchase, native audio หรือ Dota overlay UAT ผ่านจริง. Native/provider acceptance ที่ทำไม่ได้ระบุ pending แยก.
CodeDoc exit 2 เป็น INDETERMINATE และยังไม่ผ่าน alignment gate.

## ขอบเขตและความเสี่ยง

**C-2 / MEDIUM**: layout หลายหน้ามี shared CSS และ Wallet reuse; mitigation คือ scoped selectors,
component interaction tests และ viewport matrix ข้ามทั้ง Account/G-Store.
ไม่เพิ่ม dependency, public API, schema, cloud egress, routes หรือ release.
Dashboard/native Overlay และ security behavior เดิมใช้ regression inspection; ไม่ redesign ในงานนี้.
การทำชุด pixel wireframe ใหม่ทั้ง 7 หน้า และการล้าง legacy docs ทั้ง repo เป็นงานแยก;
สเปกนี้ให้โครงสร้างที่ตรวจอนุมัติได้สำหรับ 7 findings โดยเฉพาะ.

## Version diff และสถานะส่งอนุมัติ

- เอกสารนี้: `0.2.0b` accepted → `0.3.0b` implementation recorded; app คง `0.13.2`.
- WF-01–WF-07 implemented และมี local verification ใน [audit](../audits/ui-wireframe-alignment-2026-09-13.md).
  CodeDoc ยัง INDETERMINATE; native/provider acceptance ไม่ถูกแทนด้วย fixture results.
- Baseline ก่อนแก้: TypeScript และ desktop Vitest exit 0; Rust 293 passed / 5 ignored
  เมื่อรันนอก sandbox. การรันใน sandbox ก่อนหน้านั้นมี 4 DPAPI failures (`CryptProtectData`,
  error 0x80070002); source เดียวกันผ่านเมื่อรันนอก sandbox จึงไม่แก้โค้ด/ลด test gate เพื่อข้ามปัญหานี้.
- Doc-graph wrapper PASS: 215 tests; strict scan exit 1 มี 14 errors ที่ checklist ครอบคลุมทั้งหมด,
  uncovered 0. ไม่เรียก strict scan ว่าไม่มี error.
- CodeDoc exit 2 / INDETERMINATE: Ollama ไม่มี configured model
  `hf.co/yuxinlu1/Mellum2-12B-A2.5B-Claude-4.6-4.8-Opus-Thinking-GGUF:Q4_K_M`.
  ยังไม่มี semantic alignment result; ไม่แทนด้วยโมเดลอื่นอัตโนมัติ.
- ทั้งหมดเป็น baseline/เอกสารก่อนแก้ ไม่ใช่ผล acceptance หลัง implementation.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0b | 2026-09-13 | Proposed bounded layouts, material/copy/navigation fixes and acceptance matrix for WF-01–WF-07; pending owner approval under R5. |
| 0.2.0b | 2026-09-13 | Record Boss approval for implementation of WF-01–WF-07. |
| 0.3.0b | 2026-09-13 | Record local implementation and verification, including bounded populated Ledger; CodeDoc model gate remains indeterminate. |
