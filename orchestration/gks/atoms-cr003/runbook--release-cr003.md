---
id: runbook--release-cr003
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: worker
status: todo
---

# RUNBOOK: Release CR-003 (batching rule + gates checklist) [L2-Process] runbook--release-cr003

**Phase:** P5 · **Tier:** H1 · **Type:** runbook · **Est:** 1 · **MoSCoW:** must

### Description
Release checklist per the repo release workflow: all gates green (pgTAP, deno, vitest, e2e, no-scroll), migrations applied to prod gstore, Edge Fns deployed, flag OFF, then version bump + tag per CLAUDE.md batching policy (only when Boss asks). Doc: CLAUDE.md Release & update workflow. Code: docs/operations/.

### Acceptance (DoD)
Checklist doc exists; dry-run walkthrough completed once with every gate's actual command recorded.

### Depends on
[[eval--e2e-golden-path]], [[eval--e2e-billing-edge]], [[config--feature-flag-wallet]], [[audit--pdpa-deletion]], [[guard--e2e-no-scroll]]
