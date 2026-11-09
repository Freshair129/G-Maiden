---
title: "G-Events authoring"
doc_id: "g-events-authoring"
status: active
version: "0.1.1"
updated: "2026-11-09"
owner: "G-Maiden"
---
# G-Events authoring

Edit `g-events.toml` for event metadata, announcer voice ranks and bounded announcer
params. The Thai header gives the short editing workflow. Rust still implements
the detectors: changing a detector name or tier does not change `announcer::step`.
Keep pointer/tier metadata aligned with the implementation when reviewing changes.
`voice_rank` preserves announcer arbitration; JSON `priority`/`status` are legacy
presentation fields, independent of native audio priority. `trigger` supplies JSON
prose verbatim; `notes` remains internal. TOML event order and `label.en` preserve
Studio's G-Suite v1.2 presentation. `deck_order` and `deck_label` separately preserve
the 24 legacy EventDef entries and their order/labels; `label.th`, `group` and
`subtitle` preserve the remaining Deck text. Pending and authoring-only events
have no deck fields, so they do not add UI entries.

JSON emits only the v1.2 field set: the original root metadata plus event `id`,
`label`, `category`, `priority`, `status` and `trigger`. It does not add `label_th`
or runtime/deck metadata. The package parser (`gann-package/src/playback.rs`) reads
taxonomy as `serde_json::Value` and selects ids; the G-Suite Studio adapter
(`packages/ann-studio/src/src/data/gmaiden-events.ts`) spreads `...event`. Both
tolerate additional fields, but PR1 keeps the exact field set for full semantic
equality and no presentation changes.

`build.rs` validates the source and writes only `$OUT_DIR/events_gen.rs`. It retains
the existing Tauri build and Windows manifest setup. Duplicate ids, duplicate
non-zero ranks, unknown fields/detectors, invalid versions, pending misuse and
out-of-range params fail with field/event and source-line diagnostics. Zero ranks
may repeat. Fixed safety bounds are 5–60 seconds and 5–50 percent; milestones must
be unique, increasing levels in 1–30. Generated data is used directly in release.

## Regeneration and verification

From `src-tauri`, using the task's admitted Cargo lane and native dependency
environment, run:

```text
cargo test --lib --offline --locked voice_api::tests::taxonomy::regenerate_events_json -- --ignored --exact
cargo test --lib --offline --locked
```

The ignored test explicitly writes `gann-package/events.json` and
`../schemas/gmaiden-events.json`. Include both generated files with the TOML edit.
Ordinary builds/tests never rewrite them. Freshness tests compare the rendered
JSON with both files (normalizing Git CRLF line endings). Parameter-only changes
require a rebuild; they do not change the taxonomy JSON or its version.

`fixtures/g-suite-v1.2.json` is an unchanged snapshot of G-Suite
`schemas/gmaiden-events.json` at `7e876ffeaa3bca79800f5d2b0475b95e22005cf3`
(the local `origin/main` reviewed for fix round 1). The semantic regression test
compares the entire parsed generated JSON with this snapshot, including array
order, all original fields and exact Thai prose. Do not regenerate this fixture
from TOML. The separate EventDef test pins all 24 entries and display fields from
G-Maiden `origin/main` at `66c1b8b551224a53aa81b9fd868cfe60ed8dc19a`.

`id-history.json` is an append-only compatibility record, not another editable
event source. When adding ids, bump the taxonomy minor version and append its full
id set; never alter a recorded version to make a failing test pass. Params and
display wording alone need no bump. Changing an event meaning requires a major
bump. Keep old ids and mark retired events `deprecated = true`; never reuse them.
JSON presentation status is explicit and is not derived from `deprecated`.
Regeneration checks history before writing, so it cannot hide an unversioned id edit.

All existing ids are recorded as present since the baseline 1.1. Taxonomy 1.2 adds
`enemy_missing` (`since = "1.2"`, rank 0). The Studio entry keeps v1.2
`priority = "low"` and `status = "new"`. Since CR-046 D1 (#162) it is detected by
`sentry.enemy_missing`, so the Rust-owned `RUNTIME_DETECTS_VERSION` is 1.2.
`pending` stays available for a future id that is registered before its detector
lands: it is permitted only above `RUNTIME_DETECTS_VERSION`, never above the taxonomy
version, must have rank 0, and appears in generated `NON_FIRING_EVENTS`.

## Detectors

| Rust pointer | Events | Implementation |
| --- | --- | --- |
| `announcer.multikill` | double_kill, triple_kill, ultra_kill, rampage | `announcer.rs`, tiers 2–5 |
| `announcer.streak` | killing_spree, dominating, mega_kill, unstoppable, wicked_sick, monster_kill, godlike, beyond_godlike | `announcer.rs`, tiers 3–10 |
| `announcer.first_blood` / `.kill` / `.death` / `.respawn` / `.match_start` | Corresponding same-name id | `announcer.rs` |
| `announcer.level_up` | levelUp | Milestone crossing in `announcer.rs` |
| `announcer.hp_edge` / `.mana_edge` | hpLow / manaLow | Edge crossings in `announcer.rs` |
| `signal.cv` | gank, revision | Existing capture/signal path; documentation only |
| `safety.hp` | danger | `safety_events.rs` / `safety_events_core.rs` via GSI |
| `maiden.advice` | advice | Existing request_advice / speak_advice route; no new announcer detector |
| `none` | unused | Authoring-only; excluded from EventDef |
| `sentry.enemy_missing` | enemy_missing | Capture-owned `EnemyMissingVoiceGate` in `announcer.rs` (CR-046 D1); not ranked by `most_important()` |
| `pending` | (none today) | Registered, not detected in this runtime |

The allowlist is in `schema.rs`; neither that list nor the TOML is a rule engine.

## Debug override

In a debug build only, set `GMAIDEN_EVENTS_OVERRIDE` to a UTF-8 file before startup:

```toml
[params.announcer]
multikill_window_s = { value = 22 }
hp_low_percent = { value = 25 }
level_up_milestones = [6, 12, 18, 25]
```

Omitted values retain generated defaults. Only `[params.announcer]` is accepted;
ids, labels, detectors and replacement min/max bounds are rejected. Startup reads
the file once (64 KiB maximum) before starting GSI/capture. Invalid overrides are
reported and the entire override is discarded. There is no reload. Accessors do
no I/O, and the environment reader/parser module is behind `#[cfg(debug_assertions)]`.
Release contains only generated constants/tables. `toml = 0.8.2` already exists in
the lockfile and is now explicit as a build dependency and for debug startup.

## Outside this file

- G-Signal Sensitivity and its latency-critical thresholds.
- User HP-alert settings in `runtime.rs` (separate from announcer `hpLow`).
- Per-pack media mappings, hashes and audio/video assets, which stay in `.gann`.
- Cooldowns, detector logic, pack admission changes and G-Suite integration.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-09 | CR-049 PR1 authoring, generated output, version history and debug params workflow. |
| 0.1.1 | 2026-11-09 | Fix round 1: preserve G-Suite v1.2 JSON and legacy Deck presentation independently; pin both contracts. |
