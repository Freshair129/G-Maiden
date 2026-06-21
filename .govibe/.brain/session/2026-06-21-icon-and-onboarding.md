# Session — 2026-06-21 (turn 4) · G8.1 installer ปิดงาน

ต่อจาก `2026-06-21-gsi-auto-install.md`. Focus: ปิดส่วนที่เหลือของ G8.1 ให้หมด —
custom icons + onboarding wizard. ทั้งคู่ทำได้โดยไม่ต้องเปิด Dota 2.

## สิ่งที่ทำ (commit `ac56d87`)

### (a) Custom icons

- **`src-tauri/icons/generate-source.ps1`** (ใหม่): render 1024×1024 ice-gem ด้วย
  `System.Drawing` ตรง ๆ — zero external dep บน Windows.
  - rounded square 0.27 radius (matches `Gem` component in `App.tsx`)
  - rotated 45° about canvas center (transform stack on Graphics)
  - linear gradient `#8fd4ff → #3f7fb0` (ตรงกับ Gem CSS gradient เป๊ะ)
  - soft glow = 5 expanding strokes ที่ alpha ลดลง (cheap fake-blur เพราะ
    System.Drawing ไม่มี native Gaussian blur)
  - inner highlight: thin white stroke padded 24px from edge
- **`icon-source.png`** committed → ใครก็ regen ทุก platform ได้ด้วย `pnpm tauri icon`.
- เรียก `pnpm tauri icon src-tauri/icons/icon-source.png` → ขยายเป็นชุดเต็มสำหรับทุก
  platform (`.ico` Windows, `.icns` macOS, iOS AppIcon-* และ Android mipmap-*),
  รวม Windows Store tile (Square*Logo.png) — Tauri จัดการ alpha + กรอบ + scaling.
- verify: `ExtractAssociatedIcon` จาก `g-maiden.exe` ที่ build ออก → ได้ ice-gem
  จริงที่ 32×32 (ส่งภาพให้ user ดูแล้ว). MSI + NSIS bundle ใช้ icon ใหม่อัตโนมัติ.

### (b) Onboarding wizard

- `Welcome` component ใน `App.tsx`: full-screen overlay พร้อม backdrop-blur dark
  panel.
- 2-step layout:
  - Step 1 — `detect_gsi_setup` ทันทีตอน mount; ถ้า `installed=true` → ✓ เขียวอัตโนมัติ.
    ถ้าไม่ → ปุ่ม "ติดตั้ง GSI config" ใน modal เลย (ไม่ต้องไปกดที่การ์ดข้างหลัง).
  - Step 2 — "เปิด Dota 2 แล้วเริ่มแมตช์" + คำอธิบายว่าต้องรีสตาร์ทถ้าเปิดอยู่ก่อน +
    ชี้แจง `Alt+S` ซ่อน/แสดง overlay. เริ่ม opacity ต่ำกว่า Step 1 ยังไม่ผ่าน.
- ปุ่ม "พร้อมแล้ว!" — disable ถ้า Step 1 ยังไม่ผ่าน (กันคนงงทำไม overlay ไม่ขึ้น).
  ปุ่ม "ข้าม" — เผื่อคนรู้แล้วและอยาก dismiss ตรง ๆ.
- persist `localStorage.gm-onboarded = '1'` → ไม่ขึ้นซ้ำหลังกดดู.
- verify: ลบ flag (โดยใช้ webview ใหม่ — เพราะ build ใหม่ใช้ webview profile เดียวกัน
  แต่ flag เป็นฟีเจอร์ใหม่ → ยังไม่มี) → launch → modal ขึ้น Step 1 ✓ + Step 2 active
  + ปุ่มเปิด (screenshot ยืนยัน).

## บทเรียน

1. **`pnpm tauri icon <src>`** ฟรีมาก: source 1 ไฟล์ → icons ครบทุก platform
   (Windows tile, iOS AppIcon, Android mipmap, .ico, .icns). ไม่ต้องใช้ Photoshop /
   ImageMagick.
2. **System.Drawing บน PowerShell ทำ graphics ขั้นพื้นฐานพอ** — ไม่มี Gaussian blur แต่
   "multi-stroke expanding" ทำ glow เหมือนกันได้พอใช้ที่ขนาด icon.
3. **Tauri อ่าน gradient + alpha PNG เข้า .ico ได้สมบูรณ์** — ไม่ต้องทำ flat color.
4. **Welcome modal pattern**: detect state ใน modal เอง + reuse Tauri command เดียวกับ
   SetupCard → ไม่มี duplication, ทำให้ install จาก modal กับจาก card sync state
   อัตโนมัติ.
5. **localStorage flag pattern** สำหรับ first-run gating — ง่ายและพอ. ไม่ต้อง backend state.

## State ปลาย turn

- Branch `main` ahead of origin by 6 commits.
- Working tree: เหลือ untracked `orchestration/docs/ADR-O-002--govibe-integration.md` +
  `SPEC--GOVIBE-INTEGRATION.md` (งานคู่ขนานของ user).
- G8.1 installer ปิด ✅ — ไม่มีงาน in-codebase เหลือ.
- Next: **Piper local TTS** (เสียงไทยจริง — ต้องโหลด ONNX model + research Thai voice
  availability), **G-Sentry minimap CV spike** (ต้องเกมจริงเทสต์), **G-Master + Gemini**
  (cloud + API key).
