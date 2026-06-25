# G-Series Feature Specifications

> Doc-driven development: FEAT docs เป็น source of truth ของแต่ละ module.
> เปลี่ยน spec ก่อน → แล้วค่อย implement.

---

## Core Modules (Dota Intelligence)

| Module | Phase | GATE | Doc |
| --- | --- | --- | --- |
| **G-Sentry** — Fog of War Monitor | 2 | CPU ≤2.5% | [FEAT-G-SENTRY](FEAT-G-SENTRY.md) |
| **G-Motion** — Heatmap & Path Prediction | 3 | — | [FEAT-G-MOTION](FEAT-G-MOTION.md) |
| **G-Signal** — Real-time Gank Warning | 3 | **p99 ≤300ms** | [FEAT-G-SIGNAL](FEAT-G-SIGNAL.md) |
| **G-Damage** — Real-time Lethality Engine | 3 | <1ms calc (feeds G-Signal) | [FEAT-G-DAMAGE](FEAT-G-DAMAGE.md) |
| **G-Master** — Strategic Advisor | 5 | — | [FEAT-G-MASTER](FEAT-G-MASTER.md) |
| **G-Sensory** — Overlay & Hardware | 0–1, 7 | FPS ≤3%, CPU ≤2.5%, RAM ≤400MB | [FEAT-G-SENSORY](FEAT-G-SENSORY.md) |
| **G-Log** — Feedback Loop | 6 | **no-egress** | [FEAT-G-LOG](FEAT-G-LOG.md) |

## Companion Experience Extensions

| Module | Priority | Phase | Doc |
| --- | --- | --- | --- |
| **G-Voice** — Two-Way Voice | P0 | 4 | [FEAT-G-VOICE](FEAT-G-VOICE.md) |
| **G-Memory** — Persistent Memory | P0 | 6 | [FEAT-G-MEMORY](FEAT-G-MEMORY.md) |
| **G-Coach** — Post-Match Review | P1 | 6–7 | [FEAT-G-COACH](FEAT-G-COACH.md) |
| **G-Mind** — Cognitive Router | P1 | 4 | [FEAT-G-MIND](FEAT-G-MIND.md) |
| **G-Persona** — Tone Presets | P2 | 7–8 | [FEAT-G-PERSONA](FEAT-G-PERSONA.md) |
| **G-Stream** — Streamer Co-host | P2 | 8 | [FEAT-G-STREAM](FEAT-G-STREAM.md) |

## Future / Proposed (post-v1.0)

| Module | Priority | Phase | Doc |
| --- | --- | --- | --- |
| **G-Score** — Dynamic GSI-driven Soundtrack | Delighter | 9 (post-v1.0) | [FEAT-G-SCORE](FEAT-G-SCORE.md) |

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
