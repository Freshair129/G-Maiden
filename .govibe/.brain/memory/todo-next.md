# TODO / self-note - next session

อัปเดตล่าสุด: **2026-07-13 B** · **side-track ใน G-Ann (repo พี่น้อง G-Suite): event mapping + banner ครบ 3 ชิ้น + PUSHED** — (1) banner override rail ใส่ภาพเอง png/webp/gif, (2) animated-WebP bake (tone banner มี entrance animation, พิสูจน์ container จริง VP8X 0x12/12 frame/loop 1 + Pillow alpha ramp), (3) W4 HoN→Dota label resolver (36/36). **committed + pushed ขึ้น G-Suite `origin/main` (`be37053..8c1c11a`)**. ไม่แตะ G-Maiden. G-Maiden priorities ด้านล่างยังเหมือนเดิม (CR-003 ยังไม่ push).
รายงาน session ล่าสุด → `.govibe/.brain/session/2026-07-13-B-gann-event-mapping-banner.md` (ก่อนหน้า: `2026-07-13-gann-mastering-deck-complete.md`, `2026-07-12-cr003-impl-verify-supabase-local.md`)

## 🎨 G-Ann event-mapping+banner thread — งานต่อ (side-repo G-Suite, 2026-07-13 B)
- **live in-game verify (งาน Boss)**: `pnpm ann-studio:dev` → import HoN video → auto-split → auto-map
  (ดู deterministic pass ยิงกี่อัน) → banner override / เปิด "banner เคลื่อนไหว" → install → เข้าเกมดู banner
  เด้ง+animated+เสียงตรง event. (browser preview รัน Tauri app นี้ไม่ได้ — `__TAURI__.invoke` undefined.)
- **W4 OCR frame-reader ยังไม่ทำ** (env-dependent): `detect_buttons.py` sidecar — PyAV frame extract +
  OCR engine (tesseract/easyocr ใน venv) + HoN button ROI/highlight → emit `{labels:[{startMs,endMs,label}]}`
  → resolve ผ่าน `honEventMap.ts` (single source of truth). contract เขียนใน `sidecar/README.md`. calibration ต่อวิดีโอ.
- animated bake = frames 12/fps 24 (~0.5s) ปรับใน `bakeBanner.ts`; กริดยังไม่มี live-preview ของ animation.

## 🎯 Highest-leverage next work (จาก session 2026-07-12, เรียงลำดับ)
1. **push CR-003 commits** (`f675fabb..a90da645`, 4 ตัว) เมื่อ Boss สั่ง — ไม่ tag/release. (รวม session-B ที่ push แล้ว = clean).
2. **CR-003 ยัง deploy live ไม่ได้** — 3 blocker ที่จด in-code: (a) Omise API field names ยังไม่ยืนยันกับ docs
   จริง (sandbox-only), (b) shard-scoring formula = placeholder รอ balancing pass, (c) signup-trigger
   welcome-grant ยังเป็น TODO (มี `ensure_wallet()` safety net อยู่แล้ว จึงไม่ใช่ correctness gap). apply migration
   live/deploy Edge Fn = **ต้อง Boss ตัดสิน** (แตะ production gstore).
3. **Behavioral verify ที่ค้าง (ต้อง Boss ทำ)** — packaged build + Google sign-in จริง: T1 sign-in persist +
   grep WebView2 leveldb; T2 efficacyStudy; G-Master grounding ในเกมจริง. (sign-in ทำแทนไม่ได้.)
4. **AGENTS.md drift (จด session นี้)** — Repository Layout (บรรทัด 32-88) ไม่ list `supabase/` เลย ทั้งที่ tracked
   มาตั้งแต่ SEC-001 + ขยายเยอะ session นี้ (migrations/functions/tests). แก้ตอน reconcile รอบหน้า (เพิ่ม dir
   ใน tree, factual, ไม่ rewrite prose).
5. **MatchShareCard.matchId ยังเป็น prop เปล่า** — ไม่มี "last local match id" source ใน `src/src/live/`
   (MatchLog มีแค่ name/size/modified_ms ไม่มี OpenDota match id). ต้อง wire แหล่งใหม่ก่อน shard MVP ใช้ได้จริง.
6. **enemy-facing lethality (`damage.rs`) = BLOCKED-BY-DATA ถาวร** — อย่า wire อีกเว้นแต่มีแหล่งข้อมูลใหม่. self-burst ทำแล้ว.

## DONE ใน session 2026-07-13 (G-Ann / G-Suite — uncommitted ฝั่งนั้น)
- [DONE] **G-Ann mastering deck ครบชุด + ทดสอบจบ** — 12 knob wire เข้า ffmpeg จริง (EQ/presence/
  de-esser/comp/character/sat/fade/normalize/speed/gain + **L/R pan**) + LUFS จริง BS.1770 ที่ bar
  เป็น fader (L/R/M). Proof: pan export บน KOM wav → stereo, Δ 11.93dB ≈ 12dB ที่ dial. tsc=0.
  **ค้าง**: live-audio drag test (งาน Boss, `pnpm ann-studio:dev`). **ถัดไป = event mapping + banner**
  (EventTestGrid + tone banners 23 + `install_gmaiden_pack` มีแล้ว; เหลือ UX map + polish banner).
- [NOTE] browser preview (vite) **ทดสอบ Tauri app ไม่ได้** — `__TAURI__.invoke` undefined ใน browser เปล่า.
  ทดสอบ export path ด้วยการรัน ffmpeg filter จริงบนไฟล์แทน = วิธีที่ได้ผล.

## DONE ใน session 2026-07-12
- [DONE] **CR-008 WP-3 nonce = design-only** `f675fabb` — PKCE ปิด race อยู่แล้ว = defense-in-depth; supabase-js
  ไม่มี state pass-through → ต้องแตะ redirectTo → live-test ไม่ได้. เขียน design ต่อท้าย CR-008 doc, ไม่ลงโค้ด.
- [DONE] **CR-003 v0.3.0 ADR-16 reconcile** `3e7bda87` — สองสกุล shard/wallet + provenance + match_submissions/
  tips/economy_config + mint_shard_from_match/tip + match-share-submit + catalog separation. shard ไม่ติด Omise.
- [DONE] **CR-003 implement (7 parallel Sonnet agents)** `5096ecb3` — migration+4 Edge Fn+7 frontend+pgTAP.
  Opus gate จับ 6 บั๊ก + re-verify จับ 1 (deadlock ที่ fix สร้าง) → แก้ครบ.
- [DONE] **รันจริง 69/69 pgTAP บน local Postgres** `a90da645` — reconstruct 2 migration ที่ขาด (ADR-14 baseline +
  platform default privileges) + fix 6 test-authoring bug. supabase init scaffolding.

## Hard-won facts / อย่าพลาดซ้ำ (2026-07-12)
- **migration history ของ repo นี้ไม่ครบ** 🔴 — objects เก่า (profiles/gid_counters/handle_new_user/alloc_cohort_seq
  + Supabase platform default privileges) สร้างตรงบน live gstore **ก่อนมี migrations/ folder** → `supabase start`
  บน clone ใหม่พังมาตลอดจนถึง session นี้. reconstruct แล้ว (2 migration ใหม่ dated ก่อน SEC-001). ถ้าเจอ object
  ที่ migration อ้างแต่ไม่มีไฟล์สร้าง = เช็ก live schema (read-only) ก่อนเดา.
- **pgTAP `throws_ok(sql, str)` 2-arg = กับดัก** 🔴 — arg2 ถูกตีความเป็น **expected error message** ไม่ใช่ description.
  RPC ที่ raise error ถูกต้องจะ "fail" เพราะ message ไม่ match. ต้อง `throws_ok(sql, null, null, desc)` (4-arg) เสมอ
  เมื่อแค่อยากเช็กว่า "throw อะไรก็ได้". เจอ 6 จุดใน cr003 test.
- **pgTAP อ่านตาราง RLS ต้อง reset role ก่อน** — test ที่ act เป็น user แล้วอ่านตารางของ user อื่น / ตารางไม่มี
  SELECT policy (redeem_codes) จะได้ 0 แถวเงียบ ๆ → assertion fail. `reset role` ก่อน read (แบบ DB-08) แล้ว
  `set local role` กลับ. และ `sum()` = numeric ต้อง `::bigint` ก่อนเทียบ.
- **Supabase branching = Pro plan เท่านั้น** — free project สร้าง dev branch ไม่ได้ (reject ตั้งแต่ plan check,
  ไม่มีค่าใช้จ่าย). ทางฟรีที่ได้ผลเทียบเท่า = local `supabase start` (Docker) รัน migration+pgTAP จริง.
- **Supabase local บน Windows** — analytics service ต้อง `enabled=false` ใน config.toml (ต้องการ Docker TCP:2375);
  storage/studio อาจ unhealthy → ใช้ `--ignore-health-check` (DB ยังใช้ได้). `supabase test db` shell ออกไปเรียก
  `docker` CLI ตรง ๆ → ต้องมี `docker.exe` ใน PATH (ที่ `G:\Docker\Docker\resources\bin`).
- **Docker Desktop installer** — ต้องมี verb `install` นำหน้า flags (`install --quiet ...`) ไม่งั้น "Unknown command".
  ต้อง admin elevation (คลิก UAC แทน Boss ไม่ได้). `--installation-dir` + `--wsl-default-data-root` แยกที่ app กับ
  WSL2 disk ได้ (ลงไว้ `G:\Docker\` กัน C: เต็ม). ตัว docker CLI ไม่ขึ้น PATH ใน shell ที่เปิดก่อนลง.
- **Opus adversarial gate คุ้มมากกับ parallel-agent code** — mechanical checks (tsc/deno เขียว) มองไม่เห็น
  บั๊ก "ช่องว่างระหว่าง fn" (P0 no-wallet-row, tip value-loss, free-item, cap race, deadlock). 7 บั๊กจริงต่อ 1 feature.

## DONE ใน session 2026-07-11 B
- [DONE] **version drift แก้แล้ว** `5c412a7b` — CLAUDE.md:5 + AGENTS.md:239 → v0.9.0 (ที่เคยค้าง).
- [DONE] **G-Master counter-advice grounding** `55b0703c` — เดิม `counter_advice_text(&[])` ว่างตลอด →
  ground บนศัตรูที่ CV เห็น. source of truth = **Rust `runtime::KNOWN_ENEMIES`** (ไม่ใช่ frontend
  companion — Overlay window ไม่รัน companion runtime). alias `antimage/zuus/centaur`. sightings≥3.
- [DONE] **G-Master self-burst grounding** `1f9274dc` — wire `damage.rs` (เดิม dead code) บน real hero+level+
  items (ability estimate). baseline target. line ใน prompt. enemy-lethality ยัง blocked.
- [DONE] **latency harness** `ce75bb02` — ยืนยัน real harness มีอยู่แล้ว (`capture.rs` 2 tests); main.rs = doc pointer.

## Hard-won facts / อย่าพลาดซ้ำ (2026-07-11 B)
- **แอปมี 2 หน้าต่าง Tauri แยก JS context** 🔴 — `companion.ts` singleton **ต่อหน้าต่าง** ไม่ใช่ทั้งแอป.
  `useCompanionData/ensureRuntime` เรียกจาก **CommandDeck (Control window) เท่านั้น** → Overlay window
  ไม่มี enemySlots/roster. อะไรที่ auto-advice/overlay ต้องใช้ **ต้องเอาจาก Rust backend** ไม่ใช่ frontend
  singleton. (Opus gate จับ B1 นี้ตอน counter_advice.) → ดู [[gmaster-grounding-backend-source]].
- **`counter_advice_text` รับ hero *names* ไม่ใช่ items** — เลย ground ได้ (CV มี identity). ที่ audit บอก
  "blocked" เข้าใจผิด. แต่ **damage.rs lethality vs ศัตรู blocked จริง** (ต้อง enemy level/items/HP).
- **CV label ≠ dataset key** — labels.json ใช้ Valve internal (`antimage/zuus/centaur`); dataset อื่นอาจใช้
  friendly. เช็ก alias ก่อน join ชื่อฮีโร่ข้าม dataset. (3/15 diverge ใน item_counters.json.)
- **self-burst: อย่า parse GSI ability levels** — `HeroData.abilities` เป็น curated subset, align กับ GSI
  ability slot ไม่ได้โดยไม่มี live GSI → ป้อนผิด = เลขผิดเงียบ. ใช้ `estimate_ability_level` (None). items+level แม่นจริง.
- **damage.rs = `#![allow(dead_code)]`** — self_burst ใช้แล้ว แต่ is_lethal/can_i_kill_with ยัง dead (enemy-facing). อย่าเผลอลบ allow.

## DONE ใน session 2026-07-11
- [DONE] **T1 DPAPI secret store (CR-008 WP-2)** `a9c492e8` — `secret.rs` (per-file DPAPI, WRITE_LOCK,
  atomic same-dir temp-rename), mode/secret split, startup load, supabase-js `secureStorage.ts` adapter,
  key ออกจาก localStorage + migration. Opus design REVISE→APPROVE (จับ B1 race/B2 clobber ก่อนโค้ด) → code PASS.
- [DONE] **T3 CI hardening** `c5d8d4cb` — `rust-toolchain.toml` pin 1.96.0 + ci.yml/release.yml + AGENTS.md
  (tag-after-CI-green + review-gate checklist). eslint อยู่ใน gate ทั้งสองอยู่แล้ว.
- [DONE] **T2 silent-arm efficacy study** `5bacec51` — สุ่มปิด G-Signal 25% (opt-in, instant-off), log `armed`,
  analyzer + EfficacyCard เทียบ armed vs silent ต่อ event, local ล้วน. Opus FAIL(B1 FILETIME)→fix→PASS.
- [DONE] **CR-008 WP-3 login-CSRF gate** `ec5543ec` — callback pending-gate (single-use+timeout, ไม่แตะ redirect URL) + PKCE. Opus security PASS.
- [DONE] RWANG:MasterPlan adopt ที่ **Phase 7** `2e582604` (`state/PROJECT_STATE.json`) — ไม่ทำ greenfield (product ship แล้ว).

## Hard-won facts / อย่าพลาดซ้ำ (2026-07-11)
- **FILETIME quantization = randomness trap บน Windows** 🔴 — `SystemTime::now()...as_nanos()` บน Windows
  เป็น FILETIME (100ns) → **เป็นพหุคูณของ 100 เสมอ** → `nanos % 100 ≡ 0`. ใครก็ตามที่สุ่มจาก clock nanos
  ด้วย `% N` เล็ก ๆ จะได้ค่าคงที่. **ต้อง mix (splitmix64) ก่อน modulo** เสมอ. บั๊กนี้ CI เขียวมองไม่เห็นเพราะ
  test inject entropy ตรง ๆ — **ต้องมี test ที่ป้อน input แบบ quantized จริง**. ดู `runtime.rs mix_entropy`.
- **windows 0.61: `LocalFree`/`HLOCAL` อยู่ใน `Win32::Foundation`** (ไม่ใช่ System::Memory) — DPAPI
  `CryptProtectData/UnprotectData` + `CRYPT_INTEGER_BLOB` ใน `Win32::Security::Cryptography`. เพิ่ม feature
  `Win32_Security_Cryptography` + `Win32_System_Memory` ไว้ (แม้ import จริงมาจาก Foundation).
- **parallel executor ในทรีเดียวกัน = clippy ปนกัน** — agent 2 ตัวแก้ Rust พร้อมกัน แล้วตัวนึง spawn clippy →
  compile โค้ดครึ่ง ๆ ของอีกตัว = false fail. ให้ executor **หยุด self-verify Rust**, lead รัน combined
  CI-parity authoritative รอบเดียวหลังทั้งคู่จบ. (ไฟล์ disjoint OK; แต่ target/ + toolchain shared.)
- **capture มี 2 backend เสมอ** — `capture.rs` (DXGI, default) + `capture_wgc.rs` (`--features wgc` rollback).
  แก้ signature ที่ backend เดียว → `cargo check --features wgc` แดง (default gates มองไม่เห็น). **gate ต้องรัน
  `cargo check --features wgc` ด้วย** เมื่อแตะ log/signal/capture path.
- **Opus adversarial gate คุ้มทุกงาน** — จับ silent-logout race, key-clobber, FILETIME bug ที่ CI เขียวปล่อยผ่าน.
  worker self-report เขียว ≠ ถูก; lead ต้องรัน combined gate เอง + Opus review.
- **WP-3 ทำไมไม่ใช้ state/nonce**: nonce ต้องใส่ใน redirect URL → เสี่ยง Supabase allowlist match พัง และ
  **live-test OAuth ไม่ได้** (Google sign-in = ทำแทน Boss ไม่ได้) → เลือก pending-gate ที่ไม่แตะ URL + PKCE ชั้นสอง.

## DONE ใน session 2026-07-10
- [DONE] **release v0.9.0 published** (setup.exe/.msi + .sig + latest.json, in-app updater live) — CI run 29118296158
- [DONE] CR-007 shell refresh: notch ขวาล่างจริง + power corner FAB + acrylic ออก + drag lag + scale 1.0 + blur + unchip card
- [DONE] WP-4 honest data + audio rail single-owner (แก้ dual-ownership BLOCKER ที่ gate จับ)
- [DONE] announcer install auto-activate + manifest counts จริง
- [DONE] **voice-pack path-traversal + zip-slip CLOSED** (`safe_pack_path` + zip crate) — RCA เขียนแล้ว
- [DONE] CSP + Supabase/Steam-CDN origins (sign-in ใช้ได้ใน build)
- [DONE] **ADR-16 credit economy** (shard/wallet + OpenDota mint oracle + match_ref HMAC) + reconcile CLAUDE.md privacy rule (ADR-11/12 ไม่ได้หาย แค่ CLAUDE.md ขัดกันเอง) + CR-003 ติด `provenance` constraint
- [DONE] **login เปิดใช้จริง**: LIVE เพิ่ม redirect URL `http://127.0.0.1:3000/auth/callback` ใน Supabase gstore (Boss กด Save) — allowlist เดิมว่างเปล่า
- [DONE] RCA ×2: voice-pack path-traversal + release-gate drift
- [DONE] docs ใหม่: CR-007, design-system 07-combat-hud / 08-account-gid, ADR-16

## Hard-won facts / อย่าพลาดซ้ำ (2026-07-10)
- **ADR-11 (opt-in data→credit) + ADR-12 (marketplace) = Accepted แล้วตั้งแต่ 2026-06-23** — ไม่ใช่
  ไอเดียใหม่. ที่ "หาย" ซ้ำเพราะ CLAUDE.md เขียน privacy rule absolute ไม่อ้าง ADR-11. **แก้แล้ว** —
  CLAUDE.md ตอนนี้ระบุ 2 opt-in แยกกัน. ดู [[credit-economy-adr16]].
- **CR-006 layout ล็อกโดย Boss** — ห้ามเสนอ rewrite shell อีก. redesign = skin/content/quality เท่านั้น.
  ดู [[cr006-layout-locked]].
- **acrylic windowEffects = ต้นเหตุทั้งแผ่นขุ่นรอบ shell และ drag lag** — ถอดออก, ชั้น glass ที่เหลือ
  ต้องทึบ (บน transparent window เบลอ desktop รายชิ้นไม่ได้ — CSS backdrop-filter เป็น no-op).
- **CI checks ที่ review gate ต้องแมตช์**: clippy + cargo test + **eslint** + tsc + vitest + tauri
  smoke build (`--no-bundle`, verify job ห้ามเซ็น). gate ที่รัน subset ปล่อยโค้ดแดงผ่าน. ดู [[ci-gate-clippy-not-test]].
- **re-tag ปลอดภัยถ้า release job ยัง skip** (fail ก่อน publish → `gh release view` = not found) —
  ไม่ต้อง burn เป็น v0.9.1.
- Chrome MCP capture หน้า dashboard ได้ปกติ (ต่างจาก native transparent window ของแอปที่ capture ไม่ได้).

---

## Highest-leverage next work - 2026-07-09 (trail)
1. **Power radial surgical fix only** - แก้ตำแหน่ง/ทรง/การเกาะมุมของปุ่ม power และ radial menu โดยห้ามรื้อ shell geometry ใหญ่ทั้งก้อนอีก; ใช้ shell ปัจจุบันบน `main` เป็นฐาน
2. **Visual verify บน exe จริงหลัง polish รอบสุดท้าย** - เปิด artifact จริง, จับ screenshot ใหม่, แล้วเช็ก subtract rim / topbar island / sidebar bottom-left corner / power zone ให้จบก่อนขยับไปงานอื่น
3. **ค่อยย้อนกลับไปเรื่อง CPU/WebView2 หลัง shell นิ่ง** - งาน perf จาก `2026-07-08-B-control-window-cpu-throttle.md` ยังสำคัญ แต่ตอนนี้อย่าเอา layout shell ไปปนกับ pass perf อีกรอบ

## DONE ใน session 2026-07-09
- [DONE 2026-07-09] CR-006 shell หลักถูก merge เข้า `main` แล้ว (`17214968`)
- [DONE 2026-07-09] Rewrite design-system shell docs ให้ตรงกับ live UI (`03-layout.md`, `04-components.md`, `cr006-layer-dev-overlay.svg`) (`189eb2e5`)
- [DONE 2026-07-09] เขียน RCA สำหรับ shell disable regression / subtract-rim layout instability / doc drift (`189eb2e5`)
- [DONE 2026-07-09] build artifact หลายรอบและคัดลอก exe/setup ไป Desktop ให้เปิดตรวจจริง

## Hard-won facts / อย่าพลาดซ้ำ
- CR-006 shell มีหลาย coordinate systems ซ้อนกัน: **stage 1420x760** กับ **panel clip world 1280x720**; ถ้าเผลอปรับโดยไม่แยก ownership จะเกิด drift ง่ายมาก
- `docs/design-system/03-layout.md` และ `04-components.md` ตอนนี้ถูก rewrite ให้ตรงกับของจริงบน `main` แล้ว; รอบหน้าห้ามย้อนกลับไปเชื่อ mock เก่าก่อนเช็ก docs ชุดนี้
- ปัญหาหลักของรอบนี้ไม่ใช่ CSS ค่าเดียว แต่คือ **legacy shell + CR-006 shell + scaled stage + mock docs drift** แข่งกันเป็น source of truth
- `pnpm tauri build` ทำ artifact ได้ แต่จะจบ fail ที่ signing step ถ้า local env ไม่มี `TAURI_SIGNING_PRIVATE_KEY`; นี่เป็นข้อจำกัดปกติ ไม่ใช่ regression ใหม่
- `tmp-power-radial-check.html` เป็นไฟล์ temp ค้างใน working tree; อย่าลบอัตโนมัติถ้ายังไม่ได้เช็กว่าผู้ใช้ต้องการเก็บ reference ไว้หรือไม่
- คำเตือนเก่า “ห้ามแตะ `src/src/CommandDeck.tsx` / `docs/design-system/assets/cr-006-*` ถ้า user ไม่สั่งตรง ๆ” ยังจริงเชิง policy แต่ **รอบนี้ user สั่งตรงแล้วและของจริงบน `main` เปลี่ยนไปแล้ว**

## Ranked next checks
1. เปิด exe ล่าสุดแล้วเช็กมุมซ้ายล่าง power zone กับมุมขวาบน topbar island ก่อนเลย - อย่าเริ่มจาก refactor
2. ถ้าจะขยับ L1/L2 อีก ให้เทียบจาก screenshot จริงและเช็กว่าไปชน shell clip path หรือเปล่าก่อนแก้ opacity/blur
3. ถ้าจะกลับไป pass perf ให้เริ่มจาก note `2026-07-08-B-control-window-cpu-throttle.md` และแยก session ออกจากงาน shell โดยชัดเจน

## DONE ใน session 2026-07-08 B
- [DONE 2026-07-08] Level-up milestone logic ใช้ชุด `6,12,18,25` ทั้ง announcer และ persona path พร้อม skip-level tests
- [DONE 2026-07-08] Dire blindness fix - ส่ง `team_name` จาก GSI ไประบุ enemy ring color ใน CV
- [DONE 2026-07-08] Audio priority - `danger/gank/revision` ไม่โดน announcer ทับ
- [DONE 2026-07-08] Release verify gate - workflow มี `cargo test` + `clippy` + `vitest` + `tsc`
- [DONE 2026-07-08] Latency harness จริงจาก `GSI parse -> team-side routing -> signal -> audio enqueue`
- [DONE 2026-07-08] Governor CPU/RAM sampling บน Windows ย้ายไป Win32 native path ก่อน fallback PowerShell
- [DONE 2026-07-08] เพิ่ม `tests/perf/src/bin/perf_cpu_tree.rs` วัด root + child processes แบบใกล้ Task Manager
- [DONE 2026-07-08] แก้ control-window event churn: `useCompanionData()` เป็น singleton store + batch updates + inactive gate ใน `App.tsx`

## Hard-won facts / อย่าพลาดซ้ำ
- `useCompanionData()` เคยถูกเรียกหลายที่ในหน้าเดียว (`CommandDeck`, `Dashboard`, `CompanionPages`) จน subscribe Tauri events ซ้ำจริง - ถ้าจะ optimize deck ต่อ ให้เช็ก fan-out นี้ก่อนแตะ layout
- Task Manager ที่เห็น “มีวงเล็บหลาย task” คือ child `msedgewebview2.exe` จริง ไม่ใช่ DXGI thread ใน process เดียว
- หลังตัด governor noise แล้ว ถ้ายังหลุด CPU peak ให้คิดเรื่อง **WebView2 visible surface/compositing** ก่อน backend capture/audio
- เป้าชนะรอบถัดไปคือ grouped peak `<= 2.5%`; อย่าอ้างแค่ mean ต่ำแล้วถือว่าผ่าน spec
- ห้ามแตะ `src/src/CommandDeck.tsx`, `src/src/command-deck-shell-2026-07-08.css`, `docs/design-system/assets/cr-006-*` ถ้า user ยังไม่สั่งตรง ๆ

## Ranked next checks
1. วัด CPU แบบเดิมซ้ำหลังปิด animation / large transparent layers ทีละจุด และบันทึกผลเทียบ `perf_cpu_tree`
2. ตรวจว่ามี consumer ไหนยังอ่าน `data` ทั้ง object ทั้งที่ใช้เพียง slice เดียว
3. ถ้าจะทำ policy ชั่วคราว ให้เขียน UX copy/behavior ชัดว่าซ่อน dashboard แล้ว perf อยู่ในงบ แต่ visible control ยังไม่ผ่าน hard peak budget

---

## Trail เก่า - เก็บไว้เป็นบริบท

อัปเดตล่าสุด: **2026-07-08** · deck glass-redesign thread ต่อ (transparent window + acrylic + sidebar FAB + glass base) บน branch `feat/deck-glass-redesign-ds` (PR #8) + merge `origin/main` เข้ามา (audit/version/AGENTS/CLAUDE). ก่อนหน้า: audit ทั้งระบบ 2026-07-08 · FluxNode side-quest 2026-07-06 · deck 2026-07-05 C.

## 🟢 Deck glass-redesign thread (2026-07-06 → 2026-07-08) — ล่าสุด (branch `feat/deck-glass-redesign-ds`, PR #8)
- **transparent Tauri window** (`transparent:true`, tauri.conf control window) + **acrylic** `windowEffects` (real desktop-blur) + ตัด ambient rectangle นอก HUD (`.g-deck-bg` dead code ลบ).
- **drag lag fix**: ลบ `backdrop-filter` ของ glass-bg (ไร้ผลบน transparent window — acrylic เบลอ desktop แทน) + ปิด panel blur ตอนลาก (`.is-dragging` toggle จาก `startWindowDrag`, suppress panel+sidebar+topbar; safety timeout 8s).
- **topbar** 40px + **notch หุ้ม topbar อัตโนมัติ** (วัด rect จริง `pr.right-tr.left`, ResizeObserver) เหลือ seam 2px. `buildPanelPath(w,h,ntw,nth)` รับ ntw/nth วัดสด.
- **sidebar = detached FAB** (treatment+z เดียวกับ topbar) ห่าง panel body **16px** (notch `nlw=76/nlt=274`, sync CSS var + JS); logo/telemetry tiles **unbox** (ลอยบน panel, เก็บ active-nav highlight).
- **backmost glass base** re-add (`.g-deck-glass-bg` div): rounded rect แนบ envelope panel (left:12 radius:18, **ไม่ล้ำ rim**), โปร่ง `rgba(224,236,255,.09)`, **เบลอมาจาก acrylic** (CSS backdrop-filter บน backmost layer = no-op + laggy).
- ⚠️ **verify**: DOM geometry ผ่าน `preview_eval` บน probe vite แยก port (:5180, config `deckprobe` ลบทิ้งแล้ว) — `preview_screenshot` timeout เสมอ (backdrop-filter+clip หนัก); native transparent window **capture ไม่ได้** (Claude window ทะลุผ่าน). **user eyeball เท่านั้นสำหรับ look**.
- **งานทั้งหมด committed บน branch** (6 commits ahead origin: transparent/rim/glass-BG/acrylic + WIP `eb2f92f4` = sidebar FAB/glass base/notch). epitaxy auto-commit + switch HEAD กลับ main (เลย working tree main clean). **ยังไม่ tag/release.**
- **งานต่อ**: user ยัง eyeball sidebar FAB + glass gap อยู่ (frosted เบลอพอไหม, P1-P5 เข้า sidebar FAB ไหม) · REBUILD desktop (build เดิม predate ทั้ง thread) · push branch (merge main แล้ว ตอน resolve conflict นี้) → merge PR #8 เมื่อ deck นิ่ง.

## ⚪ FluxNode AI copilot (2026-07-06) — คนละ repo `D:\fluxnode-dev`
งานทั้ง session อยู่ที่ FluxNode ไม่ใช่ G-Maiden. สร้าง agent-native layer (Action registry 30 actions + brain/agent loop + media adapter + MCP + `--agent`/`--mcp`), E2E-verified ผ่าน Ollama. **9 commits @ master `c6810e5`, local ล้วน ไม่มี remote.** งานต่อ + gotchas ทั้งหมดอยู่ที่ **`D:\fluxnode-dev\HANDOFF.md`** (อย่าก๊อป FluxNode todo มาปนที่นี่). บทเรียน reusable: [[codex-vs-ollama-rust-boilerplate]]. **G-Maiden ไม่มี drift ใหม่จาก session นั้น.**

## 🎯 Highest-leverage next work (จาก audit 2026-07-08, เรียงลำดับ)

**Batch "Make-it-work" (correctness, pure-logic, มีเทสต์ครอบ — commit main ไม่ tag):**
1. **Level-up เฉพาะเลเวลสำคัญ** — สั่งแล้วแต่ยังไม่ลงมือ. แก้ **2 ทาง**: `announcer.rs:128`
   (pack path) + `App.tsx:544` (persona TTS path, อันนี้พูดทุกเลเวลจริง). ใช้ shared const
   milestone — รอผู้ใช้เลือก `{6,12,18,25}` (อัลติ) vs `{6,10,15,20,25}` (talent). เตือน: ใช้
   logic "ข้ามผ่าน milestone" (`s.level < m <= tick.level`) กันเลเวลกระโดด, sync 2 ที่แบบ STREAK_LABELS.
2. **Dire blindness** 🔴 — `cv/mod.rs:16` ring color hardcode Dire-red → gank ตาย ~50% เกม.
   parse `player.team_name` เข้า GameTick (`gsi.rs`) → เลือกสี ring ตามทีม (ต้องหาค่า Radiant-green).
3. **Audio priority** 🟠 — `audio.rs` `Cmd::Play(path, prio)`; gank/revision/danger = critical
   ห้ามโดน announcer (kill/levelup) ทับ.

**Make-it-gated (release safety) — ทำเร็ว impact สูง:**
4. CI รัน `cargo test` + `vitest run` (146 test ไม่เคยรัน) + gate `release.yml` บน CI เขียว.
5. Latency harness ตัวจริงแทน stub (`tests/perf/src/main.rs` sleep=budget → PASSED เสมอ).

**Quick wins <1 วัน:** CSP เพิ่ม origin Supabase (Google sign-in พังใน build จริง) · commit
`Cargo.lock`+`pnpm-lock.yaml` · LICENSE+README · pack path-traversal (ก่อนเปิด marketplace) ·
ย้าย secret ออกจาก localStorage. (version drift = **DONE** 2026-07-08.)

**Strategic (ตัดสินใจถูก ไม่เสียโค้ด):** legal read live-CV (Valve ban risk) · เลิก match-data
flywheel · freeze CR-003 wallet จนพิสูจน์ retention · เลือก niche-ไทย vs global.

## 🚫 Do-not-repeat / hard-won (audit 2026-07-08)
- Level-up (และเสียง persona อื่น) มี **2 code path** เสมอ — announcer.rs + App.tsx persona. แก้ที่เดียวไม่พอ.
- SEC-001 F1 = **ปิดสนิทจริง** (live-verified) — สร้างต่อได้ ไม่ต้อง re-audit RLS forge.
- TTS PowerShell = **injection-safe** (base64 ก่อน interpolate) — ไม่ใช่ช่องโหว่.
- `:3000` = bind `127.0.0.1` แต่ **ไม่มี auth** → local/web spoof GSI ได้ (M).
- version drift แก้แล้ว (Cargo/root pkg + CLAUDE/AGENTS → 0.8.0) PR #9.

## 🟢 Deck polish thread (2026-07-05 C)

**Branch `feat/deck-glass-redesign-ds`** — ahead origin **3** (`2be6f4b7`/`c8de30b8`/`d3b14d4a` จะ push ตอนปิด), **ยังไม่ merge/tag**. **PR #8** = https://github.com/Freshair129/G-Maiden/pull/8

- **DONE Subtract ปรับตาม prototype+feedback**: 2 notch (top-right topbar + bottom-left sidebar); **G-Signal ย้ายเข้า bento grid** (`.gsignal-bento` cell, ไม่ใช่ FAB ลอยแล้ว); power radial menu (min/max/close); window controls ออกจาก topbar.
- **DONE Agent sector**: caster feed sliding-window (Maiden typewriter) + **event banner wired เข้า `announcer-banner`** (ครอบ kill+streak, tone blood/gold/fire, top 40% ครึ่งซ้าย, detached จาก feed). ทั้งคู่ **demo fallback ตอนไม่มี Tauri**.
- **DONE left rail v2**: P1=**logo tile** (codex icon, inline `LogoMark`), P2-P5=**telemetry ย้ายจาก topbar** (CPU load+temp/RAM/GPU load+temp/VRAM). sidebar เอา G ออก+ลงล่าง(300). panel top ยืดลง `nlt 216→286`.
- **DONE topbar v2**: version ใต้ G-MAIDEN (`getVersion`), ปุ่ม update (`check()`, status=toast), กระดิ่ง+dropdown (sample). **drag fix** = เพิ่ม capability `core:window:allow-start-dragging` + `startDragging()`. notch `ntw→324` กัน topbar ยื่นซ้อน.
- **DONE flatten pass 1**: panel ดำแบนสีเดียว `rgba(18,20,26,.72)` + card แบน + ตัด gloss/เงา/tilt. lime คงเดิม. **ยัง eyeball ไม่ได้** (screenshot timeout) → **ต้อง user ดู contrast**.
- **DONE minimap overlap fix**: `.minimap-bento { min-height:0 !important }` (grid item min-height:auto ล้นทับแถว 3).

### 🎯 งานต่อ thread นี้ (เรียงตามคุณค่า)
1. **REBUILD desktop** — drag/version/bell/update ทดสอบได้เฉพาะ Tauri; build เดิม (0.8.0) predate logo/telemetry/topbar/flatten. `pnpm tauri build` จาก root (~12 นาที).
2. **glass ทะลุ desktop** = window `transparent:true` (tauri.conf) + เอา opaque bg ออก + card = translucent glass blur desktop. **architectural, verify ต้อง rebuild, perf risk** — user เลือกทำ**หลัง**flatten. เป็น step แยก.
3. **de-nest** sub-card ชั้นในลึก + **eyeball flatten** ว่าจางไปไหม (tune contrast).
4. wire จริง: notification bell feed (ตอนนี้ sample), agent caster narration event (`agent-message`?).
5. push branch (ปิด session นี้) → merge PR #8 เมื่อ deck นิ่ง.
6. **DOC DRIFT (pre-existing, ยังไม่แก้)**: `CLAUDE.md:5` = "implemented (v0.7.x)" และ `AGENTS.md:220` = "Current State (v0.7.x shipping; v0.8.0 in progress)" — จริง = **v0.8.0 shipped 2026-07-04** (ทุกไฟล์ version 0.8.0). แก้ status line เมื่อ user สั่ง.
---

## 🟣 Deck HUD v2 impl + G-Offload Monitor thread (2026-07-05 B)

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
