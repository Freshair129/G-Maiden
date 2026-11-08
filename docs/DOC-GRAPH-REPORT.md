# G-Maiden Doc Graph Report

สร้างเมื่อ / Generated at: 2026-11-08T22:04:34.351Z

สแกน 186 ไฟล์เอกสาร, 297 nodes, 1390 edges, 32 รายการปัญหา (6 ตัวบล็อก exit code) / scanned 186 doc files, 297 nodes, 1390 edges, 32 violations (6 blocking exit code).

ผลลัพธ์ / Result: **FAIL (exit 1)**

## สรุปตามประเภทปัญหา / Summary by violation reason

| Reason | คำอธิบาย / Description | Count | Blocking? |
| --- | --- | --- | --- |
| anchor-symbol-mismatch | anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) | 4 | yes |
| glob-slug | สแลกแบบ wildcard (informational) / glob slug (informational) | 1 | no (informational) |
| missing-changelog | มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table | 1 | yes |
| no-metadata | ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational) | 25 | no (informational) |
| version-changelog-mismatch | version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row | 1 | yes |

## รายการปัญหารายไฟล์ / Per-file violation list

### docs/DOC-GRAPH-REPORT.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/DOC-INDEX.md

- [L151] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="FEAT-G-*")

### docs/DOCS-IA-REORG-PROPOSAL.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/FEATURE-LEDGER.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/FEATURE-ORPHAN-REPORT.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/adr/ADR-21-event-taxonomy-sot.md

- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/architecture/assets/design-references/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/spikes/S-1-minimap-cv.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-007-frostline-deck-refresh.md

- [L94] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=783, symbol="announcer_install")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-008-login-hardening.md

- [L80] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=973, symbol="oauth_callback")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-009-gannstudio-authoring-install-contract.md

- [L47] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=783, symbol="announcer_install")

### docs/change request/CR-010-overlay-exact-kill-victim.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-011-cold-booth-ux-direction.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-013-one-canvas-sitemap-gstore-ios-settings.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-047-pro-tier-entitlement-contract.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.4.1", changelog="0.1.0")

### docs/design-system/landing_page_prompt.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-REVIVE.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SENTRY.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/guides/scaffold-setup.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/guides/small-model-prompting.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/business-validation-plan.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/competitive-brief.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/one-pager.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/rca/2026-07-10-voice-pack-path-traversal.md

- [L28] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=783, symbol="announcer_install")

### docs/reference/dota-ui/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/assets/dota2-hud-reference.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/competitor-brightgir-opendota-analysis.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/huggingface-dota2-resources.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/superpowers/plans/2026-08-09-gid-pipeline-phase2-annstudio.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

