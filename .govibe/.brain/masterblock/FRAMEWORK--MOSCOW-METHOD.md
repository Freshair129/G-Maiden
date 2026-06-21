---
id: FRAMEWORK--MOSCOW-METHOD
phase: 0
type: framework
status: stable
vault_id: default
tier: master
promoted_from: genesis
promoted_at: 2026-05-14T11:30:00+07:00
promotion_adr: ADR--MASTER-PROMOTION-DOC-TO-CODE
source_type: axiomatic
title: MoSCoW Method — scope and requirement categorization framework
tags:
  - msp
  - governance
  - framework
  - scope
  - prioritization
crosslinks:
  references:
    - FRAMEWORK--SCALING-LEVELS
    - FRAMEWORK--PHASE-GOVERNANCE
created_at: 2026-05-24T22:40:00.000+07:00
aliases:
  - MoSCoW
  - MoSCoW Framework
  - Priority Categorization
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

# FRAMEWORK — MoSCoW Method

## Intent

To establish a strict, shared vocabulary for categorizing product requirements and backlog items. This categorization ensures that critical functionalities are delivered first, while secondary items do not delay core releases.

## Core Directives

Every backlog item or feature request must be classified into one of the following four categories during Sprint Planning or backlog refinement:

1.  **Must Have (M):** Non-negotiable requirements. Without these, the release/PWA is considered failed or unsafe to operate.
2.  **Should Have (S):** High-priority features that add significant value but are not critical for the immediate release. They can be temporarily deferred or worked around.
3.  **Could Have (C):** Low-cost, "nice-to-have" features that improve user experience or aesthetics but have minimal impact on core metrics.
4.  **Won't Have (W):** Explicitly deferred requirements for the current phase or milestone. These are placed directly into the future backlog.

## Apply When

- **Sprint Planning:** Deciding which tasks enter the active sprint.
- **Product Requirement (PRD) drafting:** Categorizing raw requirements into release phases.
- **Scope Creep triage:** Evaluating newly requested features.

## Connections

- [[FRAMEWORK--SCALING-LEVELS]]
- [[FRAMEWORK--PHASE-GOVERNANCE]]
- [[FRAMEWORK--RICE-SCORING]]
