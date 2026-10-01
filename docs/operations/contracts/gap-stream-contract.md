---
title: "G-Stream Stream-Safe Co-host Contract"
doc_id: "gap-stream-contract"
status: draft
version: "0.3.0"
updated: "2026-10-01"
owner: "RWANG"
attributes:
  change_class: "C-2"
  privacy_risk: "HIGH"
  decision_gate: "Privacy Owner acceptance required before implementation"
---

# G-Stream Stream-Safe Co-host Contract

- **Complexity:** C-2, documentation-driven implementation.
- **Risk:** HIGH, because private identity, player history, live game state, and generated speech may become public broadcast content.
- **Contract state:** Draft only. G-Stream implementation, Privacy Owner acceptance, and stream-safe behavior are not claimed; the separate QA calibration capture path is documented below.
- **Source baseline:** source tree pinned to `2d969ac643533b4b8e24494356da2e818eac874f`; this documentation lane starts from `b9712fd9ffed472a7bf666e8a829e4b025e563cb`.

## 1. Purpose and authority

G-Stream is a future streamer co-host design, not a current module. The feature spec says it should mask MMR/rank, a player's real name, and G-Memory details; use only aggregate death-hotspot data; adjust overlay presentation; and let Maiden address viewers. The SRS requires G-Memory/G-Log to stay local. These requirements do not establish an implemented privacy filter or authorize broadcast disclosure.

This contract defines the minimum privacy gate for later work. **Local storage is not masking:** a local memory fact can still be disclosed by on-screen text, a spoken line, a banner, a screenshot, or a captured window. Every viewer-facing output must pass the same fail-closed field policy before render or speech.

The named source set shows the overlay and deck entry points, but not all imported child views or the full overlay renderer. Unknown fields/surfaces stay blocked until their complete output inventory is reviewed. The related [G-Memory contract](gap-memory-contract.md) is itself draft; it is not privacy-owner approval or authorization to feed memory to G-Stream.

## 2. Evidence and current-state boundary

| Evidence class | Source finding | Contract consequence |
| --- | --- | --- |
| REQUIREMENT | [FEAT-G-STREAM](../../features/FEAT-G-STREAM.md#L1) calls G-Stream unimplemented and lists MMR/rank, real name, G-Memory details, death hotspots, overlay changes, and co-host speech. | Treat the file as a candidate design, not shipped behavior. |
| REQUIREMENT | [SRS §3.8](../../product/software-requirements-specification.md#L127) describes persistent player facts; [§3.12](../../product/software-requirements-specification.md#L163) says G-Memory/G-Log data stays local. | Locality must remain separate from redaction and public-output approval. |
| SOURCE | [Overlay state and listeners](../../../src/src/app/Overlay.tsx#L47) hold transient text, banners, match state, CV, and advice; [the full-mode branch](../../../src/src/app/Overlay.tsx#L570) passes match and transient data to FullOverlay. | The visible full-mode field set is not fully enumerated by the inspected file; do not certify it safe. |
| SOURCE | [CommandDeck profile header](../../../src/src/CommandDeck.tsx#L119) derives visible name/subtitle from displayName and email; [the deck render](../../../src/src/CommandDeck.tsx#L614) mounts several imported views. | Identity is already surfaced in the deck header; imported child fields need a separate inventory before stream-safe approval. |
| SOURCE | [Overlay fallback renderer](../../../src/src/app/Overlay.tsx#L459) contains CV debug detections, missing-hero/gank/advice/buyback/toast panels, kill/pack banners, and optional match-stat fields. | These are known sensitive output surfaces; the fallback branch is not asserted to be the active full-mode renderer. |
| SOURCE | When `sRef.current.calibration` is true, Overlay invokes `capture_calibration_clip` for danger, revision, persona, and advice events with `event`, text, and selected context ([danger](../../../src/src/app/Overlay.tsx#L225), [revision](../../../src/src/app/Overlay.tsx#L250), [persona](../../../src/src/app/Overlay.tsx#L312), [advice](../../../src/src/app/Overlay.tsx#L436)). `lib.rs` dispatches this command to `calibration::record` ([command](../../../src-tauri/src/lib.rs#L634)). | An opt-in QA capture command path exists; the command arguments are visible in source. |
| SOURCE | The calibration module says it is off by default and stores artifacts locally ([mode/output summary](../../../src-tauri/src/calibration.rs#L1), [local-path comment](../../../src-tauri/src/calibration.rs#L12)). `base_dir` uses `%LOCALAPPDATA%` when set and falls back to `.` when unset, then appends `G-Maiden/calibration` ([base path](../../../src-tauri/src/calibration.rs#L67)). A CV-only screenshot uses the latest full-screen frame and writes PNG plus `audit.jsonl` context ([full-screen mode](../../../src-tauri/src/calibration.rs#L6), [screenshot](../../../src-tauri/src/calibration.rs#L187)). Voice-paired clips write a GIF, sampled keyframe PNGs, and audit fields including line/context ([clip output](../../../src-tauri/src/calibration.rs#L267), [audit writer](../../../src-tauri/src/calibration.rs#L294)); `lib.rs` describes the toggle as off by default and local-image-only ([setting](../../../src-tauri/src/lib.rs#L609)). | Artifact types, fields, default-off behavior, and module output path are source-backed; they are not evidence that stream masking or viewer isolation exists. |
| REQUIREMENT / SOURCE | SRS defines G-Signal as a real-time voice interrupt with a sub-300ms latency requirement ([§3.3](../../product/software-requirements-specification.md#L82), [latency requirement](../../product/software-requirements-specification.md#L86)); FEAT-G-STREAM says stream mode must not affect G-Signal latency ([constraint](../../features/FEAT-G-STREAM.md#L86)). Overlay has separate `speak_event` and `cancel_speech` calls ([danger](../../../src/src/app/Overlay.tsx#L226), [revision](../../../src/src/app/Overlay.tsx#L251)). | Preserve critical warnings for the player. The inspected sources do not establish an isolated local-audio or viewer-capture route; viewer-audio safety is UNKNOWN and safe mode cannot be certified ON until the route is defined and tested. |
| UNKNOWN | The inspected calibration path does not establish masking/redaction, G-Stream mode interaction, viewer/audio capture isolation, retention/deletion policy, or downstream export/access. No audio data is evidenced in this calibration path; this is not proof about the rest of the application. The inspected UI still shows no stream-state detector or general screenshot/export controls. | The module's local output path does not establish viewer safety. Keep calibration capture blocked in stream-safe mode until masking and capture boundaries are reviewed and tested. |
| UNKNOWN | The inspected CommandDeck imports Dashboard, Live, Build, Account, Store, Insights/History, Voice, and Settings views whose field rendering was not part of this read set. | Any unreviewed child view is blocked from safe-mode output until its fields are inventoried. |

## 3. Sensitive-field and surface inventory

The table separates source-backed visible content from future requirements and unknown children. “Sensitive” here means a value that can identify the player, reveal private history, expose strategy, or violate a stated stream requirement; it is not a claim that every live match statistic is legally identifying.

| Data class | Evidence in the permitted sources | Required stream-mode treatment |
| --- | --- | --- |
| Account identity | CommandDeck displays `displayName`, an email-derived name fallback, and `email` in the profile header; the menu opens Account & Steam. | Never place email, email-derived name, GID, Steam identifier, or account/session value in broadcast output. Render a neutral label such as “ผู้เล่น” only after the Privacy Owner accepts that replacement. Account child fields remain unknown until inventoried. |
| MMR and rank | Explicit FEAT-G-STREAM field. | Suppress on every visual, spoken, banner, screenshot, and export path. Missing/failed redaction blocks that output. |
| Player real name | Explicit FEAT-G-STREAM field; CommandDeck’s display name/email fallback is a visible identity surface. | Replace with an accepted generic form or suppress the entire output. Do not rely on string substitution after text/audio has already been emitted. |
| G-Memory facts | SRS describes favorite heroes, death locations, repeated errors, MMR trends, and play style; FEAT permits internal use but forbids display/speech in stream mode. | No memory detail may appear in viewer-facing text, voice, image, screenshot, or capture. Any internal use requires separate Memory-policy authorization; the draft Memory contract is not that authorization. |
| Death hotspots | FEAT allows aggregate-only output but defines no aggregation threshold or disclosure test. | Suppress all location-specific facts. Keep even aggregates blocked until the Privacy Owner accepts an explicit aggregation rule and tests. |
| Raw G-Log | SRS requires local storage; the inspected UI does not define a G-Stream log consumer. | Keep raw lines and raw records local. Do not display, speak, capture, export, or send them as co-host content. |
| Live match statistics | Overlay fallback fields include clock/daytime, Radiant/Dire score, hero, level, HP/Mana, K/D/A, last hits/denies, gold, net worth, GPM, and XPM. | Treat as broadcast-sensitive performance/strategy data. Each field needs an explicit allowlist decision; an unknown field is masked, not passed through by default. |
| CV and enemy state | CV debug renders candidate/detection boxes, hero names, scores, counts, and positions; missing/gank panels show hero names and probability. | Default to no CV debug or precise enemy-position/missing-state output in stream mode. Any reduced aggregate requires a separate accepted rule. |
| Dynamic text and media | Overlay state includes event toast text, G-Master advice, buyback reason/narrative, gank/clear text, victim hero, announcer text/Thai captions, clip reference, and banner image data. | Pass both text and media through the same allowlist. Unknown or uninspectable generated text/media is suppressed; do not assume a custom banner image is safe because it is local. |
| Imported deck views | CommandDeck renders Dashboard, Live/Build, Voice, Store/Wallet/Inventory/Ledger, Insights/History, Account, and Settings through child components. | Safe mode may not expose an unreviewed child surface. The list is a navigation inventory, not proof of the exact fields in those views. |
| G-Signal critical/player audio | SRS defines a real-time voice interrupt with a sub-300ms latency target; FEAT-G-STREAM says the stream feature must not affect that latency. The inspected UI does not establish audio isolation from viewer capture. | Do not suppress or delay player warnings. Viewer-audio safety is UNKNOWN; `ON_SAFE` is blocked until the routing/capture boundary is defined and tested. |
| QA calibration capture | The calibration module saves full-screen PNGs for CV-only screenshots and GIF clips plus sampled keyframe PNGs for voice-paired events; `audit.jsonl` records event metadata/context under `%LOCALAPPDATA%\G-Maiden\calibration\` when that variable is set, otherwise under `.` (with the match subdirectory). Overlay's clip command supplies event, spoken text, and selected context when calibration is enabled. | Masking/redaction, G-Stream interaction, viewer/audio capture isolation, retention/deletion policy, and downstream export/access remain UNKNOWN. No audio data is evidenced in this calibration path, not an app-wide guarantee. Block capture in stream-safe mode or prove and test a reviewed post-mask route before `ON_SAFE`. |
| External broadcast capture | The inspected UI sources do not show external capture controls; external software may capture the game, overlay, deck, or desktop. | Validate the full viewer-visible composition. If the audio/capture boundary cannot be demonstrated, keep safe mode blocked and make no viewer-safety claim. |

### 3.1 Shared output rule

For viewer-facing content, redaction runs on structured fields before formatting; the approved safe projection must feed the visible overlay, selected CommandDeck surfaces, co-host voice/TTS, captions/toasts, media, and any supported capture path. A missing rule, parser error, unknown value, stale mode state, or failed filter blocks that output. This policy must not suppress or delay latency-critical G-Signal warnings for the player; their viewer-audio boundary is unresolved, so `ON_SAFE` remains unavailable until routing is defined and tested.

Never implement stream safety as CSS-only hiding. The Overlay source calls speech separately from rendering, while advice and banners have their own state; a hidden visual can still be spoken or copied into a secondary surface.

## 4. Candidate mode settings and owner permissions

FEAT-G-STREAM shows a candidate configuration with `enabled=false`, redaction flags for MMR/name/memory details, layout choices, and a co-host greeting flag. No such setting is evidenced in the inspected source. These names and defaults are design inputs, not current application state.

For this contract, all required redactions are mandatory while stream mode is enabled. A missing or false required mask prevents entry into the safe-on state. No individual setting may disable MMR/name/memory protection without a new Privacy Owner review. The greeting switch is an explicit user permission for co-host speech; it does not authorize disclosure of otherwise blocked fields.

**Delegated Product Owner decision recorded for this revision:** preserve latency-critical G-Signal warnings for the player; stream-safe mode must not suppress or delay them, and this contract makes no claim that viewers cannot hear them. This decision defines product scope and grants no implementation authority.

**Unresolved route-policy gate:** an acceptable player-versus-viewer audio isolation option has not been selected or proven. Keep stream-safe mode `BLOCKED_SAFE` until the audio route and calibration-capture boundary are defined and tested. The Privacy Owner must separately accept the exact contract hash, including its viewer-audio behavior.

| Principal | Permitted action | Prohibited action |
| --- | --- | --- |
| Named Privacy Owner (identity not recorded here) | Accept the exact contract version/hash and choose the reviewed public field allowlist. | Acceptance cannot be inferred from a feature spec, Product Owner decision, local-only storage, or code author review. |
| Local app operator | After acceptance, explicitly enable/disable stream-safe mode and co-host greetings; review sample frames and speech. | Cannot disable required masks or enable an unreviewed surface. |
| Stream viewers | Receive only the approved safe view and opted-in co-host speech. | No access to account controls, memory/log files, raw identity fields, or mode configuration. |
| Maiden co-host output | Speak approved greetings and commentary derived only from the safe field projection. | No account identity, MMR/rank, raw G-Log, personal memory details, exact hotspots, or unreviewed free text/media. |
| Application renderer/capture path | Consume the safe projection after the mask gate succeeds. | Must not render or capture raw source objects as a fallback if masking fails. |

**Privacy acceptance gate:** before any code is implemented, a named Privacy Owner must review and accept the exact contract hash, field inventory, visible surfaces, calibration-capture payload/retention/export boundary, state transitions, audio-routing and viewer-audio behavior, co-host permissions, and test evidence. This is separate from the delegated Product Owner scope decision and implementation review. No Privacy Owner acceptance is recorded in this draft.

## 5. State transitions and fail-closed behavior

Candidate states are contract requirements, not implemented states:

- `OFF`: ordinary local mode; no co-host disclosure is implied.
- `ARMING`: on explicit enable, stop new co-host speech, clear transient viewer-facing text/media, apply required masks, and validate every output and capture surface without stopping or delaying G-Signal warnings for the player.
- `ON_SAFE`: permitted only after reviewed surfaces use the accepted safe projection and audio/capture routing tests prove the player keeps latency-critical G-Signal warnings while viewer exposure follows the separately accepted policy.
- `BLOCKED_SAFE`: any unknown field, missing mask, renderer error, stale setting, incomplete child-view inventory, or unproven audio/capture boundary suppresses co-host speech and sensitive overlay/deck/capture output. It must not suppress or delay G-Signal warnings for the player. Show only a fixed neutral local status if it is itself approved for capture.
- `DISARMING`: on explicit owner action, stop co-host output and clear its transient state before restoring normal local-only surfaces. Keep G-Signal warnings available to the player; do not infer that the stream has ended or that viewer audio is isolated.

On app restart, a saved enabled value must re-enter `ARMING`, never jump directly to `ON_SAFE`. Account/profile changes, game start/end, GSI loss, settings reload, renderer remount, or screenshot/capture initiation must revalidate or move to `BLOCKED_SAFE` before a new output can escape. Stale toast, advice, banner, co-host speech queue, and screenshot buffers must not survive a mode transition.

~~~mermaid
stateDiagram-v2
  [*] --> OFF
  OFF --> ARMING: owner enables
  ARMING --> ON_SAFE: masks plus audio/capture tests verified
  ARMING --> BLOCKED_SAFE: unknown or failed check
  ARMING --> BLOCKED_SAFE: audio or capture boundary unknown
  ON_SAFE --> BLOCKED_SAFE: field, state, or renderer uncertainty
  ON_SAFE --> BLOCKED_SAFE: audio or capture isolation fails
  BLOCKED_SAFE --> ARMING: owner retries after correction
  ON_SAFE --> DISARMING: owner explicitly disables
  DISARMING --> OFF: co-host speech stopped and transient output cleared
  BLOCKED_SAFE --> DISARMING: owner disables
~~~

## 6. Acceptance and exit gates

Implementation cannot start until the Product Owner selects an acceptable audio-isolation policy and a named Privacy Owner accepts the exact contract hash, including viewer-audio behavior. After these gates, local acceptance must meet every item below; none was run for this documentation task.

1. A complete field inventory covers FullOverlay and every CommandDeck child view before allowlisting.
2. Inspect and test the calibration capture command end to end: captured media, sensitive fields, masking order, retention, export, mode transition, and viewer capture. If any boundary remains unknown, stream-safe mode stays blocked.
3. Synthetic canaries for email, display name, MMR/rank, memory facts, hotspots, and raw log text never appear in viewer screenshots, calibration captures, captions, banners, or co-host speech while safe mode is on.
4. A mask failure, unknown field, thrown renderer, missing configuration, stale async response, or unproven capture route produces `BLOCKED_SAFE` and emits no unsafe co-host/visual/capture output; G-Signal player warnings remain active.
5. Enable, disable, restart, account change, match end, GSI loss, calibration toggle, and renderer remount exercise §5 transitions; no old text, banner, speech, or captured frame leaks across a transition.
6. The allowlist is enforced before viewer-facing rendering and co-host speech; hiding only a panel is a failure. Verify a separate audio route keeps player G-Signal warnings below the SRS latency target without claiming viewer-audio safety until capture tests prove the boundary.
7. Any supported screenshot/recording path captures only an accepted post-mask projection. If its route is unavailable or unverified, record it as NOT_IMPLEMENTED/UNKNOWN and do not certify `ON_SAFE`.
8. With stream mode off, ordinary local behavior remains unchanged and G-Signal warnings are never suppressed or delayed by stream formatting.
9. No G-Memory/G-Log raw data egress is introduced. Separate data-sharing or cloud-provider decisions remain separate gates.

**Contract exit:** the Product Owner audio-isolation policy is recorded, the named Privacy Owner accepts the exact contract hash, every output/capture/audio surface is classified, and acceptance cases are testable. **Implementation exit:** required tests pass, including calibration-capture and viewer-audio boundary checks, while G-Signal warnings remain available to the player within the SRS latency target. Until then G-Stream remains an unimplemented design candidate and safe mode is `BLOCKED_SAFE`.

## 7. Scope and non-claims

This artifact authorizes only this documentation path: `docs/operations/contracts/gap-stream-contract.md`. It does not authorize UI changes, settings persistence, stream detection, calibration/screenshot capture changes, audio routing, provider or Memory integration, new account permissions, deployment, or release.

The pinned calibration sources establish that calibration is off by default and that its module writes local artifacts under `%LOCALAPPDATA%\G-Maiden\calibration\` when `LOCALAPPDATA` is set; otherwise `base_dir` falls back to `.`. CV-only screenshots are full-screen PNGs with `audit.jsonl` context; voice-paired clips produce GIFs, sampled keyframe PNGs, and audit records containing event/line/context. Overlay's opt-in clip command passes event, text, and selected match context to `calibration::record`. The inspected sources do not establish masking/redaction, G-Stream-mode interaction, viewer/audio capture isolation, retention/deletion policy, or downstream export/access. No audio data is evidenced in this calibration path, which is not proof about the rest of the application. G-Signal player warnings are not claimed to be isolated from viewer capture.

Source evidence does not prove that G-Stream, a stream-safe toggle, masking, or co-host permissions exist today. FullOverlay fields and imported CommandDeck children remain incomplete inventories; local storage does not prevent public disclosure.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 2026-10-01 | Define candidate G-Stream field/surface masks, fail-closed state transitions, co-host permissions, and Privacy Owner acceptance gate. |
| 0.2.0 | 2026-10-01 | Correct calibration-capture evidence; add G-Signal/audio-isolation gates and preserve player warnings. |
| 0.3.0 | 2026-10-01 | Cite calibration artifacts and local path; narrow unknowns to privacy, retention/export, and stream/audio boundaries. |
