---
id: config--auth-leaked-password
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H0
role: worker
status: todo
---

# CONFIG: Enable leaked-password protection (F8) [L1-Policy] config--auth-leaked-password

**Phase:** P0 · **Tier:** H0 · **Type:** config · **Est:** 1 · **MoSCoW:** should · ⛔ requiresConfirm

### Description
Auth config toggle (not SQL): Dashboard/API -> Auth -> Password -> enable HaveIBeenPwned check. Near-N/A today (Google-OAuth only) but free and future-proofs any email path. Doc: SEC-001 F8. Code: none (config).

### Acceptance (DoD)
get_advisors(security) no longer returns auth_leaked_password_protection.

### Depends on
(none)
