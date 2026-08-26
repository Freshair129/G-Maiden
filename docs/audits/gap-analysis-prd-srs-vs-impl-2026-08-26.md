# G-Maiden — Gap Analysis: PRD/SRS vs Implementation
**Date:** 2026-08-26 · **Commit:** `main @ 5b0b8faa` (v0.13.2) · **Scope:** เทียบข้อกำหนดใน `docs/product/product-requirements.md` (PRD) + `docs/product/software-requirements-specification.md` (SRS) กับโค้ดจริงใน `src-tauri/src/` + `src/src/` — ยึด SRS เป็นหลักเมื่อขัดกัน

Method: อ่าน PRD/SRS/CLAUDE.md/AGENTS.md ครบทั้งฉบับ แล้ว verify ทุก claim สำคัญกับโค้ดจริง (ไม่เชื่อเอกสารเปล่า ๆ) — ทุกข้อกล่าวอ้างสถานะโค้ดมี `file:line` กำกับ ใช้ `docs/FEATURE-LEDGER.md` (generated 2026-08-18, 73 rows) เป็นโครงตั้งต้นและตรวจพบว่า ledger เอง stale อย่างน้อย 1 แถว (G-Persona — ดู §5)

---

## 1. สรุปสั้น (Executive Summary)

**ความครบถ้วนโดยรวมเทียบ SRS: ~60–65% ของ Functional Requirements ทั้งหมด / ~90% ของกลุ่ม Core 6 โมดูล**

- **Core 6 โมดูล (SRS §3.1–3.6): shipped ทั้งหมด** โดยมี partial 3 จุด (G-Motion ไม่มี heatmap/path model, G-Master มองไม่เห็น Net Worth ศัตรู, G-Log ยังไม่ปิด feedback loop อัตโนมัติ)
- **กลุ่มส่วนขยาย Companion Experience (SRS §3.7–3.12): ~20%** — ที่ SRS ระบุเป็น **P0 สองตัว (G-Voice, G-Memory) ไม่มีโค้ดเลยแม้แต่บรรทัดเดียว** นี่คือช่องว่างใหญ่ที่สุดระหว่างสเปคกับของจริง
- **NFR: มี measurement apparatus จริงครบทุกงบ** (latency gate จริง, governor enforce CPU/RAM runtime, FPS harness ผ่าน PresentMon) — จุดอ่อนคือ FPS gate ยังไม่มีหลักฐาน pass จริงใน repo และ latency gate ไม่รันต่อ commit

**Gap ใหญ่สุด 5 อันดับ:**
1. **G-Voice (P0)** — ไม่มี STT / push-to-talk ใด ๆ ในโค้ด (FEATURE-LEDGER: `3-g-voice` doc-only; grep `stt|whisper|microphone` ทั้ง repo ไม่พบ) ซ้ำร้าย hotkey ที่ SRS จองไว้ (`Alt+M`) ถูกใช้เป็น mute toggle ไปแล้ว (`src-tauri/src/lib.rs:776`)
2. **G-Memory (P0)** — ไม่มี persistent player memory ข้ามแมตช์; สิ่งที่ใกล้ที่สุดคือ OpenDota trend baselines (public cloud data) ซึ่งเป็นคนละสิ่งกับที่ SRS §3.8 นิยาม
3. **G-Coach (P1)** — ไม่มี post-match deep review จาก GSI log; หน้า Insights/History แสดง OpenDota aggregate เท่านั้น ไม่ใช่ key-decision-point analysis
4. **G-Stream (P2)** — ไม่มีโค้ดใด ๆ
5. **G-Master ครึ่งเดียวของ SRS §3.4.1** — เทียบได้แค่ Net Worth ตัวเอง + รายชื่อฮีโร่ศัตรูจาก CV; Scoreboard-OCR ที่จะอ่าน NW ศัตรู (`src-tauri/src/ocr.rs:1-17`) เป็น Phase A scaffold ที่**ยังไม่มี caller เลย** (declare ที่ `lib.rs:31` เท่านั้น) และ model ไม่ bundle

**Deviation จากสเปคใหญ่สุด 5 อันดับ (ทั้งหมดมีเหตุผลบันทึกไว้):**
1. **Gemini → Claude CLI/Anthropic API + Ollama fallback** (`master.rs:14,132-146`) — SRS §4.2 มี note 2026-07 รับสภาพแล้วว่าเป็น Phase-4 target ที่ยังไม่ wire
2. **ติดตามศัตรูด้วย CV screen-capture ไม่ใช่ GSI** — SRS §3.1.1 สั่งให้อ่าน GSI ทุก 500ms เพื่อดูฮีโร่ศัตรู แต่ GSI ของ own-game ไม่ส่งตำแหน่งศัตรูเลย จึงเป็นข้อกำหนดที่เป็นไปไม่ได้เชิงเทคนิค; ของจริงคือ DXGI→ONNX minimap CV ที่ 4–8 Hz (`capture.rs:15-16,49-57`) — เร็วกว่าที่สเปคขอ
3. **Danger Threshold 85% เหลือเป็นแค่ระดับ "Low"** — default จริงคือ Med 0.65/0.40 เพราะ 0.85 ไม่เคย fire ในแมตช์จริง (`signal.rs:17-21,40-46`)
4. **`Alt+M` = mute ไม่ใช่ "สรุปสถานการณ์ทันที"** ตาม SRS §4.1 (`lib.rs:776`) — ฟีเจอร์ situation-summary hotkey ไม่มีอยู่เลย
5. **Resilience เกินสเปค** — SRS §5.2 ให้ G-Sentry/G-Signal "หันมาพึ่ง Local SLM" เมื่อ cloud หลุด แต่ของจริง critical path เป็น pure Rust ที่ไม่แตะ cloud/SLM ตั้งแต่ต้น (deterministic state machines ใน `sentry.rs`/`motion.rs`/`signal.rs`) — SLM ใช้เฉพาะ G-Master fallback (`master.rs:142-146`, `slm.rs`) ถือเป็น deviation เชิงบวก

---

## 2. ตารางรายโมดูล

Legend: ✅ shipped ตรงสเปค · 🟡 partial · ❌ missing · ⚠️ deviates (ทำงานแต่ต่างจากที่สเปคเขียน)

### 2.1 Core (SRS §3.1–3.6)

| Module | Requirement (ref) | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| **G-Sentry** | SRS §3.1.2 — ฮีโร่หายจาก vision เกิน 5s → เริ่มประเมินความเสี่ยง | ✅ | `src-tauri/src/sentry.rs:27` (`MISSING_THRESHOLD_MS = 5_000`), edge-triggered + confirm-gate `sentry.rs:44-59` | มี anti-phantom gate (CONFIRM_HITS=4) เกินสเปค |
| G-Sentry | SRS §3.1.1 — อ่านจาก **GSI** ทุก **500ms** | ⚠️ | แหล่งข้อมูลจริงคือ CV detections จาก DXGI capture ที่ 4 Hz ปกติ / 8 Hz alert / 2 Hz throttled (`capture.rs:49-57,527-529`) | GSI ไม่ส่งตำแหน่งศัตรู — สเปคตั้งบนสมมติฐานที่ผิด; cadence จริงเร็วกว่าที่ขอ |
| G-Sentry | SRS §3.1.2 — โฟกัส "ตำแหน่งแก๊ง (Mid, Pos 4)" | 🟡 | `sentry.rs` track ศัตรูทุกตัวเท่ากัน — ไม่มี role weighting ใด ๆ ในไฟล์ | ไม่มีข้อมูล role จาก CV; ถือว่า track-ทุกตัว ครอบคลุมกว่าแต่ไม่ weight ตามสเปค |
| **G-Motion** | SRS §3.2.1 — เก็บตำแหน่ง last-seen ย้อนหลัง 5 นาที | ✅ | `src-tauri/src/motion.rs:24` (`WINDOW_MS = 300_000`), ring buffer `VecDeque` | |
| G-Motion | SRS §3.2.2 — ความน่าจะเป็นของ**เส้นทาง**หลบซ่อน (river/ป่า/รูน) + **Heatmap** | ⚠️🟡 | `motion.rs:6-16` ประกาศตัวเองเป็น "transparent **v1 heuristic**, not a learned model" — off-map-time ramp + heading multiplier (`motion.rs:33-78`) ไม่มี heatmap ไม่มี path model | CLAUDE.md รับสภาพแล้ว ("No heatmap or learned path model ships"); PRD ตัวอย่าง "78% ที่เนินเขานี้" ไม่มีทางเกิดจากโค้ดนี้ |
| **G-Signal** | SRS §3.3.1 — latency < 300ms + **Interrupt** เสียงที่กำลังพูด | ✅ | interrupt จริง: `capture.rs:926-928` (`audio::cancel()` + `tts::cancel()` ก่อนเล่นคลิปเตือน); latency ดู §3 | |
| G-Signal | SRS §3.3.1 — Danger Threshold **> 85%** | ⚠️ | `signal.rs:21-22` (`DANGER_THRESHOLD=0.85` = ระดับ Low เท่านั้น); default Med = 0.65/0.40, High = 0.50/0.30 (`signal.rs:40-46`) | เหตุผลบันทึกใน `signal.rs:17-20`: 0.85 ไม่เคย fire ในแมตช์จริง (v0.7.3 field report) |
| G-Signal | SRS §2.3 — **Belief Revision** เปลี่ยนคำแนะนำกลางคัน | ✅ | `signal.rs:52-58,111-114` (`SignalEvent::Revision` เมื่อ risk ตกต่ำกว่า clear หลัง alert), เสียง "เอ๊ะ! เดี๋ยวก่อน..." `capture.rs:938-943` | hysteresis latch กัน chatter — ตรง persona rule |
| **G-Master** | SRS §3.4.1 — เทียบ NW + ไอเทมตัวเอง **กับ NW/สไตล์ฝ่ายตรงข้าม** | 🟡 | prompt มีเฉพาะ NW/สถิติตัวเอง (`master.rs:81-101`) + ชื่อฮีโร่ศัตรูจาก CV → counter-item dataset (`master.rs:62-66`, `counter_advice.rs`) + self-burst (`master.rs:72-79`, `damage.rs`); **NW ศัตรูไม่มี** — `ocr.rs` (PP-OCR scoreboard reader, `ocr.rs:1-17`) ไม่มี caller ใดในโค้ด (มีแต่ `mod ocr;` ที่ `lib.rs:31`) | GSI ไม่ให้ NW ศัตรู; OCR = ทางแก้ที่ scaffold แล้วแต่ยังไม่ wire (Phase B/C ในแผน) |
| G-Master | SRS §3.4.2 — อิง "ข้อมูลเมต้าแพตช์ปัจจุบัน" | 🟡 | counter-item dataset เป็นไฟล์ static ใน repo (`items.rs`/`counter_advice.rs`) ไม่มี pipeline อัปเดตตามแพตช์ | LLM cloud อาจชดเชยได้บางส่วนแต่ไม่ grounded กับแพตช์จริง |
| G-Master | ส่งคำแนะนำผ่าน cloud + fallback | ✅⚠️ | `master.rs:111-146` — backend `Auto\|Claude\|Ollama`; Auto = ลอง Claude CLI/API ก่อนแล้วตกลง Ollama; throttle 30s + cache (`master.rs:23-26`) | ⚠️ = ไม่ใช่ Gemini ตามสเปคเดิม (ดู §4) |
| **G-Sensory** | SRS §3.5.1 — FPS Dota ตกไม่เกิน 3% | 🟡 | harness วัดจริงมี: `tests/perf/src/bin/perf_p7.rs` (PresentMon/ETW two-phase, gate `fps_drop_pct <= 3.0`, `tests/perf/README.md:141-191`) — **แต่ไม่พบหลักฐาน run ที่ pass จริงใน repo** และ README สั่งห้าม claim closeout จนกว่าจะมี | harness ออกแบบ honest-skip (เอกสารปลอม baseline ไม่ได้) |
| G-Sensory | SRS §3.5.2 — Glassmorphism โทนน้ำแข็ง + ไม่บดบัง minimap/skill bar/stats | 🟡 | glassmorphism + ice palette ✅ (`src/src/app/theme.ts:3`, `styles.css:2120`); ตำแหน่ง overlay ปรับได้ (top/left/right/custom + X/Y) แต่**ไม่มีกลไกตรวจ/บังคับ** ว่าไม่ทับ UI สำคัญ — เป็น convention ของ default position เท่านั้น | |
| G-Sensory | PRD — "ปรับเปลี่ยนสี Overlay ตาม Element ของฮีโร่ที่เล่น" | ❌ | grep `element/hero-accent` ใน `src/src/overlay/` ไม่พบ mechanism ใด | cosmetic; PRD-only (SRS ไม่ได้ขอ) |
| **G-Log** | SRS §3.6.1 — บันทึกการตาย/ผลไฟต์เทียบกับคำแนะนำที่ส่งออก | ✅ | `src-tauri/src/log.rs:1-8` — JSONL ต่อแมตช์ ที่ `%LOCALAPPDATA%\G-Maiden\logs\`, sampled ~1 Hz + `risk_trace` ของ input ที่ G-Motion เห็นจริง (`capture.rs:105,795`) | local-only ตาม privacy-first |
| G-Log | SRS §3.6.2 — วิเคราะห์ว่า sensitivity แบบใดรอดสุด แล้ว**จูนพารามิเตอร์เกมหน้า** | 🟡 | เครื่องมือ analysis มีจริง: `tests/perf/src/bin/replay_fit.rs` — replay log ผ่าน `Motion`/`Signal` ตัวจริง grid-search `MotionParams × Sensitivity` ให้ P/R/F1 เทียบการตายจริง (`README.md:97-126`) — **แต่ผลไม่ถูกป้อนกลับอัตโนมัติ**: ค่าที่รันจริงยังเป็น `MotionParams::default()` hardcode (`motion.rs:66-78` — "nothing in the live path changes just by this struct existing" `motion.rs:30-32`) | loop "ปิดได้ด้วยมือ" ไม่ใช่ "ปิดแล้ว" |

### 2.2 Companion Experience Extensions (SRS §3.7–3.12)

| Module | Requirement (ref) | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| **G-Voice** | SRS §3.7 (**P0**) — PTT (`Alt+M` ค้าง) → STT → Cloud Brain → TTS, G-Signal interrupt ได้ | ❌ | ไม่มีโค้ด STT/PTT/mic ใด ๆ (grep `stt\|whisper\|microphone\|SpeechRecognition` ทั้ง `src-tauri/src` + `src/src` = 0 hit จริง); FEATURE-LEDGER `3-g-voice` = doc-only | `Alt+M` ถูกจองเป็น mute แล้ว (`lib.rs:776`) — ต้องแก้ hotkey conflict ก่อนสร้าง |
| **G-Memory** | SRS §3.8 (**P0**) — จำฮีโร่ถนัด/จุดตายซ้ำ/เทรนด์ MMR ข้ามแมตช์ เก็บ local | ❌ | ไม่มี store ข้ามแมตช์ที่สกัดจาก G-Log; FEATURE-LEDGER `3-g-memory` = doc-only | OpenDota profile/trend ใน deck (`src/src/profile.ts`, live builders) เป็น public cloud data ไม่ใช่ local play-memory ตามนิยาม §3.8 |
| **G-Coach** | SRS §3.9 (P1) — วิเคราะห์ GSI log ทั้งแมตช์ → top-3 จุดปรับปรุงบน Dashboard | ❌ | ไม่มีตัวประมวลผล post-match จาก `logs/match-*.jsonl` ไปหน้า UI; Insights/History (`CompanionPages.tsx` + `live/`) แสดง OpenDota aggregate เท่านั้น; FEATURE-LEDGER `3-g-coach` = doc-only | วัตถุดิบครบแล้ว (G-Log JSONL + risk_trace) — ขาดตัว analyzer + UI |
| **G-Mind** | SRS §3.10 (P1) — เลือก/สลับ Cloud LLM (Gemini default) + คง SLM fallback | 🟡⚠️ | backend picker มีจริง: `Auto\|Claude\|Ollama` (`master.rs:127-146`, `runtime::master_backend`, UI `Control.tsx:222-234`); SLM fallback ✅ | ⚠️ Gemini (ที่สเปคให้เป็น default) ไม่มี; เลือกได้เพียง cloud เดียว จึงยังไม่กัน vendor lock-in ตามเจตนาสเปค |
| **G-Persona** | SRS §3.11 (P2) — แกนความถี่พูด (เงียบ↔ช่างพูด) + แกนโทน (โค้ช↔มีม) ไม่ลบล้าง Belief Revision/Interrupt | 🟡 | 4 presets `coach/silent/caster/meme` มีจริงและ wire ครบสองฝั่ง: `runtime.rs:82-83` + `lib.rs:528-536` (Rust), `Control.tsx:456-475` (UI), Silent ตัด persona lines + auto-advice voice แต่คงเตือนวิกฤต (`Overlay.tsx:266,393`), โทน casual/serious สลับ wording (`Overlay.tsx:21,221,243`; `capture.rs:932-943`) | ครอบคลุมทั้งสองแกนแบบหยาบ (ไม่มี slider ความถี่); **FEATURE-LEDGER แถว `3-g-persona` = "doc-only" — stale/ผิด** |
| **G-Stream** | SRS §3.12 (P2) — โหมด co-host + ปกปิดข้อมูลละเอียดอ่อนบนสตรีม | ❌ | ไม่มีโค้ด; FEATURE-LEDGER `3-g-stream` = doc-only | |

### 2.3 External Interfaces (SRS §4)

| Interface | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| Dota 2 GSI | §4.2 — local HTTP POST port 3000 | ✅ | `gsi.rs:608` (`bind("127.0.0.1:3000")`) + watchdog + `/telemetry`, `/announcer/install`, `/auth/callback` | bind loopback เท่านั้น (ดีกว่าสเปคซึ่งไม่ได้ระบุ) |
| Cloud Cognitive Engine | §4.2 — Gemini API | ❌⚠️ | ไม่มี Gemini client ใด ๆ; ทางที่ ship คือ Claude CLI/Anthropic (`master.rs:14,185`) + Ollama (`slm.rs`) | SRS เอง annotate แล้ว (note 2026-07 ใน §4.2) — spec-acknowledged deviation |
| TTS | §4.2 — สไตล์น้ำเสียงนักพากย์ | 🟡 | Windows SAPI ผ่าน PowerShell (`tts.rs:1-5`); **Piper local neural TTS มี path ใช้งานจริงแล้ว** ถ้าวาง `piper.exe` + model (`tts.rs:109-165`) แต่ไม่ bundle; "อารมณ์นักพากย์" ตัวจริงมาจาก announcer packs (คลิปเสียงจริง — `voice_api/`, `audio::play_random` ก่อนตกลง TTS) | สเปคควรบันทึกว่า pack-clips คือกลไก caster-voice ที่ ship |
| STT | §4.2 — สำหรับ G-Voice (ไทย/อังกฤษ) | ❌ | ไม่มีโค้ด (ตาม G-Voice) | |
| UI | §4.1 — `#08090c` + ice aluminium frame | ✅ | `theme.ts:3`, `styles.css:2120` | |
| UI | §4.1 — Modular panels | ✅ | 7 nav pages, SSOT `shortcuts.ts:72` (`PAGES`), `Ctrl+1..7`; Settings split-view (`CommandDeck.tsx`) | เกินสเปค (ONE CANVAS / CR-013) |
| UI | §4.1 — Global hotkey `Alt+M` = "สรุปสถานการณ์ทันที" | ⚠️❌ | hotkeys จริง: `Ctrl+Alt+S` toggle overlay, `Alt+↑/↓` volume, `Alt+M` **mute** (`lib.rs:771-776`) — ฟีเจอร์ situation-summary ไม่มีเลย | |

---

## 3. NFR Compliance (SRS §5 + CLAUDE.md hard constraints)

| NFR | Budget | วัดจริงหรือไม่ | Evidence | Verdict |
| --- | --- | --- | --- | --- |
| **G-Signal E2E latency** | p50 ≤ 250ms, ห้ามเกิน 300ms | **วัดจริง หลายชั้น** | (1) GATE P3 harness เรียกฟังก์ชันจริง hops 2–5 (CV/motion/signal/audio-admission) + งบ 70ms สำหรับ hop 1b/6 ที่ headless วัดไม่ได้ — gate = measured(2-5)+70 ≤ 300 (`tests/perf/src/main.rs:7-59`, README:50); (2) `latency_live.rs` วัด hop 1b (DXGI rect) + hop 6 (audio device) บนเครื่องจริง; (3) in-crate: `capture.rs:1014` pipeline p99 < **80ms** assert (`capture.rs:1060`), `capture.rs:1064` gsi→signal→enqueue p99 < **10ms** (`capture.rs:1102`) | ✅ วัดจริง แต่ **CI ไม่ gate ต่อ commit** — `perf-gate.yml` เป็น `workflow_dispatch` เท่านั้นและระบุตัวเองเป็น advisory บน shared runner |
| **Background CPU** | ≤ 2.5% mid-range | **monitor + enforce runtime** | `governor.rs:1-14` — poll ทุก 10s ผ่าน Win32 API, `CPU_THROTTLE` (`governor.rs:67`) บังคับ capture ลดเหลือ 2 Hz เมื่อเกินงบ (`capture.rs:55-57,159,527-529`); harness วัดแบบ Task-Manager-aligned: `tests/perf/src/bin/perf_cpu_tree.rs` | 🟡 enforce ที่ runtime จริง แต่**ไม่มี automated test ที่ assert ตัวเลข 2.5%** — ค่า compliance มาจากการรันมือ |
| **RAM** | ≤ 400MB ทุกโมดูล active | monitor runtime | `governor.rs:5-7` ระบุ budget ตรงสเปค; over-budget รวม RAM ด้วย (`governor.rs:78-80`) → throttle เดียวกัน | 🟡 เหมือน CPU — monitor+throttle มี, assertion อัตโนมัติไม่มี |
| **Overlay FPS impact** | ≤ 3% drop | **harness มี, หลักฐาน pass ไม่พบ** | `perf_p7.rs` two-phase PresentMon/ETW, gate `fps_drop_pct <= 3.0`, ปฏิเสธ baseline ปลอม/เก่า (README:141-191) | 🟡 **NFR นี้ยัง "asserted but unproven"** — README เองสั่ง "Do not claim P7 closeout until verdict is pass from a real run" และไม่พบ `fps-report.json` ที่ commit ไว้ |
| **ไม่บดบัง minimap/skill bar/stats** | (SRS §3.5.2) | ❌ ไม่มีการวัด | ตำแหน่ง overlay เป็น user-adjustable; ไม่มี collision check ใด ๆ | asserted-only |
| **Resilience** | G-Sentry/G-Signal อยู่รอดเมื่อ cloud หลุด | ✅ (โครงสร้าง) | critical path ไม่มี network dependency เลย — pure Rust state machines (`sentry.rs`/`motion.rs`/`signal.rs`, ADR-03); G-Master Auto ตกลง Ollama เมื่อ Claude ล้ม (`master.rs:142-146`) | ⚠️ วิธี achieve ต่างจากสเปค (ไม่ใช้ SLM ใน critical path — ดีกว่า) |
| **Privacy-first** | G-Log/raw data local-only | ✅ | `log.rs:1-4` ("Never sent off-device"), GSI bind loopback (`gsi.rs:608`), replay_fit read-only zero-network (`replay_fit.rs:3-10`) | ⚠️ SRS §5.2 เขียนแบบ absolute — ไม่รู้จัก opt-in 2 ชั้นที่มีจริงแล้ว (ADR-14 account identity, ADR-11/16 data contribution) และไม่รู้จัก release-gate ที่บังคับ sign-in online (`App.tsx:33` + `GmadFirstRunGate.tsx`, CR-022) — สเปคล้าหลังกว่านโยบายจริง |

**สรุป NFR:** ต่างจาก audit 2026-07-07 ที่พบ latency gate เป็น stub — ตอนนี้ gate เป็นของจริงแล้ว (rewrite บันทึกใน `tests/perf/src/main.rs:9-13`) และ CI หลัก (`ci.yml`) รัน clippy + `cargo test` + eslint + vitest + doc-graph gate ทุก push/PR จริง สิ่งที่เหลือคือ (ก) FPS §P7 ยังไม่มี run จริงบันทึกไว้ (ข) latency gate ไม่ผูกกับ release pipeline (ค) CPU/RAM ไม่มีตัวเลข assert อัตโนมัติ

---

## 4. Deviations from Spec (พฤติกรรมที่ ship ต่างจาก PRD/SRS)

| # | Deviation | สเปคว่า | ของจริง | เหตุผลที่บันทึกไว้ |
| --- | --- | --- | --- | --- |
| 1 | Cloud engine | Gemini (SRS §4.2, G-Mind default §3.10) | Claude CLI / Anthropic `claude-haiku-4-5` + Ollama fallback (`master.rs:14,132-146`) | SRS note 2026-07: Phase-4 target ยังไม่ wire; Claude CLI ใช้ quota ที่ user มีอยู่ ไม่มี per-token cost (`master.rs:1-4`) |
| 2 | แหล่งข้อมูลตำแหน่งศัตรู | GSI ทุก 500ms (SRS §3.1.1, PRD G-Sentry) | DXGI screen-capture → ONNX minimap CV ที่ 4–8 Hz (`capture.rs:15,49-53`) | GSI own-game ส่งเฉพาะ local player — ข้อกำหนดเดิม infeasible (CR-002 "own-game honest limit") |
| 3 | Capture tech | (design เดิม WGC — ADR-13/CR-001) | DXGI Desktop Duplication; WGC เก็บหลัง `--features wgc` (`capture_wgc.rs`) | WGC บน Win10 stall ~0.7Hz/8% CPU + crash บน WithoutBorder (`capture.rs:6`) |
| 4 | Danger threshold | > 85% (SRS §3.3.1) | Sensitivity ladder: Low 0.85/0.50, **default Med 0.65/0.40**, High 0.50/0.30 (`signal.rs:21-46`) | 0.85 ไม่เคย fire ในแมตช์จริง (field report v0.7.3, `signal.rs:17-20`) |
| 5 | `Alt+M` | สรุปสถานการณ์ทันที (SRS §4.1) | mute toggle (`lib.rs:776`) | ไม่มีบันทึกเหตุผล — น่าจะชนกับการที่ G-Voice ไม่เคยถูกสร้าง |
| 6 | Resilience mechanism | G-Sentry/G-Signal พึ่ง Local SLM เมื่อ cloud หลุด (SRS §5.2) | critical path เป็น pure Rust ไม่มี LLM เลย; SLM เฉพาะ G-Master (`slm.rs`, `master.rs:142-146`) | ADR-03: hot path ห้ามมี cloud/webview — เชื่อถือได้กว่า SLM |
| 7 | TTS | โมดูล TTS โทนนักพากย์ (SRS §4.2) | SAPI ทั่วไป (`tts.rs:1-5`) + Piper optional ไม่ bundle (`tts.rs:109-165`); โทนนักพากย์จริงมาจาก announcer pack clips (`voice_api/`, `audio.rs`) | Piper อยู่ในแผน Phase 3 (roadmap) |
| 8 | Product openness | SRS §2.1: แอป standby หลังบ้านทำงานกับเกม (ไม่กล่าวถึงบัญชี) | release build บังคับ Google sign-in + Terms + entitlement ก่อนเห็น deck (`App.tsx:33`, `GmadFirstRunGate.tsx`, `gmad_entitlement.rs` — CR-022) | closed-beta distribution gate; dev build ยังเปิดอิสระ |
| 9 | G-Motion output | Heatmap + path probability (SRS §3.2.2) | time-off-map heuristic + heading multiplier (`motion.rs:6-16`) | ประกาศตรง ๆ ในโค้ดว่าเป็น v1 heuristic; heatmap เป็น design target |

---

## 5. Reverse Gaps (มีในโค้ด แต่ PRD/SRS ไม่รู้จัก)

ส่วนใหญ่มี ADR/CR รองรับ (จึงไม่ใช่ scope creep เถื่อน) แต่ **PRD/SRS ไม่เคยถูก update ให้รวม** — คนอ่านสเปคสองฉบับจะไม่รู้ว่าระบบเหล่านี้มีอยู่:

| ระบบ | โค้ด | ครอบคลุมโดย |
| --- | --- | --- |
| **G-Damage** — burst calculator + hero DB, ป้อน self-burst เข้า prompt | `damage.rs`, `master.rs:72` | ไม่มีใน PRD/SRS (AGENTS.md list เป็นโมดูล Done) |
| **G-Revive** — buyback advice | `revive.rs`, `respawn.rs` | ไม่มีใน PRD/SRS |
| **Counter-item advice dataset** | `counter_advice.rs`, `items.rs` | โยงได้หลวม ๆ กับ §3.4 |
| **Announcer event packs ทั้งระบบ** — 24 events, pack bundles + banners, `/announcer/install`, default pack | `announcer.rs`, `voice_api/` (10 ไฟล์), `AudioSettings.tsx` | G-Suite schema + CLAUDE.md เท่านั้น |
| **Draft-CV** (pick-screen roster) + **Scoreboard OCR** scaffold | `cv/draft_detector.rs`, `cv/draft_region.rs`, `ocr.rs` | memory/CR เท่านั้น |
| **Accounts / GID / Steam link / OpenDota profile** | `auth.ts`, `gid.ts`, `profile.ts`, `identity.rs`, `supabase.ts` | ADR-14 |
| **G-Store economy** — wallet/inventory/ledger/topup | `StorePage.tsx`, `WalletTab.tsx`, `wallet.ts`, `gmadEntitlement.ts` | ADR-11/12/16, CR-003 |
| **Closed-beta entitlement gate + first-run handoff** | `gmad_entitlement.rs`, `GmadFirstRunGate.tsx`, `gmadFirstRun.ts` | CR-016/020/022 |
| **In-app updater 3 channels** | `update_channel.rs:20`, `lib.rs:77,123`, `useAppUpdate.ts`, `release/channels/*.json` | `docs/releases/release-channel-architecture.md` |
| **GPU telemetry sidecar** | `gpu-feeder/`, `governor.rs:29-63` | SRS §5.1 มี note 2026-07 แล้ว (จุดเดียวที่ spec ตามทัน) |
| **Secret store (DPAPI), Claude quota, calibration QA, utterance ledger, Maiden Line palette, BetaFeedback** | `secret.rs`, `usage.rs`, `calibration.rs`, `utterance.rs`, `MaidenLine.tsx`, `BetaFeedback.tsx` | CR-008/CR-011 ฯลฯ |

**Doc-drift ที่พบระหว่างตรวจ (ควรแก้):**
- `docs/FEATURE-LEDGER.md` แถว `3-g-persona` = "doc-only / no code mapped" — **ผิด**: G-Persona มีโค้ดจริงครบวงจร (`runtime.rs:82`, `lib.rs:528`, `Control.tsx:456-475`, `Overlay.tsx:266,393`, `capture.rs:932`) → ต้องแก้ manifest แล้ว re-run ledger
- `AGENTS.md:159,169` อ้าง "~130 Rust tests / ~110 Vitest" — ปัจจุบัน grep พบ `#[test]` 291 จุดใน `src-tauri/src` และ `it(`/`test(` ~250 จุดใน `src/src` (ตัวเลข occurrence ไม่ใช่จำนวน test ที่รันเป๊ะ แต่ชี้ว่า doc ล้าหลังราวเท่าตัว)
- `AGENTS.md` FEATURE-LEDGER แถว `1.1-g-sensory` = doc-only ทั้งที่ overlay+capture ship แล้ว — badge-heuristic ของ bootstrap ยังไม่ถูก confirm

---

## 6. ข้อเสนอแนะ (เรียงตามลำดับความสำคัญ)

ทิศทางกำกับไว้ทุกข้อ: **[แก้โค้ด]** = ทำของให้ตรงสเปค / **[แก้สเปค]** = ยอมรับความจริงแล้ว update เอกสาร

1. **[แก้สเปค — ตัดสินใจระดับ product]** ชี้ขาดชะตากรรม §3A: G-Voice + G-Memory ติดป้าย **P0** มาตั้งแต่การวิเคราะห์ Questie แต่ 0% มา 2+ เดือน ระหว่างที่ทีม ship closed-beta/economy แทน — ถ้ายังเชื่อว่าเป็น moat ให้ตั้ง phase จริงใน roadmap; ถ้าไม่ ให้ลดระดับ/ตัดออกจาก SRS เพื่อไม่ให้ P0 ค้างเป็น false signal กับทุก audit ต่อจากนี้ (และถ้าจะสร้าง G-Voice ต้องย้าย mute ออกจาก `Alt+M` ก่อน — `lib.rs:776`)
2. **[แก้สเปค]** SRS §3.1/§3.2 + PRD G-Sentry/G-Motion: เขียนใหม่ให้ตรงสถาปัตยกรรมจริง (CV-based enemy tracking ที่ 4–8 Hz เพราะ GSI ไม่ให้ตำแหน่งศัตรู; G-Motion เป็น v1 heuristic, heatmap เป็น future target) — ตอนนี้ CLAUDE.md ตามทันแล้วแต่ SRS ซึ่งเป็น "source of truth" ยังหลอกคนอ่านอยู่
3. **[แก้สเปค]** SRS §3.3: บันทึก Sensitivity ladder (Low/Med/High + default Med 0.65/0.40) แทน "85%" ค่าเดียว — โค้ดคือพฤติกรรมที่ถูก field-validate แล้ว (`signal.rs:17-20`)
4. **[แก้โค้ด]** ปิดครึ่งที่ขาดของ SRS §3.4.1: wire `ocr.rs` Phase B/C (scoreboard → enemy NW → prompt) ตามแผนที่เขียนไว้ใน `ocr.rs:11-14` — นี่คือ requirement Core ข้อเดียวที่ยังไม่มีเส้นทางทำงานเลย; ระหว่างนั้นเพิ่ม caveat ใน SRS ว่า advice ปัจจุบัน ground ด้วย CV-identified heroes + own stats เท่านั้น
5. **[แก้โค้ด]** ปิด G-Log feedback loop จริง (SRS §3.6.2): ให้ผล `replay_fit` เขียนเป็น config (เช่น tuned `MotionParams`/`Sensitivity` per-user) ที่ live path โหลด — ตอนนี้ harness วัดได้แล้วแต่ค่า default ยัง hardcode (`motion.rs:66-78`); นี่คือช่องว่างสุดท้ายของคำโฆษณา "เรียนรู้แมตช์ถัดไป"
6. **[process]** เก็บหลักฐาน NFR ที่ยังลอย: (ก) รัน GATE P7 FPS จริงหนึ่งครั้งแล้ว commit `fps-report.json` เป็น validation record (ข) ผูก `perf-gate.yml` (latency) เข้า candidate-release checklist (ตอนนี้ dispatch-only) (ค) เพิ่ม assertion ตัวเลข CPU/RAM ในการรัน perf harness ประจำ release
7. **[แก้สเปค]** SRS §5.2 privacy: อ้างอิง ADR-11/ADR-14/ADR-16 อย่างชัดเจน (identity opt-in ≠ data-contribution opt-in; CV ไม่ออกจากเครื่องเด็ดขาด) — CLAUDE.md เตือนเองว่า absolute reading ของข้อนี้เคยทำ flywheel strategy หายมาแล้วหลายรอบ; และบันทึก release-gate บังคับ sign-in (CR-022) ใน §2.1 Product Perspective
8. **[แก้สเปค]** SRS §4.1/§4.2: อัปเดต hotkey table ให้ตรง `lib.rs:771-776`, บันทึกว่า caster-voice ที่ ship คือ announcer packs + SAPI/Piper fallback chain, และตัดสินใจว่า "Alt+M สรุปสถานการณ์" จะสร้าง (เป็น G-Voice ขั้นแรกแบบ one-way ก็ได้ — ไม่ต้องมี STT) หรือถอนออก
9. **[แก้ docs]** แก้ FEATURE-LEDGER manifest แถว `3-g-persona` (มีโค้ดแล้ว), confirm phase ของแถว *(derived)*, และอัปเดตตัวเลข test ใน AGENTS.md — ledger เป็น drift-detector ของ repo ถ้าตัวมันเอง stale ความน่าเชื่อถือทั้งระบบตก
10. **[แก้สเปค/โค้ด — เลือกทางใดทางหนึ่ง]** G-Mind §3.10: ถ้า "กัน vendor lock-in" ยังเป็นเป้า ให้เพิ่ม cloud ตัวที่สอง (Gemini client) เข้า backend picker ที่มีโครงรออยู่แล้ว (`runtime::MasterBackend`); ถ้าไม่ ให้ re-scope §3.10 เป็น "cloud/local backend picker" ตามที่ ship จริง

---

*รายงานนี้ generate จากการตรวจโค้ดจริง ณ commit `5b0b8faa` — ทุก `file:line` อ้างอิงสถานะ ณ วันที่ 2026-08-26; หากโค้ดเปลี่ยน ให้ถือ line number เป็น approximate*
