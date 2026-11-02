# CR-040 — OBS-backed G-Highlights MVP (G-Orchestra lane queue)

**Authority:** [parent issue #109](https://github.com/Freshair129/G-Maiden/issues/109) and [CR040-ARCH decision addendum](CR040-ARCH-DECISION-20261102.md). The isolated DAG is [cr040-obs-mvp.json](cr040-obs-mvp.json). The repo's existing `orchestration/engine.mjs` supports `GORCH_BACKLOG`; this queue does not overwrite `orchestration/backlog.json` or its default `state.json`.

## Read-only DAG inspection

PowerShell, from the repository root:

```powershell
$env:GORCH_BACKLOG = "backlogs/cr040-obs-mvp.json"
node orchestration/orchestrator.mjs graph --mermaid
Remove-Item Env:GORCH_BACKLOG
```

Bash:

```bash
GORCH_BACKLOG=backlogs/cr040-obs-mvp.json node orchestration/orchestrator.mjs graph --mermaid
```

`graph` is read-only. This queue is registered, not a claim that any worker, daemon, OBS session, or Windows/Dota validation is running. Do not dispatch write-capable workers in the common checkout; each code lane needs its own external worktree and reviewed path ownership.

## Settings and activation contract

- Replay highlights and full-match recording are independently selectable in Settings; both default off. The media session is unarmed on launch. Settings are preferences, not capture consent.
- OBS inventory and selected scene/source/audio scope are shown before an explicit fresh per-session consent. Consent expires on scene/source/audio change, OBS reconnect, match/session change, or a change to the consented settings. The app never mutates OBS scenes or sources.
- Only verifiable Dota game-capture/window-capture sources are eligible. Desktop/display capture, webcam/video-capture, and unknown sources are rejected. Microphone is off by default and needs separate explicit selection and consent. Event categories are a selectable subset of the fixed verified local GSI allowlist; the default subset is empty.
- Session-end post-roll policy is selectable: `wait`, `partial`, or `discard`; default is `discard`. Full-match recording has a distinct `StartRecord`/`StopRecord` and completion contract. Current #110 is replay-only and does not implement that mode; Settings must show it unavailable until a separate adapter implementation is reviewed. No full-match success claim is allowed from #110.
- `SaveReplayBuffer` acknowledgement is not a saved clip. The correlated `ReplayBufferSaved` event/path and local file validation establish the replay receipt. Do not claim exact trim until the event-to-media time mapping is verified.

## Task order

```text
CR040-ARCH
  ├── CR040-A  replay-only OBS adapter      (#110)
  ├── CR040-B  review planner PR #116       (#111; manual)
  ├── CR040-C  OBS/CV read-only spike       (#112)
  └── CR040-D  settings and clip UI         (#113)
                    │
                    ▼
          CR040-SOURCE-QA                 (source/fixture review, #114)
                    │
                    ▼
          CR040-INTEGRATION-CANDIDATE     (wiring/docs/CI only; no merge)
                    │
                    ▼
          CR040-RUNTIME-QA                (independent Windows OBS/Dota/NFR, #114)
                    │
                    ▼
          CR040-OWNER-GATE                (owner-controlled readiness/merge)
```

Source QA cannot stand in for integration QA. Runtime QA must use the exact integration-candidate SHA, after wiring. The owner gate requires both independent QA records and exact-head CI/review evidence. If full-match recording remains unimplemented, record `NOT_IMPLEMENTED` and keep readiness blocked until its separate adapter contract is delivered.

## Lane ownership and boundaries

1. Check `git status`, current `main`, and live changes in [#105](https://github.com/Freshair129/G-Maiden/pull/105), [#88](https://github.com/Freshair129/G-Maiden/pull/88), and [#108](https://github.com/Freshair129/G-Maiden/issues/108). Never discard or stage unrelated work.
2. A owns only new replay adapter files under `src-tauri/src/obs_media/`; it does not implement full-match recording or touch `lib.rs`, `Cargo.toml`, `gsi.rs`, `capture.rs`, or `announcer.rs`.
3. B owns only `src/src/highlights/clipPlanner.ts` and its test. C owns only read-only spike material under `tools/obs-cv-spike/`. D owns new files under `src/src/highlights/components/`; it does not edit planner files, `CommandDeck.tsx`, `App.tsx`, or existing design tokens.
4. `CR040-INTEGRATION-CANDIDATE` is the only stage that may wire shared Rust/UI/Settings seams and update canonical docs/generated graph/CI. It creates a reviewable candidate and does **not** merge. The runtime QA stage is independent and happens after this candidate exists.
5. `CR040-OWNER-GATE` is separate from code/QA work. Agents do not merge, tag, release, or deploy. Native media engine [#115](https://github.com/Freshair129/G-Maiden/issues/115) stays deferred and outside this DAG.

## Current execution receipt

As of 2026-11-02, this queue is registered in draft PR #117. Registering or graphing it does not dispatch agents. The current #110 scope is replay-only; full-match recording remains an explicit implementation gap. No Windows OBS/Dota/NFR result is implied by source checks or synthetic fixtures.