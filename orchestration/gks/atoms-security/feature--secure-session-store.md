---
id: feature--secure-session-store
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Encrypted Supabase session storage adapter (F5) [L2-Feature] feature--secure-session-store

**Phase:** P2 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** should

### Description
src/src/secureStore.ts: a Supabase auth `storage` adapter backed by an encrypted Tauri store (tauri-plugin-store + OS DPAPI, or Stronghold), replacing plaintext WebView2 localStorage for the session. Wire into supabase.ts `auth.storage`. Graceful fallback to memory when not under Tauri (browser dev). Doc: SEC-001 §2 Phase C. Code: src/src/secureStore.ts + src/src/supabase.ts.

### Acceptance (DoD)
eval--vitest-secure-session-store GREEN; after sign-in, the WebView2 localStorage holds no JWT/refresh token; session survives app restart.

### Depends on
[[eval--vitest-secure-session-store]]
