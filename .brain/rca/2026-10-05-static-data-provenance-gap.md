---
title: "RCA: DL-005 static data provenance gap"
doc_id: "RCA-DL-005-STATIC-DATA-PROVENANCE"
status: "accepted"
version: "1.0.0"
updated: "2026-10-05"
owner: "ATHER"
---

# RCA — DL-005 Static Data Provenance Gap

## Symptom

G-Damage, G-Master, and the GSI net-worth fallback consume checked-in hero, item, item-price, and
counter snapshots, but there was no single machine-readable record of their source, patch/date,
generation commit, or exact file bytes.

## Evidence

- `src-tauri/src/damage.rs`, `src-tauri/src/items.rs`, and `src-tauri/src/counter_advice.rs` load
  static JSON with `include_str!`.
- `tools/gen-herodb/gen_herodb.py` records the dotaconstants URL, but not the upstream revision or
  retrieval date in the generated output.
- The item-price introducing change documents an OpenDota snapshot, while the item and counter
  tables are curated data; none had a shared manifest.
- The five declared files now have explicit SHA-256 values and evidence statuses in
  `src-tauri/data/provenance.json`.

## Root Cause

The original data tasks treated the JSON files as implementation assets, not as versioned inputs
to a reproducible computation contract. Source comments and commit messages were used as human
provenance, but no maintenance gate required the metadata to travel with the exact snapshot.

## Why the issue escaped detection

The Rust loaders validate JSON syntax only. Cargo tests exercised lookup and formula behavior, but
did not compare the checked-in bytes with a source manifest or reject an unrecorded patch/date.
The documentation listed the data sources but did not define a machine-readable evidence status.

## Proposed prevention

1. Keep one manifest entry for every runtime snapshot and curated generator input.
2. Require source kind, URL/revision/patch/date fields, generation tool/commit, and SHA-256 keys
   even when an historical value is explicitly `null`.
3. Permit `VERIFIED` only when revision, retrieval date, tool, and commit are recorded; use
   `PARTIAL` or `UNVERIFIED` otherwise.
4. Run `py -3 tools/data-provenance/verify_manifest.py` during data maintenance and acceptance.
5. Keep manifest verification local and never add a runtime fetch or player-data egress path.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-10-05 | Recorded the DL-005 static-data provenance root cause and prevention contract. |
