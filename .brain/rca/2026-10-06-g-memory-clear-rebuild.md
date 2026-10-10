---
title: "RCA — DL-007 G-Memory Rebuilt After Clear"
doc_id: "RCA-DL-007-G-MEMORY-CLEAR-REBUILD"
status: "active"
version: "1.0.0"
updated: "2026-10-06"
owner: "ATHER"
complexity: "C-2"
risk: "MEDIUM"
---

# RCA — DL-007 G-Memory Rebuilt After Clear

## Symptom

After `delete_player_memory` removed the derived snapshot, a later call to
`get_player_memory` could rebuild the same aggregates from archived G-Log JSONL files.
The user-visible forget action therefore did not persist across refresh or restart.

## Evidence

- Before this change, `get_player_memory` enumerated finalized G-Log archives and rebuilt
  `memory.json` when the snapshot was missing or stale.
- Before this change, `delete_player_memory` removed only `memory.json`; it did not persist
  a clear boundary or alter the eligible source set.
- Existing tests covered aggregate derivation, but not the clear-then-read lifecycle,
  restart persistence, or preservation of the original archive bytes.
- The current fix is specified in
  [`FEAT-G-MEMORY` §10.4](../../docs/features/FEAT-G-MEMORY.md#104-durable-forget-semantics-dl-007)
  and the runtime is implemented in [`memory.rs`](../../src-tauri/src/memory.rs).

## Root Cause

The clear operation deleted a rebuildable cache rather than recording deletion state.
Because the source-of-truth G-Log archives were intentionally retained, the next read had
no durable signal that those pre-clear sources must be excluded and re-imported them.

## Why the issue escaped detection

The original unit tests validated aggregation inputs and outputs independently. They did
not exercise deletion followed by a fresh read, app-restart marker reload, or the required
separation between forgetting derived memory and deleting G-Log archives.

## Proposed prevention

1. Persist a schema-versioned, monotonic local clear cutoff before removing the derived
   snapshot; apply it before cache stamps and aggregation.
2. Keep archived G-Log files unchanged. Include only match files whose valid start time is
   strictly newer than the cutoff; because filenames have second precision, exclude a
   source in the cutoff second as well.
3. Fail closed when the clear marker is unreadable or unsupported rather than rebuilding
   from retained archives.
4. Retain regression tests for restart persistence, post-clear eligibility, same-second
   exclusion, monotonic cutoff, invalid-marker handling, and byte-for-byte archive
   preservation.
5. Keep the no-egress runtime receipt as a separate open acceptance item; unit tests and
   code-doc alignment are not network-egress proof.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-10-06 | Recorded DL-007 root cause, evidence, and prevention controls. |
