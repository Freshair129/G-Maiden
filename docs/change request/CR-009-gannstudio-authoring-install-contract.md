# CR-009 — G-AnnStudio Authoring Pipeline + G-Maiden Install Contract

- **Status:** Implemented (G-Ann side, in the `G-Suite` repo) · live in-game verify pending (Boss)
- **Date:** 2026-07-13
- **Author:** Claude (session B)
- **Scope:** G-AnnStudio (`G-Suite/packages/ann-studio`) — the announcer-pack authoring tool. **No G-Maiden code is changed by this CR.** It exists to (a) record what shipped on the G-Ann side and (b) freeze the **interface contract** G-Ann relies on, so a concurrent G-Maiden backend-wire session doesn't break it silently.
- **Related:** ADR-01 (G- naming), ADR-11/12 (data/marketplace), CR-004 (voice), the shared event schema `G-Suite/schemas/gmaiden-events.json`.

> ⚠️ **Read the "Integration contract" + "Coordination for the backend-wire session" below before touching `gsi.rs` `/announcer/install`, `audio::voice_cache_dir()`, `voice_api.rs` (manifest reader / `image_mime` / `packs_dir`), or the event id set.** If any of those change, G-Ann's installers break until updated in `G-Suite`.

---

## 1. What shipped (G-Ann, `G-Suite` `main` `be37053..cfeff6c`, 16 commits)

**Banner suite** (`src/src/lib/toneBanner.ts`, `bakeBanner.ts`, `exportGmaidenPack.ts`, `EventTestGrid.tsx`)
- Auto tone-banner per event (canvas, tone ladder) + **author override** image (png/webp/gif; apng normalized→png).
- **Animated-WebP bake** of the entrance (ffmpeg `libwebp_anim`, lossless), **audio-reactive** waveform bake (loop=0), **voice-caption** (subtitle = clip transcript), **AI art** via a local Stable Diffusion WebUI (`/sdapi/v1/txt2img`).

**Vision pipeline** (`src-tauri/sidecar/*.py`, `analyze_video` command, `honEventMap.ts`)
- `detect_boundaries.py` (W1, caption windows) → `transcribe.py` (whisper) → `detect_buttons.py` (W4, HoN button OCR via rapidocr + golden-cursor) → fused by `analyze_video` into pre-labelled clips. `matchAnnouncerLabel()` resolves HoN button text → G-Maiden event id.
- Verified e2e on `inbound/KOM-ANNOUNCER.mp4`: 11/11 line windows labelled + transcribed.

**Authoring / library UX**
- Save-to-Library by **voice owner** (`SaveToLibDialog`, package name = owner), import guard (don't wipe unsaved clips).
- Test screen = **library pack builder**: drag library sounds onto event cards / "+ เพิ่มเสียงจากคลัง" → `install_library_pack`.

**Install channel + path resolution** — see the contract below.

---

## 2. Integration contract (the interface G-Ann ⇄ G-Maiden — do not break silently)

### 2.1 Activation endpoint
- G-Ann POSTs, after writing the pack files: `POST http://localhost:3000/announcer/install`
  body `{"packId":"<id>"}` (legacy `{"pack":"<id>"}` still accepted), optional `{"activate":true}`.
- G-Maiden handler: `gsi.rs::announcer_install` → `parse_install_request` → `run_announcer_install` → `voice_api::install_report(packId)` + `activate_if_exists`. **No auth on `:3000`; the handler ONLY activates a pack already on disk — it never writes/moves/extracts files.** Response `{ok, ...}` with per-event counts.
- G-Ann call site: `install_gmaiden_pack` / `install_library_pack` / `install_pack` in `G-Suite/packages/ann-studio/src-tauri/src/lib.rs` (the `endpoint` arg, hardcoded to `http://localhost:3000/announcer/install` in the frontend `exportGmaidenPack.ts` / `actions.ts`).

### 2.2 Pack location (files written directly to disk by G-Ann)
- G-Maiden reads packs from `packs_dir() = voice_api::voice_root().join("packs")` = `audio::voice_cache_dir()/packs`.
- `voice_cache_dir()` (`audio.rs`): **`<exe_dir>/voice-cache` if it exists (built/installed), else cwd-relative `assets/voice-cache` (dev-source run).**
- G-Ann mirrors this with `voice_cache_root(base)` in its `lib.rs`: `base/voice-cache` if it exists, else `base/assets/voice-cache`. `base` is resolved by `resolve_gmaiden_dir` (Settings path → `GMAIDEN_DIR` env → dev sibling repo → `detect_gmaiden_target`: repo `src-tauri/target/release` → `target/debug` → installed via Start-menu shortcut).
- **Real targets on Boss's machine:** dev-source `G:\G-Maiden\assets\voice-cache`; release build `G:\G-Maiden\src-tauri\target\release\voice-cache` (Boss's usual test); installed `G:\GM\G-Maiden\voice-cache`.

### 2.3 Pack contents + manifest schema (camelCase)
```
<voice-cache>/packs/<id>/
  clips/<event>_NN.wav        # pcm_s16le
  banners/<event>.<ext>       # png|webp|gif (animated webp/gif ok; apng written as .png)
  manifest.json
```
```jsonc
{ "id","name","version","locale","author","description","coverImage",
  "mappings": { "<eventId>": { "text","thai","banner","bannerAsset":"banners/…","clips":["clips/…"] } } }
```

### 2.4 Event id set
- Single source of truth: `G-Suite/schemas/gmaiden-events.json`, mirrored in G-Maiden `voice_api.rs` `EVENTS` and G-Ann `data/gmaiden-events.ts` (+ resolver `lib/honEventMap.ts`). Adding/renaming an event = update **all** mirrors.

### 2.5 Banner rendering
- G-Maiden inlines the banner file as a `data:` URL (overlay CSP `img-src 'self' data:`) via `voice_api::image_mime` → supports `png|jpg|jpeg|webp|gif|svg` (**no `apng`** → that's why G-Ann normalizes apng→png). Animated webp/gif animate in WebView2.

---

## 3. Coordination for the backend-wire session (asks + heads-up)

**If you change any of these, ping / update G-Ann in `G-Suite` in the same breath:**

1. `/announcer/install` route, port `:3000`, or the `{packId}`/`{activate}` payload → update G-Ann's `endpoint` constant + `parse` expectations.
2. `audio::voice_cache_dir()` or `voice_api::packs_dir()` resolution (where packs are read) → update G-Ann `voice_cache_root()`.
3. The manifest reader in `voice_api.rs` (field names, `bannerAsset` path handling, `clips[]`) → update G-Ann's manifest writer in `install_gmaiden_pack` / `install_library_pack`.
4. `voice_api::image_mime` or the overlay `img-src` CSP → G-Ann's banner ext whitelist + apng-normalization assume the current set.
5. Any add/rename in the event id set → update the three mirrors (§2.4).

**Heads-up / no action needed:**
- The vision sidecars (`detect_boundaries.py` / `detect_buttons.py` / `transcribe.py`) + `analyze_video` orchestration live **entirely in G-Ann**, not G-Maiden. The contract between the tools is the **manifest + endpoint**, not the Python. Please don't re-implement a pack pipeline inside G-Maiden — extend the manifest/endpoint if you need more.
- `pack_mrijgajn` (G-Maiden commit `2a7ba551`) is a real installed pack — usable as test data for the reader.
- G-Ann is Windows-only; the installed-build auto-detect shells out to PowerShell (`WScript.Shell`) to resolve the Start-menu shortcut.

**What I need from you (if applicable):** if the backend-wire work moves the GSI server off `:3000`, or puts auth in front of `/announcer/install`, tell me the new address/scheme so G-Ann can target it (the endpoint is currently hardcoded and unauthenticated by design).

---

## 4. Verification

| Gate | Result |
| --- | --- |
| tsc (G-Ann frontend), each commit | ✅ 0 |
| `cargo check` (G-Ann sidecar) | ✅ 0 |
| `analyze_video` e2e on KOM | ✅ 11 windows fused (text + W4 label) |
| `matchAnnouncerLabel` unit | ✅ 17/17 |
| animated/reactive bake on ffmpeg-static | ✅ valid webp (VP8X alpha+anim, loop 0/1) |
| `voice_cache_root` / auto-detect vs real dirs | ✅ picks release-build / installed / dev correctly |
| **live in-game install → activate → hear/see in Dota** | ⏳ pending (Boss) |

## 5. References
- G-Ann code: `G-Suite/packages/ann-studio` (repo `github.com/Freshair129/G-Suite`), `main` `be37053..cfeff6c`.
- G-Maiden endpoint: `src-tauri/src/gsi.rs` `announcer_install`; pack reader: `src-tauri/src/voice_api.rs`; cache path: `src-tauri/src/audio.rs` `voice_cache_dir`.
- Session log: `.govibe/.brain/session/2026-07-13-B-gann-event-mapping-banner.md`.
