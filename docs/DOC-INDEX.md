---
title: "Documentation Index"
doc_id: "DOC-INDEX"
version: "0.2.0"
created_at: "2026-07-19T00:00:00+07:00,Unknown"
last_update: "2026-08-24T10:04:00+07:00,ATHER"
status: "active"
updated: "2026-08-24"
owner: "Boss"
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
- `docs/product/closed-beta-privacy-notice-draft.md` — ร่างนโยบายความเป็นส่วนตัวสำหรับ Closed Beta
- `docs/product/closed-beta-terms-of-use-draft.md` — ร่างข้อตกลงการใช้งานสำหรับ Closed Beta
- `docs/product/MASTERPLAN-account-phase1.md` — แผนแม่บทระบบบัญชีและ Wallet Phase 1

## Release Governance

- `docs/releases/README.md`
  - `docs/releases/README.md` — canonical hub ของ release governance, stage gates, และ execution contract
- `docs/releases/beta-roadmap.md`
  - `docs/releases/beta-roadmap.md` — release-maturity roadmap แยกจาก feature roadmap
- `docs/releases/release-channel-architecture.md`
  - `docs/releases/release-channel-architecture.md` — Dev → Closed Beta → Stable channel architecture และ artifact promotion rules
- `docs/releases/release-channel-implementation.md`
  - `docs/releases/release-channel-implementation.md` — บันทึกและสถานะการติดตั้งระบบ release channels
- `docs/releases/public-demo/specification.md`
  - `docs/releases/public-demo/specification.md` — Public Demo scope และ deterministic product-story contract
- `docs/releases/public-demo/rollback.md`
  - `docs/releases/public-demo/rollback.md` — แผนการย้อนกลับ (Rollback Plan) ของ Public Demo
- `docs/releases/closed-beta/wave-0/specification.md`
  - `docs/releases/closed-beta/wave-0/specification.md` — Closed Beta Wave 0 scope
- `docs/releases/closed-beta/wave-0/definition-of-done.md`
  - `docs/releases/closed-beta/wave-0/definition-of-done.md` — Wave 0 DoD, evidence, และ exit gate
- `docs/releases/closed-beta/wave-0/evidence-runbook.md`
  - `docs/releases/closed-beta/wave-0/evidence-runbook.md` — คู่มือการเก็บหลักฐานและรันเทสสำหรับ Wave 0
- `docs/releases/closed-beta/wave-1/specification.md`
  - `docs/releases/closed-beta/wave-1/specification.md` — Wave 1 core-intelligence validation
- `docs/releases/closed-beta/wave-1/definition-of-done.md`
  - `docs/releases/closed-beta/wave-1/definition-of-done.md` — Wave 1 DoD and exit gate
- `docs/releases/closed-beta/wave-2/specification.md`
  - `docs/releases/closed-beta/wave-2/specification.md` — Wave 2 expanded-access and operations validation
- `docs/releases/closed-beta/wave-2/definition-of-done.md`
  - `docs/releases/closed-beta/wave-2/definition-of-done.md` — Wave 2 DoD and exit gate
- `docs/releases/open-beta/specification.md`
  - `docs/releases/open-beta/specification.md` — Open Beta scope
- `docs/releases/open-beta/definition-of-done.md`
  - `docs/releases/open-beta/definition-of-done.md` — Open Beta DoD และ exit gate

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
- `docs/design-system/07-combat-hud.md`
  - `docs/design-system/07-combat-hud.md` — เอกสารการออกแบบ Combat HUD ของหน้าจอ overlay
- `docs/design-system/08-account-gid.md`
  - `docs/design-system/08-account-gid.md` — การออกแบบส่วนเชื่อมต่อระบบบัญชีและ GID
- `docs/design-system/landing_page_prompt.md`
  - `docs/design-system/landing_page_prompt.md` — prompt reference สำหรับออกแบบหน้าเว็บ landing
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
- `docs/architecture/adr/` — Architecture Decision Records (ADRs):
  - `docs/architecture/adr/ADR-10-hybrid-ingestion-resilience.md` — Hybrid Ingestion Resilience
  - `docs/architecture/adr/ADR-11-optin-data-contribution-flywheel.md` — Opt-in Data Contribution + match_id Flywheel
  - `docs/architecture/adr/ADR-12-community-ai-marketplace.md` — Community AI Marketplace
  - `docs/architecture/adr/ADR-13-dxgi-capture-migration.md` — Migrate Screen Capture from WGC to DXGI Desktop Duplication
  - `docs/architecture/adr/ADR-14-gid-account-identity.md` — GID — G-Series Account & Identity Layer
  - `docs/architecture/adr/ADR-15-command-deck-hud-v2-design-system.md` — Command Deck HUD v2 design system
  - `docs/architecture/adr/ADR-16-credit-economy-and-mint-oracle.md` — Credit Economy (shard/wallet) + Mint Oracle + match_ref Storage
  - `docs/architecture/adr/ADR-17-brokered-oauth-transaction-boundary.md` — Supabase OAuth Server Transaction Boundary
  - `docs/architecture/adr/ADR-18-dev-runtime-governance-split.md` — Dev & Runtime Governance Split (renamed from ADR-17)
- `docs/architecture/spikes/` — Spikes & Technical Proofs:
  - `docs/architecture/spikes/S-1-minimap-cv.md` — Spike minimap computer vision
  - `docs/architecture/spikes/S-2-oauth-broker-provider-capability.md` — Spike Supabase OAuth Server & Loopback gate capability

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

## Change Requests (CR)

- `docs/change request/` — ข้อเสนอการเปลี่ยนแปลงและการขยายฟีเจอร์ของระบบ:
  - `docs/change request/CR-001-REVIEW-and-execution-plan.md` — DXGI Capture Migration REVIEW & Execution
  - `docs/change request/CR-002-Phase2-wire-backend.md` — Phase 2 Live-wired bento deck
  - `docs/change request/CR-003-account-phase1-wallet-billing.md` — Account Phase 1 Wallet & Billing
  - `docs/change request/CR-013-one-canvas-sitemap-gstore-ios-settings.md` — One Canvas Sitemap
  - `docs/change request/CR-016-gmad-beta-download-admin-controller.md` — Beta download controller
  - `docs/change request/CR-020-gmad-beta-notification-and-open-beta-countdown.md` — Countdown spec
  - `docs/change request/CR-022-gmad-desktop-first-run-entitlement-account-handoff.md` — Desktop first-run entitlement gate
  - `docs/change request/CR-033-pr-gate-agent-required-status-review-gate.md` — PR gate agent review rule
  - `docs/change request/CR-034-gid-iam-production-completion.md` — GID IAM Phase 2 implemented locally; live verification and production promotion pending
  - `docs/change request/CR-*.md` — เอกสาร CR อื่นๆ ทั้งหมดตั้งแต่ CR-001 ถึง CR-034

## Operations

- [[gmaiden-closed-beta-release-playbook]]
  - `docs/operations/gmaiden-closed-beta-release-playbook.md` — playbook สำหรับปล่อยสิทธิ์ดาวน์โหลด G-Maiden Closed Beta, flow จริงของ queue/grant/download, และ naming convention ของ `release_id`/`artifact_path`
- `docs/operations/validation/`
  - `docs/operations/validation/` — toolkit, forms, social validation assets

## Audits & RCA

- `docs/audits/` — รายงานการตรวจความปลอดภัยและคุณภาพโค้ด (Audit Reports):
  - `docs/audits/2026-06-23-audit-gsi-setup-overlay-settings-th.md` — รายงานตรวจสอบการตั้งค่า GSI & Overlay
  - `docs/audits/2026-07-07-independent-full-audit.md` — รายงานการตรวจโค้ดอิสระฉบับเต็ม
  - `docs/audits/SEC-001-auth-identity-hardening.md` — รายงานตรวจสอบความปลอดภัย auth
- `docs/rca/` — รายงานสาเหตุความผิดพลาดและการปรับปรุง (Root Cause Analysis):
  - `docs/rca/2026-07-10-release-gate-drift-v0.9.0.md` — วิเคราะห์ความล้มเหลวในการปล่อย v0.9.0
  - `docs/rca/2026-07-10-voice-pack-path-traversal.md` — วิเคราะห์ช่องโหว่ path traversal ของ voice pack

## Guides

- [[scaffold-setup]]
  - `docs/guides/scaffold-setup.md` — scaffold/setup guidance
- [[small-model-prompting]]
  - `docs/guides/small-model-prompting.md` — prompting guide สำหรับ small model

## Research

- [[subagent-context-scoping]]
  - `docs/research/concepts/subagent-context-scoping.md` — concept note เรื่อง subagent context scoping

## Superpowers

- `docs/superpowers/` — แผนและข้อกำหนดของฟีเจอร์ขั้นสูง (Superpowers Plans & Specs):
  - `docs/superpowers/specs/2026-08-09-gid-central-pipeline-design.md` — GID Central Pipeline Design
  - `docs/superpowers/plans/2026-08-09-gid-pipeline-phase1.md` — GID Central Pipeline Phase 1 Plan
  - `docs/superpowers/plans/2026-08-09-gid-pipeline-phase2-annstudio.md` — GID Central Pipeline Phase 2 Plan (AnnStudio)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | สารบัญ docs ฉบับแรก (untracked) |
| 0.1.1 | 2026-07-19 | link/metadata sweep (G15-T2): fixed unresolved wikilinks — `[[architecture/design-system]]` → `[[design-system]]`; directory/non-doc-graph targets (`architecture/adr`, `architecture/spikes`, `design-system/assets`, `operations/validation`, `operations/audits`, `orchestration/docs/*`) converted to plain backtick path text. `docs/operations/audits/` does not exist on disk (dangling; real audits live at `docs/audits/`) |
| 0.1.2 | 2026-07-21 | Added the OAuth/JWT multi-client authorization-flow architecture document. |
| 0.1.3 | 2026-07-21 | Added ADR-17 as the selected high-assurance OAuth transaction architecture. |
| 0.1.4 | 2026-07-22 | Added the G-Maiden Closed Beta release playbook under Operations. |
| 0.1.5 | 2026-07-24 | Added a Release Governance section that points canonical indexes to `docs/releases/` while keeping feature ownership in the product roadmap and `PROJECT_FEATURE_MAP.md`. |
| 0.1.6 | 2026-08-17 | Updated index to include missing folders (change request, audits, rca, superpowers) and listed all ADRs (ADR-10 to ADR-18) explicitly. |
| 0.1.7 | 2026-08-23 | Added the CR-034 GID IAM production-completion candidate to the Change Request index. |
| 0.1.8 | 2026-08-23 | Recorded CR-034 Phase 0 completion and the Phase 1 review gate. |
| 0.1.9 | 2026-08-24 | Recorded CR-034 Phase 1 local implementation and retained the live-production promotion gate. |
| 0.2.0 | 2026-08-24 | Recorded CR-034 Phase 2 local session/security implementation and retained the live-production promotion gate. |
