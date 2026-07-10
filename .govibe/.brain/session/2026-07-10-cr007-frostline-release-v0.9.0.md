# Session 2026-07-10 — CR-007 FROSTLINE refresh → release v0.9.0 + ADR-16 credit economy

## Entry point
เริ่มจากโจทย์ "redesign ทิศทาง UX/UI ของ G-Maiden desktop app" (ผ่าน skill `impeccable`,
สำรวจ 5 ทิศทาง) — แต่บานปลายเป็น session ยาวที่ปิดจบด้วยการ **release v0.9.0 จริง** + วางราก
เศรษฐกิจ credit (ADR-16) + เปิดใช้ login. Branch: `main` ตลอด (repo ใช้ trunk-based).

## Arc (เกิดอะไร + ทำไม)

1. **Redesign → ถูกตีกลับเป็น refresh.** เสนอทิศทางใหม่ "FROSTLINE" (resizable AppShell, phase-aware).
   **Boss ปฏิเสธการ rewrite shell** — สั่งล็อก layout CR-006 (subtract glass เว้า 3 จุด + Liquid
   Glass + fixed stage) เหตุผล: จอเดียวปิดลง tray อยู่แล้ว, สองจอเครื่องแรงพอ → แก้ perf ที่
   quality tier ไม่ใช่รื้อโครง. บันทึกเป็น memory `[[cr006-layout-locked]]`. เขียนใหม่เป็น
   **CR-007** = refresh ภายในเปลือกเดิม (skin/content/system เท่านั้น).

2. **Shell polish หลายรอบ ขับด้วย screenshot ของ Boss** (worker=Sonnet, gate=Opus ทุกงาน):
   - WP-1: เพิ่ม notch ขวาล่างจริงใน `FUNG_PANEL_PATH` (mock มีแต่ path ไม่เคยเว้า) + power radial
     → **corner FAB ใต้ sidebar** (Boss สั่งย้ายเข้ามุม). gate จับได้ว่า SignalGrid เป็นลูก panel
     → ถ้าเว้า notch จะโดน clip-path กลืน → ย้ายเป็น stage sibling.
   - ตัด **acrylic windowEffects** ออกจาก control window = แผ่นขุ่นรอบ shell หาย + drag lag หาย
     (acrylic move เป็นคอขวด Windows). เพิ่ม `.is-dragging` ปิด backdrop-filter/shadow ตอนลาก.
   - clamp scale `1.4 → 1.0` (จอ 1080p เดิมซูม ~1.35× จน rim เบลอ). เงา ambient ฟุ้งเป็นชุดเดียว
     (Boss สั่งเพิ่มเบลอ 3 รอบ → rim 140px). การ์ด agent แหว่งเพราะ top 42 ยื่นใน notch (floor 74)
     → ย้ายลง 86.
   - gate จับ WARN: `.g-panel-rim` drop-shadow อยู่ใน panel ที่ clip → เงาฟุ้งออกไม่ได้ → ย้าย rim
     เป็น stage sibling. อีก WARN: canonicalize ซ้ำต่อ clip บน gank path → hoist.

3. **WP-4 honest data + audio rail → backend** (worker→gate **FAIL**→fix→PASS):
   - บั๊ก #1: `FALLBACK.heroes = []` → `buildHeroes` map บน array ว่าง → hero slot 10 ช่องตายถาวร
     ไม่ว่า GSI ส่งอะไร. แก้เป็น 10 ช่อง honest (ตัวเลข optional, `—` ไม่ใช่ 0/0/0).
   - **BLOCKER ที่ gate จับ**: `Control` panel (ฝังใน tab Settings) กับ audio rail แย่งกันเป็น
     เจ้าของ `set_volume`/`set_cv_signal_enabled` → เลื่อนเสียงที่ deck แล้วเปิด Settings เสียง
     เด้งกลับ. แก้: audio rail เป็น single owner, backend emit `volume/signal/announcer-change`,
     Control เลิก push บน mount.
   - ย้ายสูตร signal ออกจาก UI, enemy slot จองครั้งเดียว (เลิกสลับกลางเกม), Alert Deck feed จริง.
   - เพิ่ม Rust `set_announcer_enabled` (ANN toggle ไม่เคยมี backend). ping = `—` (GSI ไม่ส่ง ping).

4. **G-AnnStudio pipeline**: audit พบ `POST /announcer/install` แทบเป็น no-op (log + คืน
   `all_counts()` ที่นับ flat layout เก่า, ไม่ activate). แก้เป็น auto-activate + counts จริงจาก
   manifest. **ตามด้วย security**: manifest `clips[]/bannerAsset/coverImage` join ตรงไม่เช็ก `..`
   → arbitrary file read (เล่นเป็นเสียง / base64 ลง overlay แค่เปิด Audio Settings). ปิดด้วย
   `safe_pack_path` (Path::components + canonicalize containment) + zip-slip guard (เลิก
   Expand-Archive → zip crate in-process). RCA: `docs/rca/2026-07-10-voice-pack-path-traversal.md`.

5. **Login วิเคราะห์** (ไม่ implement, แค่ตัดสิน): มี Google OAuth PKCE อยู่แล้ว + GID/Supabase ครบ.
   ตัดสิน: **Google พอ, email/password ไม่คุ้ม** (รับภาระ reset/brute-force/account-linking แลก
   user เพิ่มนิดเดียว); คนไม่มี Google ใช้แอปได้เต็ม (sign-in additive); ถ้าขยาย → Discord ก่อน,
   Steam ตอนเปิด store. blocker จริง = **CSP ไม่มี Supabase origin** (แก้แล้ว) + **redirect URL
   allowlist ว่าง** (เพิ่มแล้ว §ท้าย).

6. **ADR-16 credit economy** — ค้นพบว่า **ADR-11 (opt-in data→credit) + ADR-12 (marketplace/
   revshare) Accepted ตั้งแต่ 2026-06-23 แล้ว** ไม่ได้หาย. เหตุที่ "หาย" ซ้ำ = `CLAUDE.md` เขียน
   privacy rule แบบ absolute ("never upload, ADR-14 only exception") ไม่อ้าง ADR-11 เลย → ทุก
   agent บังคับกฎนั้นแล้วลืมกลยุทธ์ = **doc-consistency bug**. ADR-16 ตัดสิน: สองสกุลแยกขาด
   (shard earned ซื้อของ creator ไม่ได้ / wallet purchased), mint oracle = OpenDota ไม่ใช่ G-Log,
   "รับ shard = ส่งข้อมูล" การกระทำเดียว, tip ไม่เป็น faucet, `match_ref = HMAC(match_id)` (Boss
   เสนอเก็บ match_id ระงับข้อพิพาท → ผมค้านว่าให้เก็บ HMAC เท่านั้น กัน enumerate). แก้ CLAUDE.md
   privacy rule + ติด `provenance` constraint ให้ CR-003.

7. **Release v0.9.0** — bump 4 ไฟล์ + CHANGELOG, tag. **CI fail 3 รอบ** (หนี้สะสม ไม่ใช่งานใหม่):
   (a) clippy `redundant reference in format!` (master.rs/slm.rs, จาก stable ใหม่หลัง v0.8.0),
   (b) eslint `prefer-const` (WP-4, gate รันแค่ tsc+vitest ไม่รัน eslint),
   (c) verify job รัน `tauri build` เต็มชนกับ signing key ที่มีแค่ใน release job → `--no-bundle`.
   re-tag v0.9.0 3 ครั้งปลอดภัย (ทุกครั้ง fail ก่อน publish, `release not found`). RCA:
   `docs/rca/2026-07-10-release-gate-drift-v0.9.0.md`. build+sign+publish สำเร็จรอบ 4.

8. **เปิด login จริง** — ใช้ Chrome MCP เปิด dashboard: redirect URLs **ว่างเปล่า** (ยืนยันด้วย
   screenshot). Boss อนุญาต → ผมพิมพ์ `http://127.0.0.1:3000/auth/callback` ในช่อง, Boss กด Save.
   ตอนนี้ allowlist มี 1 URL → login chain ครบ.

## สิ่งที่ทำ (grouped)

| area | commit | สรุป |
| --- | --- | --- |
| shell geometry (notch/power FAB) | `b99777d7`, `08a09008` | WP-1 + corner FAB |
| glass/drag/scale/shadow | `0eb35042`, `7d8b9276`, `167598e9` | acrylic ออก, drag lag, scale 1.0, blur, unchip card |
| WP-4 honest data + audio rail | `a75357ff` | single-owner audio, honest heroes, buildSignals/buildActivity |
| announcer install | `b75944cd` | auto-activate + manifest counts |
| voice-pack security | `d4a400d7` | path-traversal + zip-slip CLOSED + RCA |
| CSP | `a10f28ef` | Supabase + Steam-CDN origins |
| ADR-16 + CLAUDE.md + CR-003 | `cd6d18d2` | credit economy, privacy rule reconcile |
| release bump | `815bb39f` | v0.9.0 (4 ไฟล์ + CHANGELOG) |
| CI fixes | `ada218e6`, `5ab2e7c7`, `b472def1` | clippy, eslint, workflow --no-bundle |
| release RCA | `17efd016` | gate drift RCA |

docs ใหม่: `docs/change request/CR-007-*`, `docs/design-system/07-combat-hud.md`,
`08-account-gid.md`, `docs/architecture/adr/ADR-16-*`, RCA ×2. (CR-008-login-hardening.md ใน
tree = ของ session คู่ขนาน ผมไม่แตะ.)

## Verify (จริง)
| gate | ผล |
| --- | --- |
| `cargo test` (src-tauri) | ✅ 162 passed (จาก 138 → +test security/WP-4) |
| `cargo clippy --all-targets -D warnings` | ✅ clean (หลังแก้ format! + hoist) |
| `tsc --noEmit` (src) | ✅ 0 |
| `pnpm -C src exec eslint .` | ✅ 0 error (6 warning เดิม react-hooks ไม่ fail) |
| `vitest run` | ✅ 142 passed (จาก 132 → +buildActivity/heroKda/enemySlot) |
| **CI release (run 29118296158)** | ✅ verify + release success |

## Key results
- Release v0.9.0 **published** (ไม่ draft): setup.exe+.sig, .msi+.sig, latest.json → in-app updater live.
- Supabase gstore: redirect allowlist 0 → 1 (`http://127.0.0.1:3000/auth/callback`), Site URL = `http://localhost:3000`.

## Artifacts / live actions (irreversible-ish)
- **LIVE Supabase gstore auth config เปลี่ยน**: เพิ่ม redirect URL ผ่าน dashboard (Boss กด Save).
  ไม่แตะ schema/RLS/migration. profiles/gid_counters เดิม (RLS + SEC-001 column-lock ยังทำงาน).
- **GitHub Release v0.9.0 published** + tag pushed (recreated 3×, สุดท้ายชี้ `17efd016` prefix chain).

## State ปลาย turn
- Branch `main`, `origin/main` 0/0 (sync). Working tree มีแต่ของไม่ใช่ session นี้:
  `.govibe/*` (brain), `dev.bat` (เติม checklist), `orchestration/brain/failures.jsonl` (parallel
  G-Orchestra session), `CR-008-login-hardening.md` (session อื่น), `tmp-power-radial-check.html`.
- **Pending / deferred:**
  1. 🔴 **secret encryption (Phase 2)** — refresh token + Anthropic API key ยัง plaintext ใน
     localStorage (audit: token หลุด = ยึด GID). Boss เคยสั่งรวม ยังไม่ทำ.
  2. **CLAUDE.md:5 drift**: "v0.8.x" → ควร v0.9.x (ยังไม่แก้ รอ Boss).
  3. **CI toolchain unpinned** — clippy stable ลอยทำโค้ดเขียวกลายแดง (RCA เสนอ pin, ยังไม่ทำ).
  4. **review gate ต้องรัน eslint** ด้วย (ไม่ใช่แค่ tsc+vitest) — บันทึกใน `[[ci-gate-clippy-not-test]]`.
  5. Strategy: silent-arm efficacy study (local) เป็น next logical ก่อน ingestion; Valve legal
     status เรื่อง CV ต้องเคลียร์ก่อนเปิด ingestion เชิงพาณิชย์.
