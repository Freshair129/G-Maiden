---
title: "G-Series Feature Specifications"
doc_id: "features/README"
status: "active"
version: "0.2.2"
updated: "2026-10-12"
owner: "Boss"
related_docs: ["mvp-decisions", "G-SERIES-DATA-LINEAGE", "software-requirements-specification"]
---

# G-Series Feature Specifications

> Doc-driven development: FEAT docs เป็น source of truth ของแต่ละ module.
> เปลี่ยน spec ก่อน → แล้วค่อย implement.

> MVP P0/P1 scope, access, cloud allowlist, and measurable acceptance are governed by
> [[mvp-decisions]]. A P0 label is required scope, not proof that runtime implementation is complete.

## Cross-feature data contract

- [[G-SERIES-DATA-LINEAGE]] — source, transport, field mapping, fallback, computation formula, and output contract for every G-Series module

---

## Core Modules (Dota Intelligence)

| Module | Phase | GATE | Doc |
| --- | --- | --- | --- |
| **G-Sentry** — Fog of War Monitor | 2 | Whole-app CPU ≤10% | [[FEAT-G-SENTRY]] |
| **G-Motion** — Time-off-map Risk Heuristic (no full heatmap/path model) | 3 | — | [[FEAT-G-MOTION]] |
| **G-Signal** — Real-time Gank Warning | 3 | **p50 ≤250ms; every sample ≤300ms** | [[FEAT-G-SIGNAL]] |
| **G-Damage** — Real-time Lethality Engine | 3 | <1ms calc (feeds G-Signal) | [[FEAT-G-DAMAGE]] |
| **G-Master** — Strategic Advisor | 5 | — | [[FEAT-G-MASTER]] |
| **G-Sensory** — Overlay & Hardware | 0–1, 7 | FPS ≤3%, whole-app CPU ≤10%, aggregate RAM ≤400,000,000 bytes | [[FEAT-G-SENSORY]] |
| **G-Log** — Feedback Loop | 6 | **no-egress** | [[FEAT-G-LOG]] |

## Companion Experience Extensions

| Module | Priority | Phase | Doc |
| --- | --- | --- | --- |
| **G-Voice** — Two-Way Voice | P0 | 4 | [[FEAT-G-VOICE]] |
| **G-Memory** — Persistent Memory | P0 | 6 | [[FEAT-G-MEMORY]] |
| **G-Coach** — Post-Match Review | P1; outside MVP | 6–7 | [[FEAT-G-COACH]] |
| **G-Revive** — Death Analysis & Buyback Advisor | P1 | 5–6 | [[FEAT-G-REVIVE]] |
| **G-Mind** — Cognitive Router | P1; outside MVP | 4 | [[FEAT-G-MIND]] |
| **G-Persona** — Tone Presets | P2 | 7–8 | [[FEAT-G-PERSONA]] |
| **G-Stream** — Streamer Co-host | P2 | 8 | [[FEAT-G-STREAM]] |

## Future / Proposed (post-v1.0)

| Module | Priority | Phase | Doc |
| --- | --- | --- | --- |
| **G-Score** — Dynamic GSI-driven Soundtrack | Delighter | 9 (post-v1.0) | [[FEAT-G-SCORE]] |

## Module Dependency Graph

```
GSI Server ──► G-Sentry ──► G-Motion ──► G-Signal ──► Audio Engine
                                              │
Minimap CV ─────────────────────────┘         │
                                              ▼
G-Memory (local only) ──► G-Voice (local STT/interpretation/answer) ──► G-Sensory/Audio
G-Memory (local only) ──► G-Master local context
G-Master ──[separate opt-in + allowlist]──► Claude cloud advice / Ollama local advice
G-Signal (pure Rust local path) ──interrupts──► Voice/advice audio

G-Log ◄── all modules (feedback loop)
  │
  ▼
G-Coach (post-match) ◄── G-Memory
```

## Cross-cutting Concerns

| Concern | Enforced by | GATE |
| --- | --- | --- |
| Latency (G-Signal ≤300ms) | Cached audio, no cloud/SLM in pure Rust path; p50 ≤250ms and every sample ≤300ms | MVP-006 |
| CPU ≤10% | Whole-app process group, normalized by logical CPU capacity, every 1-second sample | MVP-006 |
| RAM ≤400,000,000 bytes | Aggregate peak Working Set for whole app/process group, including host/WebView2/feeder/STT/SLM/model processes | MVP-006 |
| FPS drop ≤3% | Governor throttle | P7 |
| Privacy | G-Log/G-Memory/CV/Voice audio+transcript local-only; own-stat cloud context is separately opted in and allowlisted | MVP-005 / P6 |
| Belief Revision | G-Signal (immutable behavior) | P3 |
| Persona consistency | G-Persona (immutable core) | P4, P8 |

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.2.1 | 2026-10-10 | Corrected `doc_id` to the canonical `features/README` path slug required by the strict doc-graph gate |
| 0.2.2 | 2026-10-12 | Aligned the module and cross-cutting CPU gates with the approved 10% whole-app budget. |
| 0.2.0 | 2026-10-10 | Reconciled module index, G-Signal hard-max label, local Voice/Memory routing, G-Motion heuristic scope, and MVP decision precedence |
