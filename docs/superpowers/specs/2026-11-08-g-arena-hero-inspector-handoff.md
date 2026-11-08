---
title: "G-Arena Hero Inspector — Implementation Handoff"
doc_id: "2026-11-08-g-arena-hero-inspector-handoff"
status: "draft"
version: "0.1.0"
updated: "2026-11-08"
owner: "Boss"
related_docs: ["FEAT-G-ARENA", "software-requirements-specification", "05-sitemap-ia", "FEAT-G-PARTY"]
---

# G-Arena Hero Inspector — Implementation Handoff

## Outcome and authority

The user approved the working Arena prototype and explicitly asked the incumbent G-Maiden agent to implement its UI and hero-card interactions.
Implement the large center map, five enemy cards above, four ally cards below, self card on the left, and reserved right-hand hero inspector.
Clicking cards/known markers, skills and items must work while the map stays visible and stationary.
The canonical requirements are [[software-requirements-specification]] §4.1A and [[FEAT-G-ARENA]].
This handoff authorizes implementation inside that scope, not merging, release, cleanup or bypassing native resource/admission gates.

Status at handoff: **specification and reference artifacts only; production implementation pending**.

## Read first

1. Current repository AGENTS.md/CLAUDE.md and applicable workspace lifecycle policy; confirm writer ownership and existing dirty work.
2. [[FEAT-G-ARENA]] and its 20 acceptance rows, then SRS §4.1A.
3. [Approved screenshot](../../design-system/assets/arena-hero-inspector-20261108/desktop-approved.jpg), [compact screenshot](../../design-system/assets/arena-hero-inspector-20261108/compact-approved.jpg), and [manifest](../../design-system/assets/arena-hero-inspector-20261108/prototype-manifest.json).
4. Reference App.jsx/data.js/styles.css under the same artifact directory. They explain interaction behavior but must not be copied into production with demo fixtures or arbitrary timers enabled.
5. [PR #154](https://github.com/Freshair129/G-Maiden/pull/154): TT-00 then G-Review TT-R1→TT-R2 remain the tactical backend ordering. Its conflict resolution is separate work; do not force-push or silently rewrite that PR.
6. Current source producers and the CR-039 candidate boundary in src-tauri/src/gsi_ability.rs before implementing any live skill projection.

Baseline inspected: main **6a26d628992f0267ef4d848d92f2050bdbfa3c0f**, tree **7d4b48edde1e04976e4d60489ce48a28878ff518**.
PR #154 inspected at head **52fe8754e1239c4ed7b0990b63e24c249c54d56d**, open/draft and conflicting at that observation.
Re-resolve the current candidate and declarations before changes; these pins document the source used for this specification.

## Ordered work slices

| Slice | Work and completion condition |
| --- | --- |
| AR-00 / TT-00 refresh | Confirm owned writer checkout/branch/head, current source contracts and shared-file overlap. Record which native checks are admitted versus blocked. Preserve protected Task4/runtime work and unrelated changes. Do not allocate a worktree by habit. |
| AR-01 — read model | Add a pure, typed Arena view model and adapters for admitted own tick, roster, CV health/geometry and Party stats. Unit tests cover null/stale/source generations and stable identity. Unverified abilities never reach UI. |
| AR-02 — canvas | Replace only Live > สด body with Arena; reuse the existing Deck controllers and stage/tokens. Add roster, self card, fixed map region and reserved inspector. No route deletions. Complete AC-001/002/003/005/017 fixture coverage. |
| AR-03 — interactions | Implement shared card/marker selection, skill/item inline details, variable skill list, slot/charge distinctions, keyboard/Esc/X/focus and reset semantics. Complete AC-004/006–010/016 with deterministic inputs. |
| AR-04 — admitted live data | Connect only reviewed native projections. Existing item_names is not full inventory. Keep unknown where producers lack fields. Live abilities require the separate CR-039 real ownership evidence/admission review; do not expose candidates to finish a visual demo. Integrate the reviewed native G-Cooldown store only when available. |
| AR-05 — review and evidence | Run scoped frontend tests and UI screenshot/interaction checks. Run native/live/NFR checks only after actual resource/environment admission. Record every AC as PASS/FAIL/NOT_RUN/BLOCKED with head and evidence. Update SRS/feature ledger implementation status only to the level demonstrated. Open an implementation PR for review. |

AR-01–03 can proceed with explicit fixtures after ownership clearance; they do not need G-BuildPlan or the timer backend.
This does not reorder existing G-Review backend slices or authorize simultaneous writes to another owner's files.
AR-04 may be partially blocked while honest UI work continues. Do not label unknown-only UI as verified live skill support.

## Expected edit boundaries

Verify these paths against the current source before using them; proposed new files are not claimed to exist.

| Area | Intended changes / boundaries |
| --- | --- |
| src/src/CommandDeck.tsx | Route Arena inside the existing live tab and pass a read model from existing party/friends lifecycle owners; preserve other navigation and shortcuts |
| src/src/CompanionPages.tsx and new src/src/arena/* | Extract/reuse LiveMatchPage data consumption; add ArenaPage, HeroCard, HeroInspector, skill/item views, pure model/selection logic and scoped styles |
| src/src/live/events.ts / buildHeroes.ts | Reuse existing session/roster/geometry types; only add reviewed typed DTO fields when native producers actually provide them |
| src/src/party/* | Consume existing admitted peer stats; no new controller, consent shortcut or relay payload expansion |
| src-tauri/src/gsi.rs / gsi_ability.rs / items.rs | **Conditional owned slice only:** any own-skill/inventory projection must preserve attribution/privacy/freshness gates and be reviewed with the native owner. Retain candidate non-projection regression tests. No raw payload IPC. |
| Native G-Cooldown implementation from #154 | Reuse authoritative clock/store and bounded ULT/BKB/TP key contract; no independent React authoritative timer |
| Tests / documents | Co-locate focused model/interaction tests and evidence; update canonical spec/ledger when implementation and evidence exist |

Out of scope: HG binaries/assets, enemy data acquisition, new CV model/training, new Party fields, cloud/AI prompt expansion, Voice/replay/backend feature rewrites, production deployment, native build gate bypass, deleting/moving existing worktrees or caches.

## Verification and merge gates

- The reference bundle contains fixture-only evidence from the approved prototype; it is not evidence for the implementation head.
- Map geometry: freeze inputs, record content viewport and DPI, measure x/y/width/height before and after all inspector transitions; delta must be ≤1 CSS px.
- Verify the three desktop reference sizes using the production stage; no page-level scroll. Tablet/mobile prototype behavior does not waive ONE CANVAS.
- Validate all 20 cases in [[FEAT-G-ARENA]]. Run existing relevant route, Party lifecycle and GSI candidate non-projection tests where changed.
- Keep current whole-app NFR, consent and local-core access policies. Report native/live evidence separately from browser fixtures.
- Documentation updates require the current doc-graph CI gate and committed generated artifacts; PR protection/owner review still apply.
- Final report: owned branch/head, changed scope, actual commands/results, open ACs, native admission blockers with resume conditions, and reviewable PR. No merge/release/cleanup authority is implied.

## Disposition

This document is **READY_FOR_IMPLEMENTATION_HANDOFF**, not production acceptance.
The originating documentation task retains its local prototype/evidence and does not alter the incumbent's dirty/runtime checkout.
The incumbent should acknowledge the PR, owner/head and next slice; preserve its existing storage/native-build hold until the required inputs are qualified.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-08 | Transfer approved Arena design, ordered UI slices, source admission boundaries and implementation acceptance to the incumbent agent. |

