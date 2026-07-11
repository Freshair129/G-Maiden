# CR-008: Login system — ทำให้ sign-in ใช้งานได้จริงและปลอดภัย

**Status:** PLAN — รอ Boss approve ก่อนลงมือ (R4: C-2, risk HIGH เพราะแตะ auth + secret storage)
**Author:** Claude (spec) — Boss (approver)
**Date:** 2026-07-10
**Predecessor:** ADR-14 (GID/account), SEC-001 (identity hardening, merged `00f2fc11`),
`docs/design-system/08-account-gid.md` (UX spec), audit `2026-07-07-independent-full-audit.md`
**Related:** CR-005 (landing + multi-provider auth + G-Social) — ยัง DRAFT, ทับซ้อนบางส่วน (ดู §6)

---

## 1. สถานะจริงวันนี้ (ตรวจจากโค้ด ไม่ใช่จากเอกสาร)

โค้ด auth **เขียนครบแล้ว** และถูกต้องตามสถาปัตยกรรม (PKCE, loopback callback, column-locked profiles)
แต่ **ใช้งานจริงไม่ได้ใน build ที่ผู้ใช้ได้รับ** และมีช่องความปลอดภัยที่ต้องปิดก่อนเปิดใช้จริง

| ชิ้น | สถานะ | หลักฐาน |
| --- | --- | --- |
| Google OAuth PKCE flow | โค้ดครบ | `src/src/auth.ts` `signInWithGoogle` → `open_url` → browser |
| Loopback callback | ทำงาน | `gsi.rs:358` `.route("/auth/callback", get(oauth_callback))` → emit `oauth-callback` |
| Supabase client | ตั้งค่าถูก (`flowType: "pkce"`, `detectSessionInUrl: false`) | `src/src/supabase.ts` |
| `profiles` RLS + GID mint | **ปิดสนิทแล้ว** (verified live) | SEC-001 §2 Phase B |
| **CSP** | 🔴 **บล็อก Supabase ทั้งหมด** | `tauri.conf.json:46` `connect-src 'self' http://localhost:* ws://localhost:* https://api.opendota.com` — ไม่มี `https://wsseitulmcgnolgsrxgh.supabase.co` |
| **Refresh token** | 🔴 เก็บ plaintext ใน WebView2 localStorage | `persistSession: true` ไม่มี encrypted storage adapter |
| **Anthropic API key** | 🔴 อยู่ใน settings blob ใน localStorage | `App.tsx` (audit §Secrets) |
| **`/auth/callback` state** | 🟠 ไม่ verify `state` | `gsi.rs:287-297` รับ `code` อะไรก็ได้แล้ว exchange ทันที |

### 1.1 ทำไม sign-in พังทั้งที่โค้ดถูก

`exchangeCodeForSession()` ต้อง `POST https://<project>.supabase.co/auth/v1/token` แต่ CSP `connect-src`
ไม่มี origin นั้น → WebView2 บล็อก → sign-in ค้างที่ "รอการยืนยัน" ตลอดกาล
เช่นเดียวกับ `linkProfile()` (`profiles` update) และ `getSession()` refresh

**นี่คือ blocker เดียวที่กั้นระหว่าง "โค้ดพร้อม" กับ "ใช้ได้"** — แก้บรรทัดเดียว แต่ต้อง verify บน
packaged build ไม่ใช่ dev (Tauri inject CSP ต่างกัน)

---

## 2. Work packages

### WP-1 — ปลดล็อก sign-in (blocker, เล็ก)
- `tauri.conf.json` `security.csp` → เพิ่ม `https://wsseitulmcgnolgsrxgh.supabase.co` ใน `connect-src`
  (และ `wss://` ถ้าจะใช้ realtime ในอนาคต — **ยังไม่ใส่จนกว่าจะใช้จริง**)
- ตรวจว่าต้องเพิ่ม Steam/OpenDota origin เพิ่มไหม (`api.opendota.com` มีแล้ว; audit ระบุ "Steam origins" ด้วย
  — ยืนยันว่า `resolve_steam_id` ยิงจาก **Rust** ไม่ใช่ webview → ไม่ต้องแตะ CSP)
- **Verify บน artifact จริง** (`pnpm tauri build` → รัน exe → sign-in ให้จบ flow) ไม่ใช่ `tauri dev`
- Acceptance: กด Sign in → browser เปิด → อนุญาต → กลับมาแอปแล้วเห็นชื่อ + GID ภายใน 5 วินาที

### WP-2 — เก็บ secret ให้ถูกที่ (HIGH, ต้องทำก่อนเปิดใช้จริง)
Refresh token ใน localStorage = **ยึดบัญชี GID ได้เต็ม** ถ้ามีมัลแวร์/สคริปต์อ่าน WebView2 leveldb
API key ของ Anthropic = ขโมยเครดิตได้

- เขียน **encrypted storage adapter** ให้ supabase-js (`auth.storage`) ที่วิ่งผ่าน Tauri command →
  Rust ฝั่ง เก็บด้วย **Windows DPAPI** (`CryptProtectData`, ผูกกับ user account) หรือ
  `tauri-plugin-stronghold`
  - เลือก DPAPI: dependency น้อยกว่า, ไม่ต้องให้ผู้ใช้ตั้ง passphrase, พอสำหรับ threat model
    (มัลแวร์ที่รันเป็น user เดียวกันยัง decrypt ได้ — แต่ยกระดับจาก "อ่านไฟล์เฉย ๆ" เป็น "ต้องรันโค้ด")
- ย้าย Anthropic API key ออกจาก settings blob → ที่เก็บเดียวกัน
- migration: อ่านค่าเก่าจาก localStorage ครั้งเดียว → เขียนที่ใหม่ → **ลบของเก่า**
- Acceptance: grep WebView2 leveldb แล้วไม่พบ refresh token / API key

### WP-3 — ปิดช่อง `/auth/callback` (MEDIUM)
`:3000` ไม่มี auth และ handler รับ `code` อะไรก็ได้ → โปรเซสในเครื่อง (หรือหน้าเว็
---

## Implementation status

- **WP-1 (CSP unblock sign-in)** — ✅ DONE (session 2026-07-10; Supabase origin ใน `connect-src`, login เปิดใช้จริง).
- **WP-2 (secret encryption / DPAPI)** — ✅ IMPLEMENTED 2026-07-11, **Opus adversarial gate PASS** (design-review + final code-gate). CI-parity ครบเขียว (cargo test 169/0 · clippy `-D warnings` · tsc · eslint · vitest 148/148).
  - Rust: `src-tauri/src/secret.rs` (DPAPI per-file store `app_local_data_dir()/secrets/<name>.bin`, `WRITE_LOCK` + atomic same-dir temp-rename, `validate_name`, `secret_set/get/delete` + `load_secret`); `runtime.rs` แยก mode/secret (`set_master_mode` / `set_master_api_key` / `master_api_key_present`); startup โหลด `anthropic_api_key` จาก DPAPI. Cargo features `Win32_Security_Cryptography` + `Win32_System_Memory`.
  - Frontend: `src/src/secureStorage.ts` (supabase-js `auth.storage` adapter — DPAPI ใต้ Tauri, localStorage fallback ใน browser dev); `App.tsx` ลบ `masterApiKey` ออกจาก settings blob + UI "key saved / พิมพ์เพื่อแทนที่" (คีย์ไม่กลับเข้า webview) + one-time migration ที่ scrub plaintext เฉพาะหลังยืนยัน DPAPI write (no silent loss).
  - **DoD reconciliation (gate WARN):** "grep leveldb ไม่พบ token/key" เป็นจริงสำหรับ *live* localStorage entry และ fresh installs ทันที. WebView2 localStorage เป็น log-structured leveldb → **หลัง upgrade-migration ค่า plaintext เก่าอาจค้างใน `.log`/`.ldb` segment จนกว่า Chromium จะ compact** (เป็นข้อจำกัดโดยธรรมชาติของการ migrate ออกจาก localStorage, แก้จาก JS ไม่ได้). ความลับใหม่ไม่แตะ localStorage เลย. ถือ DoD = "ไม่มี live localStorage entry" แทน raw-disk grep.
- **WP-3 (`/auth/callback` hardening, MEDIUM)** — ✅ IMPLEMENTED 2026-07-11, **Opus security gate PASS**.
  `:3000/auth/callback` ไม่มี auth → เดิมแลก `?code=` อะไรก็ได้ทันที (drive-by page ยิง
  `<img src=".../auth/callback?code=ATTACKER">` → session fixation). แก้ด้วย **pending-gate**: แอปเรียก
  `oauth_begin` ตั้งธง (single-use + timeout 10 นาที, `runtime::set_oauth_pending`) ก่อนเปิด browser เท่านั้น;
  callback จะ emit `oauth-callback` ต่อเมื่อ `take_oauth_pending()` จริงเท่านั้น มิฉะนั้น emit `oauth-error`.
  **ไม่แตะ OAuth redirect URL** (คงตรงกับ Supabase allowlist — ไม่เสี่ยงพัง login ที่เพิ่งใช้ได้). residual
  window ที่เหลือถูก PKCE (`exchangeCodeForSession` bind กับ local `code_verifier`) กันอีกชั้น. ไฟล์:
  `runtime.rs` (gate + Release/Acquire), `gsi.rs oauth_callback`, `main.rs oauth_begin`, `auth.ts`.

### WP-3 optional hardening — per-flow nonce (design only, NOT implemented — 2026-07-11)

**Status: design-only.** Not scheduled for implementation until Boss is doing a live sign-in
verification pass anyway (see risk in §3 below). This section exists so the design doesn't have
to be re-derived next time it comes up.

**1. What it would actually buy.** The current gate is a single global flag: "a sign-in this app
started is in flight, within the last 10 minutes." A per-flow nonce would instead bind each
`oauth_begin` call to a specific callback, so two overlapping sign-in attempts (double-click
"Sign in", or a stale browser tab from a previous attempt) can't cross-consume each other's gate
slot. **But** `exchangeCodeForSession()` already fails closed in that scenario: PKCE ties the
`code` to a `code_verifier` supabase-js stored locally for *that specific* `signInWithOAuth` call,
so even if the wrong pending flag were consumed, the exchange itself would reject a mismatched
code with `invalid_grant`. Net effect: a nonce closes a race condition that already fails safe,
not a real account-takeover path. This is why it's optional, not required.

**2. Why it's not a redirect-URL edit.** Standard OAuth2 CSRF protection uses a `state` query
param that round-trips through the provider back to the redirect URI — it does **not** require
changing the redirect URI itself. But `supabase-js`'s `signInWithOAuth()` doesn't expose a
pass-through `state` param that survives to the final `redirectTo` callback (its `queryParams`
option only affects the *provider's* authorization request, e.g. Google's `prompt`/`access_type`).
The only way to smuggle app-level correlation data to our own `:3000/auth/callback` is to append
it directly onto `redirectTo` itself, e.g. `http://127.0.0.1:3000/auth/callback?flow=<nonce>`.

**3. The actual risk.** Supabase's Auth redirect-URL allowlist is registered as the exact string
`http://127.0.0.1:3000/auth/callback` (no wildcard). Two unknowns, neither answerable from code:
   - Does Supabase's allowlist check match on the full string (query included) or origin+path
     only? If it's a full-string match, `?flow=...` gets **rejected before the browser even opens**
     — silent, total login breakage.
   - Does Supabase preserve a custom query param already present in `redirectTo` when it appends
     its own `?code=...` on the way back, or does it discard/overwrite the query string entirely?
   Neither can be resolved by reading code — it's Supabase server-side behavior, and the only way
   to know is to test a real `signInWithOAuth` round-trip, i.e. Boss's Google sign-in.

**4. If/when this gets implemented:**
   - Convert the Supabase allowlist entry to a wildcard (`http://127.0.0.1:3000/auth/callback*`
     if Supabase's dashboard supports it) or add a second explicit allowlist entry, **on a
     Supabase dev branch first** (the pre-scale gate already on the backlog mentions creating one
     — reuse it, don't test against the production `gstore` project's live allowlist).
   - Rust: replace the single `OAUTH_PENDING` bool with a small in-memory map
     `HashMap<String /* nonce */, u64 /* since_ms */>`, capped size + same 10-min TTL, generated in
     `oauth_begin` and returned to the frontend.
   - Frontend: append `?flow=<nonce>` to `OAUTH_REDIRECT` per call; `oauth_callback` reads the
     `flow` query param and matches it against the map instead of a single flag.
   - Acceptance gate (in addition to the usual CI-parity): a real `signInWithGoogle()` round-trip
     on a packaged build reaching a session — this is the one auth change in this project that
     cannot be Opus/code-reviewed to "done," only human-verified.
   - If the allowlist/query-preservation assumption turns out false, fall back cleanly to the
     current global single-slot gate — it already fails safe, so there's no regression to guard
     against, only a wasted implementation attempt.
