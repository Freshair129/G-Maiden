# G-Maiden — Roadmap

> เส้นทางจาก spec-stage → launch แบ่งเป็น phase ที่มี **exit criteria วัดได้** ผูกกับ NFR.
> หลักการ: พิสูจน์ความเสี่ยงที่แพงสุด (latency, CV, resource) **ให้เร็ว** ไม่ดองไว้ท้าย.
> ประมาณการเป็นช่วงเวลาแบบ relative (ปรับตามขนาดทีม).

---

## Phase 0 — Foundation (≈1–2 สัปดาห์)
**เป้า:** โครงโปรเจกต์รันได้ end-to-end เปล่า ๆ
- scaffold Tauri v2 + React/Vite/Tailwind + Rust workspace
- CI (GitHub Actions): cargo check/clippy, eslint, tauri build (MSI/NSIS)
- โครง `docs/`, perf harness skeleton
- **Exit:** `pnpm tauri dev` เปิด overlay เปล่าโปร่งใส always-on-top ได้บน Win10/11

## Phase 1 — GSI Ingestion + Overlay skeleton (≈2 สัปดาห์)
**เป้า:** เห็นข้อมูลเกมจริงบน overlay
- axum GSI server :3000 + ไฟล์ config GSI + parser
- `GameTick` events → React overlay แสดง net worth/clock/hero แบบ glassmorphism
- control dashboard (toggle module, sensitivity) + Vercel web build แรก
- **Exit:** เปิด Dota 2 → overlay อัปเดต real-time; dashboard ขึ้น Vercel

## Phase 2 — G-Sentry + Minimap CV (≈3 สัปดาห์) ⚠️ ความเสี่ยงสูง
**เป้า:** ตรวจศัตรูหายจากแผนที่ได้จริง (พิสูจน์ R-02/R-03)
- DXGI minimap capture + template matching ไอคอนศัตรู
- G-Sentry: missing >5s → `EnemyMissing`; แจ้งเตือนเสียงพื้นฐาน
- adaptive capture rate + วัด CPU
- **Exit:** ตรวจ "mid หาย" ได้แม่นในเกมจริง; **CPU ≤2.5%** ระหว่างทำงาน

## Phase 3 — G-Motion + G-Signal critical path (≈3 สัปดาห์) ⚠️ milestone หิน
**เป้า:** ปิด NFR latency หลักของทั้งโปรเจกต์
- G-Motion: ring buffer 5 นาที + probability เส้น gank
- G-Signal: threshold >85% + **audio cache + interrupt** + Belief Revision ("เอ๊ะ! เดี๋ยวก่อน!")
- latency harness วัด p50/p99 ทุก hop
- **Exit:** **G-Signal p99 ≤300ms, p50 ≤250ms** พิสูจน์ด้วยตัวเลขจริง; Belief Revision ทำงาน

## Phase 4 — Cloud Brain / Maiden Scribe (≈2–3 สัปดาห์)
**เป้า:** persona "Maiden" มีชีวิต
- Brain Router + Gemini 2.0 Flash streaming + redaction
- Piper local TTS สำหรับบทพากย์ทั่วไป (น้ำเสียงนักพากย์)
- persona consistency: gentle + meme-aware ("Nerf CM") + narrative continuity
- **Exit:** narration ลื่นไหล; cloud-loss → ยังเตือนภัยครบ (resilience test เบื้องต้น)

## Phase 5 — G-Master Advisor (≈2 สัปดาห์)
**เป้า:** คำแนะนำ skill/item เชิงกลยุทธ์
- เทียบ net worth/ไอเทมเรา-ศัตรู + meta dataset
- คำแนะนำซื้อไอเทมแก้ทาง + persona touch
- hotkey `Alt+M` สรุปสถานการณ์
- **Exit:** คำแนะนำตรงบริบทในเกมจริง; hotkey ตอบทันที

## Phase 6 — G-Log Feedback Loop (≈2 สัปดาห์)
**เป้า:** ปิด loop เรียนรู้ (local-only)
- SQLite schema + เก็บ decisions/signals/outcomes
- tuning_state ป้อนกลับ G-Sentry/G-Signal เกมหน้า
- **Exit:** params ปรับอัตโนมัติข้ามแมตช์; **no-egress test ผ่าน** (ไม่มีข้อมูลออกนอกเครื่อง)

## Phase 7 — Resilience + Resource hardening (≈2–3 สัปดาห์)
**เป้า:** ปิดทุก NFR ที่เหลือให้ครบ
- Local SLM fallback (lazy-load) + circuit breaker
- Resource Governor บังคับ budget เต็มรูปแบบ
- วัด **RAM ≤400MB, FPS drop ≤3%** บนเครื่องระดับกลาง
- **Exit:** ผ่าน Definition of Done ครบทุกข้อ (Eng Spec §7)

## Phase 8 — Closed Beta → Launch (≈3–4 สัปดาห์)
**เป้า:** ส่งถึงมือผู้เล่นจริง
- installer (MSI/NSIS) + auto-update; onboarding ติดตั้ง GSI config
- closed beta เก็บ feedback; ปรับ persona/sensitivity
- landing + ดาวน์โหลดบน Vercel; เอกสารผู้ใช้
- **Exit:** v1.0 ออก, NFR ผ่านบนเครื่องผู้ใช้จริงหลากหลาย

---

## เส้นทางวิกฤต (Critical path ของโปรเจกต์)
**Phase 2 (CV) → Phase 3 (latency)** คือสองด่านที่เสี่ยงสุดและกำหนดว่าโปรเจกต์ "ทำได้จริงไหม".
แนะนำสร้าง **spike/prototype ของ minimap CV + audio-interrupt ตั้งแต่ Phase 0–1 คู่ขนาน**
เพื่อ de-risk ก่อนลงทุนสร้างฟีเจอร์รอบ ๆ

## NFR Validation Map
| NFR | พิสูจน์ที่ Phase |
| --- | --- |
| G-Signal ≤300ms | Phase 3 |
| CPU ≤2.5% | Phase 2 (เริ่ม), Phase 7 (ยืนยัน) |
| RAM ≤400MB | Phase 7 |
| FPS drop ≤3% | Phase 7 |
| Resilient offline | Phase 4 (เริ่ม), Phase 7 (เต็ม) |
| Privacy / no-egress | Phase 6 |
