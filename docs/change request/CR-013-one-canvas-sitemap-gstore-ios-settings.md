# CR-013: ONE CANVAS — sitemap ใหม่, G-Store เข้า nav, Settings แบบ iOS

**Status:** SHIPPED (Boss "อนุมัติ CR-013" 2026-07-16 → all 5 waves W1–W5 merged to branch `claude/gmaidens-desktop-ux-redesign-69b00b`, each Opus-gated + built + verified in-app) — via RWANG Phase-7 waves (Sonnet worker / Opus gate / Fable architect+merger). Commits: W1 `f6141086`, W2 `cb7023e9`, W3 `23dceb1f`, W4 `62578c5e`, W5 `c3638bf8`.

**Deferred follow-ups (not blockers — logged for a later CR):** (1) economy DEDUP — Wallet/Ledger still also live in Account and Inventory in Voice (temporary non-breaking duplication; needs the `entryMode`/`accountEntry` deep-link rework to fully move them into G-Store); (2) `LedgerTab` fixed `height:400` → `rowsThatFit`; (3) the heavy settings sub-cards (MasterCard/SetupCard/LogCard/AudioSettingsCard/LayoutEditor) still carry bespoke inline `C.ice` selects/buttons/bars — they read ice-dark already, so this is pixel-polish, not an R3 break in the shared primitives.
**Author:** Claude (architect) for Boss
**Date:** 2026-07-16
**Amends:** [[CR-011-cold-booth-ux-direction|CR-011 COLD BOOTH]] (§C Information architecture, §E Core screens) — ไม่แตะ §B direction, §F–§I ระบบ component/type/color/motion
**Inputs read:** [`shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts) PAGES, [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) routing, [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) `<Control embedded />` (settings เก่าทั้งดุ้น ~1,100 บรรทัด), [`CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) (SettingsPage mock ซ้ำ), [[CR-003-account-phase1-wallet-billing|CR-003]] orphan surfaces ([`StorePage`](file:///g:/G-Maiden/src/src/StorePage.tsx)/[`WalletTab`](file:///g:/G-Maiden/src/src/WalletTab.tsx)/[`InventoryTab`](file:///g:/G-Maiden/src/src/InventoryTab.tsx)/[`LedgerTab`](file:///g:/G-Maiden/src/src/LedgerTab.tsx)/[`TopupModal`](file:///g:/G-Maiden/src/src/TopupModal.tsx) — สร้างเสร็จ, ไม่มีทางเข้า), [[ADR-14-gid-account-identity|ADR-14]], [[ADR-16-credit-economy-and-mint-oracle|ADR-16]], design-system SSOT [[05-sitemap-ia|05-sitemap-ia.md]], screenshot จริงของ Boss (settings หลัง CR-011)

---

## 0. Ground rules ที่ CR นี้ยอมรับเป็นกฎหมาย

1. **CR-006 shell ล็อก** — stage 1420×760, Subtract panel 1280×720 + 3 notches ไม่ขยับแม้แต่ px เดียว
2. **CR-011 ACCEPTED ทั้งฉบับ** — two-material rule, phase axis, Maiden Line, quality tiers, PAGES-derived NAV ยังศักดิ์สิทธิ์ CR นี้เปลี่ยนเฉพาะ *รายชื่อหน้า + เนื้อในหน้า*
3. **Overlay window อยู่นอกขอบเขต** (สัญญา [[07-combat-hud|07-combat-hud.md]])
4. **NFR gate เดิม:** CPU ≤2.5%, RAM ≤400MB — Settings ใหม่ต้องไม่เพิ่ม render fan-out (แถวตั้งค่าเป็น instrument matte ธรรมดา ไม่มี blur ตาม two-material rule)
5. **CR-003 wallet ยังไม่ deploy live** (pgTAP ผ่าน local เท่านั้น, 2026-07-12) — G-Store ต้อง degrade อย่างสุภาพ (§5.4)

---

## 1. ปัญหา (จาก critique 2026-07-16)

1. 🔴 **สองภาษาดีไซน์** — [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)`:2286` inject `<Control embedded />` เป็น settings panel: 11 การ์ด legacy inline-style อยู่ในเปลือก COLD BOOTH ผู้ใช้กด Settings แล้ว "เทเลพอร์ตกลับแอปเก่า"
2. 🔴 **Scroll ยาว 3 จอไร้โครงสร้าง** — Overlay/Alerts/CV/Live/Setup/Log/Announcer/G-Master/Quota/Modules ปนอยู่ในม้วนเดียว
3. 🟡 **ซ้ำซ้อน** — การ์ด "Live (จาก GSI)" ใน settings ซ้ำหน้า Live; `AudioSettingsCard` ซ้ำหน้าที่หน้า Voice; `SettingsPage` ([`CompanionPages`](file:///g:/G-Maiden/src/src/CompanionPages.tsx), การ์ด mock Privacy/System/Window) กับ `Control embedded` เป็น settings สองชุดที่ไม่รู้จักกัน
4. 🟡 **Store ไม่มีทางเข้า** — เศรษฐกิจ shard (CR-003/ADR-16) สร้างเสร็จแต่ผู้ใช้ไปไม่ถึง
5. 🟢 Build/Insights/History บาง (2–3 การ์ด/หน้า) แต่กิน nav 3 ที่นั่ง

## 2. กฎสามข้อ (จารึกลง design-system SSOT — ดู §10)

> **R1 — One Canvas:** ทุกหน้าคือ fixed canvas ใน panel world 1280×720 เหมือน dashboard
> **ห้ามมี scrollbar ระดับหน้าเด็ดขาด** ทุก viewport ที่ stage รองรับ
>
> **R2 — Overflow → Tab:** เนื้อหาเกิน canvas → แตกเป็น segmented tab ในหน้าเดิม
> ห้ามยืดหน้า ห้ามย่อ font หนี list ที่โตได้ต้อง paginate ในกรอบสูงคงที่ผ่าน helper
> pure แบบ [`rowsThatFit()`](file:///g:/G-Maiden/src/src/StorePage.tsx#L80) ([`StorePage.tsx`](file:///g:/G-Maiden/src/src/StorePage.tsx) — pattern อ้างอิง, [[CR-003-account-phase1-wallet-billing|CR-003]] §3.0) เท่านั้น
>
> **R3 — One Language:** ทุกหน้าใน deck ใช้ภาษา COLD BOOTH (sector frame,
> instrument matte, eyebrow, IBM Plex) — legacy `Card`/inline-style จาก [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)
> ห้ามโผล่ใน deck อีก คอมโพเนนต์เก่าที่จะใช้ต่อ ต้องถูก re-skin ก่อนเข้า

การบังคับใช้เชิงกลไก: `.g-deck-panel .surface { overflow: hidden }` สำหรับทุกหน้า (แทน
`overflow-y: auto` ปัจจุบัน) — หลุดกรอบ = clip ให้เห็นคาตา ไม่ใช่ scroll ให้เนียน ตัว dev
เห็นเองว่าต้องแตก tab

## 3. Sitemap ใหม่

### 3.1 PAGES (แก้ [`shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts) — NAV/shortcut/Maiden Line ตามอัตโนมัติ)

| # | key | label TH | เดิม | การเปลี่ยนแปลง |
|---|-----|----------|------|----------------|
| 1 | `dashboard` | บูธ (Dashboard) | ✓ | ไม่แตะ — anchor ของทั้งดีไซน์ |
| 2 | `live` | แมตช์สด (Live) | ✓ | **ควบ Build** เป็น tab: `[สด | บิลด์]` |
| 3 | `voice` | แพ็กเสียง (Voice) | ✓ | tab: `[ติดตั้งแล้ว | ผูกอีเวนต์]` + ปุ่ม "หาแพ็กเพิ่ม →" ลิงก์ข้าม Store |
| 4 | `store` | **G-Store** ★ใหม่ | ✗ | route `StorePage` + tab `[ร้านค้า | กระเป๋า | คลัง | บันทึก]` |
| 5 | `insights` | สถิติ (Insights) | ✓ | **ควบ History** เป็น tab: `[ภาพรวม | รายสัปดาห์ | ประวัติ]` |
| 6 | `account` | บัญชี (Account) | ✓ | คงเดิม |
| 7 | `settings` | ตั้งค่า (Settings) | ✓ | **รื้อใหม่ทั้งหน้า** — §4 |

- `build` และ `history` **ออกจาก PAGES** (เนื้อหาย้ายเป็น tab — ไม่มีอะไรหาย)
- nav 7 ที่นั่ง + **สำรอง 1** (อนาคต: Draft-CV / Gadget) — rail 306px สูงพอ 8 ปุ่ม
- Ctrl+1..7 re-map ตามลำดับใหม่; ShortcutSheet/Maiden Line อัปเดตอัตโนมัติเพราะ derive จาก PAGES (CR-011 §L/§M — ห้ามมี array คู่ขนาน)
- **เหตุผลแยก Voice/Store ด้วย mental model:** Voice = ของที่*มี*ในเครื่อง (local-first,
  ทำงาน offline ได้) / G-Store = *ธุรกรรม* (Supabase, ต้อง sign-in) — ทับเส้น ADR-14
  additive rule พอดี: deck ทำงานได้เต็มโดยไม่แตะ Store

### 3.2 เนื้อในหน้าที่ควบ

- **Live `[สด | บิลด์]`** — build advice มีความหมายเมื่อมีแมตช์ → บริบทเดียวกับ Live;
  tab บิลด์ = `BuildAdvisorPage` เดิม re-seat (เนื้อหา 2 การ์ดพอดี canvas สบาย)
- **Insights `[ภาพรวม | รายสัปดาห์ | ประวัติ]`** — ประวัติ = `HistoryPage` list เดิม แต่
  paginate ในกรอบสูงคงที่ (R2) แทน list เปิดปลาย

## 4. Settings — iOS split view (หัวใจของ CR)

### 4.1 โครง

```
┌──────────────┬──────────────────────────────────────────┐
│ หมวด (240px)  │ detail pane (กว้างที่เหลือ)                 │
│ ○ ทั่วไป      │  [กลุ่มแถวตั้งค่าของหมวดที่เลือก]              │
│ ○ Overlay    │                                          │
│ ○ เสียง&เตือน  │  ทุกหมวดถูก budget ให้พอดี 1 จอ            │
│ ○ AI         │  (ไม่มี scroll — R1)                       │
│ ○ โมดูล & CV  │                                          │
│ ○ ส่วนตัว     │                                          │
│ ○ ระบบ       │                                          │
└──────────────┴──────────────────────────────────────────┘
```

- ซ้าย: รายการหมวด (icon + label + คำโปรย 1 บรรทัด) สไตล์ iPad Settings
- ขวา: กลุ่มแถว — **หนึ่งแถว = หนึ่งการตัดสินใจ** (label ซ้าย, control ขวา),
  จัดกลุ่มด้วย section header ตัวเล็ก, คำอธิบายเป็น footnote ใต้กลุ่ม
  (ห้าม paragraph ในการ์ด, ห้ามการ์ดซ้อนการ์ด)
- วัสดุ: instrument matte ล้วน (two-material rule — blur เป็นของ shell เท่านั้น)

### 4.2 หมวด × เนื้อหา (mapping จากของเดิมครบทุกตัว — ห้ามทำ behavior หาย)

| หมวด | ย้ายมาจาก ([`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) Control) | แถว |
|------|------------------------------|-----|
| **ทั่วไป** | window presets (CompanionPages) + DeckPrefsCard (quality/density/crisp/big mode) | ~8 ✓ |
| **Overlay** | การ์ด OVERLAY (OSD): แสดง/ซ่อน, ตำแหน่ง, ความทึบ, แผงสถิติ, ทดสอบ, hotkey hint | ~7 ✓ |
| **เสียง & เตือน** | การ์ด ALERTS: เตือน HP + threshold, เสียงพูด/เลือกเสียง/ความเร็ว/ระดับ, พูดเสริมตามเหตุการณ์, sensitivity 3 ระดับ | ~8 ✓ |
| **AI (G-Master)** | MasterCard: เปิด/ปิด, backend Auto/Claude/Ollama, API key (DPAPI), Ollama model, auto advice + QuotaCard (meter ย่อ) | ~7 ✓ |
| **โมดูล & CV** | Modules & System: สถานะ 6 โมดูล, capture badge (DXGI/Lite), CV debug, calibration capture, telemetry source | ~9 ✓ |
| **ความเป็นส่วนตัว** | privacy mode (local-first), efficacy study; ที่นั่งจองไว้: data contribution ADR-11 | ~5 ✓ |
| **ระบบ** | SetupCard (GSI config + สถานะ), เวอร์ชัน + ตรวจหาอัปเดต, LogCard → ปุ่มเปิด log viewer (pop-over), diagnostics | ~7 ✓ |

- แถวที่มี control ลึก (เช่น เลือกเสียง TTS, API key) เปิด **pop-over เล็ก** ไม่ใช่หน้าใหม่ —
  pop ใช้ console glass ได้ (เป็น "ของเหนือ shell" ตามสัญญา CR-011 §F)
- **สิ่งที่ตัดทิ้ง (ยืนยันว่าซ้ำ):** การ์ด "Live (จาก GSI)" (ซ้ำหน้า Live), `AudioSettingsCard`
  ใน settings (หน้าที่นี้เป็นของหน้า Voice แล้ว), `SettingsPage` mock ใน CompanionPages (ลบทั้ง component)

### 4.3 พันธะการย้าย (gate ต้องตรวจ)

ทุก toggle/slider/select เขียนลง `Settings` store ตัวเดิมผ่าน key เดิม — CR นี้ย้าย *ผิวหนัง*
ไม่ย้าย *สมอง*: ห้ามเปลี่ยนชื่อ setting key, ห้ามเปลี่ยน default, ห้ามเปลี่ยน Tauri command ที่เรียก
(`Control embedded` เดิมค่อยๆ ว่างลงจนลบได้ — นี่คือตัวชี้วัดความเสร็จของ CR)

## 5. G-Store (หน้าใหม่อันดับ 4)

### 5.1 Tab structure — reuse ของ CR-003 ที่สร้างเสร็จแล้วทั้งหมด

| Tab | Component เดิม | หมายเหตุ |
|-----|----------------|----------|
| ร้านค้า | [`StorePage`](file:///g:/G-Maiden/src/src/StorePage.tsx) | catalog 2 คอลัมน์ + pagination `rowsThatFit()` — no-scroll ในตัวแล้ว |
| กระเป๋า | [`WalletTab`](file:///g:/G-Maiden/src/src/WalletTab.tsx) + [`TopupModal`](file:///g:/G-Maiden/src/src/TopupModal.tsx) | shard/wallet สองสกุล ([[ADR-16-credit-economy-and-mint-oracle|ADR-16]]) |
| คลัง | [`InventoryTab`](file:///g:/G-Maiden/src/src/InventoryTab.tsx) | ของที่ซื้อแล้ว → ปุ่ม "ติดตั้ง/เปิดใช้" ข้ามไป Voice |
| บันทึก | [`LedgerTab`](file:///g:/G-Maiden/src/src/LedgerTab.tsx) | ประวัติธุรกรรม paginate ในกรอบ |

### 5.2 งานที่ต้องทำจริง

re-skin ทั้ง 4 ตัวจาก CR-003 inline navy/cyan (`#64c7ff/#31d0a0` — blue คนละตัวที่ CR-011
§1.5 ประณามไว้) → token COLD BOOTH; ห้าม logic เปลี่ยน (`useWallet().purchase()` /
`purchase_item` RPC ตามเดิม)

### 5.3 Cross-link

Voice "หาแพ็กเพิ่ม →" → Store; Inventory "เปิดใช้" → Voice (ผ่าน `navigateTo` เดิม)

### 5.4 Degrade ladder (เพราะ CR-003 ยังไม่ live)

1. **Signed-out:** catalog อ่านได้ (RLS public read) — ปุ่มซื้อกลายเป็น "ลงชื่อเข้าใช้เพื่อซื้อ"
2. **Signed-in แต่ wallet ยังไม่ deploy:** catalog + badge "เร็วๆ นี้" บนปุ่มซื้อ; กระเป๋า/บันทึก
   แสดง empty-state อธิบายตรงๆ (ห้าม mock ตัวเลข — กฎ honest-data ของ CR-007)
3. **Wallet live:** เปิดเต็ม

## 6. รื้อถอน (demolition list)

| ของ | ชะตากรรม |
|-----|----------|
| `<Control embedded />` injection ([`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)`:2286`) | ค่อยๆ ว่างลงตาม §4 จน**ลบ prop `settingsPanel` ทิ้ง** |
| `SettingsPage` ใน [`CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) | ลบ (ถูกแทนทั้งตัว) |
| [`CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) `BuildAdvisorPage`/`HistoryPage`/`InsightsPage` | re-seat เป็น tab ตาม §3.2 |
| `overflow-y: auto` per-page ([`styles.css`](file:///g:/G-Maiden/src/src/styles.css) ~4602) | แทนด้วย `overflow: hidden` (R1) |
| flow-page padding 74/28/24/104 (แก้เมื่อ 2026-07-16) | คงไว้ — เป็น interior inset ของ canvas |

## 7. แผนงาน (RWANG waves — Sonnet worker / Opus gate ตาม roster เดิม)

| Wave | เนื้อหา | Gate ตรวจ |
|------|---------|-----------|
| W1 | PAGES ใหม่ + routing + tab shell กลาง (segmented tab component เดียวใช้ทุกหน้า) + `overflow:hidden` | nav 7 ปุ่ม, Ctrl+1..7, ShortcutSheet/Maiden Line ตาม, ไม่มีหน้าไหน scroll |
| W2 | Settings shell (split view) + หมวดทั่วไป/Overlay/เสียง&เตือน | ทุก toggle เขียน key เดิม, no-scroll ทุกหมวด |
| W3 | หมวด AI/โมدูล&CV/ส่วนตัว/ระบบ + ตัด Live card/AudioSettingsCard ซ้ำ | `Control embedded` ว่าง → ลบ `settingsPanel` |
| W4 | G-Store: route + re-skin 4 tab + degrade ladder + cross-link | signed-out เห็น catalog, ไม่มี mock ตัวเลข |
| W5 | ควบ Live+Build, Insights+History+pagination + ลบ component เก่า + docs (§10) | ไม่มี dead export, tsc/eslint/vitest/cargo เขียว |

Verify ต่อ wave: `tsc --noEmit`, eslint, vitest, browser geometry check ที่ 1265×817 +
1200×780 + 1920×1080 (ไม่มี scrollbar, content พ้น notch/sidebar)

## 8. เกณฑ์รับงาน (acceptance)

1. กดทุกหน้าใน nav ที่ทุกขนาดหน้าต่าง ≥1200×780 — **ไม่มี scrollbar ระดับหน้าแม้แต่หน้าเดียว**
2. ผู้ใช้ signed-out เห็น G-Store catalog ได้ (ADR-14 additive)
3. ทุก setting เดิมยังทำงาน (spot-check: overlay toggle, HP threshold, TTS voice, master backend, telemetry source) — เขียนลง key เดิม
4. `App.tsx` ไม่มี component ที่ render ใน deck window เหลืออยู่ (Overlay window เท่านั้น)
5. ไม่มี inline hex สี CR-003 (`#64c7ff` ฯลฯ) เหลือใน deck surface
6. Anti-generic pass: Settings ไม่ใช่ SaaS card grid — เป็นแถว instrument แบบ iOS ในภาษา COLD BOOTH

## 9. ความเสี่ยง

- **ใหญ่สุด: behavior regression ตอนย้าย settings** — กันด้วย §4.3 (ผิวหนัง ไม่ใช่สมอง) + gate spot-check ต่อ wave
- Ctrl+digit ที่ผู้ใช้ชิน (7→settings เดิมอยู่ตำแหน่ง 8) — ยอมรับได้ ครั้งเดียวจบ, ShortcutSheet แสดงชุดใหม่
- CR-003 skins แตะไฟล์ที่ pgTAP local ผูกอยู่ — จำกัดที่ presentation layer เท่านั้น

## 10. เอกสารที่ต้องอัปเดตพร้อมกัน (W5)

1. [[05-sitemap-ia|docs/design-system/05-sitemap-ia.md]] — sitemap ใหม่ + กฎ R1/R2/R3 (SSOT bump)
2. `CLAUDE.md` — 2 บรรทัด: nav 7 หน้า + กฎ One-Canvas ชี้ไป SSOT
3. [[CR-011-cold-booth-ux-direction|CR-011]] §C — หมายเหตุ "amended by CR-013"

**Mock:** `assets/cr013-one-canvas-mock.html` — 3 มุมมอง (Settings iOS / G-Store / sitemap)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| — | 2026-07-19 | symbol-link coverage extension (G1.5) |
| — | 2026-07-19 | link/metadata sweep (G15-T2): `[[CLAUDE.md]]` converted to plain backtick path text (CLAUDE.md is outside docs/, not a doc-graph slug) |
| — | 2026-07-19 | link/metadata sweep (G15-T5): symbol-link `rowsThatFit()` to its `StorePage.tsx` definition |
