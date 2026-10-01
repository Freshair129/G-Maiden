---
title: "G-Memory Local Privacy and Data Contract"
doc_id: "gap-memory-contract"
status: "draft"
version: "0.1.0"
updated: "2026-10-01"
owner: "Product Owner Agent (Luna Max)"
attributes:
  doc_type: "feature-contract"
  change_class: "C-3"
  risk: "HIGH"
  decision_authority: "Delegated D7 design choices accepted; exact-hash contract disposition is recorded separately in wave-1-po-review.json. Implementation, hosted, legal, and broader privacy acceptance remain separate."
related_docs:
  - "docs/features/FEAT-G-MEMORY.md"
  - "docs/operations/gap-closure-product-owner-decisions.md"
  - "docs/operations/execution-dag-gap-closure.md"
---

# G-Memory Local Privacy and Data Contract

> **Status:** design candidate only. G-Memory is not implemented. This draft reconciles delegated D7; it is not implementation, account, provider, release, or privacy-acceptance evidence.

## 1. Purpose, authority, and boundaries

This contract defines the candidate local data boundary for G-Memory before any code is authorized. D7 sequences Memory → Voice → Coach and requires local storage, provenance, retention, deletion, and retrieval rules. Memory content and its derived aggregates must remain on-device and out of cloud prompts under the current decision.

The source requirements describe persistent player memory for hero preferences, repeated mistakes, MMR trends, and play style. The current G-Memory feature document also permits a summary in cloud prompts. D7 resolves that conflict in favor of the stricter local-only rule until a separate change request is approved. ADR-11's opt-in contribution is a separate data purpose; account sign-in or match-sharing consent does not authorize memory egress.

This document covers G-Memory's candidate data, lifecycle, retrieval boundary, and verification criteria. G-Voice and G-Coach remain later consumers; this does not authorize their microphone, STT, analysis, prompt, or UI implementation. The shared G-Master prompt path remains root-owned.

## 2. Evidence and current-state findings

| Status | Evidence | Contract consequence |
| --- | --- | --- |
| VERIFIED | [SRS §3.8](../../product/software-requirements-specification.md) requires persistent profile facts to stay local; [FEAT-G-MEMORY](../../features/FEAT-G-MEMORY.md) says local-only, then permits aggregate prompt egress. | Treat the latter allowance as superseded by D7 for this candidate. |
| VERIFIED | [D7](../gap-closure-product-owner-decisions.md) bars memory content and aggregates in cloud prompts and blocks cloud Voice context pending separate egress/consent review. | No Memory payload or derivative may reach a remote model. |
| VERIFIED | [G-Log](../../../src-tauri/src/log.rs#L1) writes local JSONL under the Windows user's Local AppData. Each in-game sample serializes a cleaned GameTick; typed events include missing-hero positions and risk traces. | G-Log is local by default. ADR-11 defines a separate user-initiated finished-match contribution path; this Memory contract neither defines nor disables it and prohibits Memory facts/aggregates in its payload. |
| VERIFIED | [GameTick](../../../src-tauri/src/gsi.rs#L41) includes player performance fields and a SteamID field. [log.rs](../../../src-tauri/src/log.rs#L154) samples while in-game. | A Memory projection must use an explicit field allowlist and must never copy the tick wholesale. |
| VERIFIED | [G-Memory](../../features/FEAT-G-MEMORY.md) proposes SQLite or JSONL derivation, indefinite retention, and 5 MB per 1,000 matches; no backend has been selected. | This draft uses the Product Owner-selected bounded JSON v1 snapshot candidate and caps combined snapshot/control storage at 5,000,000 bytes. |
| VERIFIED | [G-Log end handling](../../../src-tauri/src/log.rs#L145) closes the file without a terminal outcome record; [force_end](../../../src-tauri/src/log.rs#L191) also closes without recording why. | Do not infer a completed match or a win/loss from today's file-close behavior. A stable completion signal is a prerequisite. |
| VERIFIED | [request_advice](../../../src-tauri/src/lib.rs#L411) passes the live GameTick and known CV enemies to [master::advise](../../../src-tauri/src/master.rs#L111). Its prompt includes live GSI-derived fields, counter advice, and a burst estimate; Claude/Auto can send it through Claude CLI or the Anthropic API. | This existing live-game-context route is a separate D7 egress conflict. This Memory contract neither changes nor certifies it. |
| VERIFIED | [Ollama](../../../src-tauri/src/slm.rs#L12) is addressed at loopback. G-Master Auto tries Claude before local SLM fallback. | Memory can only be considered for a future explicitly local route; Auto is not a safe Memory route. |
| UNKNOWN | Current G-Log has no explicit stable match-complete record or versioned source schema, and its final transition tick is not written as a normal sample. | Provenance and eligibility cannot be implemented safely until G-Log exposes a tested completion boundary. |

The observed contradiction is between older companion specifications that expect cloud context and D7's later privacy choice. The live G-Master prompt is an independent existing behavior: it sends current game facts on remote-selected paths, but this code does not show G-Memory data being stored or sent. Memory facts/aggregates are barred from those prompts and from ADR-11 source-match contributions. G-Log remains local by default; this contract does not claim global no-egress for separately user-initiated, defined source-match contribution data.

## 3. Threat model and trust boundary

**Assets:** local Memory facts and provenance, raw G-Log source files, import/export files, and provider request bodies.

**Threats addressed:** accidental serialization of raw ticks or derived Memory into prompts; cross-account assumptions; stale, partial, or malformed source logs; corrupt or forward-version snapshots; import path abuse; silent resurrection after deletion; and unbounded file scans or prompt growth.

**Trust assumptions:** Memory is stored under the current Windows user's Local AppData permissions. This draft does not claim encryption at rest or protection from malware, administrators, backups, or another person using the same Windows login. The Product Owner accepted one disclosed Windows-user scope; anyone using that login shares its Memory.

The system must fail closed for Memory: uncertain ownership, source provenance, schema, or backend location yields no Memory context and no write. It must not fall back to cloud with Memory attached.

## 4. Candidate v1 data scope

Enable Memory only after a user explicitly turns it on. The initial projection is limited to facts that can be proven from a finalized local match log:

- Hero ID for each eligible completed match.
- Favorite-hero counts and the most recent 20 hero IDs, calculated from retained eligible match contributions.
- Local provenance for each contribution: source log basename, source digest, parser version, and source time range.

This is a narrow first slice, not fulfillment of the full SRS feature. The current source does not establish a reliable match outcome or terminal tick. Therefore v1 must not claim win rate, MMR trend, or match result. Death hotspots, death causes, aggression/farming style, ward behavior, and other position-derived facts remain deferred until their source, timestamps, derivation, and consent boundary are specified and tested. CV detections and positions remain local-only under repository policy.

Never copy or retain in Memory: raw G-Log lines, full GameTick objects, SteamID/GID/email/session tokens, CV detections or enemy positions, audio/transcripts, provider prompts/responses, or externally fetched profile data. Do not add free-form notes in v1; a typed allowlist keeps prompt content bounded and prevents untrusted text from becoming Memory.

## 5. Owner partition and user controls

The Product Owner selected one opaque local Memory scope per Windows user profile, disclosed as shared by anyone using that Windows login. Create a random owner-scope identifier; never derive it from Google, GID, Steam, email, a token, or a device fingerprint. Authentication remains orthogonal.

Memory is local and anonymous use is supported; no server identity association, sync, or account-based merge is created. At every app start, context and ingestion are disarmed until an explicit enable writes a valid fresh eligibility epoch. This preserves the data across sessions without silently resuming collection after restart.

The control contract is:

| User action | Required behavior |
| --- | --- |
| Startup / default-off | Keep context and ingestion off. Validate control metadata and finish pending cleanup; never scan old G-Log files. |
| Enable Memory | Require valid metadata and no pending cleanup. Persist a new eligibility epoch and cutoff at the next G-Log match-start sequence before arming. Existing retained Memory may be read after this explicit action; only matches starting at or after the cutoff may be newly ingested. |
| Enable during a match | The active match already has a start sequence below the cutoff and is ineligible; only a later match start may contribute. |
| Disable Memory | Suppress context and new writes immediately; retain valid Memory until clear or expiry. A later enable uses a fresh eligibility epoch and cutoff. |
| Clear all Memory | Suppress context/writes immediately, durably rotate the data epoch and eligibility epoch/cutoff, then erase projection and cache. Do not delete G-Log or rescan history; preserve pending source-delete records until both source and projection cleanup complete. |
| Delete a source G-Log | Persist its bounded pending-delete record before changing either source or projection; retain it until both cleanups succeed. |
| Export / import | Explicit user-selected local-file actions. Import replaces current Memory only after validation and confirmation; imported facts are marked user-imported/unverified. |

Reject network export paths and do not offer cloud sync. Export files contain no owner identifier, control metadata, local source identifiers, or raw logs. Any later transfer by the user is outside this app contract.

## 6. Provenance and write lifecycle

A Memory contribution may be created only from a finalized local G-Log source with a stable, fixture-tested completion marker, source schema, and monotonic match-start sequence. A filename, Dota process exit, in-game flag flip, or watchdog close alone is insufficient.

The only v1 hero input is GSI hero.name, exposed as GameTick.hero by gsi.rs. Accept an exact internal_name present in the shipped local src-tauri/data/heroes.json registry; reject blank or unknown IDs. Never substitute display text or copy the whole GameTick.

Each locally-derived match contribution records source basename and digest, source/parser/derivation versions, match-start sequence, data epoch, eligibility epoch, timestamp bounds, hero ID, and provenance_status=local_log_verified. Do not retain source line text or absolute paths. Duplicate processing of one source digest is idempotent.

A post-match reducer reads one bounded source file and computes the projection outside GSI/G-Signal. At commit, require that Memory is armed, the match-start sequence is at or above the current eligibility cutoff, and the source's captured data and eligibility epochs equal the current control metadata. Otherwise discard the late completion. Clear and re-enable therefore invalidate stale in-flight work. The current logger lacks the required stable completion/sequence contract; root owns that DAG prerequisite.

Interrupted, corrupt, oversized, unsupported, or provenance-mismatched logs produce no update and a content-free status. Never block GSI, G-Signal, audio, or the overlay on Memory work.

## 7. Retention, deletion, and recovery

The Product Owner selected retention of the latest 1,000 eligible local contributions and no more than 365 days, whichever cap comes first. Recompute hero counts/recency after expiry. Keep the snapshot plus bounded control metadata at or below 5,000,000 bytes per 1,000 local contributions. Do not change G-Log's retention policy.

Clear is ordered for crash safety: (1) suppress context/writes in process; (2) atomically persist disabled control metadata with a new data epoch, new eligibility cutoff, and clear_pending=true; (3) erase the prior projection and cache; (4) durably set clear_pending=false. Report success only after the new epoch and erasure are durable. If control persistence fails, keep the current process suppressed, make no source/projection mutation, and report incomplete erasure; do not claim durable suppression. If cleanup or final metadata persistence fails, the pending state blocks all use until retry. Startup is always disarmed and never reloads an epoch-mismatched snapshot or rescans history.

Source deletion uses a narrow journal of at most 64 pending source digests and safe basenames. Persist the record before deleting either the source log or its Memory contribution. If persistence fails, mutate neither, suppress Memory in the current process, report failure, and require a successful retry. After persistence, keep the record until source deletion and projection removal both succeed; retries are idempotent and run while context/ingestion are off. If the journal is full, disable Memory and reject further delete/ingestion mutations until existing records drain. Clear may erase the projection but must retain every pending source-delete record; it cannot free journal capacity while any source cleanup remains. Completed deletions leave no tombstone; no historical rescan can replay them, and the next enable cutoff excludes all earlier match starts.

On missing, corrupt, invalid, or mismatched control metadata, provide no context and perform no writes. Require explicit recovery/enable to persist a valid new epoch before use. On snapshot write failure, preserve the last valid bytes. A failed clear never deletes raw G-Log; full erasure of Memory and the separate G-Log deletion result must be reported distinctly.

## 8. Schema, import, and export

Use a bounded JSON snapshot plus separate durable control metadata. The Product Owner selected JSON v1 instead of a database. Control metadata is never exported or imported and contains control_schema_version, owner_scope_id, validity state, data_epoch, eligibility_epoch, eligibility cutoff match-start sequence, clear_pending, and at most 64 pending-delete records. Startup is disarmed even when this metadata is valid; missing, corrupt, invalid, pending, or epoch-mismatched state blocks context and ingestion until cleanup and an explicit enable succeed.

Minimum local snapshot shape:

~~~json
{
  "schema_version": 1,
  "data_epoch": "opaque-random-local-id",
  "updated_at_ms": 0,
  "matches": [
    {
      "source_file": "match-epoch.jsonl",
      "source_sha256": "hex-digest",
      "source_schema": 1,
      "derivation_version": 1,
      "match_start_seq": 42,
      "data_epoch": "opaque-random-local-id",
      "eligibility_epoch": "opaque-epoch",
      "first_record_ts_ms": 0,
      "last_record_ts_ms": 0,
      "hero_id": "npc_dota_hero_example",
      "provenance_status": "local_log_verified"
    }
  ],
  "favorite_heroes": [
    { "hero_id": "npc_dota_hero_example", "matches": 1 }
  ],
  "recent_heroes": ["npc_dota_hero_example"],
  "imported_facts": []
}
~~~

Validate schema/version, digest shape, sequence and epoch linkage, bounded counts/bytes, unique digests, registered hero IDs, and aggregate consistency before load or commit. The 5,000,000-byte cap covers snapshot and control metadata together at 1,000 local contributions.

An explicit export contains only `schema_version`, `on_import_provenance=user_imported_unverified`, and `facts:[{favorite_heroes:[...],recent_heroes:[...]}]`; omit owner/control metadata, epochs, local match-start sequences, source names/digests, and raw logs. Import requires a user-selected file and confirmation. Accept only that bounded export shape and provenance marker; reject attempts to supply local provenance fields. Store each fact set as a separate `imported_facts` row with `provenance_status=user_imported_unverified`. Retrieval may show these facts only with that label, never silently combine them with `local_log_verified` counts. Re-export preserves separate fact sets and the same on-import label. Imported facts never become `local_log_verified`, qualify as G-Log sources, or enter the source-delete journal. Replace atomically only after full validation; bind the new local snapshot to the current owner/data epoch. Unknown versions leave current state unchanged. No implicit migration, merge, cloud backup, or cross-device sync.

## 9. Retrieval, provider gate, and resource bounds

Load only the bounded Memory snapshot; never scan raw G-Log during a live query. Return a typed, deterministic summary with at most five facts and 256 UTF-8 characters. Keep the existing FEAT-G-MEMORY target of ≤5 ms per query as a measured acceptance threshold, not a claim.

Memory may be exposed only to an explicitly local consumer after its provider is known to be local. In the current selector, only an explicitly selected Ollama route may qualify, and only after the integration proves the request stays on loopback. For Auto, Claude, unknown provider state, cloud STT/LLM, or any uncertain fallback, omit Memory entirely. Auto's Claude-first behavior makes it ineligible even if it might later fall back to Ollama.

The candidate first implementation does not inject Memory into G-Master prompts. If a later local-only consumer is authorized, root owns the shared prompt integration and must prove the provider gate independently. G-Voice cloud context and G-Coach cloud analysis remain blocked by D7; both default local when separately specified and approved.

The contract's fail-closed candidate parse cap is 2 MiB per source. Skip an oversized source whole; never truncate it. Implementation remains blocked until representative match-size fixtures confirm this cap or the Product Owner selects a revised cap; root's G-Log gate owns those fixtures with the completion/sequence/provenance checks. Also bound one contribution per unique source digest, 1,000 retained contributions, the 5,000,000-byte combined snapshot/control cap, and the five-fact/256-character query. Memory work is post-match only and must not enter the G-Signal critical path or exceed existing CPU, RAM, or FPS budgets.

## 10. Data-flow view

~~~mermaid
flowchart LR
  subgraph current["Current verified paths"]
    GSI["GSI GameTick"] --> LOG["G-Log local JSONL"]
    GSI --> ADVICE["request_advice"]
    ENEMIES["Known CV enemies"] --> ADVICE
    ADVICE --> PROMPT["G-Master prompt"]
    PROMPT --> REMOTE["Claude CLI / Anthropic when selected"]
    PROMPT --> LOCAL["Ollama loopback fallback"]
  end
  subgraph candidate["Future candidate after approval"]
    CLOSED["G-Log finalized-complete event required"]
    LOG -. "completion hook required" .-> CLOSED
    CLOSED -. "future proposed" .-> REDUCE["Allowlisted post-match reducer"]
    REDUCE -. "future proposed" .-> STORE["Versioned local Memory snapshot"]
    STORE -. "future proposed" .-> QUERY["Bounded local Memory query"]
    QUERY -. "future proposed" .-> LOCALCONSUMER["Explicit local consumer only"]
    STORE -. "future proposed" .-> EXPORT["User-requested local export/import"]
  end
  QUERY -. "must not flow" .-> REMOTE
  LOG -. "raw log never enters Memory prompt" .-> REMOTE
~~~

Solid arrows show current code paths; dashed arrows show proposed flows that require approval and implementation. Dotted edges mark prohibited transfers. The diagram records a code-evidenced live-GSI egress path; it does not establish that the proposed Memory route exists or that the current egress conflict is resolved.

## 11. Required negative-egress and lifecycle evidence

Before Memory code is accepted, tests and review must demonstrate:

- With unique Memory canaries and aggregates in local facts, Claude API/CLI prompts and any separately user-initiated ADR-11 source-match contribution payload contain neither Memory canaries nor aggregates. ADR-11's explicitly defined source-match contribution remains a separate path; this contract does not claim that all G-Log-derived data is globally no-egress.
- Auto, unknown-provider, cloud STT/LLM, and provider-error paths omit Memory before the first remote request; local fallback cannot make an earlier remote request safe. Explicit Ollama tests stay on loopback.
- Startup/restart remains disarmed until explicit enable persists a valid new eligibility epoch. Enable during an active match excludes its earlier match-start sequence, including completion after restart.
- Clear races with a delayed completion: epoch/cutoff rotation suppresses cached context first and the late source cannot recreate cleared facts. Clear success requires durable metadata and projection erasure.
- Failed clear-metadata or delete-journal persistence leaves source/projection untouched, suppresses Memory for the current process, and reports failure/incomplete erasure without claiming durable suppression. After restart, context and ingestion remain off until explicit enable writes a valid new epoch; only cleanup records that were durably persisted must be drained first.
- Pending-delete retries remove both the source and projection before dropping the record; journal-full state disables writes/deletes without growing the journal.
- Imported facts stay user_imported_unverified and cannot be presented as local-log provenance or used to satisfy local source deletion.
- Unknown hero IDs, malformed/unsupported logs, schema mismatch, and size-cap violations fail closed. Query, retained count, and combined snapshot/control bytes stay within their approved bounds.

All of these are **NOT RUN** for this documentation task. Static inspection confirms only the current paths listed in §2.

## 12. Smallest implementation slice and gates

After contract approval, the first code slice is limited to the local JSON v1 projection, separate durable control metadata, allowlisted hero history, bounded query, explicit enable/disable/clear/export/import, source-delete journal integration, and the required failure/race/restart tests. It must wait for root's stable G-Log completion, provenance, sequence, and deletion hooks. No Voice, Coach, prompt integration, provider, server, migration, embedding, vector database, or network code is included.

Root owns shared G-Master integration. Any existing live-GSI egress change or Memory/Voice/Coach remote use remains a separate decision. D7 and the execution DAG govern sequence and scope.

## 13. Decisions and remaining gates

The Product Owner selected: default-off/future-match-only ingestion; one disclosed Windows-user scope; JSON v1; 1,000 matches/365 days; a 5,000,000-byte combined storage cap per 1,000 local contributions; and hero-use history as the initial fact. This draft adds per-run explicit arming, match-start cutoffs, durable clear epochs, and bounded deletion recovery to prevent restart/race resurrection.

Remaining evidence gates are the representative source-file size check for the provisional 2 MiB parse bound and root's G-Log completion/provenance/deletion contract. ADR-11's user-initiated defined source-match contribution remains outside this Memory contract and must never carry Memory facts or aggregates. The existing live-GSI remote prompt conflict remains a separate unresolved egress decision; this document does not remediate it or claim global raw-G-Log no-egress.

No code, provider, deployment, or privacy-acceptance approval is implied.

## Changelog

| Version | Date | Change | Owner |
| --- | --- | --- | --- |
| 0.1.0 | 2026-10-01 | Added the D7 local-memory contract, including durable epoch eligibility, fail-closed clear/delete recovery, import provenance, and bounded retrieval. | Product Owner Agent (Luna Max) |
