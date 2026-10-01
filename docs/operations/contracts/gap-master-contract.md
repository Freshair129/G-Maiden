---
title: "G-Master Data and Persona Contract"
doc_id: gap-master-contract
status: draft
version: 0.2.1
updated: 2026-10-01
owner: RWANG
---

# G-Master Data and Persona Contract

## 1. Scope and evidence boundary

This C-3/HIGH draft describes only behavior visible at source baseline `origin/main` commit `2d969ac643533b4b8e24494356da2e818eac874f`. It covers the G-Master prompt/provider boundary, the OCR scaffold, own-player item/damage inputs, and persona requirements. It does not change code, approve new egress, claim live OCR, or treat G-Mind's proposed multi-provider router as implemented.

The draft distinguishes facts in the assigned files from unknown upstream callers and unverified runtime behavior. No test, login, provider call, model download, or live OCR operation was performed.

## 2. Current G-Master prompt contract

`master::advise` takes `&GameTick` and `&[String]` enemy hero names. Its prompt builder interpolates a selected summary; it does not serialize the whole `GameTick` or a raw GSI packet in the inspected function. When Claude is selected, that prompt text is sent to the Claude CLI or Anthropic Messages API. The local SLM receives the same prompt at the loopback Ollama endpoint. This is selected gameplay-data egress on the cloud path; it must not be described as “no GSI data” or “all gameplay data stays local.” See [`build_prompt`](../../../src-tauri/src/master.rs#L51-L104), [provider routing](../../../src-tauri/src/master.rs#L111-L172), and [Claude transport](../../../src-tauri/src/master.rs#L174-L263).

| Prompt input | What the assigned source shows | Boundary / unknown |
| --- | --- | --- |
| Current player summary | Game phase and clock; hero name; level; K/D/A; `net_worth`; gold; HP%; mana%; Radiant and Dire team scores. | These are selected `GameTick` fields. The caller and freshness of the tick are not inspected here. Team score is not enemy net worth. |
| Enemy-specific input | `enemies: &[String]`; the comment describes CV-identified enemy hero names passed from the frontend. These names go to `counter_advice_text(enemies)`, and its resulting advice string enters the prompt. | No enemy inventory, item names, level, gold, net worth, HP, armor, magic resistance, ability state, or location is passed by this builder. Exact CV caller, confidence, timestamp/freshness, and counter-data contents are outside the assigned source set. |
| Damage grounding | The local player's hero, level (clamped to at least 1), and item names feed `damage::self_burst`. The prompt says this is an approximate combo against a soft target (0 armor, 25% magic resistance) and standard estimated skill build. | It is not an enemy-specific kill verdict. Unknown/unmodeled own items do not contribute to the estimate; do not present omitted damage as proof that an item has no effect. |
| Raw logs / memory | `build_prompt` contains no G-Log or Memory input reference. | This is a narrow builder observation, not a whole-application egress audit or a provider-side data-handling guarantee. |

The exact current flow visible in these files is:

```mermaid
flowchart LR
    T[GameTick fields] --> P[build_prompt]
    E[Enemy hero-name strings] --> C[counter_advice_text]
    C --> P
    D[Own hero + level + item names] --> B[self_burst vs soft target]
    B --> P
    P --> R{MasterBackend}
    R -->|Claude| A[Anthropic API if API key configured; otherwise Claude CLI]
    R -->|Auto| A
    A -->|success| O[Advice text]
    A -->|failure in Auto| L[Ollama local SLM]
    R -->|Ollama| L
    OCR[OCR recognize(image)] --> HIT[OcrHit text/confidence/bbox]
    HIT -. no live caller established in assigned sources .-> GAP[No G-Master OCR input]
```

### Unknown enemy items and economy stay unknown

The prompt does not receive enemy item or economy values in the inspected builder. It receives enemy hero-name strings for counter advice and a Radiant:Dire score pair. Do not infer individual enemy gold/net worth from the score or from counter suggestions; do not fill absent enemy item, level, defense, HP, or ability fields with zero or guessed values.

`items.rs` describes a player-inventory helper: it reads the player's GSI item block and sums a compile-time item-cost table with carried gold. Unknown item names return a cost of zero, and the source calls the table a snapshot from OpenDota without establishing its current patch freshness. `master.rs` interpolates `tick.net_worth`; the assigned files do not establish whether or when the upstream caller fills that field from this helper. See [item cost and own-NW helper](../../../src-tauri/src/items.rs#L1-L84).

The wired damage path is own-player-only. `damage.rs` says enemy HP/armor are not observable for its offensive-lethality scaffold; the live `self_burst` uses the player's real hero/level and recognized items against a fixed soft-target assumption, and estimates the skill build. Unknown item names are dropped by `loadout_from_names`; unknown hero data returns `None`. See [unwired enemy-lethality boundary](../../../src-tauri/src/damage.rs#L1-L15) and [self-burst implementation](../../../src-tauri/src/damage.rs#L442-L475). The model must not turn those missing enemy inputs into a “can kill” claim.

## 3. Provider scope and behavior

The shipped selector is the G-Master `MasterBackend` path `Auto | Claude | Ollama`, not the separate G-Mind router described by the forward-looking spec. In `Auto`, G-Master tries Claude and falls back to Ollama on error. `Claude` forces the Claude path; if an API key is configured the code posts to Anthropic, otherwise it invokes the signed-in `claude` CLI. `Ollama` forces the local endpoint. An explicit Ollama model selection is tried alone; the default empty selection uses the configured Aroow-9B tag and then the Gemma fallback. No Gemini provider, template fallback, circuit breaker, or hot-switch configuration layer is established by these Rust files. See [G-Mind current-vs-proposed status](../../features/FEAT-G-MIND.md#L1-L29), [G-Master selection](../../../src-tauri/src/master.rs#L125-L166), and [Ollama selection/fallback](../../../src-tauri/src/slm.rs#L12-L52).

The current advice cache throttles fresh requests for 30 seconds and returns the prior text with `cached: true`; the `Advice` payload has no source-tick timestamp. Claude API transport sets a 30-second curl maximum; the Ollama request sets 90 seconds; the Claude CLI path has no explicit timeout in the inspected function. These limits differ from G-Mind's proposed ≤1500 ms cloud timeout and three-failure circuit breaker. Do not claim the proposed deadline or circuit-breaker behavior is implemented. See [throttle/cache](../../../src-tauri/src/master.rs#L23-L37) and [proposed G-Mind constraints](../../features/FEAT-G-MIND.md#L87-L111).

The G-Mind spec marks Gemini, multiple cloud providers, template fallback, circuit breaker, and broad provider selection as design proposals; it separately says the current product uses Claude CLI/Anthropic plus Ollama and G-Signal is not routed through G-Mind. Keep Gemini deferred. This contract does not authorize a provider addition or route G-Signal through an LLM.

The G-Mind spec's PII/raw-G-Log redaction is a proposed requirement, not evidence of a separate implemented redaction layer. The prompt builder is a source-visible curated field list; no provider-path redaction test is present in the assigned files. Review that allowlist before any expansion. See [proposed redaction requirement](../../features/FEAT-G-MIND.md#L87-L111). The existing [master.rs unit tests](../../../src-tauri/src/master.rs#L304-L357) exercise prompt construction and backend-label state; their source comment explicitly avoids calling real advise() because it starts a provider process/network path. They do not prove live provider behavior and were not run.

## 4. OCR, model files, and data handling

`ocr.rs` identifies itself as a scaffold. Its module comments and `available`/`recognize` comments say there is no caller yet: scoreboard region detection and the `team-stats` event/UI are future phases. `recognize` accepts an in-memory image and returns hits containing text, confidence, and a bounding box sorted by vertical position. The OCR result has no timestamp or freshness field. No cadence, screenshot source, scoreboard row parser, or G-Master connection is established in the assigned files. See [OCR status](../../../src-tauri/src/ocr.rs#L1-L19), [model lookup](../../../src-tauri/src/ocr.rs#L63-L110), and [OCR API and result](../../../src-tauri/src/ocr.rs#L113-L169).

| OCR/model question | Evidence in assigned sources | Status |
| --- | --- | --- |
| Live caller | `ocr.rs` explicitly labels `available()` and `recognize()` as having no caller pending later phases. No OCR call appears in the assigned G-Master, SLM, damage, or item files. | No live OCR-to-advice path established; callers outside this source set are not audited. |
| Freshness | `OcrHit` includes text, confidence, bbox only; no capture time or freshness threshold is present. | `UNSPECIFIED`. |
| Accuracy | Confidence is returned from the OCR engine. The only OCR unit tests cover missing-model graceful failure; no ground-truth accuracy or confidence-calibration evidence is present. | `NOT_ESTABLISHED`; confidence is not an accuracy guarantee. |
| OCR model packaging | `ocr.rs` expects `models/ocr/det.onnx`, `rec.onnx`, and `ppocrv5_dict.txt`; it says the installer does not bundle them and lookup checks executable-relative then `models/ocr`. | OCR models are not present in the tracked `models/` inventory at this baseline; availability is not established. |
| Model license/provenance | The tracked model inventory contains `.gitkeep`, `labels.json`, and `minimap-detector.onnx`; it has no OCR model card or license file. The code mentions PP-OCRv5 but does not provide a license in the inspected model inventory. | `UNSPECIFIED`; do not download, bundle, or claim redistribution rights from this source set. |
| OCR upload | The inspected OCR module runs local `pure_onnx_ocr_sync` inference and contains no network/provider call. No caller supplies OCR output to the cloud prompt in the assigned files. | No OCR upload path is evidenced here; this is not a whole-application egress proof. |
| Ollama model availability/license | `slm.rs` names local Ollama model tags; those tags are not packaged in `models/`. No installation, presence, version, or license is verified here. | `UNVERIFIED`; no model was queried or downloaded. |

The repository-tracked model files visible at this source pin are [`labels.json`](../../../models/labels.json) and [`minimap-detector.onnx`](../../../models/minimap-detector.onnx) (plus an empty `.gitkeep`). This inventory does not establish installer inclusion, runtime availability, model accuracy, or licensing. The OCR module’s missing-model path returns `Unavailable` rather than claiming scoreboard values; its unit-test declarations are visible at [OCR tests](../../../src-tauri/src/ocr.rs#L172-L201), but were not run.

## 5. Persona contract across outputs

| Surface | Current source statement | Contract boundary |
| --- | --- | --- |
| G-Master advice | A fixed Thai prompt asks for gentle/polite, intelligent Maiden voice, Nerf CM humor, one or two concise practical sentences, no greeting or wrap-up. It is inserted into every built prompt. | The inspected prompt builder has no read of the shipped selector, so no preset effect on G-Master text is established. See [`PERSONA_PROMPT`](../../../src-tauri/src/master.rs#L19-L21) and [prompt composition](../../../src-tauri/src/master.rs#L81-L104). |
| Shipped discrete presets (partial) | Control exposes `coach`, `silent`, `caster`, and `meme`, mirrors the selected string to `set_persona_preset`, and Rust maps those values to runtime codes. Overlay uses casual text pools for `caster`/`meme` and serious pools for other values. Its ordinary persona-event and automatic G-Master-advice paths return early for `silent`. | These are observed source effects, not proof of complete preset semantics. Control's descriptions, including “chatty” frequency and “critical only,” are not fully established by these branches. The low-HP overlay danger path has no visible `silent` preset check; it gates on danger and `voiceEnabled`. See [Control selector and mirror](../../../src/src/app/Control.tsx#L219-L222), [preset choices and descriptions](../../../src/src/app/Control.tsx#L462-L484), [Rust code mapping](../../../src-tauri/src/lib.rs#L538-L547), [runtime preset slot](../../../src-tauri/src/runtime.rs#L115-L116), [Overlay tone selection](../../../src/src/app/Overlay.tsx#L221-L224), [persona-event gate](../../../src/src/app/Overlay.tsx#L261-L293), [auto-advice gate](../../../src/src/app/Overlay.tsx#L389-L394), and [low-HP danger path](../../../src/src/app/Overlay.tsx#L209-L226). |
| Numeric tone/verbosity design | FEAT-G-PERSONA describes numeric verbosity/tone dimensions, `{persona:{...}}`, and `apply_tone()` as design-only. | This proposed system is distinct from the shipped four-value selector above. Do not claim numeric levels, `apply_tone()`, or their acceptance criteria are implemented. See [design-only dimensions and logic](../../features/FEAT-G-PERSONA.md#L13-L76). |
| Announcer | The inspected selector and Overlay pack-banner rendering do not establish preset-driven announcer audio, filtering, or bundle changes. | `UNSPECIFIED` in this source review. Do not promise preset coverage or alter voice-pack/event behavior under this contract. |
| Belief Revision | FEAT-G-PERSONA lists correction of a wrong prediction as immutable and marks it implemented. Overlay has a low-HP danger-revision branch that selects casual text for `caster`/`meme`; the Rust G-Signal capture branch separately evaluates alert/revision events and dispatches `voice_interrupt`. | Preserve correction as a non-overridable requirement. Static source does not verify end-to-end timing, audio interruption, or the selected preset’s runtime effect. See [Overlay correction branch](../../../src/src/app/Overlay.tsx#L231-L257), [G-Signal dispatch](../../../src-tauri/src/capture.rs#L817-L889), and [`voice_interrupt`](../../../src-tauri/src/tts.rs#L579-L584). |
| Critical G-Signal interrupt | FEAT-G-PERSONA lists G-Signal interrupt as immutable; FEAT-G-MIND says G-Signal is outside the LLM path. Capture dispatch is gated by `signal_enabled`; its separate `silent_arm` study flag controls user-facing dispatch, and the capture branch does not read `persona_preset`. Downstream, `voice_interrupt` tries a voice-pack clip first; only its text fallback reads the preset code, selecting gentle text for Coach/Silent and alternate text for Caster/Meme. | This is a static call-path observation only; it does not establish audible end-to-end behavior. `silent_arm` is the efficacy-study assignment, not the `silent` persona preset. No provider, preset, cache, or advisor failure may suppress or delay critical dispatch; verify actual pack/fallback behavior and interrupt timing before claiming runtime acceptance. See [runtime preset/study state](../../../src-tauri/src/runtime.rs#L115-L124), [capture alert/revision path](../../../src-tauri/src/capture.rs#L817-L889), [fallback text selection](../../../src-tauri/src/tts.rs#L513-L544), and [`voice_interrupt`](../../../src-tauri/src/tts.rs#L570-L584). |
| Core persona | FEAT-G-PERSONA lists Nerf CM self-awareness and a gentle, non-aggressive core as immutable. | Keep across any accepted future tone setting; current advisor prompt directly supplies gentle/CM-style instructions. |

See [preset implementation status and immutable behaviors](../../features/FEAT-G-PERSONA.md#L13-L46), [design-only preset logic](../../features/FEAT-G-PERSONA.md#L48-L76), and [persona acceptance criteria](../../features/FEAT-G-PERSONA.md#L104-L112). The source contains a shipped named selector with partial UI effects; FEAT-G-PERSONA's numeric verbosity/tone examples and `apply_tone()` remain design targets. End-to-end preset and critical-audio behavior is `NOT_VERIFIED`.

## 6. Product decisions and acceptance gates

Product Owner decisions required before changing these contracts or implementing adjacent work:

1. Confirm the shipped provider scope is `Auto | Claude | Ollama`, with Gemini and the proposed G-Mind router remaining deferred.
2. Review/approve the exact selected gameplay fields that may be included in a remote Claude prompt. This draft describes existing source behavior; it does not broaden that payload or certify provider-side handling.
3. Keep enemy inventory/economy/defenses and OCR-derived scoreboard values `UNKNOWN` until a caller, freshness policy, data-quality test, and approved privacy boundary exist. Do not add guessed values or normalize missing data to zero in prose.
4. Preserve the source-visible `coach|silent|caster|meme` selector and its limited current effects accurately. Before claiming its descriptions or critical-only semantics end-to-end, verify settings-to-Rust mapping and behavior for persona events, auto-advice, low-HP danger, G-Signal alert/revision, and announcer output. Separately decide whether to implement FEAT-G-PERSONA's numeric tone/verbosity and `apply_tone()` design; no implementation or acceptance is approved by this draft. No preset may disable immutable behaviors.
5. Decide whether OCR remains dormant or receives a separately reviewed integration plan. Before bundling any OCR model, require exact model provenance, license/redistribution approval, installer layout, checksum/version, accuracy evidence on representative screenshots, freshness/error behavior, and a local-only image/data-flow review.

Implementation acceptance must be evidenced separately from this draft: prompt unit cases for exact allowed fields and unknown enemy facts; tests proving cached/fallback/provider paths do not leak extra context; fake-provider tests with no real credentials or network; and preset cases covering all four shipped values, the observed ordinary persona/advice gates, the low-HP danger path, G-Signal correction/interrupt, and any claimed announcer effect. Verify the shipped selector end-to-end before claiming its UI descriptions; test numeric tone/verbosity only if separately approved. OCR implementation needs a caller and tests for missing model, stale/low-confidence output, representative accuracy, and no-upload behavior before its values can enter G-Master. No such tests were run for this document.

## 7. Review record

- Source baseline: `origin/main` at `2d969ac643533b4b8e24494356da2e818eac874f`.
- Current source claims: selected prompt fields and backend branches are source-visible; OCR caller, freshness, accuracy, OCR licensing, Ollama availability/license, caller freshness, and end-to-end persona behavior are `UNSPECIFIED` or `NOT_VERIFIED` as marked above.
- Tests, provider operations, OCR inference, downloads, deployment, and release acceptance: `NOT_RUN`.
- This draft does not declare privacy compliance, model-license clearance, end-to-end persona acceptance, or G-Mind completion.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-01 | Documented G-Master's selected prompt inputs/provider paths, unknown enemy data, dormant OCR/model limits, and persona decision gates without changing code. |
| 0.2.0 | 2026-10-01 | Corrected persona scope: documented shipped discrete presets and observed partial effects separately from the design-only numeric tone/verbosity system; marked end-to-end preset and critical-audio behavior unverified. |
| 0.2.1 | 2026-10-01 | Ordered the changelog chronologically and aligned frontmatter version with the latest changelog row. |
