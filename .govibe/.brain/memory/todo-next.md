# TODO / self-note — next session

อัปเดตล่าสุด: 2026-06-21 (turn 15) · progress review + re-plan. Spike S-1 (turn 14)
ยืนยัน: NCC accuracy FAIL 10% → ONNX = mandatory ไม่ใช่ optional (ดู
`.govibe/.brain/session/2026-06-21-spike-s1-empirical.md`).

## 📊 Progress snapshot (turn 15)

**Phase 0–1 (Foundation + GSI/Overlay): ✅ DONE.** Tauri v2 + React/Vite/Tailwind
scaffold รันได้, axum GSI :3000 + parser, overlay glassmorphism, Control GUI,
MSI/NSIS installer + ice-gem icon + onboarding modal.

**โมดูล G-Series — โค้ดจริง (src-tauri/src/, 1,401 บรรทัด, 15 unit tests):**
| โมดูล | สถานะ | ไฟล์ |
|-------|-------|------|
| G-Signal (danger/HP) | ✅ MVP (rising-edge + voice interrupt + Belief Revision) | `gsi.rs` |
| G-Sensory (overlay) | ✅ MVP (banner + glassmorphism HUD) | `App.tsx` |
| G-Master (advisor) | ✅ shell-out `claude -p` + auto-advice + throttle/cache | `master.rs` |
| G-Log (feedback) | ✅ skeleton + privacy controls (local-only) | `log.rs` |
| Voice/TTS | ✅ SAPI picker + rate + WAV fallback pipeline | `tts.rs`,`audio.rs` |
| GSI auto-install | ✅ VDF parser + auto-detect Dota path | `setup.rs` |
| **G-Sentry (fog monitor)** | ⛔ ยังไม่เริ่ม — ต้อง minimap CV | — |
| **G-Motion (path predict)** | ⛔ ยังไม่เริ่ม — ต้อง minimap CV | — |
| **G-Signal เต็ม (gank 85%)** | ⛔ ยังเป็น HP-only — ต้อง G-Sentry+G-Motion ก่อน | — |

**Critical path ที่เหลือ = Phase 2 (minimap CV).** Spike S-1 พิสูจน์แล้วว่า
latency/CPU ผ่านสบาย (~100x headroom) แต่ accuracy ของ NCC ไม่พอ → **ต้อง ONNX
detector**. นี่คือด่านชี้เป็นชี้ตายตัวต่อไป.

## 🎯 แผนถัดไป — Phase 2 (minimap CV via ONNX) · roadmap เต็มที่
`C:\Users\freshair\.claude\plans\roadmap-phase-2-sorted-deer.md`
**ตัดสินใจแล้ว:** training = synthetic จาก official icons (ไม่รอ footage) ·
stack = tract + windows-capture v2.0 · ADR-05: ONNX=default, NCC=fallback.

- [x] **P2.0 part 1** — prefilter port (commit `f1c0741`): `cv/prefilter.rs` +
      `Frame`. แก้ edge-bias (average/pixel) + contrast gate. 4 tests.
- [x] **P2.0 part 2** — region geometry (commit `520430c`): `cv/region.rs`
      `MinimapRegion` bbox+icon scale+coord map. 4 tests.
- [x] **P2.0 part 3** — `capture.rs` (commit `5d9ad2f`): windows-capture v2 handler,
      crop region → prefilter → emit `minimap-cv` debug. cap ~8Hz. compile ผ่าน.
      ⚠️ **ยังต้อง verify สดกับ Dota** (ดู candidate box เกาะไอคอน + วัด CPU) — งาน user.
- [x] **P2.1** dataset generator (commit `5d9ad2f`, via subagent): `tools/gen-dataset/`
      Python, degradation profile = spike เป๊ะ, ImageFolder layout, 7/7 tests. มี
      synthetic-icon fallback (รันได้ไม่ต้องมี asset). ต้องหา official icons จริงก่อนเทรนจริง.
- [x] **P2.2** ONNX detector (commit `1c9e466`): `cv/detector.rs` tract-onnx 0.21,
      patch→32×32 bilinear→softmax/argmax→NMS. contract NCHW[1,3,32,32] RGB/255→logits,
      labels.json มี `__negative__`. fallback candidate-only ถ้าไม่มี model. 13 cv tests
      ผ่าน รวม `real_model_loads_and_infers` (พิสูจน์ tract รับ ONNX ที่ export ได้จริง).
      training: `tools/train-detector/` PyTorch tract-safe CNN → 100% synthetic val
      (OPTIMISTIC — synthetic-icon; ต้อง icon จริงก่อน ship). model 99KB commit แล้ว.
      ⚠️ **ยังต้อง bundle models/ เป็น tauri resource** ใน installer (ตอนนี้ dev โหลดจาก repo root).
- [x] **P2.3** `sentry.rs` (commit `7f1397b`): per-hero last-seen state machine,
      missing >5s edge-triggered → `EnemyMissing`. 3 tests.
- [x] **P2.4** `motion.rs` (commit `7f1397b`): ring buffer 5 นาที + v1 gank-risk
      heuristic (risk ramps ตาม off-map time peak ~12s, decay; +boost ถ้า ≥2 หาย)
      → `GankRisk`. 4 tests.
- [x] **P2.5** `signal.rs` (commit `7f1397b`): >85% → Alert (hysteresis), clear
      <50% → Revision (Belief Revision). เปล่งเสียงตรงจาก Rust (audio/tts interrupt).
      latency harness (release-only) → **p50 21.6ms / p99 67.4ms < 80ms gate** ✅.
      39 tests ผ่านหมด.
- ทดสอบ: `cargo test --bin g-maiden` (debug). latency: `cargo test --release --bin
  g-maiden pipeline_latency -- --nocapture`.

## 🔧 จุดไล่แก้ (turn 20 — commit `5a2a1ca`, build เขียว, 39 tests, model bundled)
- [x] **#1 bundle `models/` เข้า installer** — tauri.conf.json `resources` → ยืนยัน
      `target/release/models/` มีครบ, installer โต 6.6→12MB. `model_dir()` หา resource_dir ก่อน.
- [x] **#4 frontend banner** — App.tsx listen `gank-alert`/`gank-clear`/`enemy-missing` +
      gank banner (ice palette, top-center ไม่บังมินิแมพ) + auto-dismiss 6s + Belief Revision echo.
- [x] **#2 (tooling) CV debug overlay** — toggle `cvDebug` วาด region+candidate+detection boxes
      + status line (ONNX/candidate-only). **เหลือ verify สดในเกม = งาน user.**
- [x] **#5 user voice บน Rust path** — `set_cv_voice` + `runtime::voice()`; gank ใช้เสียงที่เลือก.
      ผูก `set_cv_signal_enabled` กับ `voiceEnabled` (ปิดเสียง = ปิด gank voice ด้วย).
- [x] **#6 in-game gating + adaptive rate** — `runtime::IN_GAME` (set จาก gsi) gate pipeline;
      source 15Hz, throttle เหลือ ~8Hz ปกติ, เร่งเต็มเมื่อ Sentry มี missing hero.
- [x] **#3 เทรนด้วย official hero icons จริง** — `fetch_icons.py` ดึง 127 ไอคอนจาก
      dota_react Steam CDN (OpenDota hero list) → `assets/minimap-icons/` (32×32 RGBA).
      retrain → model 128-class (127 ฮีโร่ + negative, 129KB), tract โหลดได้, val 1.0.
      ⚠️ val ยังเป็น synthetic-composite — true test = footage จริง (validation-only, ค้าง user).
- [ ] **#7 probability-model calibration** — heuristic v1; ต้องมีข้อมูล G-Log จริงก่อนจูน.

## เกร็ด turn 21
- ไอคอนมินิแมพจริง = dota_react CDN `.../heroes/icons/<short>.png` (วงกลม, transparent,
  32×32 พอดี model input). short = npc_dota_hero_X ตัด prefix. OpenDota API ให้ list.
- gen_dataset **ไม่ล้าง out-dir** → ต้อง `rm -rf _ds` ก่อน retrain ไม่งั้น class เก่าค้าง
  (เจอ synthhero_* ปนใน labels รอบแรก).

> เพิ่มจาก user (parallel): system tray + hide-to-tray (`5a2a1ca`), capabilities tray-icon.
> #3, #7 = data/asset-dependent ทำต่อไม่ได้จนกว่าจะมี input ภายนอก.

## ต้องให้ผู้ใช้ทำ (ทำแทนไม่ได้)
- [ ] **เปิด Dota 2 จริง** → ยืนยัน overlay + voice end-to-end. POST simulated ทดสอบผ่านแล้ว
      (HP=18% → banner + ทาง code path ถึง `speak()`). ถ้าเสียงเงียบ: เช็ค Windows Volume Mixer,
      ลองกดปุ่ม **🔊 ทดสอบเสียง** ใน Control GUI การ์ด Alerts.
- [ ] (ทางเลือก) ติดตั้ง Thai voice ใน Windows → Settings · Time & Language · Speech · Manage
      voices · Add voice "ไทย". UI จะเด้งโชว์ใน dropdown 'เลือกเสียง' อัตโนมัติ และ warning
      สีเหลืองจะหายไป.

## งานต่อ (เรียงตามคุณค่า)
- [ ] **WAV clips สำหรับ pre-recorded pool** — pipeline พร้อมใช้ (commit `33d2fa3`).
      ต้องการ asset: voice generation (ElevenLabs / Piper / RVC) แล้ววางลง
      `voice-cache/{event}/01.wav` (events: danger, levelUp, kill, death, respawn,
      manaLow, revision). แนะนำ 5-10 takes ต่อ event กันฟังซ้ำ. ทันทีที่มี ≥1 clip
      ของ event ใด event นั้นจะใช้ WAV แทน SAPI อัตโนมัติ (no code change needed).
- [ ] **Piper local TTS** — ลด priority ลงหลังมี Voice Cache + Claude Plan. ตอนนี้
      เส้นทาง SAPI (predictable events) สามารถถูกแทนที่ด้วย WAV ได้แล้ว; advice
      ของ G-Master ใช้ SAPI พอใช้ (ผู้ใช้กดอ่านเอง). Piper ยังคุ้มสำหรับ Maiden พูด
      streaming text ระหว่าง real-time gank warning — เก็บไว้สำหรับ G-Signal full.
- [x] ~~**MSI installer**~~ — ✅ จบ G8.1 (commit `ac56d87`): ice-gem icon ลง bundle ทุกขนาด,
      Welcome modal 2-step (auto-detect + auto-install) + 'gm-onboarded' localStorage flag.
      เหลือเทสต์ใน Dota 2 จริง = งาน user.
- [ ] **G-Sentry/G-Motion/G-Signal เต็ม** — ต้อง minimap CV. **อัปเดต turn 14:**
      Spike S-1 รันแล้ว (commit `b5b34da`): G-LAT/G-CPU **PASS empirical** ~100x
      headroom, แต่ G-ACC NCC + prefilter **FAIL 10.2% บน synthetic** เอง →
      **ต้องใช้ ONNX detector** ตั้งแต่แรก ไม่ใช่ fallback. real-game footage ยัง
      จำเป็นเพื่อ train + validate ONNX (ไม่ใช่ measure NCC). pipeline เดิม
      (capture → prefilter → match) คงไว้, เปลี่ยนแค่ match step.
- [x] ~~**G-Master advisor**~~ — ✅ จบใน turn 11 (commit `33d2fa3`): shell-out
      `claude -p` ใช้ Plan quota, throttle 30s + cache, persona prompt + game
      context auto. ติดตั้ง Claude Code CLI + login = พร้อมใช้.
- [ ] อัปเดต CLAUDE.md — "specification stage" ล้าสมัย (มี codebase แล้ว). 09f9048 ตัด govibe
      sibling note ไปแล้ว → ไม่เร่ง. ขอ confirm ก่อนเขียนทับ.
- [ ] Control GUI: การ์ด Modules ให้ toggle ได้จริง + เลือก hotkey เอง + theme.
- [x] ~~**Bug `in_game` INIT**~~ — ✅ จบใน turn 9 (commit `22a8572`): จับเฉพาะ
      PRE_GAME / GAME_IN_PROGRESS + unit tests แรกของโปรเจกต์ (3 ผ่าน).

## เทคนิคที่ค้างรู้ไว้
- รัน dev: `cd G:\G-Maiden; pnpm tauri dev` (ที่ root, **ห้าม cd src ก่อน** — tauri CLI อยู่
  `node_modules/.bin/` ของ root). standalone: ดับเบิลคลิก `src-tauri\target\release\g-maiden.exe`.
- Test voice แยก: `pnpm tauri dev` แล้วกดปุ่ม **🔊 ทดสอบเสียง** ในการ์ด Alerts; หรือ
  POST simulated HP=18% tick ไป `http://127.0.0.1:3000/gsi` (rising-edge → speak ครั้งเดียว;
  re-arm เมื่อ HP > threshold+5).
- ทุก path ใช้ absolute (`G:\G-Maiden\...`) เพราะ Bash tool persistent cwd หลง dir ได้.
- ไฟล์ brain ปัจจุบันอยู่ที่ `.govibe/.brain/` (commit 09f9048 ย้าย). **ไม่ใช่** `.brain/` เดิม.

## ⚠️ กับดักใหม่จาก turn นี้
1. **ดู `git log --all --oneline` ก่อนเชื่อ session note** — user/agent อื่นอาจ commit ระหว่าง
   session ทำให้ note ล้าสมัย. turn นี้ผมเขียน `tts.rs` ใหม่หมดโดยไม่รู้ว่า user มี
   commit `09f9048` ที่ทำ TTS ไปแล้ว (โชคดี implementation ตรงกันเป๊ะ → diff เหลือแค่
   `use std::io::Write` import เกิน).
2. **Status `M` แต่ `git diff` ว่าง = CRLF flicker** (session ก่อนก็เจอ). `git checkout --` ทิ้ง
   ได้เลย. turn นี้ Cargo.toml ขึ้น M แม้ไม่ได้แตะ.
3. **Tauri v2 `pnpm tauri build` ออก MSI + NSIS ฟรี ๆ** ไม่ต้องตั้งค่าเพิ่ม (WiX + makensis รันให้
   อัตโนมัติ) เพราะ tauri.conf.json default bundle config ออกครบ. แต่ใช้ default icon ของ Tauri
   → ดูไม่ pro.
4. **Computer-use Bash tool คงค่า cwd** ข้าม call — `cd src` แล้วต่อ `cd src` กลายเป็น `src/src`.
   ใช้ absolute path หรือ `cd /g/G-Maiden && ...` ทุกครั้ง.

## หลักการที่ใช้ได้ผล (สะสม)
- ทำเอง > spawn agent สำหรับงาน build/integration จริง.
- verify ด้วย "รันจริง + screenshot + simulated POST" — ไม่เชื่อแค่ compile ผ่าน.
- ลด component ที่จำเป็นในแต่ละ iteration: Windows SAPI (zero dep) ก่อน Piper (ONNX dep + model).
- ทุก milestone commit ตัวเอง (ไม่ pile up); branch main OK ถ้าโต้ตอบไม่ได้กระทบ user.
