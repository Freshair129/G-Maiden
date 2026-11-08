---
title: "ADR-21: Single event-taxonomy source of truth (g-events.toml) and pack version contract"
doc_id: "ADR-21-event-taxonomy-sot"
status: "accepted"
approved_by: "Boss — \"approve\" of the Fable-refined design in the orchestrator session"
approved_date: "2026-11-09"
version: "0.1.0"
updated: "2026-11-09"
owner: "G-Maiden"
source_of_truth: true
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["CR-049-event-taxonomy-sot", "gann-event-media-contract", "CR-046-demo-mvp-announcer-gank-slice", "mvp-delivery-plan"]
---

# ADR-21 — Single event-taxonomy source of truth and pack version contract

## Context

The announcer event taxonomy currently exists in six hand-maintained copies, and they have already drifted apart:

| # | Copy | Observed drift |
| --- | --- | --- |
| 1 | G-Suite `schemas/gmaiden-events.json` (canonical `$id`) | v1.1 on G-Suite `main`; v1.2 (`enemy_missing`) only on a branch |
| 2 | G-Maiden vendored `schemas/gmaiden-events.json` | `description` and `gank`/`revision` trigger text differ from #1 |
| 3 | `src-tauri/gann-package/events.json` (`include_str!` in `gann-package/src/playback.rs:7`) | v1.1 |
| 4 | Studio's copied `gann-package` crate (G-Suite `packages/ann-studio/src-tauri/gann-package`) | `playback.rs` already differs from #3 |
| 5 | `src-tauri/src/voice_api/events.rs` `EVENTS` | Rust labels and Thai names |
| 6 | Studio `src/src/data/gmaiden-events.ts` | `danger` labelled "Gank Warning"; no `gank` id |

Detection behaviour is hardcoded in `src-tauri/src/announcer.rs`:
- tunables at `:20-23` (`MULTIKILL_WINDOW_S`, `HP_LOW`, `MANA_LOW`, `LEVEL_UP_MILESTONES`);
- the numeric `priority()` table at `:68-94`;
- the detection state machine in `step()` at `:154-308`.

The JSON `trigger` field is prose only. The owner wants one human-readable file he can open and edit without asking an AI. An independent review (Fable, 2026-11-08) confirmed the drift above with file:line evidence. It rejected a free-form or enumerated "rule" engine: `step()` is one interlocking state machine, covering batch kill/death ordering, aggregate-jump rejection, the first-blood score check and match-start reconnect handling.

## Decision

1. **One SOT file in G-Maiden: `src-tauri/events/g-events.toml`.** TOML, not YAML: it is maintained in the Rust ecosystem, supports comments and avoids YAML's implicit-typing and indentation footguns. G-Maiden owns the taxonomy because it owns detection. The G-Suite schema becomes a generated consumer.
2. **The file describes events and tunables; it does not define logic.** Each event declares:
   - `id`;
   - labels (`en`, `th`);
   - `category`;
   - a `detector` pointer (e.g. `announcer.multikill`) into an allowlist that Rust implements;
   - an optional `tier`;
   - an explicit numeric `voice_rank` (single-slot audio tie-break);
   - `since`;
   - optionally `deprecated`.

   Tunables live in `[params.*]` tables with `value`/`min`/`max`. There are no free-form conditions and no rule engine.
3. **Build-time codegen with compile-time guarantees.** `build.rs` parses the file with `deny_unknown_fields` and fails the build when:
   - an id is duplicated;
   - a `voice_rank` is duplicated;
   - a param is out of its range;
   - a `detector` is not in the allowlist.

   It emits the Rust event table, `priority()` and param constants, plus `gann-package/events.json` and `schemas/gmaiden-events.json`. A `cargo test` fails if the committed JSON differs from the generated output. The hand-written mirror tests and the TS copy are removed.
4. **G-Signal thresholds stay out.** The CV `Sensitivity` rungs (`signal.rs`) are a user setting on the ≤300 ms path. The TOML may reference those events by `detector = "signal.cv"` for documentation and ranking only.
5. **No runtime reload in release.** Debug builds may read `GMAIDEN_EVENTS_OVERRIDE=<path>` once at startup, for `[params]` only. The code is compiled out of release (`#[cfg(debug_assertions)]`). No hot reload and no user-facing editor in this ADR.
6. **One shared crate, not copies.** G-Suite depends on `g-ann-package` through a Cargo git dependency pinned to a G-Maiden revision. The copied crate directory and `gmaiden-events.ts` are deleted, and Studio reads the event list from the crate.
7. **Per-pack media mapping stays in `.gann`.** Event → audio/video with SHA-256 stays in `ann_<UUID>.json`, authored and verified by Studio, per [[gann-event-media-contract]]. The TOML never names media files.
8. **Version contract.**
   - `[taxonomy] version` (semver) versions ids and meanings only. Adding an event is a minor bump. Renaming, removing or changing an event's meaning is a major bump. `[params]` changes carry no taxonomy bump.
   - Packs record `taxonomy_version` in `ann_<UUID>.json`. When it is absent, the pack is treated as `1.1`.
   - All compatibility checks live in `g-ann-package` registry validation, which Studio export, Studio Event Test, Maiden import and `POST /announcer/install` share.
   - Ids are never reused; removal is `deprecated = true`.
   - A test fails if the id set changes without a version bump.

| Pack `taxonomy_version` vs runtime | Behaviour |
| --- | --- |
| Same major, pack ≤ runtime | Admit. Runtime events with no mapping stay silent and log `unmapped` (existing behaviour). |
| Same major, pack > runtime | Admit. Unknown ids are still hash/pair-verified but inert, with a logged reason. This **changes** the current refusal at `gann-package/src/playback.rs:218-224`. |
| Different major | Refuse at import/install; active selection unchanged. |
| Field absent | Treat as `1.1`. |

## Consequences

- Owner-readable: one file answers "which events exist, how is each detected, what can be tuned". Studio answers "which file does pack X play".
- Changing a tunable requires a rebuild. This is accepted for safety: bounds are compile-checked and no unchecked config reaches release.
- G-Suite builds depend on a pinned G-Maiden revision; bumping the pin is an explicit, reviewable change.
- The admission change for newer packs is a deliberate loosening of the current unknown-id refusal. It keeps hash/pair verification, so media integrity is unchanged.
- G-Signal latency, privacy and the GANN-only media rule are unchanged.

## Alternatives considered

| Alternative | Outcome |
| --- | --- |
| YAML SOT | Rejected: `serde_yaml` is archived and implicit typing invites silent mistakes; no editability gain over TOML |
| Enumerated `rule` engine in config | Rejected: misrepresents a bespoke state machine and invites wrong configurations |
| Runtime-loaded config in release | Rejected: unvalidated tuning could reach players and the G-Signal path |
| Rust table as SOT plus generated read-only YAML/MD | Rejected: the owner must be able to edit, not only read |
| Keep G-Suite as taxonomy owner | Rejected: detection lives in G-Maiden; the owner of behaviour should own the contract |
| File-copy sync between repos | Rejected: has already drifted |

## Out of scope

- Per-event cooldown: a new behaviour; it needs its own CR.
- Voicing `enemy_missing` beyond CR-046 D1.
- A user-facing editor, and a Studio "export mapping (YAML)" view.
