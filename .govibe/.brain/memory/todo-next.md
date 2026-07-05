# TODO / self-note — next session

อัปเดตล่าสุด: **2026-07-05 (B)** · deck HUD v2 ลงโค้ด + G-Offload Monitor
(ดู session `.govibe/.brain/session/2026-07-05-B-deck-hud-impl-offload-monitor.md`;
part A = `...-deck-redesign-designsystem.md`). ก่อนหน้า = account/security (2026-07-04).
ด้านล่างจาก "📊 Progress snapshot (turn 15)" คือ CV/Signal thread เดิม (2026-06-21) — trail.

## 🟣 Deck HUD v2 impl + G-Offload Monitor thread (2026-07-05 B) — ล่าสุด

**Branch `feat/deck-glass-redesign-ds`** — 15 commits, **ยังไม่ push/merge/tag**.

- **Deck Subtract HUD ลงโค้ดจริงแล้ว** (`b14df060`→`dbd87287`): glass FAB shell (topbar+telemetry /
  sidebar icon nav `DeckIcons.tsx`) + panel เว้า 2 โหว่ (top-right topbar + bottom-right signals)
  **มุมมน `clip-path: path()` JS rounded fillet** + G-Signal FAB cards D/E/F/G (ย้ายจาก Dashboard) +
  P1–P5 anchor rail + **scale-to-fit stage** (fixed 1280×800 → scale เต็มจอทุกขนาด, 1920=1.35) +
  panel rim (drop-shadow ตาม clip). **เก็บ Dashboard รวยเดิม** (ไม่ downgrade เป็น prototype).
  ⚠️ **user ยังบอก "ยังไม่หาย"** — Subtract ยังไม่เป๊ะ 100% (ต้องดูภาพจริงรอบหน้า + จูน).
- **G-Offload Monitor** (`tools/offload-monitor/`, `ed3d7110`→`a1a91698`): `run.mjs` wrapper
  (ollama/openrouter/codex, log cmd+output) + UI 3 tabs (codex เขียน). เสิร์ฟ :5176. ดู [[codex-cli-offload]] [[rwang-local-slm]].
- **Provider tiers ใช้ได้ครบ:** ollama local (up, 43 models) · codex (`</dev/null` gotcha) ·
  **openrouter (key ใน `.openrouter.key` gitignore; ต้อง cap max_tokens; free models เยอะตัว dead —
  ใช้ `google/gemini-3.1-flash-lite`).**
- **Orchestration:** fleet (Workflow) 7 drafters + audit gate → audit **REJECT** จับ selector-fracture
  (บทเรียน: freeze selector contract ก่อน fan-out งาน CSS ไฟล์ร่วม). audit gate คุ้ม.

### 🎯 งานต่อ thread นี้ (เรียงตามคุณค่า)
1. **จูน deck Subtract ให้เป๊ะ** — ดูภาพจริง localhost:5173 (screenshot ผม/agent timeout เพราะ
   backdrop-filter; ต้องให้ user ส่งภาพ หรือลด blur ชั่วคราวตอน dev). สงสัย: signal FAB ล่างขวาชิดขอบ/ตัด,
   สัดส่วนโหว่, panel edge. **verify ด้วย preview_eval geometry ได้แต่ตาเปล่าไม่ได้.**
2. P1–P5 wire เข้า agent-comm จริง (ตอนนี้ static)
3. re-skin inner zones (score/stats/battle) เป็น `--g-*` เต็ม
4. push branch + PR เมื่อ deck นิ่ง (ยังไม่ทำ)
5. (แยก) implement CR-005 landing/auth/community (draft) + ADR-14 amendment (multi-provider auth)

### กับดักใหม่ (thread นี้)
- **preview_screenshot timeout เสมอบน deck** (backdrop-filter+clip-path หนัก) → verify ต้องใช้
  `preview_eval` computed-style/geometry; ตาเปล่าต้องพึ่ง user.
- **vite bind :5173 ไม่ใช่ :5174** (launch.json ตั้ง 5174 แต่ vite strictPort:false → 5173).
- **codex echo v1 กลับ** ถ้าสั่ง "อ่านไฟล์เดิมแล้วต่อ" — ต้อง self-contained prompt (generate fresh).
- deck เป็น **fixed 1280×800 stage scaled** แล้ว — แก้ layout ต้องคิดใน coord 1280×800 (ไม่ใช่ window).

## 🔵 Deck redesign / Design-system / Orchestration thread (2026-07-05 A)

**Branch `feat/deck-glass-redesign-ds`** (2 commits: code `a5fd9900`, docs `62b2c680`).
ยังไม่ push / ยังไม่ merge / ยังไม่ tag.

- **Design-system SSOT** ใหม่ที่ `docs/design-system/` (hub + 01–06 + assets SVG + `prototype.html`).
  ทิศทาง = **Command Deck HUD v2**: glass panel เว้าแหว่ง (Subtract) + FAB ลอย, P1–P5 = anchor
  (ไม่ใช่ nav), accent ice + **lime #A3E635**. บันทึกใน **ADR-15**. **ยัง draft** — `styles.css`
  ยังใช้ token เก่า (`--bg #060913`); migration map อยู่ `02-tokens.md §1.6`.
- **CR-004** (voice+browser) + **CR-005** (landing+auth+social) = **draft รอ approve**.
  CR-005 lock: landing=web+in-app, community=page เต็ม, auth=multi-provider (ต้องแก้ ADR-14).
  **2 open question ค้าง:** auth provider ตัวที่ 2 (default ผมเสนอ **Discord**), landing location
  (default **`web/landing/` ใน repo**). W1–W5 waves.
- **Orchestration model (ตั้งวงแล้ว, ยังไม่รัน build):** Claude=orchestrator+final gate; +audit/review
  subagent 1 ชั้นก่อน lead (ลด context); subagent swap by **role** (module-base ยังไม่มีใน G-Orchestra);
  local SLM = **Ollama @ 127.0.0.1:11434** (เรียก `/api/chat` ตรง, copy `runOllama`+VRAM guard จาก
  `G:/GenesisBlock_Dev/Rwang_remote/providers.mjs`; config `Rwang_remote/config.json`; coder=Aroow-9B/
  gemma4-rust, worker=qwen3.5:4b, embed=bge-m3; **serialize, ห้าม concurrent, ห้าม q8_0 KV**).
- **G-Orchestra verdict (จาก subagent audit):** planning/govern substrate ที่ **mature** (DAG,
  atom-schema, adaptive-decompose, DACI approval-chain, Verify Gate, ownership, providers, telemetry
  = solid). **ใช้เป็น decompose+govern ได้** แต่ **ไม่ใช่ executor** สำหรับ Claude subagent. Gap:
  ไม่มี pre-lead audit tier, DDD (แค่ text), diagram-to-code ingestion, AST edits, module-base swap.
  → **แผน hybrid:** G-Orchestra ทำ `atoms.cr005.json`+compile (DAG/waves) + Claude subagent execute
  + review subagent เป็น audit gate + ยืม DACI/`requiresConfirm` rule (drop transport :4577).

### 🎯 งานต่อ thread นี้
1. ตอบ 2 open question CR-005 (auth provider, landing repo) → ปลดล็อก decompose ที่แม่น
2. **decompose CR-005 → `atoms.cr005.json`** (ตาม precedent CR-003) ด้วย G-Orchestra compile
3. รัน build ผ่าน hybrid orchestration: เริ่ม W1 (web landing, เสี่ยงต่ำ) — **ห้ามแตะ deck layout**
4. (แยก) migrate `styles.css` → `--g-*` tokens ทีละ component เมื่อ approve ทิศทาง design-system
5. ADR-14 amendment (multi-provider auth) ก่อน implement W2

## 🟢 Account / Auth / Security thread (2026-07-04)

**SEC-001 auth hardening: APPLIED LIVE + merged (PR #6, main `72162e66`).**
ปิด F1 (ปลอม Founder GID / self-admin) บน live gstore แล้ว: profiles column-locked,
mint-gid Edge Fn ทำหน้าที่ mint gid_code ฝั่ง server. รายละเอียด+กับดัก PUBLIC-revoke
อยู่ใน auto-memory `gstore-security-findings.md` + SEC-001 audit doc.

**CR-003 account MVP = design เสร็จ (ยังไม่ implement).** wallet/inventory/history/
billing(PromptPay+TrueMoney/Omise) + no-scroll UI policy. แตกเป็น 51 atoms/8 waves
(`orchestration/gks/atoms.cr003.json` → MASTERPLAN-account-phase1.md).

### 🎯 งานต่อ thread นี้ (เรียงตามคุณค่า)
1. **Cut app release** (bump tauri.conf.json + src/package.json + App.tsx APP_VERSION
   + CHANGELOG + tag `vX.Y.Z`) → ส่ง SEC-001 client changes ถึง user, ปิด self-healing
   window (installed v0.8.0: signup ใหม่เห็น GID ว่างชั่วคราว). **user ต้องสั่ง release ก่อน.**
2. **pre-public/pre-scale gate** (⚠️ ต้องทำก่อนเปิดคนใช้จริง/scale): สร้าง Supabase dev
   branch → apply Part B → รัน `supabase/tests/sec001_identity_lock.sql` (pgTAP) +
   full `get_advisors(security)`. เลื่อนมาเพราะ dev branch มีค่าใช้จ่าย.
3. F8 leaked-password dashboard toggle (minor). Omise onboarding (ทะเบียนพาณิชย์ +
   TrueMoney channel) = critical path non-code ก่อนเปิด billing.
4. **implement CR-003** ตาม waves ใน MASTERPLAN (เริ่ม wave 0: types + migrations +
   no-scroll policy + micro lane). รันด้วย `GORCH_BACKLOG=gks/backlog.cr003.json`.

### กับดักใหม่ (account/security thread)
- **Postgres ให้ EXECUTE กับ PUBLIC เป็น default** → revoke จาก anon/authenticated เฉย ๆ
  เป็น no-op; ต้อง `revoke … from public`. Re-verify ด้วย `has_function_privilege` เสมอ.
- **Tauri app ไม่มี backend :4577** — UI ที่ port จาก orchestra-standalone แล้วยิง `/api/*`
  จะ crash. Store page ของ CR-003 จะแทนหน้า Voice Packs slot นั้น (Supabase = backend).
- **deno ติดตั้งแล้วแต่ไม่อยู่ใน PATH** → รันผ่าน `C:\Users\freshair\.deno\bin\deno.exe`.

---

## 📊 Progress snapshot (turn 15)

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
- [~] **#7 probability-model calibration** — **ปูทางแล้ว** (commit `2b92126`):
      G-Log บันทึก event `gank_signal`/`gank_revision`/`enemy_missing` ลง match JSONL
      (time-aligned กับ tick). `tools/analyze-log/analyze.py` join signal→outcome
      (death/HP drop ใน window) → precision/recall. **เหลือจูนจริงเมื่อมี match data**:
      เล่นจริง → `python analyze.py` → ปรับ DANGER_THRESHOLD (signal.rs) / missing_risk
      curve (motion.rs) ตาม precision/recall. 42 Rust tests + analyzer self-test ผ่าน.

## 🔄 In-app updater (turn 23, commit `34339aa`)
- Tauri updater + process plugin; ask-first UI ใน Control (เช็คตอนเปิด + ปุ่ม
  ตรวจหาอัปเดต + banner อัปเดตเลย/ภายหลัง). endpoint = GitHub Releases latest.json.
- **signing key อยู่ `.tauri/g-maiden-updater.key` (gitignored) — ⚠️ ห้ามหาย/ห้าม commit.**
  ถ้าหาย = เซ็นอัปเดตไม่ได้อีก ผู้ใช้เก่าจะอัปเดตไม่ได้ ต้อง backup. pubkey อยู่ใน tauri.conf.json.
- CI: `.github/workflows/release.yml` (tauri-action) build+sign+publish ตอน push tag `v*`.
  ต้องตั้ง GitHub secrets: `TAURI_SIGNING_PRIVATE_KEY` (เนื้อไฟล์ key), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ("").
- ออกเวอร์ชันใหม่: bump version ใน tauri.conf.json + src/package.json → commit → `git tag vX.Y.Z` → push.
- local signed build: `TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/g-maiden-updater.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" pnpm tauri build` → ได้ .sig.

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
