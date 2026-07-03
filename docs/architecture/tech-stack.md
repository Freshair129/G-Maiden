# G-Maiden â€” Tech Stack

> à¹€à¸­à¸à¸ªà¸²à¸£à¸™à¸µà¹‰à¸à¸³à¸«à¸™à¸” **à¹€à¸—à¸„à¹‚à¸™à¹‚à¸¥à¸¢à¸µà¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸à¹ƒà¸Šà¹‰** à¹à¸¥à¸°à¹€à¸«à¸•à¸¸à¸œà¸¥à¸—à¸µà¹ˆà¸œà¸¹à¸à¸•à¸£à¸‡à¸à¸±à¸š Non-Functional Requirements (SRS Â§5).
> à¸«à¸¥à¸±à¸à¸à¸²à¸£à¸•à¸±à¸”à¸ªà¸´à¸™à¹ƒà¸ˆ: à¸—à¸¸à¸à¸•à¸±à¸§à¹€à¸¥à¸·à¸­à¸à¸•à¹‰à¸­à¸‡à¸žà¸´à¸ªà¸¹à¸ˆà¸™à¹Œà¹„à¸”à¹‰à¸§à¹ˆà¸²à¸Šà¹ˆà¸§à¸¢à¹ƒà¸«à¹‰à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ budget â€” latency â‰¤300ms, CPU â‰¤2.5%,
> RAM â‰¤400MB, FPS drop â‰¤3%, privacy-first, resilient-offline.

---

## 1. à¸ªà¸£à¸¸à¸›à¸à¸²à¸£à¸•à¸±à¸”à¸ªà¸´à¸™à¹ƒà¸ˆà¸«à¸¥à¸±à¸ (Stack at a glance)

| à¸Šà¸±à¹‰à¸™ (Layer) | à¹€à¸—à¸„à¹‚à¸™à¹‚à¸¥à¸¢à¸µ | à¹€à¸«à¸•à¸¸à¸œà¸¥à¸ªà¸±à¹‰à¸™ à¹† |
| --- | --- | --- |
| Desktop shell | **Tauri v2** (Rust core + WebView2) | à¸à¸´à¸™ RAM/CPU à¸•à¹ˆà¸³à¸à¸§à¹ˆà¸² Electron à¸«à¸¥à¸²à¸¢à¹€à¸—à¹ˆà¸², à¹ƒà¸Šà¹‰ WebView2 à¸—à¸µà¹ˆà¸¡à¸²à¸à¸±à¸š Windows, à¸£à¸­à¸‡à¸£à¸±à¸š transparent/click-through overlay |
| Critical-path core | **Rust** (tokio, axum, crossbeam) | à¸‡à¸²à¸™à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡ â‰¤300ms (G-Sentry/G-Signal) à¸•à¹‰à¸­à¸‡à¹€à¸›à¹‡à¸™ native à¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™ JS event loop |
| GSI ingestion | **axum** HTTP server à¸šà¸™à¸žà¸­à¸£à¹Œà¸• 3000 | à¸£à¸±à¸š Valve GSI JSON POST à¸ˆà¸²à¸à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸œà¸¹à¹‰à¹€à¸¥à¹ˆà¸™à¹€à¸­à¸‡ |
| Minimap CV | **`windows` crate** (DXGI Desktop Duplication — `capture.rs`/`dxgi.rs`) + **`tract-onnx`** (ONNX inference) + **`pure-onnx-ocr-sync`** (OCR) | ดึงตำแหน่งศัตรู — GSI ไม่ให้ตำแหน่งศัตรูตรง ๆ ต้องอ่านจาก minimap. `windows-capture` (WGC) อยู่หลัง `--features wgc` เท่านั้น |
| TTS (default) | **Windows SAPI** ผ่าน PowerShell (`tts.rs`) + **audio cache** (clip สำเร็จรูปใน voice-cache) | เส้นทางที่ shipping จริง — เล่นคลิปทันทีถ้ามี ไม่งั้น SAPI พูดผ่าน PowerShell |
| TTS (planned/opportunistic) | **Piper** (local neural TTS, ONNX) | ใช้อัตโนมัติ *เฉพาะเมื่อ* พบ `piper.exe` + โมเดลข้าง binary; latency ต่ำกว่า SAPI แต่ยังไม่ใช่ค่าเริ่มต้น |
| Audio engine | **rodio / cpal** | à¹€à¸¥à¹ˆà¸™à¹€à¸ªà¸µà¸¢à¸‡ + à¸Šà¹ˆà¸­à¸‡ interrupt à¸ªà¸³à¸«à¸£à¸±à¸š Belief Revision |
| Cloud Brain | **Claude CLI / Anthropic Messages API** (`claude-haiku-4-5`, `master.rs`) มี **Ollama SLM fallback** | persona narration + วิเคราะห์เชิงลึก (non-critical). > **สถานะ (2026-07): Gemini เป็นเป้า Phase-4 — ยังไม่ wired; โค้ดจริงเรียก Claude CLI/Anthropic API แล้ว fallback Ollama** |
| Local SLM (fallback) | **Ollama over HTTP** (`master.rs`/`slm.rs`/`runtime.rs`) | สร้างบทพูด persona ตอน cloud หลุด. ไม่ pin โมเดลในโค้ด — เลือกใน UI. > **สถานะ (2026-07): ไม่ใช่ `llama-cpp-rs`/`candle`; เป็น Ollama HTTP** |
| Overlay + Dashboard UI | **React 18 + TypeScript + Vite + TailwindCSS** | glassmorphism HUD; à¹‚à¸„à¹‰à¸”à¹€à¸”à¸µà¸¢à¸§à¹ƒà¸Šà¹‰à¹„à¸”à¹‰à¸—à¸±à¹‰à¸‡ overlay à¹à¸¥à¸° web dashboard |
| FE state | **Zustand** (overlay) + **TanStack Query** (dashboard) | à¹€à¸šà¸², à¹„à¸¡à¹ˆà¸¡à¸µ boilerplate |
| Local store (G-Log) | **JSONL flat files** (`log.rs`) — หนึ่ง `match-*.jsonl` ต่อแมตช์ใน `%LOCALAPPDATA%\G-Maiden\logs\` | privacy-first, local-only, ไม่มี server. > **สถานะ (2026-07): ไม่ใช่ SQLite/`rusqlite` — เป็น JSONL** |
| Web dashboard | **Vercel** (Vite static build à¸‚à¸­à¸‡ React à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™) | landing + remote config (à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ªà¹ˆà¸§à¸™à¸•à¸±à¸§à¸œà¸¹à¹‰à¹€à¸¥à¹ˆà¸™) |
| Build/CI | **pnpm + cargo + GitHub Actions + Tauri bundler** (MSI/NSIS) | |
| GPU telemetry sidecar | **`gpu-feeder/`** (repo-root zero-dep crate, bundled เป็น Tauri `externalBin`) | รัน `nvidia-smi` แล้ว POST ไป `POST /telemetry` ของ G-Maiden; main process ไม่รัน `nvidia-smi` เอง (คุม NFR budget) |
| Accounts & Identity | **Google OAuth + Supabase `gstore` (profiles+RLS) + GID codec (`src/src/gid.ts`) + Steam identity (`identity.rs`)** | optional/additive sign-in; stores only public data (ADR-11/ADR-14) |

---

## 2. à¸—à¸³à¹„à¸¡ Tauri à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ Electron

à¸‚à¹‰à¸­à¸ˆà¸³à¸à¸±à¸” RAM â‰¤400MB à¹à¸¥à¸° CPU â‰¤2.5% à¸•à¸±à¸” Electron à¸­à¸­à¸à¸—à¸±à¸™à¸—à¸µ â€” Electron à¸¥à¸³à¸žà¸±à¸‡à¸à¸´à¸™ RAM 150â€“250MB
à¸à¹ˆà¸­à¸™à¹‚à¸«à¸¥à¸”à¹à¸­à¸›à¸”à¹‰à¸§à¸¢à¸‹à¹‰à¸³ à¹à¸¥à¸°à¸à¸±à¸‡ Chromium à¹€à¸•à¹‡à¸¡à¸•à¸±à¸§ (CPU à¸ªà¸¹à¸‡). Tauri v2:

- à¹ƒà¸Šà¹‰ **WebView2** à¸—à¸µà¹ˆà¸•à¸´à¸”à¸¡à¸²à¸à¸±à¸š Windows 10/11 à¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§ â†’ à¹„à¸¡à¹ˆà¸à¸±à¸‡ browser engine
- core à¹€à¸›à¹‡à¸™ **Rust** â†’ à¸‡à¸²à¸™ critical path à¸£à¸±à¸™à¹€à¸›à¹‡à¸™ native code
- à¸£à¸­à¸‡à¸£à¸±à¸šà¸«à¸™à¹‰à¸²à¸•à¹ˆà¸²à¸‡ **transparent, undecorated, always-on-top, click-through** à¹„à¸”à¹‰à¹‚à¸”à¸¢à¸•à¸£à¸‡ (à¸ˆà¸³à¹€à¸›à¹‡à¸™à¸ªà¸³à¸«à¸£à¸±à¸š overlay à¸à¸£à¸°à¸ˆà¸à¹ƒà¸ª à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸šà¸±à¸‡ minimap/skill bar)
- binary à¹€à¸¥à¹‡à¸, cold start à¹€à¸£à¹‡à¸§

**Trade-off à¸—à¸µà¹ˆà¸¢à¸­à¸¡à¸£à¸±à¸š:** WebView2 à¹€à¸§à¸­à¸£à¹Œà¸Šà¸±à¸™à¸•à¹ˆà¸²à¸‡à¸à¸±à¸™à¸šà¸™à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰à¸­à¸²à¸ˆà¹€à¸£à¸™à¹€à¸”à¸­à¸£à¹Œ CSS à¸•à¹ˆà¸²à¸‡à¹€à¸¥à¹‡à¸à¸™à¹‰à¸­à¸¢ â†’
à¸ˆà¸±à¸”à¸à¸²à¸£à¸”à¹‰à¸§à¸¢à¸à¸²à¸£ pin runtime à¸•à¸­à¸™ bundle à¹à¸¥à¸°à¸—à¸”à¸ªà¸­à¸šà¸šà¸™ Win10/Win11.

---

## 3. à¸à¸²à¸£à¹à¸šà¹ˆà¸‡à¸‡à¸²à¸™à¸ªà¸­à¸‡à¸Šà¸±à¹‰à¸™ (à¸•à¸²à¸¡ SRS Â§2.1)

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Desktop App (Tauri) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                            â”‚
â”‚  â”Œâ”€â”€ Rust Core (G-Sensory Gateway) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€ WebView (UI) â”€â”€â”  â”‚
â”‚  â”‚  â€¢ axum GSI server :3000                       â”‚   â”‚ React overlay     â”‚  â”‚
â”‚  â”‚  â€¢ Minimap capture + CV                        â”‚â—„â”€â–ºâ”‚ (glassmorphism)   â”‚  â”‚
â”‚  â”‚  â€¢ G-Sentry / G-Motion / G-Signal (â‰¤300ms)     â”‚IPCâ”‚ Control dashboard â”‚  â”‚
â”‚  â”‚  â€¢ Audio engine + TTS (SAPI / cache; Piper opt)â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”‚  â€¢ G-Log JSONL (match-*.jsonl, local-only)     â”‚                          â”‚
â”‚  â”‚  â€¢ Local SLM via Ollama (fallback)             â”‚                          â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                    â”‚ (non-critical, async, degrade-gracefully)
            â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚  Cloud Brain   â”‚  Claude CLI / Anthropic API (haiku) â€” Maiden Scribe [Gemini = Phase-4 target]
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**à¸à¸Žà¹€à¸«à¸¥à¹‡à¸:** à¸—à¸¸à¸à¸­à¸¢à¹ˆà¸²à¸‡à¹ƒà¸™ critical path (gank warning) à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ Rust Core à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ â€”
cloud à¹à¸¥à¸° webview **à¸«à¹‰à¸²à¸¡** à¸­à¸¢à¸¹à¹ˆà¸šà¸™à¹€à¸ªà¹‰à¸™à¸—à¸²à¸‡ â‰¤300ms. à¸–à¹‰à¸² cloud à¸«à¸¥à¸¸à¸” core à¸¢à¸±à¸‡à¹€à¸•à¸·à¸­à¸™à¸ à¸±à¸¢à¹„à¸”à¹‰à¸„à¸£à¸š.

---

## 4. à¹à¸•à¹ˆà¸¥à¸°à¸‚à¹‰à¸­à¸ˆà¸³à¸à¸±à¸”à¸–à¸¹à¸à¹à¸à¹‰à¸”à¹‰à¸§à¸¢à¸­à¸°à¹„à¸£ (Constraint â†’ Mitigation)

| à¸‚à¹‰à¸­à¸ˆà¸³à¸à¸±à¸” (SRS) | à¸à¸¥à¹„à¸à¹ƒà¸™à¸ªà¹à¸•à¸à¸™à¸µà¹‰ |
| --- | --- |
| G-Signal â‰¤300ms (target 250) | à¹€à¸ªà¹‰à¸™à¸—à¸²à¸‡à¸§à¸´à¸à¸¤à¸•à¹€à¸›à¹‡à¸™ Rust à¸¥à¹‰à¸§à¸™; à¹€à¸ªà¸µà¸¢à¸‡à¹€à¸•à¸·à¸­à¸™à¹ƒà¸Šà¹‰ **audio cache à¸—à¸µà¹ˆ render à¹„à¸§à¹‰à¸¥à¹ˆà¸§à¸‡à¸«à¸™à¹‰à¸²** (à¹„à¸¡à¹ˆà¹€à¸£à¸µà¸¢à¸ LLM/TTS à¸ªà¸”); à¸”à¸¹ budget à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¹ƒà¸™ `engineering-spec.md` |
| CPU â‰¤2.5% background | Rust + tokio (async, à¹„à¸¡à¹ˆ busy-loop); minimap capture à¹à¸šà¸š event-driven/throttled; à¹„à¸¡à¹ˆà¸¡à¸µ Chromium |
| RAM â‰¤400MB | Tauri (WebView2 à¹ƒà¸Šà¹‰à¸£à¹ˆà¸§à¸¡à¸à¸±à¸šà¸£à¸°à¸šà¸š); SLM à¹‚à¸«à¸¥à¸”à¹à¸šà¸š lazy à¹€à¸‰à¸žà¸²à¸°à¸•à¸­à¸™ fallback (à¸”à¸¹ Â§5 à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸) |
| FPS drop â‰¤3% | DXGI Desktop Duplication (GPU-assisted capture, à¹„à¸¡à¹ˆ block render); overlay à¹€à¸›à¹‡à¸™ window à¹à¸¢à¸ composited à¹‚à¸”à¸¢ DWM |
| Privacy-first | G-Log à¹€à¸à¹‡à¸šà¹ƒà¸™ JSONL local (match-*.jsonl); à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸”à¸´à¸š/à¸ªà¸–à¸´à¸•à¸´à¸œà¸¹à¹‰à¹€à¸¥à¹ˆà¸™ **à¹„à¸¡à¹ˆà¸­à¸±à¸›à¹‚à¸«à¸¥à¸”**; cloud à¸£à¸±à¸šà¹€à¸‰à¸žà¸²à¸° context à¸—à¸µà¹ˆà¸œà¹ˆà¸²à¸™ redaction |
| Resilient offline | G-Sentry/G-Signal à¸—à¸³à¸‡à¸²à¸™à¸šà¸™ Rust core 100%; persona text fallback à¹„à¸› local SLM/templated lines |

---

## 5. à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸à¸ªà¸³à¸„à¸±à¸à¹€à¸£à¸·à¹ˆà¸­à¸‡ RAM à¸à¸±à¸š Local SLM (à¸•à¹‰à¸­à¸‡à¸•à¸±à¸”à¸ªà¸´à¸™à¹ƒà¸ˆà¸•à¸±à¹‰à¸‡à¹à¸•à¹ˆà¸•à¹‰à¸™)

> **สถานะ (2026-07): Local SLM รันผ่าน Ollama (ไม่ pin โมเดลในโค้ด — เลือกใน UI). ตัวเลข Qwen2.5 ด้านล่างเป็นแนวคิด sizing เดิม ไม่ใช่โมเดลที่ hard-code.**

à¹‚à¸¡à¹€à¸”à¸¥ SLM 1.5B à¹à¸šà¸š Q4 à¸à¸´à¸™à¸«à¸™à¹ˆà¸§à¸¢à¸„à¸§à¸²à¸¡à¸ˆà¸³ ~1â€“1.3GB à¸•à¸­à¸™à¹‚à¸«à¸¥à¸” â€” **à¹€à¸à¸´à¸™** budget 400MB à¸–à¹‰à¸²à¹‚à¸«à¸¥à¸”à¸„à¹‰à¸²à¸‡à¹„à¸§à¹‰à¸•à¸¥à¸­à¸”.
à¸”à¸±à¸‡à¸™à¸±à¹‰à¸™à¸™à¸´à¸¢à¸²à¸¡ budget à¹ƒà¸«à¹‰à¸Šà¸±à¸”:

- **400MB = always-on background footprint** à¸‚à¸­à¸‡ Rust core + overlay (à¹„à¸¡à¹ˆà¸£à¸§à¸¡à¸™à¹‰à¸³à¸«à¸™à¸±à¸à¹‚à¸¡à¹€à¸”à¸¥)
- SLM **à¹„à¸¡à¹ˆà¹‚à¸«à¸¥à¸”à¹ƒà¸™à¸ªà¸–à¸²à¸™à¸°à¸›à¸à¸•à¸´** (à¸‚à¸“à¸° cloud à¸­à¸­à¸™à¹„à¸¥à¸™à¹Œ) â€” à¹‚à¸«à¸¥à¸” lazy à¹€à¸‰à¸žà¸²à¸°à¹€à¸¡à¸·à¹ˆà¸­ cloud à¸«à¸¥à¸¸à¸”
- **critical path à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¹ƒà¸Šà¹‰ LLM à¹€à¸¥à¸¢** â€” gank warning à¹€à¸›à¹‡à¸™ logic à¹€à¸Šà¸´à¸‡à¸à¸Ž + à¹€à¸ªà¸µà¸¢à¸‡ cache â†’ deterministic, à¹€à¸£à¹‡à¸§

à¸—à¸²à¸‡à¹€à¸¥à¸·à¸­à¸à¸–à¹‰à¸²à¸•à¹‰à¸­à¸‡à¸à¸²à¸£ SLM à¸„à¹‰à¸²à¸‡à¸•à¸¥à¸­à¸”à¸ˆà¸£à¸´à¸‡ à¹† à¹ƒà¸«à¹‰à¸¥à¸”à¹€à¸›à¹‡à¸™à¹‚à¸¡à¹€à¸”à¸¥ ~0.5B (Qwen2.5-0.5B) à¸«à¸£à¸·à¸­à¹ƒà¸Šà¹‰ template engine
à¹à¸—à¸™ LLM à¸ªà¸³à¸«à¸£à¸±à¸š fallback. **à¸›à¸£à¸°à¹€à¸”à¹‡à¸™à¸™à¸µà¹‰à¸–à¸¹à¸à¸¢à¸à¹€à¸›à¹‡à¸™ Risk R-01 à¹ƒà¸™ TDD.**

---

## 6. à¸ªà¸´à¹ˆà¸‡à¸—à¸µà¹ˆ deploy à¸‚à¸¶à¹‰à¸™ Vercel (à¸à¸±à¸šà¸ªà¸´à¹ˆà¸‡à¸—à¸µà¹ˆà¹„à¸¡à¹ˆ)

- **à¸‚à¸¶à¹‰à¸™ Vercel:** landing page, à¹€à¸­à¸à¸ªà¸²à¸£, à¸«à¸™à¹‰à¸² remote config/preset à¸‚à¸­à¸‡ Maiden (à¹‚à¸—à¸™à¹€à¸ªà¸µà¸¢à¸‡, sensitivity),
  à¸”à¸²à¸§à¸™à¹Œà¹‚à¸«à¸¥à¸” installer. à¹‚à¸„à¹‰à¸” React à¸Šà¸¸à¸”à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸š overlay (build à¹€à¸›à¹‰à¸²à¸«à¸¡à¸²à¸¢ `web`).
- **à¹„à¸¡à¹ˆà¸‚à¸¶à¹‰à¸™ Vercel à¹€à¸”à¹‡à¸”à¸‚à¸²à¸”:** GSI data, à¸ªà¸–à¸´à¸•à¸´à¸œà¸¹à¹‰à¹€à¸¥à¹ˆà¸™, G-Log â€” à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”à¸­à¸¢à¸¹à¹ˆà¸šà¸™à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ (privacy-first).

