# G-Maiden — Tech Stack

> เอกสารนี้กำหนด **เทคโนโลยีที่เลือกใช้** และเหตุผลที่ผูกตรงกับ Non-Functional Requirements (SRS §5).
> หลักการตัดสินใจ: ทุกตัวเลือกต้องพิสูจน์ได้ว่าช่วยให้อยู่ใน budget — latency ≤300ms, CPU ≤2.5%,
> RAM ≤400MB, FPS drop ≤3%, privacy-first, resilient-offline.

---

## 1. สรุปการตัดสินใจหลัก (Stack at a glance)

| ชั้น (Layer) | เทคโนโลยี | เหตุผลสั้น ๆ |
| --- | --- | --- |
| Desktop shell | **Tauri v2** (Rust core + WebView2) | กิน RAM/CPU ต่ำกว่า Electron หลายเท่า, ใช้ WebView2 ที่มากับ Windows, รองรับ transparent/click-through overlay |
| Critical-path core | **Rust** (tokio, axum, crossbeam) | งานที่ต้อง ≤300ms (G-Sentry/G-Signal) ต้องเป็น native ไม่ผ่าน JS event loop |
| GSI ingestion | **axum** HTTP server บนพอร์ต 3000 | รับ Valve GSI JSON POST จากเครื่องผู้เล่นเอง |
| Minimap CV | **`windows` crate** (DXGI Desktop Duplication — [`capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs)/[`dxgi.rs`](file:///g:/G-Maiden/src-tauri/src/dxgi.rs)) + **`tract-onnx`** (ONNX inference) + **`pure-onnx-ocr-sync`** (OCR) | ดึงตำแหน่งศัตรู — GSI ไม่ให้ตำแหน่งศัตรูตรง ๆ ต้องอ่านจาก minimap. `windows-capture` (WGC) อยู่หลัง `--features wgc` เท่านั้น |
| TTS (default) | **Windows SAPI** ผ่าน PowerShell ([`tts.rs`](file:///g:/G-Maiden/src-tauri/src/tts.rs)) + **audio cache** (clip สำเร็จรูปใน voice-cache) | เส้นทางที่ shipping จริง — เล่นคลิปทันทีถ้ามี ไม่งั้น SAPI พูดผ่าน PowerShell |
| TTS (planned/opportunistic) | **Piper** (local neural TTS, ONNX) | ใช้อัตโนมัติ *เฉพาะเมื่อ* พบ `piper.exe` + โมเดลข้าง binary; latency ต่ำกว่า SAPI แต่ยังไม่ใช่ค่าเริ่มต้น |
| Audio engine | **rodio / cpal** | เล่นเสียง + ช่อง interrupt สำหรับ Belief Revision |
| Cloud Brain | **Claude CLI / Anthropic Messages API** (`claude-haiku-4-5`, [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)) มี **Ollama SLM fallback** | persona narration + วิเคราะห์เชิงลึก (non-critical). > **สถานะ (2026-07): Gemini เป็นเป้า Phase-4 — ยังไม่ wired; โค้ดจริงเรียก Claude CLI/Anthropic API แล้ว fallback Ollama** |
| Local SLM (fallback) | **Ollama over HTTP** ([`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)/[`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs)/[`runtime.rs`](file:///g:/G-Maiden/src-tauri/src/runtime.rs)) | สร้างบทพูด persona ตอน cloud หลุด. ไม่ pin โมเดลในโค้ด — เลือกใน UI. > **สถานะ (2026-07): ไม่ใช่ `llama-cpp-rs`/`candle`; เป็น Ollama HTTP** |
| Overlay + Dashboard UI | **React 18 + TypeScript + Vite + TailwindCSS** | glassmorphism HUD; โค้ดเดียวใช้ได้ทั้ง overlay และ web dashboard |
| FE state | **Zustand** (overlay) + **TanStack Query** (dashboard) | เบา, ไม่มี boilerplate |
| Local store (G-Log) | **JSONL flat files** ([`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs)) — หนึ่ง `match-*.jsonl` ต่อแมตช์ใน `%LOCALAPPDATA%\G-Maiden\logs\` | privacy-first, local-only, ไม่มี server. > **สถานะ (2026-07): ไม่ใช่ SQLite/`rusqlite` — เป็น JSONL** |
| Web dashboard | **Vercel** (Vite static build ของ React เดียวกัน) | landing + remote config (ไม่มีข้อมูลส่วนตัวผู้เล่น) |
| Build/CI | **pnpm + cargo + GitHub Actions + Tauri bundler** (MSI/NSIS) | |
| GPU telemetry sidecar | **[`gpu-feeder/`](file:///g:/G-Maiden/gpu-feeder/src/main.rs)** (repo-root zero-dep crate, bundled เป็น Tauri `externalBin`) | รัน `nvidia-smi` แล้ว POST ไป `POST /telemetry` ของ G-Maiden; main process ไม่รัน `nvidia-smi` เอง (คุม NFR budget) |
| Accounts & Identity | **Google OAuth + Supabase `gstore` (profiles+RLS) + GID codec ([`src/src/gid.ts`](file:///g:/G-Maiden/src/src/gid.ts)) + Steam identity ([`identity.rs`](file:///g:/G-Maiden/src-tauri/src/identity.rs))** | optional/additive sign-in; stores only public data ([[ADR-11-optin-data-contribution-flywheel|ADR-11]]/[[ADR-14-gid-account-identity|ADR-14]]) |

---

## 2. ทำไม Tauri ไม่ใช่ Electron

ข้อจำกัด RAM ≤400MB และ CPU ≤2.5% ตัด Electron ออกทันที — Electron ลำพังกิน RAM 150–250MB
ก่อนโหลดแอปด้วยซ้ำ และฝัง Chromium เต็มตัว (CPU สูง). Tauri v2:

- ใช้ **WebView2** ที่ติดมากับ Windows 10/11 อยู่แล้ว → ไม่ฝัง browser engine
- core เป็น **Rust** → งาน critical path รันเป็น native code
- รองรับหน้าต่าง **transparent, undecorated, always-on-top, click-through** ได้โดยตรง (จำเป็นสำหรับ overlay กระจกใส ที่ไม่บัง minimap/skill bar)
- binary เล็ก, cold start เร็ว

**Trade-off ที่ยอมรับ:** WebView2 เวอร์ชันต่างกันบนเครื่องผู้ใช้อาจเรนเดอร์ CSS ต่างเล็กน้อย →
จัดการด้วยการ pin runtime ตอน bundle และทดสอบบน Win10/Win11.

---

## 3. การแบ่งงานสองชั้น (ตาม SRS §2.1)

```
┌─────────────────────────── Desktop App (Tauri) ───────────────────────────┐
│                                                                            │
│  ┌── Rust Core (G-Sensory Gateway) ──────────────┐   ┌── WebView (UI) ──┐  │
│  │  • axum GSI server :3000                       │   │ React overlay     │  │
│  │  • Minimap capture + CV                        │◄─►│ (glassmorphism)   │  │
│  │  • G-Sentry / G-Motion / G-Signal (≤300ms)     │IPC│ Control dashboard │  │
│  │  • Audio engine + TTS (SAPI / cache; Piper opt)│   └───────────────────┘  │
│  │  • G-Log JSONL (match-*.jsonl, local-only)     │                          │
│  │  • Local SLM via Ollama (fallback)             │                          │
│  └────────────────┬───────────────────────────────┘                         │
└───────────────────┼─────────────────────────────────────────────────────────┘
                    │ (non-critical, async, degrade-gracefully)
            ┌───────▼────────┐
            │  Cloud Brain   │  Claude CLI / Anthropic API (haiku) — Maiden Scribe [Gemini = Phase-4 target]
            └────────────────┘
```

**กฎเหล็ก:** ทุกอย่างใน critical path (gank warning) อยู่ใน Rust Core เท่านั้น —
cloud และ webview **ห้าม** อยู่บนเส้นทาง ≤300ms. ถ้า cloud หลุด core ยังเตือนภัยได้ครบ.

---

## 4. แต่ละข้อจำกัดถูกแก้ด้วยอะไร (Constraint → Mitigation)

| ข้อจำกัด (SRS) | กลไกในสแตกนี้ |
| --- | --- |
| G-Signal ≤300ms (target 250) | เส้นทางวิกฤตเป็น Rust ล้วน; เสียงเตือนใช้ **audio cache ที่ render ไว้ล่วงหน้า** (ไม่เรียก LLM/TTS สด); ดู budget ละเอียดใน `engineering-spec.md` |
| CPU ≤2.5% background | Rust + tokio (async, ไม่ busy-loop); minimap capture แบบ event-driven/throttled; ไม่มี Chromium |
| RAM ≤400MB | Tauri (WebView2 ใช้ร่วมกับระบบ); SLM โหลดแบบ lazy เฉพาะตอน fallback (ดู §5 หมายเหตุ) |
| FPS drop ≤3% | DXGI Desktop Duplication (GPU-assisted capture, ไม่ block render); overlay เป็น window แยก composited โดย DWM |
| Privacy-first | G-Log เก็บใน JSONL local (match-*.jsonl); ข้อมูลดิบ/สถิติผู้เล่น **ไม่อัปโหลด**; cloud รับเฉพาะ context ที่ผ่าน redaction |
| Resilient offline | G-Sentry/G-Signal ทำงานบน Rust core 100%; persona text fallback ไป local SLM/templated lines |

---

## 5. หมายเหตุสำคัญเรื่อง RAM กับ Local SLM (ต้องตัดสินใจตั้งแต่ต้น)

> **สถานะ (2026-07): Local SLM รันผ่าน Ollama (ไม่ pin โมเดลในโค้ด — เลือกใน UI). ตัวเลข Qwen2.5 ด้านล่างเป็นแนวคิด sizing เดิม ไม่ใช่โมเดลที่ hard-code.**

โมเดล SLM 1.5B แบบ Q4 กินหน่วยความจำ ~1–1.3GB ตอนโหลด — **เกิน** budget 400MB ถ้าโหลดค้างไว้ตลอด.
ดังนั้นนิยาม budget ให้ชัด:

- **400MB = always-on background footprint** ของ Rust core + overlay (ไม่รวมน้ำหนักโมเดล)
- SLM **ไม่โหลดในสถานะปกติ** (ขณะ cloud ออนไลน์) — โหลด lazy เฉพาะเมื่อ cloud หลุด
- **critical path ไม่ต้องใช้ LLM เลย** — gank warning เป็น logic เชิงกฎ + เสียง cache → deterministic, เร็ว

ทางเลือกถ้าต้องการ SLM ค้างตลอดจริง ๆ ให้ลดเป็นโมเดล ~0.5B (Qwen2.5-0.5B) หรือใช้ template engine
แทน LLM สำหรับ fallback. **ประเด็นนี้ถูกยกเป็น Risk R-01 ใน TDD.**

---

## 6. สิ่งที่ deploy ขึ้น Vercel (กับสิ่งที่ไม่)

- **ขึ้น Vercel:** landing page, เอกสาร, หน้า remote config/preset ของ Maiden (โทนเสียง, sensitivity),
  ดาวน์โหลด installer. โค้ด React ชุดเดียวกับ overlay (build เป้าหมาย `web`).
- **ไม่ขึ้น Vercel เด็ดขาด:** GSI data, สถิติผู้เล่น, G-Log — ทั้งหมดอยู่บนเครื่องเท่านั้น (privacy-first).

