---
version: "2.0.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-05T00:00:00+07:00,Opus"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "tech stack + code map"
  language: "th/en"
---

# 06 — Stack & Code Map

> design system นี้ต้อง "landใน" โค้ดจริง — ไฟล์นี้บอกว่า token/component/layout อยู่ที่ไหน

## 1. Tech stack (UI layer)

| ชั้น | เทคโนโลยี | หมายเหตุ |
| --- | --- | --- |
| Shell | **Tauri v2** (Rust) | หน้าต่าง decorations off, resizable false, custom drag |
| UI | **React + Vite + TypeScript** | `src/src/` |
| Styling | **CSS ตรง** (`styles.css`) + CSS variables | ไม่มี CSS framework — token = `:root` vars |
| Window API | `@tauri-apps/api/window`, `.../dpi` | minimize/maximize/close/setSize |
| Glass | native CSS `backdrop-filter` + `clip-path: url()` | ดู layout §3 |
| Charts/vis | (ยังไม่มี lib) | sparkline/bar ทำด้วย CSS/SVG มือ |

รายละเอียดสถาปัตยกรรมเต็ม: [[tech-stack|docs/architecture/tech-stack.md]]

## 2. Where things live (code map)

| design concept | ไฟล์ในโค้ด |
| --- | --- |
| **Tokens** (`:root`) | [`src/src/styles.css`](file:///g:/G-Maiden/src/src/styles.css) — SSOT ค่าอยู่ไฟล์ 02, sync มาที่นี่ |
| **Window routing** (Control/Overlay) | [`src/src/App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) |
| **Command Deck shell** (topbar, sidebar, tabs) | [`src/src/CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) |
| **Dashboard** (bento, scoreboard, G-Signal) | `src/src/Dashboard.tsx` + [`companion.ts`](file:///g:/G-Maiden/src/src/companion.ts) |
| **Pages** (Live/Companion/Build/Insights/History/Settings) | [`src/src/CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) |
| **Account** (GID, OAuth, Steam) | [`AccountPage.tsx`](file:///g:/G-Maiden/src/src/AccountPage.tsx) [`AuthPanel.tsx`](file:///g:/G-Maiden/src/src/AuthPanel.tsx) [`SteamLink.tsx`](file:///g:/G-Maiden/src/src/SteamLink.tsx) + [`auth.ts`](file:///g:/G-Maiden/src/src/auth.ts) [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts) [`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts) |
| **Voice packs** | [`VoicePacksPage.tsx`](file:///g:/G-Maiden/src/src/VoicePacksPage.tsx) [`VoiceInventory.tsx`](file:///g:/G-Maiden/src/src/VoiceInventory.tsx) [`AudioSettings.tsx`](file:///g:/G-Maiden/src/src/AudioSettings.tsx) |
| **Live data builders** | [`src/src/live/`](file:///g:/G-Maiden/src/src/live/) (merge Tauri events over MOCK/FALLBACK) |
| **Overlay + capture backend** | [`src-tauri/src/`](file:///g:/G-Maiden/src-tauri/src/) (DXGI, [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs), [`announcer.rs`](file:///g:/G-Maiden/src-tauri/src/announcer.rs), [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)) |

## 3. Prototype ↔ production

- **Live prototype** (frosted-glass Subtract HUD) = HTML เดี่ยว build จาก token ไฟล์ 02 แบบ 1:1
  ใช้เป็น visual reference — ไม่ใช่โค้ด production
- **Migration path:** ดู tokens §1.6 (legacy→v2 map) — เพิ่ม `--g-*` block ก่อน แล้วแทนทีละ component
  (topbar → sidebar → dashboard → pages) อย่า big-bang; ทุกก้าวเช็ค NFR (ไฟล์ 01 §4)

## 4. Build / verify

| งาน | คำสั่ง | cwd |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | `src/` |
| Rust test | `cargo test` | `src-tauri/` |
| Dev (deck) | `pnpm -C src dev` | root |
| Full build (smoke) | `pnpm tauri build` | root (จาก root — CLI อยู่ root `node_modules/.bin`) |
| CI gate | clippy `-D warnings` (ไม่ใช่แค่ test) | — |

Release ผ่าน tag `vX.Y.Z` → CI เท่านั้น (ดู [`CLAUDE.md`](file:///g:/G-Maiden/CLAUDE.md) → Release workflow); commit บน main ไม่ถึง user จนกว่าจะ tag

## 5. Design→code checklist (ก่อน merge UI PR)

- [ ] ใช้ `--g-*` token ไม่ hardcode hex
- [ ] ไม่มี scrollbar; content fit-to-grid (layout §7)
- [ ] focus ring มองเห็น + `prefers-reduced-motion` เคารพ
- [ ] `—` เมื่อไม่มี data (ไม่ใช่ 0 ปลอม)
- [ ] overlay: วัด FPS drop ≤3%, ไม่บัง minimap/skillbar/stats
- [ ] component ใหม่ลงทะเบียนในไฟล์ 04 แล้ว
