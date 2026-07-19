# G-Series Feature Specifications

> Doc-driven development: FEAT docs เป็น source of truth ของแต่ละ module.
> เปลี่ยน spec ก่อน → แล้วค่อย implement.

---

## Core Modules (Dota Intelligence)

| Module | Phase | GATE | Doc |
| --- | --- | --- | --- |
| **G-Sentry** — Fog of War Monitor | 2 | CPU ≤2.5% | [[FEAT-G-SENTRY]] |
| **G-Motion** — Heatmap & Path Prediction | 3 | — | [[FEAT-G-MOTION]] |
| **G-Signal** — Real-time Gank Warning | 3 | **p99 ≤300ms** | [[FEAT-G-SIGNAL]] |
| **G-Damage** — Real-time Lethality Engine | 3 | <1ms calc (feeds G-Signal) | [[FEAT-G-DAMAGE]] |
| **G-Master** — Strategic Advisor | 5 | — | [[FEAT-G-MASTER]] |
| **G-Sensory** — Overlay & Hardware | 0–1, 7 | FPS ≤3%, CPU ≤2.5%, RAM ≤400MB | [[FEAT-G-SENSORY]] |
| **G-Log** — Feedback Loop | 6 | **no-egress** | [[FEAT-G-LOG]] |

## Companion Experience Extensions

| Module | Priority | Phase | Doc |
| --- | --- | --- | --- |
| **G-Voice** — Two-Way Voice | P0 | 4 | [[FEAT-G-VOICE]] |
| **G-Memory** — Persistent Memory | P0 | 6 | [[FEAT-G-MEMORY]] |
| **G-Coach** — Post-Match Review | P1 | 6–7 | [[FEAT-G-COACH]] |
| **G-Revive** — Death Analysis & Buyback Advisor | P1 | 5–6 | [[FEAT-G-REVIVE]] |
| **G-Mind** — Cognitive Router | P1 | 4 | [[FEAT-G-MIND]] |
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
G-Mind (Brain Router) ◄── G-Master ◄── G-Voice ◄── G-Memory
         │                    │
         ▼                    ▼
   Cloud/SLM/Template    G-Sensory (Overlay)
                              │
                              ▼
                          G-Persona (filter)
                              │
                              ▼
                          G-Stream (redact, if enabled)
                              
G-Log ◄── all modules (feedback loop)
  │
  ▼
G-Coach (post-match) ◄── G-Memory
```

## Cross-cutting Concerns

| Concern | Enforced by | GATE |
| --- | --- | --- |
| Latency (G-Signal ≤300ms) | Cached audio, no LLM in path | P3 |
| CPU ≤2.5% | Resource Governor (G-Sensory) | P2, P7 |
| RAM ≤400 MB | Governor + SLM lazy-load | P7 |
| FPS drop ≤3% | Governor throttle | P7 |
| Privacy (no-egress) | G-Log/G-Memory local-only | P6 |
| Belief Revision | G-Signal (immutable behavior) | P3 |
| Persona consistency | G-Persona (immutable core) | P4, P8 |
