---
id: eval--pgtap-identity-lock
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: pgTAP: identity columns unforgeable (F1) — RED first [L3-Storage] eval--pgtap-identity-lock

**Phase:** P0 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** must

### Description
Write supabase/tests/sec001_identity_lock.sql BEFORE the Part B migration (must be RED on today's schema): as an authenticated user, UPDATE own profiles SET generation='B' -> must be denied; SET gid_code='G-FFAKE' -> denied; SET role='admin' (after role exists) -> denied; SET display_name='ok' -> allowed. Proves F1 is closed. Doc: SEC-001 §3. Code: supabase/tests/sec001_identity_lock.sql.

### Acceptance (DoD)
File runs; the deny-assertions FAIL on the current schema (proving the hole is real) and PASS after config--migration-identity-hardening Part B.

### Depends on
(none)
