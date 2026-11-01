---
title: "ADR-19: Local HUD Observation and Action-Scoped Lethality"
doc_id: "ADR-19-local-hud-observation-and-action-lethality"
status: "draft"
version: "0.1.2"
updated: "2026-10-28"
owner: "Boss"
source_of_truth: true
related_docs: ["CR-035-selected-target-hud-cv-and-action-lethality", "FEAT-G-DAMAGE", "G-SERIES-DATA-LINEAGE", "ADR-13-dxgi-capture-migration", "ADR-10-hybrid-ingestion-resilience", "mvp-decisions"]
---

# ADR-19 — Local HUD Observation and Action-Scoped Lethality

> **Status: PROPOSED, not accepted.** Issue [#71](https://github.com/Freshair129/G-Maiden/issues/71) · Change request [[CR-035-selected-target-hud-cv-and-action-lethality]]. Implementation and ranked-play use still require design, policy and evidence gates. The text below is an architectural **proposal**, not confirmation that it exists in the build.

## 1. Context

G-Maiden already ingests player-authorized GSI, observes the minimap with DXGI + CV, and implements parts of G-Damage in Rust. For offensive action evaluation (e.g. Sniper's **Assassinate** against a currently selected enemy), the missing inputs are target identity, live HP, armor and magic resistance.

Dota 2's Selected Unit Panel can expose information visible to the player on selecting a unit. Depending on HUD settings, the target data may replace the player's control-console panel or appear in a separate unit-query panel. The data **cannot be assumed present in both UI modes**. GSI is *not* an authoritative live enemy-stat feed; LLMs and OpenDota should not be used to synthesize absent values.

Current code:
- `dxgi.rs::acquire_rect` copies one ROI per capture acquisition. Two calls do not guarantee same frame and can consume acquisition time.
- `capture.rs` owns minimap CV and G-Signal's real-time priority; `cv/draft_region.rs` approximates **draft** portraits, not selected-unit live HUD.
- `ocr.rs` exists but has no live scoreboard/target reader.
- `damage.rs::TargetCombatSnapshot` includes an HP interval, age/quality gates, normalized armor and magic resistance; its live target adapter is not wired.
- `damage.rs::can_i_kill_with` evaluates a modeled **combo** including multiple abilities and attacks, not an isolated single action.
- `src-tauri/data/provenance.json` reports incomplete ability/item patch provenance. Stale Sniper definitions cannot validate a live Assassinate call.

## 2. Proposed decision

**D1 — Only local player-visible pixels are valid target-stat observations.**
Use DXGI Desktop Duplication to capture read-only HUD regions. Do not use Bot Scripting API in a human match, memory scanning, DLL injection, network packet sniffing, or game client modification to acquire hidden state. Capture and inference remain on-device; other sources may provide own-stat GSI or *verified patch definitions*, but may not magically assert the current enemy's hidden HP/modifiers.

**D2 — Single acquired frame with multiple extracted ROI(s).**
Extend the existing DXGI/capture architecture to acquire one frame once, produce `FrameBundle {frame_id, session_epoch, observed_at_monotonic_ms}`, copy/crop minimap and selected-target HUD ROIs, and release the acquired frame exactly once. The default 4/8/2Hz minimap cadence and critical voice path retain priority. Under CPU/RAM pressure, **drop or reduce target OCR first**, not G-Signal; report freshness/coverage loss rather than reusing stale frames.

**D3 — Selection is a stateful visual observation, not a mouse event.**
Watch the selected-unit panel to detect *potential* identity changes, then validate portrait/name/visible stats with temporal consistency and bounded frame time. A click is not proof of a particular target. Use `UNKNOWN` on selection churn, mismatched portrait, HUD transition, occlusion, invalid OCR, uncalibrated layout or ambiguous team/unit. Mode A (control-console override ON) and mode B (unit-query panel OFF) are separately calibrated; absent fields must be marked unavailable.

**D4 — Per-field provenance, TTL and target/session identity are mandatory.**
Every target stat carries its original frame/clock/source/quality; invalidate immediately on target switch or `session_epoch` change. A new message or recalculation never refreshes an old stat's timestamp. Use `TargetCombatSnapshot` and its existing fail-closed rules as the canonical G-Damage ingress: HP observation age ≤500ms, defensive stat age ≤5s, data-quality floor as currently defined. Any missing required field leads to no `KillWindow`, not a guessed value.

**D5 — Separate action-specific math from full-burst math.**
Expose a new action-level calculation contract (e.g. `ActionDamageEstimate`) that represents **one attack / one spell / one named combo** explicitly. It must not present `can_i_kill_with`'s sum of abilities + assumed attacks as Sniper Assassinate single-cast damage. Compute effective physical/magical/pure damage using verified skill mechanics, own level/available resources, target defenses, and travel/regen/buff uncertainty. Every formula and dataset is keyed to a verified Dota patch; unknown patch or unsupported modifiers fail closed.

**D6 — Read-only and non-deceptive advice.**
Start in shadow/QA mode: no live kill prompts until source, policy and calibration gates pass. When released, the overlay may show `lethal_possible`, `nonlethal_on_current_evidence`, or `unknown`, bounded intervals, decision age, and caveats. The UI must distinguish **measurement confidence** from **empirically calibrated probability of securing a kill**; no unconditional “ยิงเลย/kill guaranteed” when uncertainty remains. No auto-targeting, casting, mouse/keyboard events, or hidden commands.

**D7 — Preserve current privacy contract.**
Raw frames, OCR text and target CV data remain local-only; do not place them in Claude/Anthropic requests, Ollama network requests, OpenDota/Supabase calls or account telemetry. Externally authored datasets used to **verify static game mechanics** do not become permission to upload the user's match. Local diagnostic logs carry only bounded sanitized metadata approved by the product data contract; opt-in capture evidence uses explicit local QA controls.

## 3. Processing contracts

```text
Dota 2 window (borderless) + player-selected unit
    |
    v
DXGI one AcquireNextFrame => FrameBundle(epoch, frame_id, t_capture)
    +-- minimap ROI => existing G-Sentry/G-Motion/G-Signal (highest priority)
    +-- selected HUD ROI => PanelModeDetector => SelectionTracker
                                  => ROI/OCR/health interval
                                  => TargetCombatSnapshot adapter [Rust, local]
                                           +
GSI own player observation -----------------+----> ActionScopedDamagePolicy
Verified current-patch Sniper action data --+        |
                                                    v
                                      action_damage_estimate / UNKNOWN
                                                    |
                                              local overlay/G-Log
```

Proposed `SelectionState`: `NO_TARGET`, `CANDIDATE`, `CONFIRMED(id)`, `UNKNOWN(reason)`, `STALE`. The state machine **never** treats another target's last-known HP as present HP. `respawn` and `dead` are separate from target visibility; do not infer alive/dead solely from minimap absence.

Suggested internal interfaces (design, not implementation):

```rust
struct FrameBundle {
    frame_id: u64,
    session_epoch: u64,
    observed_at_ms: u64,
    // read-only ROI images owned/released independently of DXGI
}

enum TargetSelection {
    Confirmed { target_id: String },
    NoTarget,
    Unknown { reason: &'static str },
}

enum ActionVerdict {
    LethalPossible,
    NonlethalOnEvidence,
    Unknown,
}
```

For a numeric example: if a target has HP `[390, 410]` and *fully verified* effective damage lies `[425, 440]`, the conservative margin is `425 - 410 = +15`; **still not guaranteed lethal** when immunity/barrier/regen/travel or other action modifiers cannot be ruled out. A single bar ratio without verified Max HP does not provide an absolute HP interval.

The existing `TargetCombatSnapshot::to_kill_input()` is the source-safe boundary for a complete target; adapt rather than duplicate it. Review its uniform-prior `kill_confidence()` model before presenting any value as a statistical probability.

## 4. Options considered

| Option | Decision | Reason |
| --- | --- | --- |
| **DXGI HUD ROI + local OCR + fail-closed target snapshot** | **Proposed** | Reads only visible player UI, reuses on-device Rust pipeline and existing stat contract |
| Separate `acquire_rect()` call for each ROI | Reject as default | Uncoordinated frame timestamps/acquisition and extra budget; may miss UI changes |
| Full-frame VLM/LLM each tick | Reject | Too slow, resource heavy and unreliable for exact numeric fields; cloud privacy violation |
| GSI as enemy selected-target authority | Reject | Not exposed by current own-game GSI feed |
| Valve Bot Script or process-memory read in ranked | Reject | Unsupported/unfair sensor channel; risk of policy/anti-cheat breach |
| Infer enemy armor/MR/items from static hero defaults as **certain** | Reject | Purchases, levels, status effects and patch variation invalidate the assumption |
| Reuse full-burst kill window for single Assassinate | Reject | Counts actions never executed in the requested single-cast question |
| Disable the feature if evidence is inadequate | Accept fallback | Honest `UNKNOWN` is preferable to a false kill call |

## 5. Consequences

**Positive:** smaller bounded CV regions, per-target visible data, reuses current `TargetCombatSnapshot`, reduces dependence on fog-unknown minimap projections, doesn't block on LLM, and gives an auditable path to action-specific damage.

**Costs:** explicit dual-mode HUD calibration and localization/fonts, extra capture/OCR resource budget, OCR and patch regression fixtures, race-free frame ownership, defensive stat coverage gaps, continuous expiration/retraction logic, new policy/competitive-integrity review.

**Neutral limitations:** screenshots cannot reveal hidden buffs or future regen; presence of a selected unit panel does not certify every field shown. A numeric damage estimate is not equivalent to permission for automated gameplay advice in every competition. No claim that this feature is safe from Valve enforcement before separate review.

## 6. Verification & rollout gates

1. **Design:** documented UI-mode matrix, target identification conditions, source-authority and policy review; map existing `MVP-017/018/021/048/050` acceptance requirements without silently marking deferred `MVP-054` complete.
2. **Capture:** prove single acquisition/releases under timeout, device reset, monitor move, GDI fallback, calibration and concurrent frame requests; profile ROI payloads and stale semantics.
3. **Detector:** held-out labeled captures for enemy hero, ally, creep, building, no-target, HUD switches, fog, occlusion and read errors. Agree quality thresholds before observing test results.
4. **Damage:** fixed-source current-patch receipts for Sniper Assassinate and its attack/talent/item interaction; deterministic typed/unit tests for armor (points), MR (%), level, HP interval, mana/cooldown, barriers/regeneration/travel and patch mismatch.
5. **System:** Win10 19045 / Win11 26100 accepted matrix; critical voice **p50 ≤250ms and every measured sample ≤300ms**, whole-app CPU ≤10%, aggregate peak RAM ≤900,000,000 bytes, Dota FPS drop ≤3%; verify with minimap + target ROI enabled.
6. **Security/Privacy:** outbound packet/payload inspection, no external CV/target data, no injection/automated game actions. Live enabled only after explicit owner acceptance and fair-play rules review.

**Rollback:** feature isolated behind not-enabled-by-default product gate during proof; turn off target ROI/OCR and revert to the existing GSI+minimap path without changing player data, game client or cloud schema. The presence of a technical flag in a proposed design does not waive the repository's rule against accumulating ungoverned compatibility flags.

## 7. Related documents and tracking

- [[CR-035-selected-target-hud-cv-and-action-lethality]]
- [[FEAT-G-DAMAGE]]
- [[G-SERIES-DATA-LINEAGE]]
- [[ADR-13-dxgi-capture-migration]]
- [[ADR-10-hybrid-ingestion-resilience]]
- [[mvp-decisions]]
- [GitHub Issue #71](https://github.com/Freshair129/G-Maiden/issues/71)

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-18 | Proposed local player-visible selected-target ROI observation, shared-frame capture, source-safe target state and action-scoped lethality architecture; pending approval and evidence. |
| 0.1.1 | 2026-10-28 | Align active RAM target with owner-approved800MB aggregate full Working Set (MVP decision v0.4.0); retain accounting and historical evidence. |
| 0.1.2 | 2026-10-28 | Align active MVP RAM ceiling to owner-approved900MB aggregate Working Set; preserve accounting and historical evidence. |
