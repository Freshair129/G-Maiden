---
id: feature--ef-mint-gid
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Edge Fn mint-gid — server-authoritative GID (reuses gid.ts) [L2-Feature] feature--ef-mint-gid

**Phase:** P1 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
supabase/functions/mint-gid/index.ts: JWT auth, load the caller's profile (generation, cohort_seq, created_at), import the SAME src/src/gid.ts codec (generateGid) so the algorithm stays single-sourced per ADR-14, and UPDATE profiles SET gid_code=... WHERE id=auth.uid() AND gid_code IS NULL via service_role. Idempotent (null-guard). TDD self-contained: mint-gid.test.ts FIRST — mints once, second call is a no-op, missing seq -> error. Doc: SEC-001 §2 Phase B step 1. Code: supabase/functions/mint-gid/index.ts.

### Acceptance (DoD)
deno test green (tests first); minting works with the profiles UPDATE(gid_code) grant revoked from the client; output GID byte-identical to gid.ts for the same source fields.

### Depends on
[[config--migration-identity-hardening-part-a]]
