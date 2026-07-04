---
id: feature--store-page
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# FEATURE: Store page — paged catalog grid (replaces dead Voice Packs) [L2-Feature] feature--store-page

**Phase:** P4 · **Tier:** H1 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
src/src/wallet/StorePage.tsx per mockup §3, wired into the deck nav slot of the old Voice Packs page (which crashes on :4577 /api/*): fixed grid (page size from viewport, pager not scroll), card states buy/owned/insufficient(-> TopupModal with deficit)/signed-out('เข้าสู่ระบบเพื่อซื้อ'), 'ลองฟัง' preview via existing audio preview command, confirm sheet before purchase(). Doc: CR-003 §3.3. Code: src/src/wallet/StorePage.tsx.

### Acceptance (DoD)
Old /api/* fetches fully removed from the nav path; signed-out renders the full catalog; purchase flow green against seeded data; no overflow at baseline.

### Depends on
[[feature--account-tabs-shell]], [[feature--store-api]], [[algo--suggest-package]], [[algo--fmt-money]]
