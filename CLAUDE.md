# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: specification stage

This directory currently holds **only requirement documents** — there is no source code, build
tooling, package manifest, or test suite yet. The two specs are the source of truth:

- `Product Requirement Document.md` (PRD) — vision, modules, persona, ADR-01 naming.
- `Software Requirements Specification.md` (SRS) — functional + non-functional requirements,
  external interfaces, performance budgets. The SRS is the more detailed/authoritative of the two.

Both are written in Thai. When implementing, treat the SRS numbers (latency, CPU, RAM) as hard
constraints, not aspirations. Do not invent build/test commands — none exist until the stack is
chosen and scaffolded.

> Note: the sibling directory `../govibe` is a **different, unrelated project** (GoVibe Mission
> Control) with its own `CLAUDE.md`. The two share a Git repo only because `.git` lives at the
> `G:/` drive root. Don't pull conventions or architecture across the boundary.

## What G-Maiden is

A real-time AI companion / co-pilot ("**Maiden**", inspired by Dota 2's Crystal Maiden) that
narrates and advises during live Dota 2 matches via voice + a transparent on-screen overlay. It
reads live game data through Valve's **GSI (Game State Integration)** and reacts within a strict
latency budget without disrupting the player's focus.

## Architecture intent (from the SRS)

Hybrid **client-server**, split by latency requirement:

1. **Local Gateway (G-Sensory tier)** — receives raw GSI data, processes the minimap, and emits
   ultra-low-latency voice alerts. Critical-path work (gank warnings) runs here so it survives
   cloud disconnection by falling back to a **local SLM**.
2. **Cloud Brain (Maiden Scribe)** — drives live-caster persona, narrative continuity, and deep
   analysis via a **cloud LLM (Gemini)**. Non-critical; degrades gracefully when offline.

### The G-Series modules (ADR-01: every module is prefixed `G-`)

| Module | Responsibility |
| --- | --- |
| **G-Sentry** | Fog-of-war monitor — polls GSI every 500ms; flags enemies missing from vision >5s |
| **G-Motion** | Heatmap/path prediction — keeps 5 min of last-seen enemy positions, predicts gank routes |
| **G-Signal** | Real-time gank warning — **voice interrupt** when danger threshold >85%; the hard-latency path |
| **G-Master** | Strategic/financial advisor — skill/item build advice vs. enemy Net Worth & items |
| **G-Sensory** | Overlay rendering + hardware optimization (glassmorphism HUD, FPS/resource budget) |
| **G-Log** | Feedback loop — logs decisions/outcomes locally to tune prediction params next match |

When adding any new module/feature, keep the `G-` prefix (ADR-01) for brand/scalability unity.

### Hard constraints (non-functional — enforce these)

- **G-Signal end-to-end latency: target 250ms, never exceed 300ms.**
- Background CPU usage ≤ **2.5%** on a mid-range chipset; RAM ≤ **400MB** with all modules active.
- Overlay must not drop Dota 2 FPS by more than **3%**, and must not obscure minimap, skill bar,
  or stats panels.
- **Privacy-first:** G-Log raw data and player stats stay **local only** — never upload them.
- **Resilience:** on cloud/network loss, G-Sentry and G-Signal must keep running on the local SLM.

### Key external interfaces

- **Dota 2 GSI** → local HTTP POST on **port 3000**, JSON payloads from the player's own machine.
- **Cloud cognitive engine** → Gemini streaming API.
- **TTS module** → text-to-speech tuned for a live-caster vocal style.

## Persona rules (product-critical, not flavor)

"Maiden" must stay consistent across every utterance:
- **Gentle + intelligent**, statistically credible advice.
- **Meme-aware self-deprecation** about the perennial "Nerf CM" movement-speed nerfs.
- **Belief Revision:** when a prediction is wrong, Maiden audibly catches itself and changes advice
  mid-sentence ("เอ๊ะ! เดี๋ยวก่อน!") — this mid-stream correction is a required behavior of
  G-Signal, not optional polish.

## Visual language

Premium-dark dashboard: background `#08090c`, frosted ice-aluminium panels
`rgba(18, 20, 28, 0.72)`, glassmorphism overlay in Maiden's ice palette. Modular control panels;
global hotkeys (e.g. `Alt+M` → instant situation summary).
