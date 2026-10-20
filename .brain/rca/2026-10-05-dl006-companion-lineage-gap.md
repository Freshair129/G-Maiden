---
title: "RCA — DL-006 Companion Feature Lineage Gap"
doc_id: "RCA-DL-006-COMPANION-LINEAGE"
status: "active"
version: "1.0.0"
updated: "2026-10-05"
owner: "ATHER"
complexity: "C-3"
risk: "HIGH"
---

# RCA — DL-006 Companion Feature Lineage Gap

## Symptom

G-Voice, G-Memory, G-Coach, G-Stream, and G-Score had feature visions and acceptance
lists, but a developer could not reproduce their complete source-to-output behavior from
the repository. The gap included missing transport boundaries, field mappings, formulas,
fallback rules, and evidence requirements.

## Evidence

- [`FEAT-G-VOICE`](../../docs/features/FEAT-G-VOICE.md) described future microphone/STT
  behavior, while the existing `Alt+M` binding is mute and the current TTS path is output-only.
- [`FEAT-G-MEMORY`](../../docs/features/FEAT-G-MEMORY.md) proposed SQLite even though
  [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs) writes local JSONL and no memory module exists.
- [`FEAT-G-COACH`](../../docs/features/FEAT-G-COACH.md) requested key moments and top-three
  recommendations without a deterministic event score or compact-input boundary.
- [`FEAT-G-STREAM`](../../docs/features/FEAT-G-STREAM.md) described redaction but had no
  allowlist, fail-closed behavior, or stream transport boundary.
- [`FEAT-G-SCORE`](../../docs/features/FEAT-G-SCORE.md) was explicitly post-v1 proposed and
  had no approved weighting function or runtime module.
- The runtime search found existing G-Log, G-Master, Audio, TTS, GSI, and G-Signal code,
  but no `voice`, `memory`, `coach`, `stream`, or `score` module declarations.

## Root Cause

The companion feature specs were written as product design visions at different times and
were not reconciled with the current shipped boundaries: G-Log JSONL, local GSI ingestion,
Claude/Ollama advisor fallback, SAPI/rodio output, and the independent G-Signal critical path.
No shared review gate required every feature to declare source, transport, formula, output,
fallback, privacy, and acceptance evidence before implementation.

## Why the issue escaped detection

The existing documentation and feature ledger tracked module intent and status, but a
documentation-only or planned feature could appear complete without a runtime lineage
contract. Existing tests covered shipped modules, so they could not detect missing companion
modules or unapproved formulas. The absence of a canonical per-feature lineage checklist
allowed legacy assumptions such as SQLite, cloud STT, Gemini, and inferred MMR to remain in
peer specs without implementation evidence.

## Proposed prevention

1. Keep the five DL-006 contracts in the peer feature specs and summarize them in the
   canonical G-Series lineage and engineering documents.
2. Require source/transport/field/formula/output/fallback/privacy/evidence sections before
   any companion runtime implementation is approved.
3. Mark unavailable fields as `UNKNOWN`; never infer MMR, death coordinates, teamfight, or
   objective events from an unrelated source.
4. Keep G-Voice, G-Coach, and G-Score outside the G-Signal critical path, and require
   redaction/no-egress fixtures for G-Memory and G-Stream.
5. Treat structural tests and local alignment as documentation evidence only; live audio,
   privacy, CPU/RAM, FPS, and stream acceptance require their own receipts.
