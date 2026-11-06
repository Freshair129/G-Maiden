---
title: "G-Maiden UI versus wireframe — page-by-page review"
doc_id: "ui-wireframe-alignment-2026-09-13"
version: "0.2.0"
status: "active"
created_at: "2026-09-13T02:00:11+07:00,RWANG,e5012bf"
last_update: "2026-09-13T02:00:11+07:00,RWANG"
updated: "2026-09-13"
owner: "Boss"
attributes:
  domain: "ui-ux"
  doc_type: "audit"
  change_class: "C-2"
  risk: "LOW"
---

# ตรวจ UI เทียบ wireframe รายหน้า

**ผลหลังแก้: WF-01–WF-07 แก้ใน local worktree และผ่าน browser/component verification ตามขอบเขตด้านล่าง.**
Boss อนุมัติ [สเปกแก้ไข](../operations/ui-wireframe-remediation-proposal.md) วันที่ 2026-09-13.
App ยังคง `0.13.2`; ยังไม่ใช่ release/production acceptance. CodeDoc ยัง INDETERMINATE เพราะขาดโมเดลที่กำหนด.

## ผลหลัง implementation

| Finding | สิ่งที่แก้และหลักฐานหลังแก้ |
| --- | --- |
| WF-01 | Voice inventory paginate ตามพื้นที่จริง; header/mode tabs คงที่; editor 3 sections เก็บ draft ไว้; detail/event/form regions มีขอบเขต |
| WF-02 | Account chrome คงที่และ body ใช้พื้นที่เหลือ; populated Ledger ใช้ inner scrolling ให้เข้าถึงครบ 20 rows ต่อ cursor page |
| WF-03 | Audio Settings แบ่ง เสียงพูด / แบนเนอร์และบุคลิก; ทั้งสองส่วนไม่มี category scroll |
| WF-04 | Live/Build/Insights interior cards ใช้ opaque instrument/hairline ไม่มี gradient, shadow หรือ blur ตาม computed style |
| WF-05 | แก้ Closed Beta Google/optional Steam copy, เพิ่ม privacy ที่ release/Account sign-in, ลบ Google CTA ซ้ำใน DEV Account โดยไม่แก้ auth authority |
| WF-06 | Insights teaching empty มีปุ่มไป Account ผ่าน navigation เดิม |
| WF-07 | ตัด duplicate Live-from-GSI และ AudioSettingsCard เฉพาะ Settings; Setup/Log/Voice/Live ยังคงอยู่ |

[ภาพหลังแก้](../../.brain/verification/ui-wireframe-2026-09-13/after/index.html) ·
[ขอบเขตและผลตรวจ](../../.brain/verification/ui-wireframe-2026-09-13/after/README.md).
ตรวจ 28 states × 3 viewports = **84 browser states**, เพิ่ม **12 signed-in component fixture states**
และ **6 keyboard-to-end checks** สำหรับ Ledger/Security; header อยู่กับที่และรายการสุดท้ายเข้าถึงได้.
ข้อมูลบัญชี/ธุรกรรม/อุปกรณ์ทั้งหมดในชุด signed-in เป็น synthetic, ไม่มี login/provider/native mutation จริง.

Frontend 290 tests, TypeScript, ESLint, Rust 293 passed / 5 ignored, clippy และ unsigned Tauri no-bundle build ผ่าน.
Doc-graph structural gate และ CodeDoc รายงานแยกใน verification record; ไม่ใช้แทน native UAT.

ส่วนถัดไปเก็บ **ผลตรวจครั้งแรกก่อนแก้** พร้อม baseline screenshots/source lines เพื่ออธิบายสาเหตุและความต่าง.


[เปิดแกลเลอรีภาพ](../../.brain/verification/ui-wireframe-2026-09-13/gallery.html) · [หลักฐานและวิธีตรวจ](../../.brain/verification/ui-wireframe-2026-09-13/README.md)

## เกณฑ์ที่ใช้และความน่าเชื่อถือของ reference

| Reference | ใช้ตัดสินอะไร | ข้อจำกัด |
| --- | --- | --- |
| [CR-013 ONE CANVAS](../change%20request/CR-013-one-canvas-sitemap-gstore-ios-settings.md) §2–5, §8 | 7-page navigation, Live/Build, Insights/History, G-Store 4 tabs, Settings split view; no page scroll and shared design language | มีข้อความ shipped แต่ source ยังมี interim exceptions; ไม่ใช้สถานะ shipped แทนหลักฐานหน้าจอ |
| [03-layout](../design-system/03-layout.md), [05-sitemap-ia](../design-system/05-sitemap-ia.md) | Stage 1420×760, panel 1280×720, geometry and page ownership | 03 ยังกล่าว max scale 1.0; source มี Boss-recorded big-mode override. 05 first-run/7-day receipt ขัดกับ CR-022 รุ่นใหม่ |
| [01-foundations](../design-system/01-foundations.md) §2.1, [04-components](../design-system/04-components.md) | Instrument matte for interior; glass reserved for shell/FAB/pop layers; phase content and overlays | Review actual computed styles, not CSS class names alone |
| [08-account-gid](../design-system/08-account-gid.md) | Account copy, privacy statement, Steam-link teaching empty and CTA | First-run placement and 7-day policy are outdated against approved CR-022 |
| [CR-022](../change%20request/CR-022-gmad-desktop-first-run-entitlement-account-handoff.md) §5, §8 | Current release-only first-run gate and process-local grace | Takes precedence over older Account-only entry/7-day receipt text |
| [Annotated wireframe SVG](../design-system/assets/wireframe-annotated.svg) | Historical Dashboard composition | Still has P1–P5 anchor rail, character-art box and old sector labels/dimensions. It is not an up-to-date pixel baseline |
| [UI flow board](../architecture/g-maiden-ui-sitemap-flow-board.md), [07-combat-hud](../design-system/07-combat-hud.md) | Overlay boundary and module direction | 07 still describes Lite/Full and local Layout Editor; later board records merged overlay/editor moved to G-AnnStudio |

ไม่พบชุดภาพ wireframe รายหน้าที่ครบทั้ง 7 หน้าในแหล่งอ้างอิงที่ตรวจ. จึงเทียบโครงสร้างกับ CR/IA และเทียบ visual language กับ design system; **ไม่มีคะแนน pixel-parity หรือเปอร์เซ็นต์ความตรงที่แต่งขึ้น**.

## ผลรายหน้า

| หน้า | สิ่งที่ตรง | สิ่งที่ยังไม่ตรง / ตรวจไม่ได้ | Verdict |
| --- | --- | --- | --- |
| **Dashboard** | Sidebar 7 ปุ่ม, audio rail แยกจาก nav, scoreboard, standby readiness, ON AIR, Alert/Companion และ D–G signal cluster; authored stage/panel ตรง | ภาพ SVG เก่ายังไม่อัปเดต; prep/live/debrief ที่มี GSI จริงไม่ได้ตรวจในรอบนี้ | **ตรงโครงล่าสุดใน standby** |
| **Live / Build** | 2 tabs สด/บิลด์, objectives + enemy list + feeds, build path/notes; enemy list เป็น bounded internal scroll ไม่ใช่ content หาย | Card gradient/shadow ยังเป็นภาษาเก่า (WF-04); live label แสดงแม้ไม่มี GSI แต่ไม่ได้ถือเป็นหลักฐานว่ามีแมตช์จริง | **ตรง IA, visual บางส่วนไม่ตรง** |
| **Voice** | Inventory + editor + items เปิดได้; หาแพ็กเพิ่มไป G-Store; fixture เห็น grid/detail จริง | Page scroll เมื่อมีหลายแพ็ก/editor ยาว (WF-01), legacy blue visuals; 3 tabs ไม่ตรงภาพคำอธิบาย CR-013 ที่ระบุ 2 tabs — source บันทึกเหตุผลไว้แล้ว จึงต้อง reconcile docs ไม่ควรลบ feature จาก audit | **ไม่ผ่าน One Canvas** |
| **G-Store** | ร้านค้า/กระเป๋า/คลัง/บันทึกครบ; wallet/ledger/inventory มี signed-out states; frame อยู่ใน panel | Catalog/products, purchase/top-up/receipt success ไม่ได้ตรวจกับ backend จริง; catalog request ถูก block ใน preview. ไม่รับรอง grid ที่มีสินค้าจริง | **ตรงโครง, data states ยังไม่ครบ** |
| **Insights / History** | ภาพรวม/ประวัติ, weekly อยู่ในภาพรวม, history empty; source อธิบายการตัด weekly tab ที่ซ้ำแล้ว และ IA ล่าสุดตามทัน | Card language ไม่ตรง (WF-04); teaching empty ไม่มีปุ่มไป Account (WF-06). Populated weekly/history ยังไม่ตรวจ | **ตรง IA, visual/CTA ไม่ครบ** |
| **Account** | Profile/Steam/GID ownership, 4 tabs บัญชี/กระเป๋า/ประวัติธุรกรรม/ความปลอดภัย; security guest state | Wallet ทำให้ทั้ง Account body scroll (WF-02); copy ว่า account optional ขัดกับ release gate, privacy line หาย และ dev signed-out มี Google CTA 2 จุด (WF-05) | **ไม่ผ่านครบทั้ง layout/copy** |
| **Settings** | iOS split view, category rail 240px ตาม CSS, 7 หมวดครบ; outer canvas ไม่ scroll | เสียง & เตือนยัง scroll ทั้ง detail category (WF-03); ระบบยังมี Live (จาก GSI) card ที่ CR-013 สั่งยุบ (WF-07); native controls ยังไม่ functional-UAT | **ตรง shell, เนื้อหาบางหมวดไม่ตรง** |

## Findings ที่ควรแก้

### WF-01 — P2: Voice scroll ระดับหน้า

**Expected:** CR-013 §2 R1/R2 ให้คง canvas และ paginate/แบ่ง tab เมื่อรายการยาว. **Observed:** `voice_api_state` fixture 12 packs ทำให้ `.surface.page-voice` มี `scrollHeight=1225`, `clientHeight=720`, computed `overflow-y:auto` ที่ 1420×760. ส่วน grid/detail โตตามรายการ, tabs และ heading เลื่อนออกไปด้วย. Editor ก็เป็น long form.

**Evidence:** [ภาพ grid](../../.brain/verification/ui-wireframe-2026-09-13/25-voice-fixture-grid.png), [หลัง scroll](../../.brain/verification/ui-wireframe-2026-09-13/29-voice-scrolled.png); [styles.css](../../src/src/styles.css) lines 1351–1357, 2624–2633; [VoicePacksPage](../../src/src/VoicePacksPage.tsx), [VoiceInventory](../../src/src/VoiceInventory.tsx).

**Cause / direction:** retained flow-page `overflow-y:auto !important` plus unbounded pack layout. Budget grid/detail/editor inside the canvas and paginate or use approved bounded sub-regions; do not merely hide overflow and lose packs. Fixture is synthetic, not installed content.

### WF-02 — P2: Account wallet scrolls the complete page body

**Expected:** Account tabs/header remain on one canvas. **Observed:** signed-out wallet content makes `.account-page` `868px` tall inside `622px` viewport; `overflow-y:auto` moves the title, entitlement panel and sub-tabs along with content. No populated transaction list is needed to reproduce it.

**Evidence:** [wallet](../../.brain/verification/ui-wireframe-2026-09-13/21-account-wallet.png), [after scroll](../../.brain/verification/ui-wireframe-2026-09-13/30-account-wallet-scrolled.png), [geometry](../../.brain/verification/ui-wireframe-2026-09-13/21-account-wallet-geometry.json); [styles.css](../../src/src/styles.css) line 1164; [AccountPage](../../src/src/AccountPage.tsx), [WalletTab](../../src/src/WalletTab.tsx).

**Cause / direction:** Account's full-height scrolling wrapper stacks heading/entitlement/tabs above a wallet with its own full-height layout. Allocate remaining height to tab content; keep page chrome fixed. Outer `.surface` not overflowing does not establish that the entire page is fixed.

### WF-03 — P2: Settings audio category exceeds its one-screen budget

**Expected:** CR-013 §4.1 and W2 acceptance explicitly budget each category to one screen; deeper controls use popovers. **Observed:** audio detail `scrollHeight=836`, `clientHeight=622`. Persona controls are below the initial viewport. Outer Settings surface stays fixed, so this is a **category budget failure**, not a root-window scrollbar.

**Evidence:** [initial audio](../../.brain/verification/ui-wireframe-2026-09-13/09-settings-audio.png), [scrolled audio](../../.brain/verification/ui-wireframe-2026-09-13/31-settings-audio-scrolled.png), [geometry](../../.brain/verification/ui-wireframe-2026-09-13/09-settings-audio-geometry.json); [styles.css](../../src/src/styles.css) lines 4289–4312; [Control](../../src/src/app/Control.tsx).

**Cause / direction:** `.settings-detail-body` intentionally retains interim auto-scroll; audio groups exceed the planned row budget. Split the category's content with a small approved tab/popover arrangement instead of shrinking fonts. The generic IA allowance for bounded scrolling does not erase the more specific Settings one-screen acceptance criterion.

### WF-04 — P2: Live/Build/Insights retain the old interior material

**Expected:** CR-013 R3 and foundations §2.1: opaque `--g-instrument*`, hairline border, no interior shadow/blur. **Observed computed style:** `.card-shell.page-hero` uses `linear-gradient(rgba(11,20,39,0.94), rgba(8,14,28,0.94))` and `rgba(0,0,0,0.24) 0px 18px 40px 0px` box-shadow. Plex font is correct. The difference is actual CSS, not the white transparent-window background in a browser screenshot.

**Evidence:** [Live](../../.brain/verification/ui-wireframe-2026-09-13/02-live.png), [Insights](../../.brain/verification/ui-wireframe-2026-09-13/05-insights.png), [computed styles](../../.brain/verification/ui-wireframe-2026-09-13/responsive-geometry.json); [styles.css](../../src/src/styles.css) lines 272–277; [CompanionPages](../../src/src/CompanionPages.tsx).

**Cause / direction:** old `.card-shell` styling remains effective on non-dashboard domain pages. Scope the approved token treatment to their interior components; preserve shell/FAB/pop materials and Overlay's separate contract.

### WF-05 — P2: Account/first-run copy is not reconciled with current access policy

**Expected:** CR-022 §5 makes Google required for Closed Beta; 08-account §1 requires a clear local-data/privacy statement at sign-in. **Observed:** Account says “The deck works without an account”; AuthPanel says “Optional”. The initial release gate screenshot has Google/GID explanation but no local-data privacy line. In dev signed-out Account, GmadEntitlementPanel and AuthPanel each render a Google button.

**Evidence:** [Account](../../.brain/verification/ui-wireframe-2026-09-13/06-account.png), [prior native cold-start screenshot](../../.brain/verification/gap01-02-webview-2026-09-13/01-cold-start.png); [AccountPage](../../src/src/AccountPage.tsx) lines 65–71, [AuthPanel](../../src/src/AuthPanel.tsx) line 46, [GmadFirstRunGate](../../src/src/GmadFirstRunGate.tsx), [GmadEntitlementPanel](../../src/src/GmadEntitlementPanel.tsx).

**Scope qualification:** duplicate Google buttons were observed in **DEV signed-out Account**; normal release guest flow does not mount Account behind the gate. Do not report it as a proven duplicate on the normal release login screen. Align copy and the intended sign-in surface per build/entitlement context without weakening the native gate.

### WF-06 — P2: Insights teaching empty has no direct Account CTA

**Expected:** 08-account §2 asks for teaching text plus one button to Account on account-dependent cards. **Observed:** weekly empty state says to link Steam on Account but is a plain paragraph, no button/link. The user must discover sidebar navigation.

**Evidence:** [Insights](../../.brain/verification/ui-wireframe-2026-09-13/05-insights.png); [CompanionPages](../../src/src/CompanionPages.tsx) line 200. Add the existing navigation action; do not introduce another auth modal.

### WF-07 — P3: Settings retains two cards scheduled for removal

**Expected:** CR-013 §4.2 demolition removes the duplicate Live-from-GSI card and AudioSettingsCard; these belong on Live and Voice respectively. **Observed:** Settings → ระบบ still renders `Card title="Live (จาก GSI)"` before Setup and Log, and เสียง & เตือน still mounts `AudioSettingsCard` below the persona group.

**Evidence:** [System](../../.brain/verification/ui-wireframe-2026-09-13/13-settings-system.png), [audio bottom](../../.brain/verification/ui-wireframe-2026-09-13/31-settings-audio-scrolled.png); [Control](../../src/src/app/Control.tsx) lines 487 and 603. The extra audio card also contributes to WF-03. Reconcile the intended readiness summary with the explicit removal contract before changing it; do not remove necessary setup diagnostics as opportunistic cleanup.

## Reference drift, not automatic implementation defects

- The annotated SVG still shows P1–P5, character art and old signal labels. Later docs explicitly replace these with audio rail, phase-aware readiness and ON AIR. Refresh the asset; do not restore the old layout to satisfy it.
- `03-layout` scale ceiling is older than the Boss-recorded `bigMode` override in [deck/prefs.ts](../../src/src/deck/prefs.ts) lines 21–26 and 62–85. Default 1920×1080 measurement yields a 1917×1026 stage at 1.35×, contained in the window. This is a documentation reconciliation item, not proof that stage dimensions changed.
- `05-sitemap-ia` and `08-account-gid` still say all auth occurs in Account and describe a protected seven-day receipt. Approved CR-022 now defines a first-run control-window gate and 24-hour **in-process** fallback after online verification. Treat the older flow as stale; do not change the current gate back from this audit.
- `07-combat-hud` retains Lite/Full and a local Layout Editor, while later flow-board/source merge the overlay and move editing to G-AnnStudio. Overlay visual parity needs a current dedicated reference plus native/game screenshots.
- CR-013 Voice's two labels differ from the existing three-mode implementation. Insights' two tabs are explained by the removal of a duplicate weekly view and match current IA. Record these decisions in the visual assets rather than counting every historical tab difference as a regression.

## Coverage and limitations

- Browser preview of current source using Vite DEV at 1420×760. All 7 primary destinations were visited and captured, with the same release React/CSS components but **without release entitlement gating or native IPC**.
- Visited additional Settings categories, Live Build, Voice modes, Store and Account tabs, Insights History, onboarding, Maiden Line and shortcut sheet. Screenshots and geometry records are in the evidence directory.
- Measured all 7 destinations at 1200×780, 1265×817 and 1920×1080. Root window scroll dimensions matched each viewport. This does not make child page/category overflow acceptable. The responsive matrix records the active sub-tab state at capture time; the dedicated 1420×760 probes are the stable reproduction evidence for WF-01–03.
- Native-only Voice initially showed missing-IPC errors in plain browser. Later **browser-only Tauri mocks** provided a synthetic `VoiceState` containing 12 packs, zero clips/events and no paths to real content, to inspect grid/editor layout. No native import, equip, file write or playback was performed.
- Supabase requests were blocked for this preview after initial Dashboard verification. Store data/purchase, signed-in Account/Security, release auth/Terms/grace states, actual GSI match phases and native Combat HUD remain unverified visually in this pass. Raw IPC/provider errors from this setup are not labelled native-production failures.
- Existing native cold-start evidence is linked and dated; the release executable was not relaunched in this audit. No production write, login, top-up, installer or release occurred.
- CodeDoc model alignment is a separate gate; a missing model or a passing structural doc graph cannot certify UI-wireframe parity.

## Remaining follow-through

1. Reconcile reference assets and the first-run/big-mode/Overlay flow docs against already approved CRs.
2. WF-01–07 remediation is approved and locally implemented; finish the configured-model CodeDoc gate before declaring complete code/doc alignment.
3. Verify with populated, explicitly labelled fixtures at the three CR-013 viewport sizes, and native UAT for account/session/Overlay paths. Keep page/header bounds assertions separate from root-window overflow assertions.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-13 | Initial seven-page wireframe/code/visual review with seven findings, historical reference drift and explicit preview/native evidence limits. |
| 0.2.0 | 2026-09-13 | Record approved WF-01–07 remediation, 96 browser/component states and keyboard checks; preserve original findings and separate native/model gates. |
