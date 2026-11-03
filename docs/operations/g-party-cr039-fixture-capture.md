---
title: "G-Party CR-039 Player-Mode Fixture Capture Plan"
doc_id: "g-party-cr039-fixture-capture"
status: "draft"
version: "0.1.0"
updated: "2026-11-03"
owner: "G-Maiden"
complexity: "C-2"
risk: "HIGH"
related_docs: ["FEAT-G-PARTY", "mvp-decisions"]
---

# G-Party CR-039 Player-Mode Fixture Capture Plan

## Status and ownership

This is capture preparation only. No real fixture was captured or added by this change. Synthetic parser fixtures remain useful for schema tests but do not establish live Dota ownership or field semantics.

At review time, issue [#108](https://github.com/Freshair129/G-Maiden/issues/108) remained open. Draft PR [#118](https://github.com/Freshair129/G-Maiden/pull/118), authored by Freshair129 at `8466c99cca0714faef480f99e6ab9c0b81a83ddd`, owns the parser candidate in `src-tauri/src/gsi.rs` and `src-tauri/src/gsi_ability.rs`. It is parser-only, unshared, and has no real player-mode fixtures. This plan prepares evidence for that owner lane; it does not add a competing parser, change the Party contract, or authorize publication.

## Evidence target

Capture actual Dota 2 player-mode GSI observations and enough local receipt context to evaluate whether ability entries belong to the local player's hero or to a selected unit. A provider timestamp, `selected_unit` indicator, SteamID field, file name, or SHA-256 digest alone does not prove that attribution. Record their observed values, but keep the attribution conclusion pending review.

The first useful slice is one confirmed own-hero observation plus a non-self selection from the same live session. This permits fixture-led test authoring only. It does not satisfy the full ownership matrix or authorize data sharing.

| Scenario | Expected use |
| --- | --- |
| Local player's active hero, selected | Positive candidate; locally verify the player-to-hero association |
| Allied hero selected | Negative/control for selected-unit confusion |
| Visible enemy hero selected | Negative/control; do not attribute its kit to the local player |
| Courier, summon, illusion or clone selected, where available | Negative/control for non-hero or copied units |
| Death/respawn, pause/unpause, hero or ability-kit transition | Check clearing, freshness, and changed observations |
| Spectator/replay or non-player context | Negative context only; never use it as the positive player-mode fixture |
| Missing/partial ability section if observed naturally | Record as missing/partial; do not edit a real payload to manufacture it |

Mark unavailable scenarios `not observed`. Do not fill gaps with synthetic records or label them verified. Preserve sample order and capture transitions before, during, and after each marked scenario when available.

## Local capture procedure

1. Use an actual live Dota 2 player-mode session. Unranked All Pick is preferred to avoid collecting ranked-match context; record the exact mode and game build. Do not substitute a replay, spectator session, or an edited payload.
2. Capture the GSI request bytes at local receipt with a recorder whose name and version are recorded. Record a monotonic receipt clock and source sequence when available. Do not treat the GSI provider timestamp, UI repaint, or polling time as receipt time.
3. Verify the local-owner-to-GSI identity mapping on the same machine during capture. Keep the actual SteamID and the mapping evidence local; the sanitized output uses per-session aliases such as `SELF`, `ALLY_1`, and `ENEMY_1`.
4. Add a sidecar manifest with the fixture ID, scenario labels, game build/mode, recorder version, session alias, event order, monotonic receipt observations, and redaction notes. Expected-owner labels are observer annotations, not parser outputs.
5. Record a hash of the untouched local raw stream in the local-only manifest if useful for checking that file later. A hash protects byte identity after capture; it does not authenticate Dota as the source.

Manifest fields are a capture aid, not a new GSI, Party, or consent schema. Unknown source sequence, mode, owner mapping, or receipt time stays explicitly `unknown`.

## Data sensitivity and storage

Raw GSI may contain SteamIDs, player/account names, match and lobby IDs, team/hero state, ability state, timestamps, and other players' information. Treat the raw capture as private gameplay and identity data. Do not capture voice, chat, screen video, cookies, authorization headers, or unrelated app data.

Keep raw bytes and the identity map outside the repository and any cloud-synced folder, under the current user's local profile, for example:

- Raw capture and identity map: `%LOCALAPPDATA%\G-Maiden\review\cr039-gsi-fixtures\raw\`
- Sanitized working copy: `%LOCALAPPDATA%\G-Maiden\review\cr039-gsi-fixtures\sanitized\`

Restrict the directory to the local user. Redact account/Steam IDs, player names, match/lobby IDs, room IDs, IP addresses, tokens, and unrelated fields. Preserve equality only with fresh per-session aliases. Retain ability fields and enough source context for the specific attribution question. Never paste raw data into chat, an issue, a PR, or an external service.

`Freshair129/G-Maiden` is public. Do not add even a sanitized gameplay trace to Git or publish it without a separate owner review of the redaction and explicit authorization. If that review authorizes a tracked test fixture, the proposed destination is `src-tauri/tests/fixtures/cr039-gsi-ability/`; coordinate that path with the PR #118 owner first. Until then, the sanitized copy also remains local-only.

## Acceptance and next gate

- [x] Record a privacy-preserving capture procedure and distinguish real observations from synthetic tests and observer annotations.
- [x] Define a minimal own-versus-non-self attribution slice and the fuller scenario matrix without changing parser or sharing contracts.
- [x] Set local-only raw and sanitized destinations, redaction rules, and the public-repository publication gate.
- [ ] Owner captures a real player-mode sample and locally verifies the owner mapping.
- [ ] Parser owner reviews the sanitized fixture and authors a failing attribution test before changing parser behavior.
- [ ] Independent review confirms the provenance claim and that no identifying fields remain in any proposed tracked fixture.

The smallest next action is a short local unranked All Pick capture containing the local hero observation and one non-self selected-unit observation. The raw file stays under the local raw path above. Only a sanitized candidate may be considered for review; until the owner approves its destination, it stays in the local sanitized path. Missing parts of the full matrix remain open acceptance items.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-03 | Prepare a local-only provenance capture plan for CR-039 ability attribution; define scenarios, privacy handling, and parser-owner review gates without claiming any fixture exists. |
