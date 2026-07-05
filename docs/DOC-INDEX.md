# Documentation Index

## Product

- `docs/product/product-requirements.md` — PRD หลักของโปรดักต์
- `docs/product/software-requirements-specification.md` — SRS และ non-functional constraints
- `docs/product/business-requirements.md` — BRD เชิงธุรกิจ
- `docs/product/business-validation-plan.md` — แผน validation ตลาด/activation
- `docs/product/competitive-brief.md` — ภาพตลาดและคู่แข่ง
- `docs/product/one-pager.md` — สรุปสั้นสำหรับการเล่าโปรดักต์
- `docs/product/roadmap.md` — roadmap หลักที่ใช้งานปัจจุบัน
- `docs/product/roadmap-legacy.md` — roadmap รุ่นเก่าที่ยังเก็บไว้เป็นประวัติ

## Design System

- `docs/design-system/README.md` — **SSOT hub** ของ design system (Command Deck HUD v2)
- `docs/design-system/01-foundations.md` — principles, visual language, surfaces, NFR gate, a11y
- `docs/design-system/02-tokens.md` — design tokens (color/type/space/radius/elevation/blur/motion) + `:root`
- `docs/design-system/03-layout.md` — Subtract-shape geometry, dimensions, responsive
- `docs/design-system/04-components.md` — component catalog (anatomy/dim/states)
- `docs/design-system/05-sitemap-ia.md` — IA, navigation, page inventory, flows
- `docs/design-system/06-stack.md` — tech stack + code map + migration checklist
- `docs/design-system/assets/` — annotated wireframe/subtract-shape/swatches (SVG) + glass prototype (HTML)

## Architecture

- `docs/architecture/tech-stack.md` — เทคโนโลยีและเหตุผลการเลือก
- `docs/architecture/engineering-spec.md` — contracts และ engineering rules
- `docs/architecture/technical-design-document.md` — system design หลัก
- `docs/architecture/design-system.md` — Iceglass UX/UI design system สำหรับ Control Dashboard และ Overlay
- `docs/architecture/product-family-design-map.md` — shared visual overview for G-Maiden and the `orchestration/` G-Orchestra multi-agent dev tool
- `docs/architecture/g-maiden-ui-sitemap-flow-board.md` — G-Maiden player-facing UI sitemap, user flow, and board
- `docs/architecture/implementation-plan.md` — implementation plan / ultraplan
- `docs/architecture/adr/` — architecture decisions (ADR-10/11/12 strategy, ADR-13 DXGI,
  **ADR-14 GID account & identity layer** — Supabase `gstore`, Google OAuth, GID codec, privacy reconcile)
- `docs/architecture/spikes/` — spike และ technical proof

## Orchestration

- `orchestration/docs/SRS--G-ORCHESTRA.md` — SRS สำหรับ G-Orchestra multi-agent orchestrator
- `orchestration/docs/FEAT--MULTI-AGENT-ORCHESTRATOR.md` — feature spec สำหรับ G-Orchestra multi-agent workflow
- `orchestration/docs/g-orchestra-ui-sitemap-flow-board.md` — G-Orchestra UI sitemap, user flow, and design board
- `orchestration/docs/SPEC--*.md` — specs เฉพาะระบบ orchestration เช่น verify gate, provider registry, local model anti-error loop
- `orchestration/docs/ADR-O-*.md` — architecture decisions ของ orchestration

## Features

- `docs/features/README.md` — ดัชนี feature docs
- `docs/features/FEAT-G-*.md` — เอกสารเชิงโมดูลของ G-series

## Operations

- `docs/operations/validation/` — toolkit, forms, social validation assets
- `docs/operations/audits/` — audit reports

## Guides

- `docs/guides/scaffold-setup.md` — scaffold/setup guidance
- `docs/guides/small-model-prompting.md` — prompting guide สำหรับ small model

## Research

- `docs/research/concepts/subagent-context-scoping.md` — concept note เรื่อง subagent context scoping
