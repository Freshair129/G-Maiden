---
id: FRAMEWORK--RICE-SCORING
phase: 0
type: framework
status: stable
vault_id: default
tier: master
promoted_from: genesis
promoted_at: 2026-05-14T11:30:00+07:00
promotion_adr: ADR--MASTER-PROMOTION-DOC-TO-CODE
source_type: axiomatic
title: RICE Scoring — objective feature prioritization framework
tags:
  - msp
  - governance
  - framework
  - prioritization
  - rice-scoring
crosslinks:
  references:
    - FRAMEWORK--MOSCOW-METHOD
created_at: 2026-05-24T22:40:00.000+07:00
aliases:
  - RICE
  - RICE Scoring
  - Feature Prioritization
cluster: implementation_flow
role: Governance / architectural framework
attributes:
  domain: framework
  language: markdown
  is_test: false
  is_entrypoint: false
  has_secret: false
  leak_risk: low
  encryption_level: none
---

# FRAMEWORK — RICE Scoring

## Formula

The priority score is calculated using the following mathematical model:

$$\text{RICE Score} = \frac{\text{Reach} \times \text{Impact} \times \text{Confidence}}{\text{Effort}}$$

## Scoring Matrix

### 1. Reach
The estimated number of users affected by the feature in a given trip or session:
- **100:** Affects all active roles (e.g., both Rider and Passenger) on every trip.
- **80:** Affects users during a common event (e.g., network buffering).
- **50:** Affects users at specific journey transitions (e.g., trip start/end summary).
- **20:** Affects a small edge-case subset of users (e.g., session host abrupt disconnect).

### 2. Impact
The estimated contribution to the product's North Star metric:
- **3 (Massive):** Directly addresses the core experience (e.g., synchronized playback).
- **2 (High):** Significantly improves usability or reliability.
- **1 (Medium):** Standard utility/aesthetics improvement.
- **0.5 (Low):** Minor benefit or developer-only utility (e.g., internal telemetry logging).

### 3. Confidence
The level of certainty regarding our reach, impact, and effort estimates:
- **1.0 (100%):** High confidence; verified by previous prototypes or clean API support.
- **0.8 (80%):** Moderate confidence; minor platform constraints (e.g., mobile browser quirks).
- **0.5 (50%):** Low confidence; requires a feasibility spike or deep research.

### 4. Effort
The total estimated development time, measured in person-days:
- **1:** Minor task, completes in 1 day.
- **3:** Normal task, completes in half a week.
- **5:** Standard feature, takes 1 full week.
- **10:** Complex module, takes 2 weeks.
- **20+:** Major epic, high complexity.

## Directives

1.  **Refine Before Coding:** Every backlog item must have its RICE factors calculated and documented during backlog refinement.
2.  **Sort by RICE:** Rank features by their calculated RICE score. High RICE scores indicate high-value, low-effort features that should be prioritized.
3.  **Map to MoSCoW:** Use RICE scores as an input to MoSCoW categorization. A high RICE score generally maps to a Must Have or Should Have, while low-RICE, high-effort items are deferred to Won't Have.

## Connections

- [[FRAMEWORK--MOSCOW-METHOD]]
- [[FRAMEWORK--SCOPE-CREEP-PREVENTION]]
