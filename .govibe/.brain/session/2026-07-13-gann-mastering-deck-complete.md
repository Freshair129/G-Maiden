# 2026-07-13 — G-Ann Mastering Deck ครบชุด + ทดสอบจบ (ปิด session)

> ⚠️ **งาน session นี้อยู่ใน repo พี่น้อง `G:\G-Suite\packages\ann-studio` (G-AnnStudio) ไม่ใช่ G-Maiden.**
> บันทึกไว้ใน brain ของ G-Maiden เพราะ G-Ann คือเครื่องมือที่ผลิต voice pack ให้ G-Maiden
> (เติม ~10 event ที่ default pack ยังขาด). โค้ด G-Ann ทั้งหมด **uncommitted** ใน G-Suite.

## Entry point
ต่อจาก session ก่อน (compacted) — งาน L/R/M stereo faders ของ deck mastering ใน G-Ann
คอมไพล์ผ่านแล้ว. Boss สั่ง: "ทำ knob L/R ให้ครบชุด mastering แล้ว test ให้จบ จะได้ปิด
session เพื่อเริ่มทำ event mapping + banner."

## Arc
- โจทย์รอบนี้ไม่ใช่เขียนโค้ดใหม่ แต่ **ยืนยันว่า mastering ครบชุดจริง + ทดสอบ end-to-end** ก่อนปิด.
- ลองใช้ browser preview (vite :5174) ทดสอบ UI → **ตัน**: G-Ann เป็น Tauri app, `window.__TAURI__.invoke`
  เป็น undefined ใน browser เปล่า → `SoundLibrary.init_library` error + screenshot timeout. สรุป
  **browser preview ทดสอบ Tauri app ตัวนี้ไม่ได้** (audio ต้อง Tauri fs, export ต้อง Rust/ffmpeg).
  หันไปทดสอบสิ่งที่สำคัญจริงแทน = **pan export บนไฟล์เสียงจริง**.
- Gotcha: `vite` ไม่อยู่ใน PATH ตรง ๆ ต้อง `npx vite`; kill ผ่าน `Get-NetTCPConnection -LocalPort 5174`.
- ยืนยันว่าไม่มี version drift ใน G-Maiden (ทุกไฟล์ = v0.9.0) — session นี้ไม่แตะโค้ด G-Maiden.

## สิ่งที่ทำ
- **ทดสอบ pan export จริง** (ไม่แก้โค้ด) — ดึง filter จาก `clip_audio_filter` (lib.rs:453-457)
  `pan=stereo|c0={ll}*c0|c1={rr}*c0` มา dial L+6/R−6 dB (ll=1.9953, rr=0.5012) รันบน
  `inbound/KOM-ANNOUNCER_extracted.wav` ด้วย `D:\fluxnode-dev\...\release\ffmpeg.exe`.
- **อัปเดต auto-memory** `voicepack-from-video-mvp.md` — เพิ่มบล็อก 2026-07-13 (mastering deck complete + proof).

Mastering deck ที่ถือว่า "ครบชุด" (ทุก knob wire เข้า ffmpeg จริงใน `clip_audio_filter`):
EQ low/mid/high · presence · de-esser (amt+freq) · compression · character · saturation ·
fade in/out · normalize · speed (atempo) · master gain · **L/R stereo balance (pan)** ·
LUFS meter จริง (BS.1770-gated, K-weighted) ที่ bar เป็น fader ลากได้ (L/R/M, −24..+12 dB).

## Verify (gate ที่รันจริง)
| Gate | ผล |
| --- | --- |
| `npx tsc --noEmit` (G-Ann `src/`) | ✅ exit 0 |
| ffmpeg `pan` บนไฟล์จริง | ✅ exit 0, output = stereo |
| per-channel RMS (astats) | ✅ ตรงเป๊ะ (ดูตัวเลขล่าง) |
| build / cargo | ไม่รันรอบนี้ (prior session = 0; ไม่แตะ Rust รอบนี้) |
| live-audio drag (fader → เสียง + เข็ม LUFS) | ❌ ทดสอบ headless ไม่ได้ — ต้อง Boss เปิด Tauri app |

## Key numbers
- pan L+6/R−6 → output **stereo 44100Hz s16**; **ch1 (L) RMS −12.03 dB / ch2 (R) RMS −23.96 dB**
  → **Δ 11.93 dB ≈ 12 dB ที่ dial** = ค่า fader ไปถึงคลิปที่ export จริง ไม่ใช่แค่ live preview.

## Artifacts
- แก้ auto-memory: `C:\Users\freshair\.claude\projects\G--G-Maiden\memory\voicepack-from-video-mvp.md`
- G-Ann (G-Suite, **uncommitted**): `MasteringPanel.tsx`/`MeterPanel.tsx`/`ClipWaveform.tsx`/
  `LedDisplay.tsx`/`EventTestGrid.tsx` (untracked) + `lib.rs`/`useStudioStore.ts`/`llm.ts`/
  `App.tsx`/`SoundLibrary.tsx`/`ChatPanel.tsx`/`Header.tsx`/`RightRail.tsx` (modified) +
  `features.ts`/`project.ts`/`audio.ts`/`toneBanner.ts` + `sidecar/detect_boundaries.py`.
- **ไม่มี live/irreversible action** (ไม่แตะ gstore/Edge Fn/ไม่ deploy).

## State ปลาย turn
- **G-Maiden**: branch `main`, sync กับ origin, working tree สะอาด ยกเว้น `orchestration/src-tauri/Cargo.toml`
  ขึ้น `M` (CRLF/build flicker — มีมาตั้งแต่ต้น session, ไม่ได้แตะ; `git checkout --` ทิ้งได้).
- **G-Suite**: งาน G-Ann ทั้งหมด uncommitted (ดูรายการ Artifacts). Boss จัดการ commit ฝั่ง G-Suite เอง.
- **Pending**: (1) live-audio test ลาก fader ฟังเสียง + LUFS ขยับ = `pnpm ann-studio:dev` (งาน Boss);
  (2) **Session ถัดไป = Event Mapping + Banner** — ของพื้นฐานมีแล้ว (EventTestGrid, tone banners 23,
  `install_gmaiden_pack` เขียน manifest pack จริง) เหลือ UX การ map + polish banner (override rail,
  animated WebP bake, W4 HoN→Dota button-OCR label).
