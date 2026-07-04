---
id: eval--pgtap-redeem
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: pgTAP: redeem_code rules (DB-07) — RED first [L3-Logic] eval--pgtap-redeem

**Phase:** P1 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** should

### Description
Write supabase/tests/cr003_redeem.sql BEFORE redeem_code exists: same-user re-redeem rejected (PK), over max_uses rejected, expired rejected, used_count accurate under two concurrent redemptions of a max_uses=1 code. Doc: CR-003 §5.2. Code: supabase/tests/cr003_redeem.sql.

### Acceptance (DoD)
File runs red and encodes DB-07 as pgTAP assertions.

### Depends on
[[config--sql-migration-ops]]
