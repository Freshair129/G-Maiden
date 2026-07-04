---
id: feature--pack-install-wire
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Install pipeline: signed URL -> POST /announcer/install -> activate [L2-Feature] feature--pack-install-wire

**Phase:** P5 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
Wire Inventory's ติดตั้ง/ใช้งาน: packDownloadUrl() -> download bundle -> POST /announcer/install on the existing :3000 GSI endpoint (same pipeline as G-AnnStudio) -> activate via the existing active-pack mechanism (voice_api.rs). Handle download failure + resume. Doc: CR-003 §3.4, US-10. Code: src/src/wallet/InventoryTab.tsx + src-tauri (only if a command is missing).

### Acceptance (DoD)
US-10 end-to-end: purchased pack lands in voice-cache/packs/<id>/ with manifest, becomes ACTIVE, and the next fired event voices from it (audio::play_random order per AGENTS/CLAUDE contract).

### Depends on
[[feature--ef-pack-download]], [[feature--inventory-tab]]
