---
title: "G-Arena Hero Inspector — Implementation Handoff"
doc_id: "2026-11-08-g-arena-hero-inspector-handoff"
status: "accepted"
approved_by: "Boss — \"approve all action and start imp\" in orchestrator session"
approved_date: "2026-11-08"
version: "0.2.0"
updated: "2026-11-08"
owner: "Boss"
related_docs: ["FEAT-G-ARENA", "software-requirements-specification", "05-sitemap-ia", "FEAT-G-PARTY"]
---

# G-Arena Hero Inspector — Implementation Handoff

## Outcome and authority

The owner-approved outcome is one Command Deck with base Arena for every tier: large center map, compact enemy cards above, four ally slots below and own hero at left. Pro unlocks the full inspector, G-Cooldown timers, G-Party ally detail and G-Review integration inside that same UI, subject to source admission.
The canonical requirements are [[software-requirements-specification]] §4.1A and [[FEAT-G-ARENA]]. Entitlement authority and offline semantics are owned by [CR-047 §11.1 D-1 / §11.2 D-2](../../change%20request/CR-047-pro-tier-entitlement-contract.md) ([PR #169](https://github.com/Freshair129/G-Maiden/pull/169)). The owner explicitly selected the latest D-2 semantics for this revision; do not implement the older blanket offline downgrade.

**Current authorization (2026-11-08, CR-047 §11.3 D-3):** Boss approved #165 and ordered implementation start. The orchestrator assigns **AR-01..AR-03** (read model, canvas, interactions, Pro presentation path) to one writer on a new branch from main. Entitlement input is fixed to `absent` until the CR-047 §12 ADR is accepted; no lease, key, schema, Edge Function or UI-local grant. Pro presentation is exercised only by fixture/test input. AR-04 Pro timers wait for the reviewed #154 store; live skills wait for CR-039 ownership admission.

Status: **AR-00 recorded; AR-01..03 assigned; AR-04/05 partially blocked as above**.

## Read first

1. Current repository AGENTS.md/CLAUDE.md and applicable workspace lifecycle policy; confirm writer ownership and existing dirty work.
2. [[FEAT-G-ARENA]] and its 24 acceptance rows, then SRS §4.1A.
3. [Approved screenshot](../../design-system/assets/arena-hero-inspector-20261108/desktop-approved.jpg), [compact screenshot](../../design-system/assets/arena-hero-inspector-20261108/compact-approved.jpg), and [manifest](../../design-system/assets/arena-hero-inspector-20261108/prototype-manifest.json).
4. Reference App.jsx/data.js/styles.css under the same artifact directory. They explain interaction behavior but must not be copied into production with demo fixtures or arbitrary timers enabled.
5. [PR #154](https://github.com/Freshair129/G-Maiden/pull/154): TT-00 then G-Review TT-R1→TT-R2 remain the tactical backend ordering. Its conflict resolution is separate work; do not force-push or silently rewrite that PR.
6. CR-047 in #169: consume its decisions and prerequisites; do not edit its entitlement mechanism or infer authorization from sign-in.
7. Current source producers and the CR-039 candidate boundary in src-tauri/src/gsi_ability.rs before implementing any live skill projection.

Baseline inspected: main **6a26d628992f0267ef4d848d92f2050bdbfa3c0f**, tree **7d4b48edde1e04976e4d60489ce48a28878ff518**.
PR #154 inspected at head **52fe8754e1239c4ed7b0990b63e24c249c54d56d**, open/draft and conflicting at that observation.
These pins describe the original source inspection. This documentation revision merges main **5a489e7b05b62cc0b992a60bfeffe65785e4f8f3** (#166 overlay changes unchanged); it reads CR-047 at **7c1e30c66bca8fb524a0d86c7b15698986027323**. Re-resolve current candidates and declarations at the eventual implementation assignment.

## Dimensional layout reference

Read [[arena-layout-dimensional]] alongside the approved screenshots. The self-contained HTML/SVG/JPEG sheet adds two measured viewport plans and hero-card, skill-row and inventory details. Preserve the existing native stage; V1 native inner safe area and T1 minimum touch target remain [TBD] for measured implementation review. Prototype dimensions are observations, not new native constants. Existing sheets/screenshots retain historical dense tiles, fixture selection and prototype chrome; apply the production overrides in the guide before implementation.

## Ordered work slices

| Slice | Work and completion condition |
| --- | --- |
| AR-00 / TT-00 refresh | Before any implementation, record explicit orchestrator assignment, #165 owner approval, CR-047 ADR/M6 prerequisites, owned writer/head and collision review. Record timer-store readiness separately for the Pro timer slice. Preserve TT-00 → G-Review TT-R1 → TT-R2, protected runtimes and unknown owners. No new worktree by habit. |
| AR-01 — read model | After AR-00, add pure typed adapters for admitted own tick/roster/CV/Party and consume the existing entitlement authority result for presentation. Cover base/Pro/offline-valid/lapsed/revoked/unverifiable, late-response rejection and unchanged source admission; do not create a new entitlement DTO/mechanism or expose unverified abilities. |
| AR-02 — canvas | One Live > สด Arena for every tier. Preserve all 7 pages and tabs [สด / บิลด์ / ฮีโร่ CV / G-Party], existing CommandDeck useParty/useFriends owner, stage/tokens. Add compact enemy/unknown-ally cards, self, fixed map and neutral reserved region; map first, missing alert second. Complete AC-001/002/003/005/017/023 fixtures. |
| AR-03 — interactions | User selection only opens Pro full inspector; base retains summary/neutral. Implement admitted skill/item details, keyboard/Esc/X/focus, no unknown-only rows, tier transitions and every-tier ดูเหตุการณ์ local event tab. Reuse reviewed G-Review target only for Pro. Complete AC-004/006–010/015/016/021–024 with deterministic inputs; no CM preselect in production. |
| AR-04 — admitted live data | Connect only reviewed projections. Pro never expands data/consent rights. CR-039 real ownership admission precedes live skills; item_names is not inventory. Reuse #154 native store for Pro timers once ready. Preserve Party freshness/withdrawal and one relay owner. Tier loss removes presentation only; no producer/store reset or core gate. |
| AR-05 — review and evidence | Verify all 24 cases, tier transition/no-blank/focus/map invariants, navigation and local timeline. Run scoped frontend/visual checks; native/live/NFR only with resource/environment admission. Record PASS/FAIL/NOT_RUN/BLOCKED per case and exact head; keep fixture and native evidence separate. Implementation PR and owner review are subsequent gates. |

AR-01–05 are future assignment slices, not permission to begin code now. After the prerequisites and assignment are satisfied, fixture/model work need not wait for G-BuildPlan; Pro timer integration still waits for the reviewed #154 store. This preserves the tactical backend order and does not authorize writes to another owner's workspace.

## Base / Pro and loss-of-entitlement handoff

Use [[FEAT-G-ARENA]] §2.1 as the capability table and §2.2 as the UI state oracle. Base keeps map, own hero, enemy seen/missing/age and the local event timeline. Pro adds the four reviewed features in place. Offline with a valid lease retains Pro under D-2; revoked/lapsed/unverifiable authority removes Pro presentation immediately without blank/stuck states, notification noise or a map shift. Clear stale Pro selection/detail, keep core/feed/producers/store intact, and require new user selection after entitlement recovery. No UI-local grant or alternate lease mechanism.

## Expected edit boundaries (future explicit assignment only)

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
- Validate all 24 cases in [[FEAT-G-ARENA]]. Run existing relevant route, Party lifecycle and GSI candidate non-projection tests where changed.
- Keep current whole-app NFR, consent and local-core access policies. Report native/live evidence separately from browser fixtures.
- Documentation updates require the current doc-graph CI gate and committed generated artifacts; PR protection/owner review still apply.
- Final report: owned branch/head, changed scope, actual commands/results, open ACs, native admission blockers with resume conditions, and reviewable PR. No merge/release/cleanup authority is implied.

## Disposition

This document is **BLOCKED_BY_DEPENDENCY / AWAITING_EXPLICIT_IMPLEMENTATION_ASSIGNMENT**, not production acceptance. Resume only when the AR-00 prerequisites and assignment are recorded; documentation review may proceed now.
The originating documentation task retains its local prototype/evidence and does not alter the incumbent's dirty/runtime checkout.
The incumbent should acknowledge the revised PR and prerequisites, not start AR-01. Preserve its existing storage/native-build hold until required inputs are qualified. Remaining decisions: V1 native inner safe area, T1 minimum touch target, follow-up entitlement ADR details owned by #169, and source/native acceptance evidence. D-2 resolved the former Q1–Q4/Q6 decision set; do not report those as unanswered.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-08 | Transfer approved Arena design, ordered UI slices, source admission boundaries and implementation acceptance to the incumbent agent. |
| 0.1.1 | 2026-11-08 | Add dimensional drawing reference and native integration TBD boundaries. |
| 0.1.2 | 2026-11-08 | Apply owner D-1/D-2 and four UX adjustments to AR-00–05; make code authorization conditional on explicit assignment/dependencies, preserve navigation and add tier/timeline acceptance. |
| 0.2.0 | 2026-11-08 | Record AR-00: Boss approval and implementation assignment for AR-01..03 under CR-047 D-3; entitlement fixed to `absent`. |
