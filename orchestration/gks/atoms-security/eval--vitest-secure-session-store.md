---
id: eval--vitest-secure-session-store
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: Vitest: encrypted session storage adapter (F5) — RED first [L2-Feature] eval--vitest-secure-session-store

**Phase:** P2 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** should

### Description
Write src/src/__tests__/secure-store.test.ts BEFORE the adapter: getItem/setItem/removeItem round-trip through a mocked Tauri encrypted store; asserts nothing is written to window.localStorage. Doc: SEC-001 §2 Phase C (F5). Code: src/src/__tests__/secure-store.test.ts.

### Acceptance (DoD)
vitest red (adapter missing) with the no-localStorage assertion encoded.

### Depends on
(none)
