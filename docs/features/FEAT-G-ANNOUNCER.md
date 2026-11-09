---
title: "FEAT-G-ANNOUNCER — Announcer event detection and taxonomy"
doc_id: "FEAT-G-ANNOUNCER"
status: "active"
version: "0.1.1"
updated: "2026-11-09"
owner: "Boss"
source_of_truth: true
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["ADR-21-event-taxonomy-sot", "CR-049-event-taxonomy-sot", "gann-event-media-contract", "CR-046-demo-mvp-announcer-gank-slice", "FEAT-G-SIGNAL"]
---

# FEAT-G-ANNOUNCER — Announcer event detection and taxonomy

> **Read this before changing any announcer event.** The event list has one source of truth:
> `src-tauri/events/g-events.toml` ([[ADR-21-event-taxonomy-sot]]). Never add or hand-edit a second
> event list: not in JSON, not in Rust, not in TS, not in G-Suite.

## 1. Purpose

Turn the local player's GSI deltas into announcer event ids (kill, multikill, streak, death, …),
and pick the single most important id per tick for the single-slot audio. Media for an id comes
only from the active verified `.gann` pack ([[gann-event-media-contract]]).

## 2. Where things live

| Concern | Location | Editable by |
| --- | --- | --- |
| Event ids, labels, category, `voice_rank`, `detector`, tunables (`[params]`) | `src-tauri/events/g-events.toml` | Owner/dev; rebuild after edit |
| Generated event JSON (G-Maiden + G-Suite) | `schemas/gmaiden-events.json`, `src-tauri/gann-package/events.json` | **Generated only.** Regenerate with the command in `src-tauri/events/README.md` |
| Detection logic (state machine) | `src-tauri/src/announcer.rs` `step()` | Code review |
| G-Signal events (`gank`, `revision`) and thresholds | `capture.rs`, `signal.rs` ([[FEAT-G-SIGNAL]]) | Not in the TOML; `Sensitivity` is a user setting |
| HP safety alert (`danger`) user settings | `safety_events*.rs`, `runtime.rs` | Not in the TOML |
| Which audio/banner a pack plays for an id | `ann_<UUID>.json` inside the `.gann` | G-AnnStudio only (hash-verified) |

## 3. Input

Own-player GSI only: `player.kills`, `player.deaths`, `player.alive`, `hero.health_percent`/`mana_percent`,
`hero.level`, `map.clock_time`, team scores, and the match/session lifecycle. Announcer events never use CV.

## 4. Logic

- `step()` is one interlocking state machine. It handles batch kill/death ordering, counter resets, aggregate-jump rejection, the first-blood score check and match-start reconnects. The TOML `detector` field points at it; it does not replace it.
- `most_important()` selects the highest `voice_rank` among the ids emitted in a tick.
- `detector = "pending"` registers an id with no runtime detection; it never fires.

## 5. Changing events

| Change | Do | Version |
| --- | --- | --- |
| Tune a param (e.g. multikill window) | Edit `[params]` within `min..max` | none |
| Rename a label, fix a description | Edit the TOML, regenerate JSON | none (presentation) |
| Add an event | Add `[[events]]` and the Rust detector; regenerate; append to `id-history.json` | minor |
| Rename or remove an id, or change its meaning | Do not rename. Deprecate, add a new id, write a CR | major |

After any change, run the regenerate command and `cargo test --lib`. The tests fail if the generated
JSON is stale, the id set changes without a version bump, or Studio-visible fields drift from the
pinned G-Suite snapshot.

## 6. Constraints

- G-Signal stays pure Rust, ≤300 ms; codegen is compile-time only. Release builds carry no config loader;
  `GMAIDEN_EVENTS_OVERRIDE` exists only in debug builds and only for `[params]`.
- GANN-only media: the TOML never names media files. Missing mappings stay silent and log a reason.
- Privacy: announcer data never leaves the machine.

## 7. Acceptance

See CR-049 §5 (EVT-AC-001..008). Source and unit evidence are not live-match or acoustic acceptance.

## Pack compatibility

`ann_<UUID>.json` may declare `taxonomy_version`. Its grammar is canonical `MAJOR.MINOR`:
two ASCII unsigned 32-bit integers, no leading zeroes except `0`, whitespace, patch component,
sign or suffix. An absent field means `1.1`; null, non-string and malformed values are refused.
The runtime version comes from the generated `gann-package/events.json` `version` field.

| Pack vs runtime | Admission |
| --- | --- |
| Same major, pack ≤ runtime | Admit only known event ids. Missing mappings stay silent/unmapped. |
| Same major, pack > runtime | Admit; unknown ids retain all hash, pair, WAV and silent-WebM checks but are inert. |
| Different major | Refuse before changing active selection. |
| Field absent | Apply the `1.1` rule. |

The shared check lives in `src-tauri/gann-package/src/playback.rs`. Existing
`Package::validate_playback() -> Result<(), String>` remains available;
`validate_playback_with_report()` returns `AdmissionReport` with effective pack/runtime versions
and `inert_events` (id → reason). `validate_playback_registry()` shares registry checks with
Maiden's cache reader; it does not replace container hashes or media admission. The event-count
bound is 128, independent of the runtime taxonomy size.

Maiden logs inert ids locally at import/activation and excludes them from projected mappings
and verified pair snapshots, including preview. Known pending ids such as `enemy_missing` are
admitted by taxonomy but remain unselectable until implemented; detection is unchanged.
Production installation uses `PackageInstaller` via the registered current-user pipe.
`POST /announcer/install` currently returns HTTP 410; its old admission helper
is test-only. CR-049 PR2 does not restore that endpoint. Studio consumer integration is PR3.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-09 | Module charter for announcer event detection; points every event change at the g-events.toml SOT (ADR-21 / CR-049). |
| 0.1.1 | 2026-11-09 | CR-049 PR2: document taxonomy admission matrix, legacy default, report API, verified inert mappings and current install transport; native acceptance remains separate. |
