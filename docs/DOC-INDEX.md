---
version: "0.1.4"
created_at: "2026-07-19T00:00:00+07:00,Unknown"
last_update: "2026-07-22T20:18:00+07:00,ATHER"
status: "active"
attributes:
  domain: "documentation-governance"
  doc_type: "document-index"
  scope: "repository documentation index"
  language: "th/en"
---

# Documentation Index

## Product

- [[product-requirements]]
  - `docs/product/product-requirements.md` — PRD หลักของโปรดักต์
- [[software-requirements-specification]]
  - `docs/product/software-requirements-specification.md` — SRS และ non-functional constraints
- [[business-requirements]]
  - `docs/product/business-requirements.md` — BRD เชิงธุรกิจ
- [[business-validation-plan]]
  - `docs/product/business-validation-plan.md` — แผน validation ตลาด/activation
- [[competitive-brief]]
  - `docs/product/competitive-brief.md` — ภาพตลาดและคู่แข่ง
- [[one-pager]]
  - `docs/product/one-pager.md` — สรุปสั้นสำหรับการเล่าโปรดักต์
- [[roadmap]]
  - `docs/product/roadmap.md` — roadmap หลักที่ใช้งานปัจจุบัน
- [[roadmap-legacy]]
  - `docs/product/roadmap-legacy.md` — roadmap รุ่นเก่าที่ยังเก็บไว้เป็นประวัติ

## Design System

- [[design-system/README]]
  - `docs/design-system/README.md` — **SSOT hub** ของ design system (Command Deck HUD v2)
- [[01-foundations]]
  - `docs/design-system/01-foundations.md` — principles, visual language, surfaces, NFR gate, a11y
- [[02-tokens]]
  - `docs/design-system/02-tokens.md` — design tokens (color/type/space/radius/elevation/blur/motion) + `:root`
- [[03-layout]]
  - `docs/design-system/03-layout.md` — Subtract-shape geometry, dimensions, responsive
- [[04-components]]
  - `docs/design-system/04-components.md` — component catalog (anatomy/dim/states)
- [[05-sitemap-ia]]
  - `docs/design-system/05-sitemap-ia.md` — IA, navigation, page inventory, flows
- [[06-stack]]
  - `docs/design-system/06-stack.md` — tech stack + code map + migration checklist
- `docs/design-system/assets/`
  - `docs/design-system/assets/` — annotated wireframe/subtract-shape/swatches (SVG) + glass prototype (HTML)

## Architecture

- [[tech-stack]]
  - `docs/architecture/tech-stack.md` — เทคโนโลยีและเหตุผลการเลือก
- [[engineering-spec]]
  - `docs/architecture/engineering-spec.md` — contracts และ engineering rules
- [[technical-design-document]]
  - `docs/architecture/technical-design-document.md` — system design หลัก
- [[design-system]]
  - `docs/architecture/design-system.md` — Iceglass UX/UI design system สำหรับ Control Dashboard และ Overlay
- [[product-family-design-map]]
  - `docs/architecture/product-family-design-map.md` — shared visual overview for G-Maiden and the `orchestration/` G-Orchestra multi-agent dev tool
- [[g-maiden-ui-sitemap-flow-board]]
  - `docs/architecture/g-maiden-ui-sitemap-flow-board.md` — G-Maiden player-facing UI sitemap, user flow, and board
- [[implementation-plan]]
  - `docs/architecture/implementation-plan.md` — implementation plan / ultraplan
- [[oauth-jwt-client-authorization-flows]]
  - `docs/architecture/oauth-jwt-client-authorization-flows.md` — C-3/HIGH OAuth 2.0 + PKCE, JWT, Device Authorization pairing, and future mobile-client authorization contract
- `docs/architecture/adr/`
  - `docs/architecture/adr/` — architecture decisions (ADR-10/11/12 strategy, ADR-13 DXGI, **ADR-14 GID account & identity layer**, **ADR-17 brokered OAuth transaction boundary**)
- `docs/architecture/spikes/`
  - `docs/architecture/spikes/` — spike และ technical proof

## Orchestration

- `orchestration/docs/SRS--G-ORCHESTRA.md`
  - `orchestration/docs/SRS--G-ORCHESTRA.md` — SRS สำหรับ G-Orchestra multi-agent orchestrator
- `orchestration/docs/FEAT--MULTI-AGENT-ORCHESTRATOR.md`
  - `orchestration/docs/FEAT--MULTI-AGENT-ORCHESTRATOR.md` — feature spec สำหรับ G-Orchestra multi-agent workflow
- `orchestration/docs/g-orchestra-ui-sitemap-flow-board.md`
  - `orchestration/docs/g-orchestra-ui-sitemap-flow-board.md` — G-Orchestra UI sitemap, user flow, and design board
- [[SPEC--*]]
  - `orchestration/docs/SPEC--*.md` — specs เฉพาะระบบ orchestration เช่น verify gate, provider registry, local model anti-error loop
- [[ADR-O-*]]
  - `orchestration/docs/ADR-O-*.md` — architecture decisions ของ orchestration

## Features

- [[features/README]]
  - `docs/features/README.md` — ดัชนี feature docs
- [[FEAT-G-*]]
  - `docs/features/FEAT-G-*.md` — เอกสารเชิงโมดูลของ G-series

## Operations

- [[gmaiden-closed-beta-release-playbook]]
  - `docs/operations/gmaiden-closed-beta-release-playbook.md` — playbook สำหรับปล่อยสิทธิ์ดาวน์โหลด G-Maiden Closed Beta, flow จริงของ queue/grant/download, และ naming convention ของ `release_id`/`artifact_path`

- `docs/operations/validation/`
  - `docs/operations/validation/` — toolkit, forms, social validation assets
- `docs/operations/audits/`
  - `docs/operations/audits/` — audit reports

## Guides

- [[scaffold-setup]]
  - `docs/guides/scaffold-setup.md` — scaffold/setup guidance
- [[small-model-prompting]]
  - `docs/guides/small-model-prompting.md` — prompting guide สำหรับ small model

## Research

- [[subagent-context-scoping]]
  - `docs/research/concepts/subagent-context-scoping.md` — concept note เรื่อง subagent context scoping

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | สารบัญ docs ฉบับแรก (untracked) |
| 0.1.1 | 2026-07-19 | link/metadata sweep (G15-T2): fixed unresolved wikilinks — `[[architecture/design-system]]` → `[[design-system]]`; directory/non-doc-graph targets (`architecture/adr`, `architecture/spikes`, `design-system/assets`, `operations/validation`, `operations/audits`, `orchestration/docs/*`) converted to plain backtick path text. `docs/operations/audits/` does not exist on disk (dangling; real audits live at `docs/audits/`) |
| 0.1.2 | 2026-07-21 | Added the OAuth/JWT multi-client authorization-flow architecture document. |
| 0.1.3 | 2026-07-21 | Added ADR-17 as the selected high-assurance OAuth transaction architecture. |
| 0.1.4 | 2026-07-22 | Added the G-Maiden Closed Beta release playbook under Operations. |
