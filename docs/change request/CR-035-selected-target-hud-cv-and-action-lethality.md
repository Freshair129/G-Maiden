---
title: "CR-035: Selected Target HUD CV and Action-Specific Lethality"
doc_id: "CR-035-selected-target-hud-cv-and-action-lethality"
status: "draft"
version: "0.1.0"
updated: "2026-10-18"
owner: "Boss"
source_of_truth: true
change_class: "C-3"
risk: "HIGH"
related_docs: ["ADR-19-local-hud-observation-and-action-lethality", "FEAT-G-DAMAGE", "G-SERIES-DATA-LINEAGE", "ADR-13-dxgi-capture-migration", "mvp-decisions", "mvp-backlog"]
---

# CR-035 — Selected Target HUD CV + Action-Specific Lethality

> **Tracking:** [GitHub Issue #71](https://github.com/Freshair129/G-Maiden/issues/71) · **Decision:** proposal, NOT approved for implementation or live release · **Architecture:** [[ADR-19-local-hud-observation-and-action-lethality]] (proposed) · **Owner system:** [[FEAT-G-DAMAGE]].
>
> เอกสารนี้เพิ่ม adapter และ action-level contract ให้ G-Damage เดิม **ไม่ใช่** การอ้างว่า OCR, selected-target recognition หรือ kill prediction ทำงานจริงแล้ว และไม่ยกเลิก MVP gates เดิม

## 1. Problem and goal

GSI `GameTick` ปัจจุบันให้ข้อมูลของฮีโร่ผู้เล่นเอง ไม่ให้ authoritative current HP, armor, magic resistance หรือ level ของฮีโร่เป้าหมายที่ผู้เล่นคลิก. ผู้เล่นมองเห็นข้อมูลส่วนหนึ่งจาก **Selected Unit Panel** บน HUD เมื่อเลือกยูนิตเป้าหมาย; G-Maiden ควรอ่านเฉพาะข้อมูลภาพที่ผู้เล่นได้รับอนุญาตให้เห็นแล้ว เพื่อประเมินว่า *Action เดียว* เช่น Sniper `Assassinate` มีดาเมจพอฆ่าเป้าหมายหรือไม่ โดยไม่ส่ง raw CV/OCR ออกเครื่อง.

### Verified source baseline (at drafting)

- `src-tauri/src/dxgi.rs`: `acquire_rect()` ใช้ GPU copy เฉพาะ ROI ได้ แต่แต่ละ call ทำ acquisition ใหม่; single-frame multi-ROI ยังไม่ได้ implement.
- `src-tauri/src/capture.rs`: DXGI → minimap prefilter/ONNX → G-Sentry/G-Motion/G-Signal, 250 ms normal / 125 ms alert / 500 ms throttled. Draft strip ROI ใช้ก่อนเข้าเกม; **ไม่ใช่** selected-target live panel detector.
- `src-tauri/src/gsi.rs`: มี own-hero `GameTick` และ session identity; ไม่มี selected-target enemy stat source. โปรด audit จริงว่า `abilities` ใน raw GSI มีอะไรบ้างก่อนออกแบบตัวอ่าน skill level/talent.
- `src-tauri/src/ocr.rs`: OCR wrapper มีแล้วแต่ยังไม่มี live selected-target consumer และ models ไม่ถูก bundle.
- `src-tauri/src/damage.rs`: `TargetCombatSnapshot` + `can_i_kill_from_snapshot` มีเป็น source-neutral, fail-closed scaffold; `can_i_kill_with` เป็น **full-burst** model ไม่ใช่คำนวณ Assassinate นัดเดียว.
- `src-tauri/data/provenance.json`: curated ability/item values มี patch/revision ที่ยังไม่ยืนยัน; ตัวเลขใน `heroes.json` ห้ามเรียกว่า current-patch authoritative หากไม่มี receipt.
- `docs/product/mvp-decisions.md`: CV, raw GSI/logs/memory ต้อง local-only; G-Signal critical path pure Rust และต้องไม่เสีย NFR.

## 2. Scope boundary

**In scope:** player-visible HUD capture, target-panel ROI detection, selected-unit identity + field validity, bounded local OCR/HP interval, reusable target observation, single-action damage estimation, read-only overlay/telemetry, replay and live validation.

**Out of scope:** Bot API to inspect live human matches, process memory/game injection, fog-hidden enemy stats, packet interception, mouse/keyboard/control automation, autocast, external game-data exfiltration, claiming exact kill odds without calibrated evidence, full-hero combat support in first slice, payment, and generalized live Top Hero Bar death/respawn observer (separate follow-up).

**Supported rollout target:** Windows x64 1920×1080, 16:9, 100% DPI, default Dota HUD, borderless fullscreen, one display, standard own-game live 5v5. Other layout/monitor/DPI/HUD customizations start as `UNCALIBRATED` until explicitly measured. Both `Unit query overrides hero control console` ON and OFF require distinct, empirically validated layouts; if panel omits fields, do not infer they were visible.

## 3. Functional requirements (EARS)

| ID | Requirement |
| --- | --- |
| CR035-FR-01 | WHEN a new DXGI frame arrives THEN capture one frame timestamp/epoch and extract requested minimap and selected-target ROIs from that same frame, with bounded allocation and no second uncoordinated `AcquireNextFrame` for the same logical observation. |
| CR035-FR-02 | WHEN the selected-unit panel changes THEN emit a *candidate selection* observation; only confirm after stable target identity + required evidence, **not** from mouse-click interception alone. |
| CR035-FR-03 | IF selected target is unidentifiable, ally/non-hero, deselected, dead, fog-hidden, obscured, HUD-mismatched, or changed during OCR THEN outcome SHALL be `UNKNOWN` or `UNAVAILABLE`; never reuse a previous target's HP. |
| CR035-FR-04 | WHEN visible target health is displayed THEN produce absolute HP `[low,high]` with provenance, observed monotonic timestamp, source quality and confidence. If only relative bar ratio is visible, convert only with independently verified `max_hp`; otherwise no absolute HP conclusion. |
| CR035-FR-05 | WHEN visible level/armor/MR are verified THEN normalize level to integer, armor to raw points, and MR to percentage (e.g. 25.0 means 25%), preserving field-level source and age. Unknown modifiers remain unknown. |
| CR035-FR-06 | WHEN a complete, fresh target observation is available THEN adapt to existing `TargetCombatSnapshot` and `to_kill_input`; HP TTL ≤500ms, target defensive-stat TTL ≤5s and source quality floor from current G-Damage contract SHALL remain binding. |
| CR035-FR-07 | WHEN the player changes target, HUD disappears, session epoch changes, GSI goes stale for a necessary self-field, or source confidence falls below threshold THEN invalidate the current kill estimate immediately (no old-target reuse). |
| CR035-FR-08 | WHEN the selected action is `Sniper.Assassinate` THEN use an **action-specific** damage model driven by verified current-patch skill mechanics, own effective attack damage/level/talents/items/availability and target defenses. Never reuse general `burst_damage_with` as a single-cast result without a proven action breakdown. |
| CR035-FR-09 | IF travel time, regen, barrier, spell block, immunity, amplification, resistances, fog, or patch coverage are unresolved THEN expose a bounded estimate/unknown reason; do not issue a deterministic `kill guaranteed` or call-to-action. |
| CR035-FR-10 | WHEN the estimate is eligible for display THEN publish local read-only overlay advisory with target identity, action, damage interval, margin, source ages, missing inputs and calibration confidence; no auto-click, no auto-cast, no LLM on hot path. |
| CR035-FR-11 | WHEN a decision changes from eligible to unknown/stale THEN retract the advisory and log a bounded, privacy-safe revision; do not continue displaying an obsolete “lethal” state. |

## 4. Proposed processing and event contract

```text
DXGI.AcquireOneFrame -> FrameBundle { epoch, acquired_at_ms, ROI crops }
  ├─ MinimapObserver (existing, latency-critical)
  └─ SelectedTargetObserver (new, lower priority)
       -> PanelModeDetector (override ON/OFF + calibration)
       -> TargetSelectionTracker (stable hero/slot/unknown)
       -> TargetStatReader (OCR; bar-HP interval, armor/MR/level when visible)
       -> TargetCombatSnapshot adapter [local only]
             + OwnPlayerGameTick + ApprovedPatchActionDefinition
             -> ActionDamageEstimate [single cast] -> Overlay + G-Log metadata
```

One frame means one DXGI `AcquireNextFrame` / matching `ReleaseFrame`; extract multiple small ROIs using GPU subrect copies from the acquired resource or an equivalent *measured* implementation. Shared `frame_id`, `session_epoch`, and `observed_at_ms` are mandatory. Avoid enlarging a union crop across the entire screen solely to simplify wiring.

**Data examples (proposed; not shipped):**

```json
{
  "schema": "selected-target-observation.v1",
  "session_epoch": 42,
  "frame_id": 9182,
  "selected_target": {"id": "npc_dota_hero_pudge", "team": "dire", "state": "confirmed"},
  "hp": {"low": 389, "high": 407, "source": "hud_selected_unit_ocr", "observed_at_ms": 102400},
  "armor": {"value": null, "source": "unavailable"},
  "magic_resistance_pct": {"value": null, "source": "unavailable"},
  "level": {"value": 12, "source": "hud_selected_unit_ocr", "observed_at_ms": 102400},
  "sensor": {"mode": "override_on", "calibrated": true, "quality": "partial"}
}
```

**Illustrative only:** this partial record SHALL NOT generate a `KillWindow` (armor and MR absent). Source-quality confidence is not the calibrated probability of a kill.

Action estimate response (proposed): `{ action_id, target_id, effective_damage_low, effective_damage_high, hp_low, hp_high, margin_low, margin_high, verdict: "lethal_possible" | "nonlethal_on_current_evidence" | "unknown", source_age_ms, missing_factors, patch_id }`. If the formula has unverified modifiers, emit `unknown` rather than forcing the range.

## 5. Explicit technical choices

1. **Read-only observation** through DXGI; no memory read, hook, client modification, or hidden-state inference as truth.
2. **Two HUD modes:** control-console override ON and independent unit-query panel OFF, both calibrated from real captures; absent fields remain unknown.
3. **Do not do full-frame OCR each tick.** Cheap diff/selection/ROI health detectors gate bounded asynchronous OCR; hot G-Signal always wins scheduler priority.
4. **Identity before stats:** never attach HP to a hero solely from proximity of cursor or a minimap track; require target panel evidence and bounded same-frame identity.
5. **No single timestamp laundering:** record per-field source and age (or invalidate whole normalized snapshot to earliest required field), not a fresh packet timestamp for old cached stats.
6. **Damage formulas separated by action:** single cast vs full burst; calibrate with actual game mechanics and current-patch receipts.
7. **No fake probabilities:** existing `kill_confidence()` assumes uniform EHP uncertainty; without field-labeled calibration, treat it as heuristic confidence, not frequency-calibrated “chance to kill”.
8. **Local-only:** do not add target/CV/OCR/raw frame fields to external G-Master prompts, Supabase, telemetry, OpenDota, or cloud egress.

## 6. Delivery plan and dependencies

| WP | Owner area | Deliverable | Gate |
| --- | --- | --- | --- |
| 0 | QA/Product | HUD fixture matrix, fair-play/policy review, labels, patch receipts, expected coverage | design/authorization before implementation |
| 1 | Rust/DXGI | one acquired frame / multiple ROI crops + health, timestamps and regression tests | capture correctness and G-Signal non-regression |
| 2 | CV/OCR | selected target stable identity, two-mode calibration, HP interval, armor/MR/level confidence; degraded states | held-out detection/OCR quality receipt |
| 3 | G-Damage | adapter to existing `TargetCombatSnapshot`, single-action calculation and patch guard | deterministic formula + unverified-modifier tests |
| 4 | UI/Logs | read-only overlay, retraction, source/unknown status and privacy-safe local logs | UX/privacy/latency review |
| 5 | QA | end-to-end game probes; opt-in guarded beta only after acceptance | owner release gate |

Do not start by changing `MVP-054` to DONE: target-side live damage remains deferred in current `mvp-backlog`; schedule this as a separately approved feature with documented dependency/priority changes, not an implicit MVP promise. Reuse `MVP-017/018/021/048/050` coverage, unknown, quality, performance and privacy test contracts.

## 7. Acceptance / evidence matrix

- **Input:** selected enemy → stable target id; enemy switch mid-OCR → invalidate; ally/creep/building → no hero-kill estimate; target deselect → clear; UI open/closed/minimized/occluded → no hallucinated values.
- **HUD variants:** override ON/OFF, full/partial panel, draft-to-match, default HUD, 1080p; unsupported scaling/resolution returns uncalibrated. Overlay must not cover target read.
- **HP:** exact visible digits when available; proportional bar read becomes interval, never an exact HP value without certified max HP. Inject OCR mistakes and dropout; verify false-confidence suppression.
- **Combat:** only verified Sniper action; action level, cooldown/mana, target armor/MR, abilities, talent, travel and regen; patch mismatch or missing required modifier -> unknown.
- **Timing:** validate existing 500ms HP / 5s stats age contracts in tests, and measure acquisition→observation→overlay latency by p50/p95/p99; no unverified new latency guarantee.
- **NFR:** current critical G-Signal p50 ≤250ms and **every measured sample** ≤300ms from acquisition to first audible sample; whole-app CPU ≤10% normalized (1s samples), aggregate peak Working Set ≤400,000,000 bytes, Dota FPS drop ≤3%. Measure on accepted Windows/Dota matrix.
- **Integrity/privacy:** evidence of 0 raw frame/OCR/CV egress, no unauthorized interaction with Dota, documented policy/fair-play determination prior to any live-match release.
- **Unit/integration:** ROI frame/ReleaseFrame ownership, session lifecycle, target switch, stale source, model errors, patch provenance, self/target separation; held-out labeled fixture outcomes and reproducible native Windows run.

**DoD:** completed implementation PR(s) with explicit changed files, tests, native game evidence, measurable quality thresholds agreed *before* reading results, patch-linked references, and owner acceptance. Documentation alone closes no implementation task.

## 8. Risks, rollback and decisions needed

| Risk | Mitigation |
| --- | --- |
| Additional ROI/copy/OCR delays gank warning | capture once; low-priority OCR; throttle/drop stale target work; retain current minimap path |
| False “kill secure” prompts mislead player | shadow mode and read-only advisory; calibrated confidence and `UNKNOWN`; no automatic call to action |
| Selected unit panel lacks Armor/MR depending on layout | explicit per-layout coverage matrix; do not derive hidden buffs/items from assumptions |
| Patch drift in Sniper mechanics / source datasets | patch ID and verified receipts; fail closed until updated |
| Ambiguous competitive-integrity rules | product/legal/operator review before ranked-mode activation; no ban-safe guarantee |
| Multiple source age clocks | monotonic time + per-field provenance + session epoch invalidation |

Rollback: disable SelectedTargetObserver / related advisory, preserve existing GSI/minimap/G-Signal pipeline and source-neutral G-Damage scaffolding; no schema migration or cloud changes in this CR.

**Open decisions:** choose current-patch source/verification cadence; determine acceptable ROI/OCR false-positive thresholds using labeled data before rollout; decide whether HUD detection can operate in ranked matches under current Valve/tournament rules; approve first supported unit-query mode after fixture evidence.

## Related

- [[ADR-19-local-hud-observation-and-action-lethality]]
- [[FEAT-G-DAMAGE]]
- [[G-SERIES-DATA-LINEAGE]]
- [[ADR-13-dxgi-capture-migration]]
- [[mvp-decisions]]
- [Issue #71](https://github.com/Freshair129/G-Maiden/issues/71)

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-18 | Initial proposed CR: SelectedTargetObserver, shared-frame ROI, source-safe target HP/defense, Sniper single-action damage, tests and policy gates; no runtime changes. |
