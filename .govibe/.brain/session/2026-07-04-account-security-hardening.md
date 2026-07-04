# Session — 2026-07-04 · Account MVP design + SEC-001 auth hardening (deployed live) + /end-session skill

**Entry point:** user ขอออกแบบระบบ account (GID) เฟสแรก (wallet/inventory/history/
billing PromptPay+TrueMoney) → ระหว่างทาง pivot ไป "เอา login+auth+security ให้แน่น
ก่อน" → จบที่ deploy SEC-001 hardening ขึ้น live gstore + merge PR #6. Branch งาน =
`feat/voice-pack-inventory` (merged เข้า main แล้ว).

## Arc (ทำอะไร ทำไม)

1. **ออกแบบ CR-003 account เฟสแรก** — wallet + ledger + billing (PromptPay/TrueMoney
   ผ่าน **Opn/Omise** เจ้าเดียวได้ 2 ช่องทาง) + store (แทนหน้า Voice Packs ที่ยิง
   `/api/*` :4577 ค้าง — Supabase คือ backend นั้น) + inventory + history. ตัดสินใจหลัก:
   **G-Coins closed-loop** (ไม่คืน/ถอน/โอน → เลี่ยง e-money license ธปท.), เงินทุก path
   ทำฝั่ง server (RLS read-only client + SECURITY DEFINER RPC), ledger = source of truth.
2. **user เพิ่มข้อกำหนด UI:** desktop-first แบบ Steam, **ห้าม page-scroll** — ล้นให้เพิ่ม
   tab ไม่ใช่เลื่อน. เขียนเป็น §3.0 no-scroll policy + pure fn `rowsThatFit` + e2e gate.
   ตอบเทรดออฟ: ไม่มี landing page = เสีย SEO/share-link ตอน marketplace (เก็บไว้ทีหลัง),
   "ห้าม scroll" ต้องนิยาม = ห้าม scroll **ระดับหน้า** (ข้อมูลโตใช้ pagination ในกรอบ),
   ผูก baseline 1280×800 + DPI 100/125/150, เพดาน 7 tabs.
3. **แตกงานด้วย G-Orchestra จริง** — สร้าง Genesis block `atoms.cr003.json` (51 atoms,
   8 waves) + MASTERPLAN. แก้ `gks/compile.mjs` ให้รับ argv block file → emit
   `backlog.<suffix>.json` + `atoms-<suffix>/` แยกจาก gorch เดิม. Pipeline ตามที่ user สั่ง:
   local-LLM micro lane (engineType:"micro") → Verify Gate (frontier) → Lead → Boss.
4. **pivot → SEC-001 (login+auth+security):** ตรวจ **live gstore จริง** ผ่าน Supabase MCP
   (pg_policy, role grants, function defs, get_advisors) → เจอ **F1 High: ปลอม Founder GID
   / self-admin** ได้เพราะ `own_profile_update` row-scoped แต่ **ไม่ column-scoped** +
   authenticated มี table-wide UPDATE. + F2-F8. เขียน SEC-001 audit + migration + security atoms.
5. **user สั่ง deploy MVP** (เลื่อน pgTAP+advisor dev-branch ไป pre-public) → **ยิงขึ้น live
   gstore จริง** (ได้รับอนุญาต): Part A → Part B → mint-gid EF. **เจอกับดัก PUBLIC** (ดู Verify).
6. **สร้าง `/end-session` skill** แบบ GenesisBlockDB แต่ปรับ path ให้ตรง G-Maiden.
7. **commit 3 ก้อน → PR #6 → CI pass → merge** (user สั่ง create-pr แล้ว merge).

## สิ่งที่ทำ

### SEC-001 — auth/identity hardening (commit `00f2fc11`, **APPLIED LIVE**)
- **live gstore migrations applied** (irreversible-ish, บันทึกไว้ชัด):
  - Part A: `revoke execute … from public,anon,authenticated` (alloc_cohort_seq,
    handle_new_user), revoke gid_counters/anon-profiles grants, pin touch_updated_at path.
  - Part B: `revoke insert,update on profiles from authenticated` + drop own_profile_insert
    + `grant update(display_name,steamid64,account_id)` + add locked `role` column.
- **mint-gid Edge Fn deployed** (ACTIVE v1, verify_jwt=true) — server-authoritative GID,
  reuse `gid.ts` ผ่าน synced copy `supabase/functions/_shared/gid.ts` (single-source ADR-14).
  pure `decideMint()` + IO wiring แยก. `supabase/tests/sec001_identity_lock.sql` (pgTAP RED-first).
- client: `profile.ts` เลิก mint gid_code ฝั่ง client → invoke mint-gid; `auth.ts` linkProfile
  update เฉพาะ steam link (ไม่ upsert/email).
- docs: `docs/audits/SEC-001-auth-identity-hardening.md` (8 findings + fix 3 phase + verify).
- orchestra: `atoms.security.json` (11 atoms) → backlog.security.json + atoms-security/.

### CR-003 account design (commit `851fbf44`, docs only)
- `docs/change request/CR-003-account-phase1-wallet-billing.md` (schema 11 ตาราง, RLS, RPC
  atomic, UX 4 tab+Store, 15 user stories, E2E 3 ชั้น, §3.0 no-scroll).
- `docs/product/MASTERPLAN-account-phase1.md` · `atoms.cr003.json` (51 atoms) + backlog.
- `orchestration/gks/compile.mjs` — argv block-file support (ใช้ทั้ง cr003 + security).

### /end-session skill (commit `eae00fdd`)
- `.claude/skills/end-session/SKILL.md` (⚠️ `.claude` gitignored → local only) +
  `.agents/skills/end-session/SKILL.md` (ตัว track). ปรับ path เป็น `.govibe/.brain/` +
  auto-memory, ห้าม bump version/tag ตอน end-session.

## Verify (gate ที่รันจริง)

| Gate | ผล |
|------|-----|
| `tsc --noEmit` (src) | ✅ clean หลังแก้ auth.ts/profile.ts |
| `vitest` gid | ✅ 20/20 |
| `pnpm -C src lint` (ESLint) | ✅ 0 errors (เหลือ warnings เดิม) |
| `deno test mint-gid/mint.test.ts` | ✅ **6/6** (พิสูจน์ _shared/gid.ts Deno copy runtime ถูก) |
| **live grant verify** (SQL) | ✅ authed UPDATE = `{account_id,display_name,steamid64}` เท่านั้น · `forgeable_cols_remaining = 0` |
| **live get_advisors** หลัง Part A | ✅ F2/F3/F4/F7 หาย (เหลือ gid_counters 0008=INFO + F8 leaked-pw=dashboard) |
| PR #6 CI | ✅ pass 6m28s → merged (sha `72162e66`) |
| pgTAP sec001_identity_lock | ⏳ **DEFERRED** → pre-public (ต้อง dev branch) |

**กับดักที่เจอ:** Postgres ให้ `EXECUTE` กับ **PUBLIC** เป็น default → `revoke from
anon,authenticated` เฉย ๆ เป็น **no-op** (ยืนยันด้วย `has_function_privilege` = ยัง true)
ต้อง `revoke … from public` ด้วย ถึงปิดได้จริง. อย่าเชื่อ revoke จนกว่าจะ re-verify.

## Key numbers
- F1 ปิด: `forgeable_cols_remaining = 0` (generation/gid_code/cohort_seq/role/email/id ล็อก).
- CR-003 = 51 atoms/8 waves · SEC-001 = 11 atoms/5 waves. deno 6/6, vitest 20/20.

## Artifacts + live actions
- **LIVE (irreversible-ish) บน gstore ref `wsseitulmcgnolgsrxgh`:** 3 migrations (part_a,
  part_a_public_revoke, part_b) + mint-gid Edge Fn v1.
- ไฟล์: ดู 3 commit ข้างบน. PR #6 merged → main tip `72162e66`.

## State ปลาย turn
- Branch: **main** (PR #6 merged, `feat/voice-pack-inventory` ลบแล้ว). local main sync.
- Working tree: `src-tauri/Cargo.toml` M แต่ diff ว่าง (CRLF phantom — ทิ้งได้). + brain files
  ที่เพิ่งเขียน turn นี้ (ยังไม่ commit — /end-session ไม่ได้สั่ง commit).
- **ยังไม่ถึง user:** main ไม่ทริกเกอร์ updater — client changes จะถึง user เมื่อ tag release.

## Pending / deferred (ดู todo-next.md + auto-memory)
1. **Cut app release** (bump 3 จุด + CHANGELOG + tag) เพื่อส่ง client changes ถึง user —
   ปิด self-healing window (v0.8.0 ที่ติดตั้งอยู่: signup ใหม่เห็น GID ว่างชั่วคราว).
2. **pre-public/pre-scale:** รัน pgTAP `sec001_identity_lock.sql` + full get_advisors บน dev branch.
3. F8 leaked-password dashboard toggle. Omise onboarding (ทะเบียน+TrueMoney) ก่อนเปิด billing.
4. CR-003 implement (ยังเป็น design) — เดินตาม waves ใน MASTERPLAN.
