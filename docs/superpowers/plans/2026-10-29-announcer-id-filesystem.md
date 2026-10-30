---
title: G-Announcer ID filesystem integration
doc_id: 2026-10-29-announcer-id-filesystem
status: active
version: 0.1.0
updated: 2026-10-29
owner: G-Maiden
---

# G-Announcer ID Filesystem Implementation Plan

**Goal:** โหลดเสียงต้นฉบับ เสียงผสม และวิดีโอคู่กันจาก manifest `ann_<UUID>.json` ของ Studio โดยไม่ใช้ SQL

**Architecture:** manifest เป็นแหล่งข้อมูลเดียว เก็บไฟล์ที่ตรวจแล้วใน voice-cache และแปลงเป็นข้อมูล inventory/cache ในหน่วยความจำเท่านั้น เลือก original sound ID ครั้งเดียว แล้วใช้ mixed WAV และ silent video ของ banner ID เดียวกันผ่าน lifecycle เดิม

**Spec:** ผู้ใช้สั่งใน Studio ให้เชื่อมชุด ID เข้า G-Maiden โดยใช้ filesystem; package revision 2 อยู่ที่ `D:/G-Maiden-3D-Studio/workspace/vrzo-filesystem-v2` พร้อม PLAN.md และ validation.json

**Tech Stack:** Rust/serde/ring, Tauri, React/TypeScript

## Global Constraints

- RAM ceiling 900,000,000 bytes; preserve current runtime governor and session fences.
- Keep existing VRZO and Nakhom packs; importing does not change selection.
- Preserve development-authoring permission gate; no Store/security contract change.
- Do not restart current candidate, publish, commit, or release in this task.
- No filesystem hashing or JSON parsing in audio callback or G-Signal hot path.

## Approach and decisions

Direct manifest loading was requested. Generating another legacy manifest or inferring legacy clip stems would create a second authority and is excluded. The builder chooses a folder importer with bounded streaming copies, because the existing archive IPC limit is 32 MB and this package exceeds it. Local imports retain the existing development-build restriction. Activation uses the current Use control. Component configs are retained as authoring data; runtime presents the pre-rendered silent video and never synthesizes extra cue audio.

## Review Focus

- Invalid/duplicate IDs, dangling or wrong-role event references must fail before activation.
- Traversal, symlinks, missing files, hash changes, oversized input must fail closed.
- One original must map to exactly one mixed sound/video per event; no unmapped auto-trigger.
- Import failure preserves installed packs/active pointer; no overwrite of existing ID revisions.
- Native audio lifecycle, session and pack-change fences still stop stale visuals.

## Tasks

- [ ] Add bounded ID manifest validator and fixture tests (RED then GREEN): schema, references, pairing, paths, hashes, PCM, resource limits.
- [ ] Integrate read-only manifest projection, transactional folder import and activation cache. Test legacy pack regression and rollback.
- [ ] Resolve mixed playback and dynamic silent visual through the existing lifecycle. Test exact digest/ID pairing and stale-event rejection.
- [ ] Add development-only folder import control with explicit status; test error and successful selection behavior.
- [ ] Run Rust suite, clippy, ESLint, TypeScript, Vitest, doc gate and no-bundle native build with timeouts. Review complete diff. Keep live/acoustic/resource acceptance separate.

## Execution ledger

- Ruling: use a fresh external worktree from main e8bd6695; primary checkout is dirty. Native creation failed ownership validation; scoped safe.directory git fallback used, no global trust change.
- Ruling: preserve Store gates and expose filesystem import only where development authoring is already allowed. Shipping consumer import requires a separately approved distribution contract.

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-29 | Authorized filesystem integration and validation plan |
