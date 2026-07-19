# G-Maiden — Ultraplan (Master Implementation Plan)

> ⚠️ **เอกสารเชิงประวัติ (planning artifact, ~v0.1–0.5).** แผนนี้เขียนก่อนลงมือ และหลายอย่าง
> เปลี่ยนไปตอน implement จริง — เช่น G-Log เป็น **JSONL** ไม่ใช่ SQLite, SLM ใช้ **Ollama** ไม่ใช่
> llama-cpp/Qwen, cloud ใช้ **Claude CLI/Anthropic API** ไม่ใช่ Gemini, โมดูลเป็นไฟล์ `.rs` แบน
> ไม่ใช่โฟลเดอร์. **สถานะจริงล่าสุดดูที่ `AGENTS.md` + `CLAUDE.md`.** เก็บไว้เป็นบันทึกแผนเดิม.

> แผนลงมือสร้างระดับ task-by-task — ต่อยอดจาก `01`–`04`. ใช้เป็น "คัมภีร์ build":
> มี toolchain ที่แน่นอน, spike de-risk ก่อนลงทุน, backlog แยกเป็น task id ที่มี deliverable +
> ไฟล์ + acceptance + dependency + estimate, critical path, perf harness และ sprint แรกที่ทำได้ทันที.
>
> **ปรัชญา:** de-risk ก่อน (CV + latency), สร้างเป็น vertical slice ที่รันได้จริงทุก phase,
> วัด NFR ด้วยตัวเลขไม่ใช่ความรู้สึก. ทุก task "เสร็จ" ต่อเมื่อผ่าน acceptance ของมัน.

---

## 0. วิธีอ่านแผนนี้

- **Task id:** `S-x` = spike, `Gn.x` = งานใน Phase n (ตาม Roadmap).
- แต่ละ task มี: **Deliverable / Files / Accept (เกณฑ์ผ่าน) / Deps / Est**.
- Est เป็น dev-day โดยประมาณ (1 dev). `‖` = ทำคู่ขนานกับ track อื่นได้.
- เริ่มที่ §3 (toolchain) → §4 (spikes) → §5 ตามลำดับ phase. ดู critical path §6 ก่อนวางคน.

---

## 1. กลยุทธ์การ build

1. **Spike 3 ตัวก่อนทุกอย่าง** (S-1 minimap CV, S-2 audio interrupt, S-3 GSI loop) — ถ้าตัวใด
   พิสูจน์ไม่ได้ สถาปัตยกรรมต้องปรับ **ก่อน** ลงทุนสร้างฟีเจอร์รอบ ๆ.
2. **Vertical slice ทุก phase** — ทุก phase จบด้วยของที่ "เปิดเกมแล้วเห็นผล" ไม่ใช่ layer แยกที่ยังต่อไม่ได้.
3. **Latency-first** — perf harness (G3.6) สร้างพร้อม G-Signal ไม่ใช่ทีหลัง; ทุก hop ติด `timestamp_ms`.
4. **NFR เป็น gate** — จบ phase ต้องผ่านเกณฑ์ตัวเลข (ดู §9) ไม่งั้นถือว่ายังไม่จบ.

---

## 2. Workstreams (track ที่เดินคู่ขนานได้)

| Track | ขอบเขต | Phase ที่หนัก |
| --- | --- | --- |
| **A — Core/Latency (Rust)** | GSI, CV, sentry/motion/signal, audio, governor | P2–P3, P7 |
| **B — Brain/Persona** | brain router, Gemini, Piper TTS, SLM, persona | P4–P5 |
| **C — UI/Overlay (React)** | overlay glassmorphism, dashboard, hotkeys, Vercel | P1, P5 |
| **D — Data/Feedback** | SQLite G-Log, tuning loop, perf harness | P6, cross |
| **E — Platform** | CI, bundler, installer, auto-update, onboarding | P0, P8 |

ทีมเล็ก: ทำตามลำดับ phase. ทีม ≥3: A นำ, C ตามหนึ่งก้าว, B/D/E แทรกตาม dependency.

---

## 3. Pre-flight — Toolchain & dependencies (ทำครั้งเดียว)

### 3.1 เครื่องมือ
- Rust stable (≥1.80), `rustup`, `cargo`, target `x86_64-pc-windows-msvc`
- Node ≥20 + **pnpm**; Vite; TypeScript ≥5
- **WebView2 Runtime** (Evergreen) บนเครื่อง dev/test
- Visual Studio Build Tools (MSVC) — จำเป็นต่อ link Rust บน Windows
- Tauri CLI v2: `cargo install tauri-cli --version "^2"`

### 3.2 Rust crates (src-tauri)
```
tauri = "2"            tauri-plugin-global-shortcut = "2"
tokio = { features=["full"] }      axum = "0.7"      hyper
serde / serde_json                 crossbeam-channel
windows-capture        (DXGI duplication)   |  หรือ scrap/dxgcap
image / imageproc      (template match)     |  ort = "2" (ONNX, ใส่ตอนยก detector)
rayon                  (vision pool)
rodio + cpal           (audio + interrupt)
rusqlite = { features=["bundled"] }
reqwest = { features=["stream","json"] }    (Gemini)
tracing + tracing-subscriber                (latency trace)
hound / symphonia      (อ่าน/เขียน audio cache)
```
*(Piper เรียกผ่าน ONNX/`ort` หรือ bundle binary; `llama-cpp-2` / `candle` ใส่ตอน P7 fallback)*

### 3.3 npm packages (src/)
```
react react-dom  ·  vite @vitejs/plugin-react  ·  typescript
tailwindcss postcss autoprefixer
zustand            (overlay state)
@tanstack/react-query   (dashboard)
@tauri-apps/api  @tauri-apps/plugin-global-shortcut
framer-motion      (micro-interactions, ใช้แบบประหยัด)
```

### 3.4 GSI config (ต้องมีตั้งแต่ P1)
ไฟล์: `.../Steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/gamestate_integration_gmaiden.cfg`
```
"G-Maiden Integration"
{
  "uri"        "http://127.0.0.1:3000/gsi"
  "timeout"    "5.0"
  "buffer"     "0.1"
  "throttle"   "0.1"
  "heartbeat"  "30.0"
  "data"
  {
    "provider" "1"  "map" "1"  "player" "1"
    "hero" "1"  "abilities" "1"  "items" "1"
  }
}
```
*(installer จะวางไฟล์นี้ให้อัตโนมัติใน G8.x — onboarding)*

**Accept (pre-flight):** `cargo build` + `pnpm install && pnpm build` ผ่านบน Windows สะอาด.

---

## 4. Spike Phase — de-risk ก่อนสร้างจริง (≈1–1.5 สัปดาห์, ทำคู่ขนาน)

> ทำในโฟลเดอร์ `spikes/` ทิ้งได้ — เป้าคือ **คำตอบ ใช่/ไม่ใช่** ไม่ใช่โค้ดสวย.

### S-1 — Minimap CV feasibility ⚠️ เสี่ยงสุด (Track A)
- **Deliverable:** โปรแกรมเล็กที่ capture region minimap แล้ว detect ไอคอนศัตรู ≥1 ตัว แสดงพิกัด
- **Files:** `spikes/cv/`
- **Accept:** template matching จับไอคอนได้ความแม่น ≥80% ในเกมจริง 1 เกม **และ** capture+detect loop ≤80ms/รอบ, CPU เพิ่ม ≤2.5% ที่ ~6Hz
- **ถ้าไม่ผ่าน:** ลองยก ONNX detector; ถ้ายังไม่ได้ → ทบทวน ADR-05 (ลด scope เป็น GSI-only inference)
- **Est:** 3–4d

### S-2 — Audio interrupt latency (Track A)
- **Deliverable:** เล่นคลิป A อยู่ → กด key → ตัดเข้า "เอ๊ะ! เดี๋ยวก่อน!" + คลิป B
- **Files:** `spikes/audio/`
- **Accept:** เวลา จาก trigger → ได้ยินคลิปใหม่ ≤80ms (วัดจริง); ตัดที่ word-boundary ไม่กระตุก
- **Est:** 2d

### S-3 — GSI round-trip (Track A/C)
- **Deliverable:** axum :3000 รับ POST จาก Dota 2 จริง → print net worth/clock
- **Files:** `spikes/gsi/`
- **Accept:** เห็น tick ไหลเข้าทุก ~100–500ms ระหว่างเล่นเกมจริง; ยืนยันว่า **ไม่มีตำแหน่งศัตรู** ใน payload (ตอกย้ำ R-03)
- **Est:** 1d

**Gate ออกจาก Spike:** S-1 และ S-2 ผ่าน → commit สถาปัตยกรรมตามแผน. ไม่ผ่าน → ปรับ ADR ก่อนไป P0.

---

## 5. Task backlog ตาม Phase

### Phase 0 — Foundation (Track E)
- **G0.1** Scaffold Tauri v2 + React/Vite/Tailwind monorepo.
  Files: `src-tauri/`, `src/`, [`tauri.conf.json`](file:///g:/G-Maiden/src-tauri/tauri.conf.json), [`package.json`](file:///g:/G-Maiden/package.json). Accept: `pnpm tauri dev` เปิดหน้าต่างได้. Est 1d
- **G0.2** ตั้ง overlay window: transparent, undecorated, always-on-top, click-through, skip-taskbar.
  Files: `tauri.conf.json`, `src-tauri/src/window.rs`. Accept: หน้าต่างใสมองทะลุ คลิกทะลุไปเกมได้. Deps G0.1. Est 1d
- **G0.3** CI: clippy + eslint + `tauri build`. Files: [`.github/workflows/ci.yml`](file:///g:/G-Maiden/.github/workflows/ci.yml). Accept: PR เขียว, ได้ artifact MSI. Est 1d
- **G0.4** Logging/tracing base + `timestamp_ms` helper. Files: `src-tauri/src/trace.rs`. Accept: log มี monotonic ts. Est 0.5d

### Phase 1 — GSI ingestion + Overlay skeleton (Track A+C)
- **G1.1** axum GSI server + parser → `GameTick` (จาก S-3). Files: `src-tauri/src/gsi/`. Accept: parse net worth/clock/hero ได้ครบ. Est 2d
- **G1.2** Event bus core→UI ผ่าน Tauri events (`CoreEvent`). Files: `src-tauri/src/bus.rs`, `src/store/events.ts`. Accept: UI รับ `GameTick` real-time. Deps G1.1. Est 1.5d
- **G1.3** Overlay HUD glassmorphism (bg `#08090c`, panel `rgba(18,20,28,0.72)`, ice palette). Files: `src/overlay/`. Accept: แสดง net worth/clock/hero ไม่บัง minimap/skill bar. Deps G1.2. Est 2d ‖
- **G1.4** Control dashboard (toggle module, sensitivity slider). Files: `src/dashboard/`. Accept: toggle ส่ง command ถึง core. Est 2d ‖
- **G1.5** Vercel web build (target `web`, ไม่มี Tauri API). Files: `vite.config.ts`, `vercel.json`. Accept: dashboard ขึ้น Vercel preview. Deps G1.4. Est 1d ‖

### Phase 2 — G-Sentry + Minimap CV (Track A) ⚠️
- **G2.1** Capture module (จาก S-1): DXGI region minimap, config พิกัดตาม resolution/HUD scale. Files: `src-tauri/src/vision/capture.rs`. Accept: ได้ frame minimap ที่ ~6Hz. Deps S-1. Est 2d
- **G2.2** Detector: template match 10 ฮีโร่ในเกมนั้น (ดึงรายชื่อจาก GSI/draft). Files: `src-tauri/src/vision/detect.rs`. Accept: แม่น ≥80% เกมจริง. Deps G2.1. Est 3d
- **G2.3** Pixel→game coord mapping. Files: `src-tauri/src/vision/coords.rs`. Accept: พิกัดตรงกับตำแหน่งจริง ±tolerance. Deps G2.2. Est 1d
- **G2.4** G-Sentry: ติดตาม `last_seen`, missing >5s → `EnemyMissing`. Files: `src-tauri/src/sentry/`. Accept: ตรวจ "mid หาย" ได้ในเกมจริง. Deps G2.3. Est 2d
- **G2.5** Adaptive capture rate (เร่งเมื่อ sentry สงสัย) + วัด CPU. Files: `vision/capture.rs`, `governor` stub. Accept: **CPU ≤2.5%** ขณะทำงานปกติ. Deps G2.4. Est 1.5d
- **G2.6** Overlay แสดง enemy-missing indicator. Files: `src/overlay/`. Accept: เห็นไฟเตือนเมื่อศัตรูหาย. Deps G2.4, G1.3. Est 1d ‖

### Phase 3 — G-Motion + G-Signal critical path (Track A) ⚠️ milestone หิน
- **G3.1** Ring buffer ตำแหน่งศัตรู 5 นาที. Files: `src-tauri/src/motion/buffer.rs`. Accept: เก็บ/หมุนถูก ไม่โต RAM. Deps G2.3. Est 1d
- **G3.2** G-Motion probability เส้น gank (เริ่ม heuristic: ทิศ+เวลา+เลน). Files: `src-tauri/src/motion/predict.rs`. Accept: ออก `GankRisk{probability}` สมเหตุผล. Deps G3.1. Est 3d
- **G3.3** Audio cache pipeline + slot-splicing (render คลิป critical ล่วงหน้า). Files: `src-tauri/src/audio/cache.rs`, `assets/voice-cache/`. Accept: เล่นคลิป critical จาก cache ≤40ms. Deps S-2. Est 2d
- **G3.4** G-Signal: threshold >85% + interrupt channel. Files: `src-tauri/src/signal/`. Accept: trigger เสียงเตือนเมื่อข้าม 85%. Deps G3.2, G3.3. Est 2d
- **G3.5** Belief Revision: "เอ๊ะ! เดี๋ยวก่อน!" mid-sentence (state machine `currently_speaking`/`interruptible`/`revision_in_flight`). Files: `signal/revision.rs`, `audio/`. Accept: เปลี่ยนคำเตือนกลางประโยคที่ word-boundary. Deps G3.4. Est 2d
- **G3.6** Latency harness — วัด p50/p99 ทุก hop. Files: `tests/perf/latency.rs`. Accept: รายงานตัวเลขจริง. Deps G3.4. Est 1.5d
- **🚪 GATE P3:** **G-Signal p99 ≤300ms, p50 ≤250ms** พิสูจน์ด้วย G3.6. *ถ้าไม่ผ่าน หยุดทุก track อื่น มาแก้ก่อน.*

### Phase 4 — Cloud Brain / Maiden Scribe (Track B)
- **G4.1** Brain Router (online→Cloud, fail→Template; SLM ใส่ P7). Files: `src-tauri/src/brain/router.rs`. Accept: เลือกแหล่งถูกตาม health. Est 2d
- **G4.2** Gemini 2.0 Flash streaming + timeout 1500ms + circuit breaker. Files: `brain/gemini.rs`. Accept: narration streaming เข้า queue. Deps G4.1. Est 2d
- **G4.3** Redaction ก่อนส่ง cloud (ตัด PII/G-Log ดิบ). Files: `brain/redact.rs`. Accept: payload ออกไม่มีข้อมูลส่วนตัว. Deps G4.2. Est 1d
- **G4.4** Piper local TTS (น้ำเสียงนักพากย์) สำหรับ narration ทั่วไป. Files: `src-tauri/src/audio/tts.rs`, `models/piper/`. Accept: สังเคราะห์สดน้ำเสียงตรง persona. Est 2.5d ‖
- **G4.5** Persona layer: gentle + meme-aware "Nerf CM" + narrative continuity. Files: `brain/persona.rs`, prompt templates. Accept: น้ำเสียงคงเส้นคงวาตาม PRD §2. Deps G4.2. Est 2d
- **G4.6** Narration queue preemptible (G-Signal แทรกได้). Files: `audio/queue.rs`. Accept: alert วิกฤตตัด narration ทั่วไปได้. Deps G3.4, G4.4. Est 1d
- **🚪 GATE P4:** cloud-loss test — ปิดเน็ต → G-Sentry/G-Signal ยังครบ.

### Phase 5 — G-Master Advisor (Track B+C)
- **G5.1** เก็บ net worth/items เรา+ศัตรู (เท่าที่ GSI/CV ให้). Files: `src-tauri/src/master/state.rs`. Accept: state ครบพอแนะนำ. Est 1.5d
- **G5.2** Meta dataset + advice engine (item แก้ทาง). Files: `master/advise.rs`, `assets/meta/`. Accept: คำแนะนำตรงบริบทเกมจริง. Deps G5.1. Est 3d
- **G5.3** Hotkey `Alt+M` → situation summary. Files: `src-tauri/src/hotkey.rs`. Accept: กดแล้ว Maiden สรุปทันที. Est 1d ‖
- **G5.4** Overlay advice panel. Files: `src/overlay/`. Accept: แสดงคำแนะนำ + rationale. Deps G5.2. Est 1.5d ‖

### Phase 6 — G-Log Feedback Loop (Track D)
- **G6.1** SQLite schema + write layer (batched). Files: `src-tauri/src/glog/`. Accept: เขียน matches/decisions/signals ได้. Est 2d
- **G6.2** เก็บ outcome (death/teamfight/win) เทียบคำแนะนำ. Files: `glog/outcome.rs`. Accept: จับคู่ decision↔outcome ถูก. Deps G6.1. Est 2d
- **G6.3** Tuning loop: `tuning_state` ป้อนกลับ G-Sentry/G-Signal เกมหน้า. Files: `glog/tuning.rs`. Accept: params ปรับข้ามแมตช์. Deps G6.2. Est 2d
- **🚪 GATE P6:** **no-egress test** — ตรวจ network: ไม่มี G-Log/สถิติออกนอกเครื่อง.

### Phase 7 — Resilience + Resource hardening (Track A+B)
- **G7.1** Local SLM fallback (Qwen2.5, lazy-load, unload เมื่อ cloud กลับ). Files: `brain/slm.rs`, `models/`. Accept: cloud หลุด → persona text ยังออกจาก SLM. Est 3d
- **G7.2** Resource Governor เต็มรูปแบบ (throttle CPU/RAM/FPS ตาม budget). Files: `src-tauri/src/governor/`. Accept: บังคับ budget ได้จริงใต้โหลด. Est 2.5d
- **G7.3** Perf suite: วัด **RAM ≤400MB, FPS drop ≤3%** บนเครื่องระดับกลาง. Files: `tests/perf/`. Accept: ผ่านทุกตัวเลข. Deps G7.2. Est 2d
- **🚪 GATE P7:** Definition of Done ครบทุกข้อ (Eng Spec §7).

### Phase 8 — Beta → Launch (Track E)
- **G8.1** Installer (MSI/NSIS) + วาง GSI cfg อัตโนมัติ + auto-update. Files: `src-tauri/`, `installer/`. Accept: ติดตั้งบนเครื่องสะอาดแล้วใช้ได้. Est 3d
- **G8.2** Onboarding flow (ตรวจ WebView2, วาง cfg, สอน hotkey). Files: `src/onboarding/`. Accept: ผู้ใช้ใหม่ตั้งค่าจบใน <2 นาที. Est 2d
- **G8.3** Landing + ดาวน์โหลดบน Vercel + เอกสารผู้ใช้. Files: `src/dashboard/`, `docs/user/`. Accept: หน้า public ใช้งานได้. Est 2d ‖
- **G8.4** Closed beta + เก็บ feedback + จูน persona/sensitivity. Accept: เกณฑ์ feedback ผ่าน, NFR ผ่านบนเครื่องผู้ใช้จริงหลากหลาย. Est 2สัปดาห์+
- **🚪 GATE P8:** v1.0 — NFR ครบบนเครื่องจริง.

---

## 6. Dependency graph / critical path

```
S-1,S-2,S-3 ─► G0.x ─► G1.x ─► G2.x ─► G3.x ─► [GATE P3] ─► G4.x ─► G5.x
                                  │                            │
                                  └──────────► G6.x ◄──────────┘ ─► G7.x ─► [GATE P7] ─► G8.x
```
**critical path = S-1 → G2.x (CV) → G3.x (latency/GATE P3) → G7.x (budget/GATE P7).**
ทุกอย่างนอกเส้นนี้ (UI polish, dashboard, advice, docs) ทำคู่ขนานได้ และเลื่อนได้โดยไม่ขยับวันปล่อย.

**กฎ scheduling:** อย่าเริ่ม P4+ จนกว่า GATE P3 ผ่าน — persona ที่สวยบนเส้นทาง latency ที่หลุดคือ
การลงทุนผิดที่.

---

## 7. Cross-cutting: test, perf, observability

- **Perf harness (สร้างที่ G3.6, ขยายที่ G7.3):** วัด 4 ตัวเลข NFR อัตโนมัติ — latency p50/p99,
  CPU%, RAM MB, FPS delta. รันก่อน merge เข้า main ทุกครั้งที่แตะ critical path.
- **Replay fixtures:** เก็บ GSI tick stream + minimap frame เป็นไฟล์ → replay ทดสอบ sentry/motion/signal
  แบบ deterministic โดยไม่ต้องเปิดเกมทุกครั้ง. (สร้างจาก S-1/S-3, ใช้ตลอด)
- **Unit:** vision coord mapping, ring buffer, threshold logic, redaction.
- **Integration:** GSI→Sentry→Motion→Signal→Audio ด้วย replay fixture, assert latency.
- **Manual game test:** checklist ต่อ phase ในเกมจริง (CV แม่น, เตือนตรงจังหวะ, ไม่บัง UI).
- **Observability:** `tracing` spans ต่อ hop + `ResourceStat` ออก UI; เก็บ trace ลง G-Log local.

---

## 8. Sprint 1 — ทำอะไรก่อน (checklist ลงมือได้ทันที)

> เป้า ~1.5–2 สัปดาห์: ผ่าน spike gate + scaffold รันได้ + เห็น GSI ไหลเข้า overlay.

1. [ ] ติดตั้ง toolchain §3 (Rust+MSVC, pnpm, Tauri CLI, WebView2) — `cargo build` + `pnpm build` ผ่าน
2. [ ] **S-3** GSI loop (1d) — เห็น tick จากเกมจริง ยืนยันไม่มีตำแหน่งศัตรู
3. [ ] **S-2** audio interrupt (2d) — ตัดเสียง ≤80ms
4. [ ] **S-1** minimap CV (3–4d) — detect ศัตรู ≥80%, loop ≤80ms ⚠️ ตัวชี้เป็นชี้ตาย
5. [ ] **Spike gate review** — S-1/S-2 ผ่าน? ถ้าไม่ ปรับ ADR ก่อนไปต่อ
6. [ ] **G0.1–G0.2** scaffold + overlay window ใส click-through
7. [ ] **G1.1–G1.3** GSI server → event bus → overlay แสดง net worth/clock

**นิยาม "Sprint 1 สำเร็จ":** เปิด Dota 2 จริง → overlay กระจกใสแสดงข้อมูลสด + spike ทั้ง 3 ผ่าน gate.

---

## 9. Milestone gates (NFR validation — ตัวเลขบังคับ)

| Gate | เกณฑ์ | Phase |
| --- | --- | --- |
| Spike | S-1 CV ≥80% & ≤80ms/loop; S-2 interrupt ≤80ms | §4 |
| GATE P2 | CPU ≤2.5% ขณะ CV ทำงาน | G2.5 |
| **GATE P3** | **G-Signal p99 ≤300ms, p50 ≤250ms** | G3.6 |
| GATE P4 | cloud-loss → sentry/signal ยังครบ | G4 |
| GATE P6 | no-egress (G-Log ไม่ออกนอกเครื่อง) | G6 |
| **GATE P7** | RAM ≤400MB & FPS drop ≤3% & DoD ครบ | G7.3 |
| GATE P8 | v1.0 NFR ครบบนเครื่องผู้ใช้จริง | G8 |

---

## 10. Tracking & cadence

- **Board:** task id ในแผนนี้ = การ์ด 1 ใบ (To do / In progress / Blocked / Done-when-accept-passed).
- **WIP limit:** critical path (Track A) ทำทีละ task; track อื่นคู่ขนานได้.
- **Definition of Done กลาง:** code + test + acceptance ของ task ผ่าน + ไม่ทำ NFR gate ใด ๆ ถอยหลัง.
- **รีวิว gate:** ทุก 🚪 GATE คือ go/no-go meeting — ไม่ผ่านไม่ข้าม phase.
- **อัปเดต ADR/Risk:** ถ้า spike หรือ gate บังคับให้เปลี่ยนดีไซน์ แก้ `03-TDD.md` (ADR/Risk) ทันที.
```
สถานะถัดไปที่แนะนำ: เริ่ม Sprint 1 ข้อ 1–4 (toolchain + spike ทั้งสาม)
```
