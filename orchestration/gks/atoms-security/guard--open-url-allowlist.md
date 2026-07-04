---
id: guard--open-url-allowlist
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H1
role: coder
status: todo
---

# GUARD: open_url scheme/host allowlist (Rust) [L3-Logic] guard--open-url-allowlist

**Phase:** P2 · **Tier:** H1 · **Type:** guard · **Est:** 1 · **MoSCoW:** should

### Description
Harden src-tauri/src/main.rs open_url: only launch https:// URLs (reject file:/data:/custom schemes) so a crafted OAuth url can't shell out. Add a #[cfg(test)] unit test for the validator (accept https google/supabase host, reject file:// and non-url). Doc: SEC-001 §2 Phase C. Code: src-tauri/src/main.rs.

### Acceptance (DoD)
cargo test green incl. the new validator test; a non-https url is refused and logged; the real Google/Supabase auth url still opens.

### Depends on
(none)
