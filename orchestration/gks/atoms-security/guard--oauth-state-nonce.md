---
id: guard--oauth-state-nonce
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H1
role: coder
status: todo
---

# GUARD: Pure fn: OAuth state nonce verify (F6) [L3-Logic] guard--oauth-state-nonce

**Phase:** P2 · **Tier:** H1 · **Type:** guard · **Est:** 1 · **MoSCoW:** should

### Description
Pure core in src/src/oauthState.ts: `makeState(): string` (caller stores it) and `verifyState(expected: string|null, got: string|null): boolean` — true only when both present and equal; false on null/mismatch/reuse (caller clears expected after true). TDD: oauthState.test.ts FIRST, >=5 cases (match, mismatch, null expected, null got, empty). Wiring into auth.ts (attach state to signInWithOAuth, check on oauth-callback) is done in feature--secure-session-store's PR or a follow-up. Doc: SEC-001 F6. Code: src/src/oauthState.ts.

### Acceptance (DoD)
vitest green (tests first); function is pure (no crypto side effects beyond a passed RNG or a fixed test seed), no DOM/Tauri imports.

### Depends on
(none)
