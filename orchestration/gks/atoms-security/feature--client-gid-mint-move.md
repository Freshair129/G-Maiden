---
id: feature--client-gid-mint-move
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H1
role: coder
status: todo
---

# FEATURE: Client: stop writing gid_code / email; call mint-gid [L2-Feature] feature--client-gid-mint-move

**Phase:** P1 · **Tier:** H1 · **Type:** feature · **Est:** 1 · **MoSCoW:** must

### Description
profile.ts: delete the client-side `update profiles set gid_code` (the .is('gid_code',null) block); instead invoke the mint-gid function when gid_code is empty, then read it back. auth.ts linkProfile: switch `.upsert({id,email,steamid64,account_id})` to `.update({steamid64,account_id}).eq('id',userId)` (row pre-exists via trigger; email is set server-side). Doc: SEC-001 §2 Phase B step 3. Code: src/src/profile.ts + src/src/auth.ts.

### Acceptance (DoD)
npx tsc --noEmit + vitest pass; a fresh Google sign-in still yields a persisted G-F… GID; no client code writes generation/gid_code/cohort_seq/email anymore (grep proves it).

### Depends on
[[feature--ef-mint-gid]]
