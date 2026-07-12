# Session 2026-07-12 — CR-003 wallet: reconcile → implement (parallel) → Opus gate → รันจริงบน Postgres

## Entry point
ต่อจาก session ก่อน (`/next` → "plan and scope" → RWANG:MasterPlan). เริ่มจากเก็บกวาดไฟล์ค้าง
3 ตัว แล้วไล่ยาวไปจนถึง **implement CR-003 wallet/billing เต็มระบบ + verify ด้วยการรัน migration
จริงบน local Postgres**. โมเดลหลัก session นี้ = **Opus** (สลับจาก Sonnet ช่วงท้าย).

## Arc (เกิดอะไร + ทำไม)
1. **เก็บกวาด 3 ไฟล์ค้าง** — `dev.bat` (checklist CR-007 เก่า, discard), `failures.jsonl` (junk RB3
   entry, discard), `tmp-power-radial-check.html` (scratch CR-006 ที่ merge ไปแล้ว, ลบ). ยืนยันว่า
   session-B commits (`55b0703c..1f9274dc`) **push ไป origin/main แล้ว** ตั้งแต่รอบก่อน — todo-next
   ที่บอก "ยังไม่ push" ล้าสมัย.
2. **WP-3 optional hardening → design-only** (`f675fabb`) — per-flow nonce จะปิด race ที่ **PKCE
   ปิดอยู่แล้ว** (mismatch `code_verifier` → `invalid_grant`) = defense-in-depth ไม่ใช่ช่องจริง. และ
   supabase-js ไม่มี `state` pass-through → ต้องแตะ `redirectTo` URL → เสี่ยง allowlist match พัง +
   live-test Google sign-in ไม่ได้. เขียน design ต่อท้าย CR-008 doc, **ไม่ลงโค้ด**.
3. **RWANG:MasterPlan bootstrap** — state = Phase 7 (in_progress, 0-6 approved จาก corpus เดิม).
   backlog ranked ที่เหลือ = behavioral-verify (ต้อง Boss) / blocked-by-data / blocked-by-ADR16.
   → เลือก **CR-003 unblock** (งานเดียวที่ปลดล็อกได้ด้วยตัวเอง).
4. **เจอ conflict จริง: CR-003 (v0.2.0) vs ADR-16** — CR-003 (2026-07-04) ออกแบบ **สกุลเดียว**
   (G-Coins purchase-only) แต่ ADR-16 (Accepted 2026-07-10, **หลัง** CR-003) บังคับ **สองสกุลแยกขาด**
   (shard earned / wallet purchased) + `provenance` ตั้งแต่ migration แรก. CR-003 schema เดิม
   **ขัด ADR-16 §7 ตรง ๆ**. → **rewrite CR-003 v0.3.0** (`3e7bda87`): แยก wallets เป็น
   shard_balance/wallet_balance, เพิ่ม currency ทุกที่, ตารางใหม่ match_submissions/tips/economy_config,
   RPC ใหม่ mint_shard_from_match/tip, Edge Fn match-share-submit, catalog separation constraint,
   US-16..21, DB-09..13. **shard ไม่ติด Omise** (mint จาก OpenDota, ไม่ต้อง payment gateway) →
   ship shard MVP ก่อน wallet ได้.
5. **User approve CR-003 v0.3.0** → **7 parallel Sonnet-5 agents** implement (frozen `useWallet()`
   contract กันไม่ให้ drift): migration SQL / 2 Edge Fn (Omise) / 2 Edge Fn (shard+download) /
   wallet.ts / Store+Wallet+Topup UI / Inventory+Ledger+MatchShare UI / pgTAP. mechanical checks
   เขียวหมด (tsc, deno check ×4, deno test 19/19).
6. **Opus adversarial gate → เจอ 6 บั๊กจริง** (ทั้งหมดใน migration RPC — คลาสบั๊กที่ parallel-agent
   ชอบทำ: แต่ละ fn ดูโอเค แต่ช่องว่างระหว่างกันพัง):
   - **P0** ผู้ใช้ใหม่ไม่มี wallets row → topup จ่ายเงินจริงแล้วเงินหาย (order ค้าง pending)
   - **High** tip ให้คนไม่มี wallet → เงินหายเงียบ (insert ledger 0 แถว)
   - **Med-High** free item (price=0) ซื้อไม่ได้ (ชน `check amount<>0`)
   - **Med** ×2 daily cap (earn/tip) ไม่ concurrency-safe
   - **Low-Med** tipped shard ไม่มีวันหมดอายุ
   - **Low** timezone mismatch (frontend local vs DB UTC)
   → แก้ครบ. **re-verify pass เจอบั๊กใหม่ 1 ตัวที่ fix#4 สร้าง** (deadlock: ผู้ใช้ใหม่ 2 คน tip กัน
   พร้อมกัน, `ensure_wallet` insert เรียงผิด order) → แก้ (`5096ecb3`).
7. **User สั่งรันจริง (verify ด้วยการ execute ไม่ใช่แค่อ่าน)** — ปฏิเสธ paid cloud branch. หาทางฟรี:
   ไม่มี Supabase CLI / Docker daemon พัง. → **ลง Docker Desktop ใหม่บน `G:\Docker\`** (ตัวแอป +
   WSL2 data disk อยู่บน G: หมด, กัน C: เต็ม — C: เหลือ 30.8GB). ต้อง admin elevation (Boss รันเอง;
   ผมคลิก UAC ไม่ได้) + gotcha: installer ต้องมี verb `install` นำหน้า flags (ไม่งั้น "Unknown command").
8. **supabase start local → เจอ migration history ขาด 2 ชิ้น** (นี่คือ payoff ของการรันจริง — static
   review มองไม่เห็น):
   - ADR-14 baseline (profiles/gid_counters/handle_new_user/alloc_cohort_seq) — สร้างตรงบน live gstore
     ก่อนมี migrations/ folder → fresh `supabase start` พังที่ `alloc_cohort_seq does not exist`.
   - Supabase **platform default privileges** (ALTER DEFAULT PRIVILEGES ให้ anon/authenticated) —
     platform bootstrap ตอนสร้าง project, ไม่เคยถูก capture → `permission denied for table profiles`.
   → **reconstruct ทั้ง 2 ผ่าน read-only introspection บน live gstore** (Boss อนุญาต read; **ไม่มี
   write ลง production**). ต้อง trim `supabase_admin`-scoped ALTER DEFAULT PRIVILEGES (local postgres
   role ไม่มีสิทธิ์). analytics service ต้อง `enabled=false` + `--ignore-health-check` (storage/studio
   unhealthy บน Windows แต่ DB ใช้ได้).
9. **pgTAP → เจอ test-authoring bug 6 จุด** (ไม่ใช่บั๊ก migration — RPC ทำงานถูกหมด):
   - `throws_ok(sql, desc)` 2-arg → pgTAP ตีความ arg2 เป็น **expected error message** ไม่ใช่ desc →
     ไม่ match error จริง (ที่ถูกต้อง) ของ RPC. ต้องเป็น `throws_ok(sql, null, null, desc)`.
   - อ่านตาราง RLS-protected (redeem_codes ไม่มี SELECT policy เลย, wallet_ledger own-read) ขณะยัง
     `role authenticated` ผิดคน → ต้อง `reset role` ก่อนอ่าน (แบบ DB-08).
   - `sum(amount)` เป็น `numeric` เทียบ `bigint` → ต้อง `::bigint`.
   → แก้ครบ → **69/69 ผ่าน** (`a90da645`).
10. **ลอง real dev branch → โดน block: branching = Pro plan เท่านั้น** (gstore = free). ไม่มีการ
    สร้าง branch / ไม่มีค่าใช้จ่าย (reject ตั้งแต่ plan check). User เลือก **"พอแล้ว local test คุ้มแล้ว"**.

## สิ่งที่ทำ (grouped + commit)
- **เก็บกวาด** — dev.bat/failures.jsonl (git checkout), tmp-power-radial-check.html (rm). uncommitted→clean.
- **`docs/change request/CR-008-login-hardening.md`** — WP-3 nonce design section. `f675fabb`.
- **`docs/change request/CR-003-account-phase1-wallet-billing.md`** — v0.3.0 ADR-16 reconcile
  (§0 + schema/RLS/RPC rewrite + US-16..21 + DB-09..13 + sequencing). status→Approved. `3e7bda87`.
- **`supabase/migrations/20260711120000_cr003_wallet_billing.sql`** — schema+RLS+RPC ครบ (ensure_wallet
  safety net, free-item guard, dual-row lock ordered tip, shard expiry on tip, cap-before-lock fixes). `5096ecb3` + fixes.
- **`supabase/functions/{topup-create,payment-webhook,match-share-submit,pack-download}/`** — 4 Edge Fn
  (pure-logic split + tests). `5096ecb3`.
- **`src/src/{wallet.ts,StorePage,WalletTab,TopupModal,InventoryTab,LedgerTab,MatchShareCard}.tsx`** +
  styles.css. `5096ecb3`.
- **`supabase/tests/cr003_wallet_billing.sql`** — 63 pgTAP (DB-01..13) + 6 test-bug fixes. `5096ecb3`/`a90da645`.
- **`supabase/migrations/20260702000000_platform_default_privileges.sql`** (ใหม่) +
  **`20260704000000_adr14_gid_account_identity.sql`** (ใหม่) — reconstructed missing history. `a90da645`.
- **`supabase/config.toml` + `.gitignore`** — `supabase init` scaffolding (analytics disabled). `a90da645`.

## Verify (gate ที่รันจริง)
| Gate | ผล |
| --- | --- |
| `npx tsc --noEmit` (src/) | ✅ clean |
| `deno check` ×4 Edge Fn index.ts | ✅ clean |
| `deno test` topup-create + payment-webhook | ✅ 19/19 |
| **pgTAP `supabase test db --local`** (local Postgres จริง) | ✅ **69/69** (cr003 63 + sec001 6) |
| Opus adversarial review (2 passes) | เจอ+แก้ 6+1 บั๊ก, pass ท้าย |

**ไม่ได้รัน:** cargo test/clippy (ไม่แตะ Rust src-tauri), vitest, live get_advisors (ไม่ได้แตะ live schema),
real cloud dev branch (blocked-by-plan).

## Key numbers
- 69/69 pgTAP ผ่านบน local Postgres 17.6.1.143 (Supabase CLI 2.109.1, Docker 29.6.1).
- migration chain 4 ตัว apply เรียงถูก, benign NOTICE เดียว (own_profile_insert drop skip).
- Opus gate: 6 บั๊กรอบแรก + 1 บั๊กที่ fix สร้าง = 7 บั๊กจริงที่ mechanical checks (tsc/deno เขียว) มองไม่เห็น.

## Artifacts / live actions
- **Live gstore (read-only เท่านั้น, Boss อนุญาต):** introspection `pg_get_functiondef` /
  `pg_default_acl` / `list_tables` / policies — เพื่อ reconstruct migration ที่ขาด. **ไม่มี write,
  ไม่มี migration apply, ไม่มี Edge Fn deploy ลง production.**
- **Cloud dev branch:** ลองสร้าง → reject (Pro-only) → ไม่มีอะไรถูกสร้าง, ไม่มีค่าใช้จ่าย.
- **Local infra (เครื่อง Boss, ไม่ใช่ repo):** Docker Desktop ลงใหม่ที่ `G:\Docker\` (app + WSL2 data).
  installer ที่ `G:\Installers\Docker Desktop Installer.exe`. Supabase local volume ยังค้างใน docker
  (stop แล้ว, ข้อมูล backup ใน volume `com.supabase.cli.project=G-Maiden`).

## State ปลาย turn
- branch `main`, **ahead origin/main 4 commits** (`f675fabb`, `3e7bda87`, `5096ecb3`, `a90da645`) — **ยังไม่ push**.
- working tree clean ยกเว้น `orchestration/src-tauri/Cargo.toml` (M) = **CRLF flicker, diff ว่าง** — ปล่อยได้.
- **ทั้ง 4 commit ยังไม่ tag/release** (ถูกต้องตาม batching policy).

## Pending / deferred (honest)
- **Edge Fn ยัง deploy ไม่ได้ / migration ยัง apply live ไม่ได้** — Omise API field names ยังไม่ยืนยันกับ
  docs จริง (sandbox-only), shard-scoring formula = placeholder รอ balancing, signup-trigger welcome-grant
  ยังเป็น TODO (ensure_wallet เป็น safety net).
- **`MatchShareCard.matchId`** ยังเป็น prop เปล่า — ไม่มี "last local match id" source ใน `src/src/live/`.
- **CR-003 ยังไม่ push** — รอ Boss สั่ง.
- **DB-05/DB-12 concurrency** = sequential-only (พิสูจน์ logical guard, ไม่ใช่ true race). ต้อง 2-psql harness.
- **AGENTS.md drift:** Repository Layout (บรรทัด 32-88) **ไม่ list `supabase/`** เลย ทั้งที่ dir นี้ tracked
  มาตั้งแต่ SEC-001 (merged) และ session นี้ขยายเยอะ (migrations/ + functions/ + tests/). = tracked-but-
  undocumented. **ยังไม่แก้** (user ไม่ได้สั่ง) — จดไว้ให้ session หน้า.
