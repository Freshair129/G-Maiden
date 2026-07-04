---
id: guard--traceability-lint
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# GUARD: Doc<->Code traceability lint (pure scan) [L3-Logic] guard--traceability-lint

**Phase:** P0 · **Tier:** H1 · **Type:** guard · **Est:** 1 · **MoSCoW:** should

### Description
Write scripts/trace-lint.mjs. Pure core: `missingDocHeaders(files: {path,firstLines}[]): string[]` — returns paths whose first 5 lines lack a `Doc:` marker referencing docs/. CLI wrapper scans a hard-coded glob list (src/src/wallet/**, supabase/**). TDD: write scripts/trace-lint.test.mjs FIRST (node --test), 3 cases: header present / absent / non-listed file ignored. Doc: MASTERPLAN §Rules. Code: scripts/trace-lint.mjs.

### Acceptance (DoD)
node --test scripts/trace-lint.test.mjs green (written before impl); running the CLI on a file without the header exits 1 and prints the path.

### Depends on
[[config--local-first-micro-role]]
