# Session 2026-07-11 B — G-Master grounding: counter-advice (CV enemies) + self-burst (damage engine)

ต่อจาก session A (secrets/efficacy/CI/WP-3). Entry point: Boss ถามว่า "มีอะไรทำต่อไหม" หลังปิด backlog
หลัก → เลือกไล่ปิด audit critical ที่เหลือ = **grounded engines unwired** (G-Master เดา เพราะ engine
ที่ ground แล้วไม่ถึงผู้ใช้). branch `main`.

## Arc (ทำไม + จุดตัดสินใจ + กับดัก)
- **สืบก่อนทำ (บทเรียนจาก B1 ครั้งก่อน):** ยิง 2 Sonnet-5 agent ขนาน — (#2) สืบว่า G-Master ground ได้จริงไหม,
  (#3) latency harness มี gap ไหม. ผล:
  - **#3 = ไม่มี gap** — real harness มีอยู่แล้วใน `capture.rs` (`pipeline_latency_within_budget` +
    `gsi_to_signal_audio_enqueue_latency_within_budget`). `tests/perf/src/main.rs` เป็นแค่ synthetic
    budget-envelope. agent เพิ่ม doc-comment ชี้ real test (ไม่ rewrite ซ้ำ) → commit `ce75bb02`.
  - **#2 verdict:** `counter_advice_text` รับ **hero *names*** (ไม่ใช่ items!) → **ไม่ได้ blocked** โดย
    honest-limit เรื่อง enemy items. `damage.rs` lethality vs ศัตรู = **blocked ถาวร** (level/items/HP
    ของศัตรูมองไม่เห็น). self-burst (ฮีโร่ตัวเอง) = groundable.
- **counter_advice grounding (`55b0703c`):** เดิม `master.rs` เรียก `counter_advice_text(&[])` (ว่างตลอด).
  - **กับดักชื่อฮีโร่:** CV labels (`antimage/zuus/centaur`) ≠ item_counters.json keys
    (`anti_mage/zeus/centaur_warrunner`) — 3 ตัวจาก 15. เพิ่ม `canonical_hero_key` alias (เก็บ display
    สวยไว้ ไม่ re-key JSON).
  - **B1 ที่ Opus gate จับ (สำคัญ):** แอปมี **2 หน้าต่าง Tauri แยก JS context กัน** — companion.ts singleton
    ของ Overlay window **ไม่เคยรัน** (`ensureRuntime` เรียกจาก CommandDeck ใน Control window เท่านั้น).
    auto-advice ยิงจาก **Overlay window** → `knownEnemyHeroes()` = `[]` เสมอ → ยัง confabulate. สมมติฐาน
    "companion เป็น singleton โหลดแล้ว" **ผิดข้ามขอบหน้าต่าง**. แก้: ย้าย roster เป็น **Rust backend
    source of truth** (`runtime::KNOWN_ENEMIES`, capture.rs/capture_wgc.rs เติมจาก detections, clear ที่
    log.rs start_match, request_advice อ่านเอง) → drop frontend param + revert App.tsx/companion.ts.
    window-agnostic. re-gate PASS.
  - **W1 (gate WARN, แก้):** roster ไม่มี cap/decay → CV misclassify frame เดียวติดทั้งเกม. เพิ่ม
    threshold `MIN_ENEMY_SIGHTINGS=3` (เห็นซ้ำ 3 เฟรมถึงนับ) → frame หลุดเดียวไม่ latch.
- **self-burst grounding (`1f9274dc`):** wire `damage.rs` (เดิม dead code, `#![allow(dead_code)]`).
  - **ตัดสินใจสำคัญ:** ability levels **ใช้ estimate (None) ไม่ parse GSI** — `HeroData.abilities` เป็น
    curated subset ที่ align index/name กับ GSI ability slot **ไม่ได้ยืนยันโดยไม่มี live GSI**; ป้อน level
    ผิด slot = เลขผิดเงียบ ๆ (แย่กว่า estimate). items + level = แม่นจริง.
  - baseline target (เกราะ0/ต้านเวท25%) แทนศัตรูที่มองไม่เห็น → "คอมโบโดน ~X กับเป้าเปลือย" ไม่ใช่ kill verdict.
  - flow: GSI `items` → `item_names_from` → `GameTick.item_names` (`#[serde(default)]`) → `self_burst`
    → build_prompt line. Opus gate PASS (ไม่มี blocker; 2 NIT cosmetic).

## สิ่งที่ทำ (commit)
- `ce75bb02` docs(perf): `tests/perf/src/main.rs` +18-line doc pointer (comment only).
- `55b0703c` feat: counter_advice grounding — `runtime.rs` (KNOWN_ENEMIES + sightings threshold),
  `capture.rs`/`capture_wgc.rs` (feed detections), `log.rs` (clear at match start), `main.rs`
  (request_advice reads backend), `master.rs` (advise/build_prompt take enemies), `counter_advice.rs`
  (canonical_hero_key alias +tests).
- `1f9274dc` feat: self-burst — `items.rs` (item_names_from), `gsi.rs` (GameTick.item_names),
  `damage.rs` (self_burst + baseline consts), `master.rs` (burst line in prompt).

## Verify (gate จริง — ค่าสุดท้าย)
| Gate | ผล |
|---|---|
| `cargo test --bin g-maiden` | **192 passed / 0 failed / 4 ignored** |
| `cargo clippy --all-targets -- -D warnings` | clean |
| `cargo check --features wgc` | clean |
| `pnpm exec tsc --noEmit` | 0 (frontend ไม่มี TS change สุทธิ — grounding revert แล้ว) |
| `pnpm exec eslint .` | 0 errors |
| `pnpm exec vitest run` | pass |

Opus gates: #3 no-gap · counter_advice FAIL(B1 two-window)→fix→PASS (+W1 threshold) · self-burst PASS.

## Key numbers
- counter dataset = 15 heroes, 3 CV/dataset name diverge (antimage/zuus/centaur). MIN_ENEMY_SIGHTINGS=3.
- item_db = 12 burst-relevant items (unmodeled → 0 = under-estimate = ทิศปลอดภัย). hero_db = 127.
- self_burst baseline: armor 0 / magic-res 25%.

## Artifacts / live actions
ไม่มี new file, ไม่มี live/irreversible action (ไม่แตะ DB/Edge Fn/tag/release). damage.rs ยังเป็น
`#![allow(dead_code)]` (is_lethal/can_i_kill_with ยัง dead — enemy-facing blocked ถาวร).

## State ปลาย turn
- branch `main`, **ahead origin 3** (`55b0703c..1f9274dc`) — **ยังไม่ push** (Boss ยังไม่สั่ง push รอบนี้).
- working tree: เหลือเฉพาะ pre-existing ไม่ใช่ของเรา (`dev.bat`, `orchestration/brain/failures.jsonl`,
  `tmp-power-radial-check.html`) + brain writes ของ session B (uncommitted).
- **code backlog หมดจริง:** audit criticals ที่แก้ด้วยโค้ดได้ = ปิดครบ (Dire ✓ latency ✓ CI ✓
  grounded: counter_advice ✓ self-burst ✓). enemy-lethality = blocked-by-data (ทำไม่ได้ ไม่ใช่บั๊ก).
- **Pending (ต้อง Boss / strategic):** behavioral verify (build + Google sign-in จริง: T1 leveldb, T2 arm,
  counter/self-burst ในเกมจริง) · CV legal risk · CR-003 freeze.
