---
title: "CR-002 Phase 2 — Wire command-deck UI to live backend + run in Tauri"
doc_id: "CR-002-Phase2-wire-backend"
status: "IMPLEMENTED — merged to main 170805b8 (2026-07-02)"
version: "0.1.0"
updated: "2026-06-29"
owner: "Boss"
related_docs: ["CR-002-command-deck-ui-port", "ADR-13-dxgi-capture-migration"]
---

# CR-002 Phase 2 — Wire command deck to live data + run in real Tauri

> Phase 1 landed the command-deck UI on **mock data** (`companion.ts` -> baked `MOCK`).
> Phase 2 replaces the mock with **live G-Maiden state** (GSI + CV/DXGI) and verifies it
> in the real Tauri window. Do this in the **next session**.

## 0. First: just see it in Tauri (mock is fine)
The deck already renders in the real app with MOCK (the `/api/companion` fetch fails under
Tauri -> falls back to `MOCK`). So step 1 next session = **build + run** and confirm the deck
+ overlay + DXGI all work together:
```
cd src && pnpm install          # frontend deps (worktree/main)
cd .. && pnpm tauri build       # release exe -> src-tauri/target/release/g-maiden.exe
# or: pnpm tauri dev            # debug (CV slow; fine for UI check)
```
Control window -> command deck (mock). Overlay window -> unchanged CV overlay.
capture-mode badge will show **DXGI/Lite live** (Tauri event already wired).

## 1. Data-source rewire (the core work)
`companion.ts::useCompanionData()` currently `fetch("/api/companion")`. Rewire to **Tauri
events/commands** (consistent with `App.tsx` overlay which uses `listen('game-tick')` etc.).
Recommended: a small adapter that builds a `CompanionData` object from the live streams the
Rust backend already emits, and feeds it to the deck.

**Source map (CompanionData <- live):**
| CompanionData field | Live source (Rust) |
|---|---|
| `match.clock / scores / mode / gsiOnline` | `game-tick` (GameTick, gsi.rs) + `gsi-status` |
| `match.player.{nw,gpm,xpm,k,d,a,cs,denies,ping}` | GameTick (GSI player block) |
| `match.player.*Avg` (trend baselines) | **needs history** -> Phase 2b (per-hero/time avg from local match log / DB) |
| `heroes[]` allies/enemies (kda, level, items, state, hpPercent) | GSI players + CV: `minimap-cv` detections + `enemy-missing` -> state visible/missing/dead; hp from GSI |
| `markers[]` (minimap positions) | `minimap-cv` detections (x/y normalised) |
| capture-mode badge | `capture-mode` event (already wired, works in Tauri) |
| `profile.{rank,mmr,winRate,games,kda,mainHero,behavior,role,hours}` | **external** (OpenDota / Steam) -> Phase 2b; respect privacy (public flag) |
| signals / gankRisk / safePush / warningTabs | G-Signal / G-Motion outputs (signal.rs / motion.rs) |

## 2. Phasing
- **2a (live match essentials):** clock/scores/gsiOnline, player stat bar (no baselines yet -> hide arrows or use flat), heroes visible/missing/dead + timers, markers, gank/threat from G-Signal. Keep `MOCK` as dev fallback.
- **2b (enrichment):** stat trend baselines (needs match-history/DB), profile card (OpenDota/Steam, privacy-gated `public`), hours-played.

## 3. Acceptance / Success
```
■ AC
  [_] Tauri app builds + runs; control window shows the command deck; overlay + DXGI unaffected
  [_] With Dota live (borderless), deck shows real clock/scores/KDA + hero states + capture-mode
  [_] No mock values leak when live data present (MOCK only when disconnected)
■ SC
  [_] trend arrows reflect real vs baseline (2b)
  [_] profile card shows real rank/MMR/hours when public; locked when private (2b)
  [_] perf still within budget (DXGI CPU <=2.5%, RAM <=400MB)
```

## 4. Risks
- `CompanionData` is a large shape -> wire incrementally (2a essentials first), keep `MOCK` fallback so partial wiring still renders.
- Trend baselines + profile need data we don't have locally yet (history/DB + external API) -> explicitly 2b, don't block 2a.
- Debug (`tauri dev`) CV is ~100x slower -> judge perf only on release build.

## Changelog
| Version | Date | Summary |
|---|---|---|
| 0.1.0 | 2026-06-29 | Phase 2 plan: run-in-Tauri (mock ok) + source map + 2a/2b phasing + AC/SC |
