# G-Maiden Doc Graph Report

สร้างเมื่อ / Generated at: 2026-07-21T16:20:40.674Z

สแกน 113 ไฟล์เอกสาร, 237 nodes, 1207 edges, 130 รายการปัญหา (79 ตัวบล็อก exit code) / scanned 113 doc files, 237 nodes, 1207 edges, 130 violations (79 blocking exit code).

ผลลัพธ์ / Result: **FAIL (exit 1)**

## สรุปตามประเภทปัญหา / Summary by violation reason

| Reason | คำอธิบาย / Description | Count | Blocking? |
| --- | --- | --- | --- |
| anchor-symbol-mismatch | anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) | 11 | yes |
| doc-id-slug-mismatch | doc_id ไม่ตรงกับ slug ของไฟล์ (--strict) / doc_id does not match the file's slug (--strict) | 2 | yes |
| glob-slug | สแลกแบบ wildcard (informational) / glob slug (informational) | 3 | no (informational) |
| invalid-status | ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) | 21 | yes |
| missing-approval | status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) | 7 | yes |
| missing-file | symbol link ไปยังไฟล์ที่ไม่มีจริง / symbol link to a missing file | 1 | yes |
| missing-required-field | ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) | 22 | yes |
| no-metadata | ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational) | 48 | no (informational) |
| version-changelog-mismatch | version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row | 15 | yes |

## รายการปัญหารายไฟล์ / Per-file violation list

### docs/DOC-GRAPH-REPORT.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/DOC-INDEX.md

- [L84] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="SPEC--*")
- [L86] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="ADR-O-*")
- [L93] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="FEAT-G-*")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/DOCS-IA-REORG-PROPOSAL.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/FEATURE-LEDGER.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/CR-001-dxgi-capture-migration.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="Submitted")

### docs/architecture/adr/ADR-10-hybrid-ingestion-resilience.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/adr/ADR-11-optin-data-contribution-flywheel.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/adr/ADR-12-community-ai-marketplace.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/adr/ADR-14-gid-account-identity.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/adr/ADR-15-command-deck-hud-v2-design-system.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="accepted (design) · pending implementation")

### docs/architecture/adr/ADR-17-brokered-oauth-transaction-boundary.md

- [L133] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=422, symbol="rs:L422")
- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")

### docs/architecture/assets/design-references/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/engineering-spec.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/g-maiden-ui-sitemap-flow-board.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/implementation-plan.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/oauth-jwt-client-authorization-flows.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")

### docs/architecture/spec-orchestra-codedoc-agent.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/spikes/S-1-minimap-cv.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/spikes/S-2-oauth-broker-provider-capability.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")

### docs/architecture/tech-stack.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/technical-design-document.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/ADR-13-dxgi-capture-migration.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/change request/CR-001-REVIEW-and-execution-plan.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="Wave A+B code-complete & gate-green (2026-06-29); Wave C in-game test pending Boss")

### docs/change request/CR-001-Wave-C-test-plan.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="ready to execute")

### docs/change request/CR-002-Phase2-wire-backend.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="IMPLEMENTED — merged to main 170805b8 (2026-07-02)")

### docs/change request/CR-003-payment-golive-checklist.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="Open — blocked on Phase 0 (legal/terms) + Phase 1 (Omise)")

### docs/change request/CR-004-voice-command-browser.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-005-W1A-landing-hero-gid-closed-beta.md

- [L250] **missing-file** — symbol link ไปยังไฟล์ที่ไม่มีจริง / symbol link to a missing file (target="landing/assets/concepts/g-maiden-sea-captain-stone-titan-v1.webp")

### docs/change request/CR-005-landing-auth-social.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="DRAFT — awaiting approval")

### docs/change request/CR-007-frostline-deck-refresh.md

- [L94] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-008-login-hardening.md

- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=199, symbol="set_master_mode")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=206, symbol="set_master_api_key")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=215, symbol="master_api_key_present")
- [L76] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=424, symbol="set_oauth_pending")
- [L77] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=439, symbol="take_oauth_pending")
- [L80] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=337, symbol="oauth_callback")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-009-gannstudio-authoring-install-contract.md

- [L36] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-010-overlay-exact-kill-victim.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-011-cold-booth-ux-direction.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-013-one-canvas-sitemap-gstore-ios-settings.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-014-document-impact-map-gmaiden-adapter.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/CR-016-gmad-beta-download-admin-controller.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.2b", changelog="0.1.0")

### docs/change request/CR-017-gstore-migration-history-reconciliation.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="implemented")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/CR-018-ops-route-spa-rewrite.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="implemented")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.0b", changelog="0.1.0b")

### docs/change request/CR-019-owner-role-and-operator-delegation.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.0b", changelog="0.1.0b")

### docs/change request/CR-020-gmad-beta-notification-and-open-beta-countdown.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.0b", changelog="0.1.0b")

### docs/change request/CR-021-closed-beta-terms-consent-and-entitlement-acceptance.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.0b", changelog="0.1.0b")

### docs/change request/CR-022-gmad-desktop-first-run-entitlement-account-handoff.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.6.0b", changelog="0.1.0b")

### docs/change request/CR-023-gmaiden-original-3d-hero-scroll-narrative.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.7.1b", changelog="0.1.0b")

### docs/change request/CR-024-gmaiden-3d-studio-and-portable-blender.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.8.1b", changelog="0.1.0b")

### docs/change request/CR-025-codedoc-aligner-structured-output-reliability.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/CR-026-mpfb2-character-authoring-and-guarded-image-to-3d-import.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.1b", changelog="0.1.0b")

### docs/change request/CR-027-comfyui-local-generation-and-provenance-bridge.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="candidate")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")

### docs/change request/CR-028-gmaiden-3d-hero-production-handoff.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.1.1b", changelog="0.1.0b")

### docs/design-system/landing_page_prompt.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-COACH.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-LOG.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MASTER.md

- [L42] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=327, symbol="known_enemies")
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

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SCORE.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SENSORY.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SENTRY.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SIGNAL.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-STREAM.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-VOICE.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/guides/scaffold-setup.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/guides/small-model-prompting.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/operations/validation/forms-and-social.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/business-validation-plan.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/closed-beta-privacy-notice-draft.md

- [-] **doc-id-slug-mismatch** — doc_id ไม่ตรงกับ slug ของไฟล์ (--strict) / doc_id does not match the file's slug (--strict) (severity="error", docId="GMAIDEN-CLOSED-BETA-PRIVACY-NOTICE", expectedSlug="closed-beta-privacy-notice-draft")
- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.0.0b", changelog="0.1.0b")

### docs/product/closed-beta-terms-of-use-draft.md

- [-] **doc-id-slug-mismatch** — doc_id ไม่ตรงกับ slug ของไฟล์ (--strict) / doc_id does not match the file's slug (--strict) (severity="error", docId="GMAIDEN-CLOSED-BETA-TERMS", expectedSlug="closed-beta-terms-of-use-draft")
- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="beta")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.0.0b", changelog="0.1.0b")

### docs/product/competitive-brief.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/one-pager.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/product-requirements.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/roadmap-legacy.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/roadmap.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/software-requirements-specification.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/rca/2026-07-10-voice-pack-path-traversal.md

- [L28] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")

### docs/reference/dota-ui/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/assets/dota2-hud-reference.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/competitor-brightgir-opendota-analysis.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/concepts/subagent-context-scoping.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="stable")

### docs/research/huggingface-dota2-resources.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

