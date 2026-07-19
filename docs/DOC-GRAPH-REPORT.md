# G-Maiden Doc Graph Report

สร้างเมื่อ / Generated at: 2026-07-19T11:15:40.662Z

สแกน 87 ไฟล์เอกสาร, 195 nodes, 1121 edges, 169 รายการปัญหา (119 ตัวบล็อก exit code) / scanned 87 doc files, 195 nodes, 1121 edges, 169 violations (119 blocking exit code).

ผลลัพธ์ / Result: **FAIL (exit 1)**

## สรุปตามประเภทปัญหา / Summary by violation reason

| Reason | คำอธิบาย / Description | Count | Blocking? |
| --- | --- | --- | --- |
| bad-anchor | เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range | 14 | yes |
| collision | wikilink ชนกัน / repeated wikilink target | 58 | yes |
| glob-slug | สแลกแบบ wildcard (informational) / glob slug (informational) | 3 | no (informational) |
| missing-changelog | มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table | 9 | yes |
| no-metadata | ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational) | 47 | no (informational) |
| unresolved | wikilink หาไม่เจอ / unresolved wikilink | 34 | yes |
| version-changelog-mismatch | version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row | 4 | yes |

## รายการปัญหารายไฟล์ / Per-file violation list

### docs/DOC-GRAPH-REPORT.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/DOC-INDEX.md

- [L38] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="design-system/assets")
- [L49] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="architecture/design-system")
- [L57] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="architecture/adr")
- [L59] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="architecture/spikes")
- [L64] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="SRS--G-ORCHESTRA")
- [L66] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="FEAT--MULTI-AGENT-ORCHESTRATOR")
- [L68] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="g-orchestra-ui-sitemap-flow-board")
- [L70] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="SPEC--*")
- [L72] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="ADR-O-*")
- [L79] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="FEAT-G-*")
- [L84] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="operations/validation")
- [L86] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="operations/audits")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/DOCS-IA-REORG-PROPOSAL.md

- [L16] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/product/")
- [L18] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/architecture/")
- [L20] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/features/")
- [L22] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/operations/")
- [L24] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/guides/")
- [L26] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/research/")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/README.md

- [L7] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/product/")
- [L9] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/architecture/")
- [L11] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/features/")
- [L13] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/operations/")
- [L15] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/guides/")
- [L17] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="docs/research/")
- [L39] **collision** — wikilink ชนกัน / repeated wikilink target (slug="DOC-INDEX")
- [L54] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="SPEC--GOVIBE-INTEGRATION")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/CR-001-dxgi-capture-migration.md

- [L221] **collision** — wikilink ชนกัน / repeated wikilink target (slug="DXGI-task-assignment")

### docs/architecture/adr/ADR-15-command-deck-hud-v2-design-system.md

- [L21] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="architecture/design-system")
- [L42] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-005-landing-auth-social")

### docs/architecture/adr/ADR-16-credit-economy-and-mint-oracle.md

- [L24] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-11-optin-data-contribution-flywheel")
- [L24] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-12-community-ai-marketplace")
- [L31] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-14-gid-account-identity")
- [L144] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-003-account-phase1-wallet-billing")

### docs/architecture/assets/design-references/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/design-system.md

- [L43] **collision** — wikilink ชนกัน / repeated wikilink target (slug="software-requirements-specification")
- [L44] **collision** — wikilink ชนกัน / repeated wikilink target (slug="engineering-spec")
- [L45] **collision** — wikilink ชนกัน / repeated wikilink target (slug="technical-design-document")
- [L49] **collision** — wikilink ชนกัน / repeated wikilink target (slug="FEAT-G-SENSORY")
- [L52] **collision** — wikilink ชนกัน / repeated wikilink target (slug="2026-06-23-audit-gsi-setup-overlay-settings-th")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.1.0b", changelog="+banner")

### docs/architecture/engineering-spec.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/g-maiden-ui-sitemap-flow-board.md

- [L23] **collision** — wikilink ชนกัน / repeated wikilink target (slug="05-sitemap-ia")
- [L178] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [L180] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")

### docs/architecture/implementation-plan.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/product-family-design-map.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.5.0b", changelog="+banner")

### docs/architecture/spec-orchestra-codedoc-agent.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/spikes/S-1-minimap-cv.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/tech-stack.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/technical-design-document.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/audits/2026-06-23-audit-gsi-setup-overlay-settings-th.md

- [L17] **collision** — wikilink ชนกัน / repeated wikilink target (slug="engineering-spec")
- [L219] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")

### docs/audits/2026-07-07-independent-full-audit.md

- [L4] **collision** — wikilink ชนกัน / repeated wikilink target (slug="SEC-001-auth-identity-hardening")
- [L40] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-003-account-phase1-wallet-billing")

### docs/audits/SEC-001-auth-identity-hardening.md

- [L16] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-003-account-phase1-wallet-billing")
- [L87] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-14-gid-account-identity")

### docs/change request/ADR-13-dxgi-capture-migration.md

- [L128] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLAUDE.md")

### docs/change request/CR-001-REVIEW-and-execution-plan.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.1.0", changelog="0.3.0")

### docs/change request/CR-001-Wave-C-test-plan.md

- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/change request/CR-003-account-phase1-wallet-billing.md

- [L15] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-16-credit-economy-and-mint-oracle")
- [L22] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-14-gid-account-identity")
- [L656] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="architecture/design-system")

### docs/change request/CR-003-payment-golive-checklist.md

- [L19] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-16-credit-economy-and-mint-oracle")
- [L36] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLAUDE.md")
- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/change request/CR-004-voice-command-browser.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-005-landing-auth-social.md

- [L36] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-14-gid-account-identity")

### docs/change request/CR-007-frostline-deck-refresh.md

- [L40] **collision** — wikilink ชนกัน / repeated wikilink target (slug="07-combat-hud")
- [L49] **collision** — wikilink ชนกัน / repeated wikilink target (slug="03-layout")
- [L82] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [L85] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-008-login-hardening.md

- [L6] **collision** — wikilink ชนกัน / repeated wikilink target (slug="SEC-001-auth-identity-hardening")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-009-gannstudio-authoring-install-contract.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-010-overlay-exact-kill-victim.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-011-cold-booth-ux-direction.md

- [L3] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-007-frostline-deck-refresh")
- [L7] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-003-account-phase1-wallet-billing")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-013-one-canvas-sitemap-gstore-ios-settings.md

- [L8] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-011-cold-booth-ux-direction")
- [L9] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-003-account-phase1-wallet-billing")
- [L9] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-16-credit-economy-and-mint-oracle")
- [L9] **collision** — wikilink ชนกัน / repeated wikilink target (slug="05-sitemap-ia")
- [L191] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLAUDE.md")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/DXGI-task-assignment.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.1.0", changelog="0.2.0")

### docs/design-system/01-foundations.md

- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/design-system/02-tokens.md

- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/design-system/04-components.md

- [L391] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [L392] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [L514] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/design-system/05-sitemap-ia.md

- [L14] **collision** — wikilink ชนกัน / repeated wikilink target (slug="03-layout")
- [L46] **collision** — wikilink ชนกัน / repeated wikilink target (slug="04-components")

### docs/design-system/06-stack.md

- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/design-system/07-combat-hud.md

- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/design-system/08-account-gid.md

- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/design-system/README.md

- [L35] **collision** — wikilink ชนกัน / repeated wikilink target (slug="06-stack")
- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/features/FEAT-G-COACH.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-LOG.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MASTER.md

- [L41] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MEMORY.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MIND.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MOTION.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-PERSONA.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-REVIVE.md

- [L101] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SCORE.md

- [L7] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-12-community-ai-marketplace")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SENSORY.md

- [L4] **collision** — wikilink ชนกัน / repeated wikilink target (slug="technical-design-document")
- [L48] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [L81] **collision** — wikilink ชนกัน / repeated wikilink target (slug="architecture/design-system")
- [L81] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="architecture/design-system")
- [L145] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="architecture/design-system")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SENTRY.md

- [L4] **collision** — wikilink ชนกัน / repeated wikilink target (slug="technical-design-document")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SIGNAL.md

- [L4] **collision** — wikilink ชนกัน / repeated wikilink target (slug="software-requirements-specification")
- [L16] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [L109] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-STREAM.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-VOICE.md

- [L9] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src-tauri/src/main.rs")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/guides/scaffold-setup.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/guides/small-model-prompting.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/operations/validation/forms-and-social.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/business-requirements.md

- [L3] **collision** — wikilink ชนกัน / repeated wikilink target (slug="product-requirements")
- [L3] **collision** — wikilink ชนกัน / repeated wikilink target (slug="software-requirements-specification")
- [L5] **collision** — wikilink ชนกัน / repeated wikilink target (slug="competitive-brief")
- [L5] **collision** — wikilink ชนกัน / repeated wikilink target (slug="roadmap")
- [L95] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-10-hybrid-ingestion-resilience")
- [L96] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-11-optin-data-contribution-flywheel")
- [L102] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-12-community-ai-marketplace")

### docs/product/business-validation-plan.md

- [L26] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-11-optin-data-contribution-flywheel")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/competitive-brief.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/one-pager.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/product-requirements.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/roadmap-legacy.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/roadmap.md

- [L3] **collision** — wikilink ชนกัน / repeated wikilink target (slug="product-requirements")
- [L3] **collision** — wikilink ชนกัน / repeated wikilink target (slug="software-requirements-specification")
- [L3] **collision** — wikilink ชนกัน / repeated wikilink target (slug="engineering-spec")
- [L3] **collision** — wikilink ชนกัน / repeated wikilink target (slug="technical-design-document")
- [L12] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-003-account-phase1-wallet-billing")
- [L18] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="PROJECT_FEATURE_MAP")
- [L48] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-003-payment-golive-checklist")
- [L66] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-12-community-ai-marketplace")
- [L114] **collision** — wikilink ชนกัน / repeated wikilink target (slug="CR-002-Phase2-wire-backend")
- [L149] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-14-gid-account-identity")
- [L154] **collision** — wikilink ชนกัน / repeated wikilink target (slug="ADR-11-optin-data-contribution-flywheel")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/software-requirements-specification.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/reference/dota-ui/README.md

- [L9] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="architecture/assets/design-references/README")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/assets/dota2-hud-reference.md

- [L7] **collision** — wikilink ชนกัน / repeated wikilink target (slug="reference/dota-ui/README")
- [L7] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="reference/dota-ui/README")
- [L11] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="reference/dota-ui/README")
- [L210] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="reference/dota-ui/README")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/competitor-brightgir-opendota-analysis.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/huggingface-dota2-resources.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

