---
id: audit--pdpa-deletion
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: worker
status: todo
---

# AUDIT: PDPA/privacy audit vs ADR-14 reconciliation [L1-Policy] audit--pdpa-deletion

**Phase:** P5 · **Tier:** H1 · **Type:** audit · **Est:** 1 · **MoSCoW:** should

### Description
ATHER-style audit: verify the account layer still stores identity+transactions only (no card data, no match data), deletion flow works, ToS wording covers closed-loop non-refundable coins (CR-003 D1), and every table matches the CR-003 §7 table. Output: checklist appended to CR-003. Doc: CR-003 §7. Code: none (doc-only).

### Acceptance (DoD)
Checklist committed with evidence links (queries/screens); any DRIFT item has an owner + follow-up atom.

### Depends on
[[feature--deletion-request]]
