---
title: "VRZO v8 verified mixed audio implementation plan"
doc_id: 2026-10-29-vrzo-v8-mixed-audio
status: active
version: 0.2.0
updated: 2026-10-29
owner: G-Maiden
---
# VRZO v8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Play the selected VRZO clip with its stock-composite v8 banner and one verified voice+SFX mix through rodio.

**Architecture:** Validate original selection and mixed snapshot separately in the bounded preparation worker. The audio owner admits exactly one PCM source; its existing lifecycle controls the silent video. Studio's READY manifest is required before copying any assets.

**Tech Stack:** Rust/rodio, Tauri, React, bundled muted VP9 alpha WebM.

**Spec:** Existing lifecycle contract [[2026-10-29-vrzo-synced-banner]] plus the owner-authorized v8 handoff at `D:/G-Maiden-3D-Studio/workspace/vrzo-runtime-handoff.md`, section "VRZO v8 runtime lane accepted". Input currently `events.json` status PRODUCTION; no READY evidence yet.

## Global Constraints

- Preserve original packs, signed archives, current VRZO selection and 900,000,000-byte RAM ceiling.
- No hashing, decoding or filesystem IO on audio callback/Critical thread. Existing two-clip/sample/expiry limits remain.
- Video muted, one rodio source; mixed WAV mono48k PCM16 with original duration within one output sample.
- Original selection digest and played mixed digest are distinct provenance. If mix unavailable/invalid, original plays once, v8 visual suppressed with explicit local reason.
- Visual duration original+1.4s within one30fps frame; cancellation/preemption/scope change removes immediately.
- No minimap CPU remediation, release, tag, publication or source-pack mutation in this lane.

## Execution rulings

- Native startup exposed missing provider SteamID: replace that unsupported requirement with read-only native registry active Steam account authority. Independent Windows query and Rust probe agree; unavailable login or player mismatch remains silent. Preserve initial606-test candidate/startup evidence as superseded for live event authority.

- Owner additionally reports stutter and false Double Kill while controlling own hero. Include duplicate-trigger removal, identity/baseline guards and aggregate-counter timing regression in this lane. Team score alone was independently tested and produces no kill event. Exact live incident remains unproven until next native diagnostics.
- Implement pure mix tests before asset intake; READY arrived during implementation and21 original/mixed/video entries independently passed hash/format/duration/stream verification.
- Existing linked node_modules requires pinned Corepack pnpm or direct package entrypoints; ambient pnpm attempted an unsafe reinstall and was stopped without modifying dependencies.
- Evidence/ledger lives under local target/vrzo-runtime-20261029/v8 to preserve this recovered dirty lane; no task commits or cleanup of its pre-existing files.

## Review Focus

- TOCTOU: bytes hashed must be the exact bytes decoded.
- A matching filename alone must not authorize another pack/event or a mix.
- Late preparation cannot resurrect old session/preview/pack identities.
- Corrupt/missing mix must not produce silence or duplicate voice through competing players.
- Export metadata, unit tests and startup cannot prove actual alpha or acoustic sync.

## Task 1: Admit the complete Studio asset set

- [ ] Wait for explicit READY manifest in v8 workspace; record its digest and QA/provenance.
- [ ] Verify exact21 IDs/15 events, original SHA against installed source pack, mixed/video SHA, contained relative paths, audio format/duration and video dimensions/fps/duration/no-audio.
- [ ] Extend `tools/verify-vrzo-assets.mjs` and `src-tauri/src/vrzo_catalog.json` with separate original/mixed/video provenance; add fixtures for missing/duplicate/unsafe/mismatched entries and observe rejection before import.
- [ ] Copy only verified silent videos to `src/public/vrzo-banners` and mixed WAV resources under `src-tauri`; declare resource mapping in Tauri configuration. Verify staged bundle hashes again. Never read from mutable Studio paths at runtime.

## Task 2: Prepare and admit one verified mixed source

- [ ] Add failing tests in `vrzo_banner.rs` and `audio_preparation.rs` for original mismatch, modified mixed bytes, oversized/truncated/wrong-format/duration mix and file mutation after snapshot.
- [ ] Carry selected pack/event identity in the lifecycle preparation request. Verify bounded original snapshot first, then catalog-authorized bounded mixed snapshot and decode the same bytes.
- [ ] Extend `PreparedClip` and lifecycle data in `audio_lifecycle.rs`/`audio.rs` with distinct selected-original and played-mix proof. Preserve admission, priority, cancellation and session/preview fencing.
- [ ] Update `vrzo_playback.rs` to admit v8 visuals only with the complete selected+played proof; explicit degraded original playback has no v8 visual. Log actual source provenance locally.
- [ ] Assert one-source admission, stale/expired request rejection, critical preemption and original-only fallback. Run regression suite and review before asset-driven native trial.

## Task 3: UI, documentation and local candidate

- [ ] Keep existing21 variant selector and muted video cleanup in `VoiceInventory.tsx`, `vrzoBannerVideo.tsx`, `Overlay.tsx`; adjust only where v8 metadata requires. Verify normal-end tail and stop/cancel cleanup.
- [ ] Update AGENTS/CLAUDE, feature/runbook and changelog to describe source behavior and explicit unverified native limits. Regenerate doc graph.
- [ ] Run bounded default cargo test, Clippy, TypeScript, ESLint, Vitest, doc/provenance gates and Tauri no-bundle build; preserve original failure evidence.
- [ ] Freeze source/assets/build hashes, stage all existing packs, keep VRZO selected, open one new local candidate and verify process/port/Control/Overlay identity.
- [ ] Record native preview alpha, one audible mix, timing and lifecycle observations separately. Do not call manual tests passed if user unavailable or UI blocked.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-29 | Prepare v8 runtime contract and gated asset/audio/build implementation sequence. |
| 0.2.0 | 2026-10-29 | Record owner event/stutter scope, READY intake and execution rulings. |
