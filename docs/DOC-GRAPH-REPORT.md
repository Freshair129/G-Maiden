# G-Maiden Doc Graph Report

สร้างเมื่อ / Generated at: 2026-08-28T06:43:13.611Z

สแกน 145 ไฟล์เอกสาร, 270 nodes, 1209 edges, 215 รายการปัญหา (159 ตัวบล็อก exit code) / scanned 145 doc files, 270 nodes, 1209 edges, 215 violations (159 blocking exit code).

ผลลัพธ์ / Result: **FAIL (exit 1)**

## สรุปตามประเภทปัญหา / Summary by violation reason

| Reason | คำอธิบาย / Description | Count | Blocking? |
| --- | --- | --- | --- |
| anchor-symbol-mismatch | anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) | 92 | yes |
| duplicate-slug | สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) | 13 | yes |
| glob-slug | สแลกแบบ wildcard (informational) / glob slug (informational) | 3 | no (informational) |
| invalid-status | ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) | 7 | yes |
| missing-approval | status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) | 7 | yes |
| missing-changelog | มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table | 4 | yes |
| no-metadata | ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational) | 53 | no (informational) |
| unresolved | wikilink หาไม่เจอ / unresolved wikilink | 11 | yes |
| version-changelog-mismatch | version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row | 25 | yes |

## รายการปัญหารายไฟล์ / Per-file violation list

### docs/DOC-GRAPH-REPORT.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/DOC-INDEX.md

- [L139] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="SPEC--*")
- [L141] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="ADR-O-*")
- [L148] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="FEAT-G-*")

### docs/DOCS-IA-REORG-PROPOSAL.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/FEATURE-LEDGER.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/FEATURE-ORPHAN-REPORT.md

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

### docs/architecture/adr/ADR-13-dxgi-capture-migration.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/adr/ADR-14-gid-account-identity.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/adr/ADR-15-command-deck-hud-v2-design-system.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="accepted (design) · pending implementation")

### docs/architecture/adr/ADR-17-brokered-oauth-transaction-boundary.md

- [L134] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=422, symbol="rs:L422")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.4.3b", changelog="0.4.2b")

### docs/architecture/assets/design-references/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/engineering-spec.md

- [L215] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/companion.ts", anchor=941, symbol="useCompanionData")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/g-maiden-ui-sitemap-flow-board.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/gmad-current-first-run-user-flow-walkthrough.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.4.0b", changelog="0.1.0b")

### docs/architecture/implementation-plan.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/oauth-jwt-client-authorization-flows.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.3b", changelog="0.3.2b")

### docs/architecture/spec-orchestra-codedoc-agent.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/spikes/S-1-minimap-cv.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/tech-stack.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/technical-design-document.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/audits/2026-07-07-independent-full-audit.md

- [L122] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/companion.ts", anchor=941, symbol="useCompanionData")

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

### docs/change request/CR-005-landing-auth-social.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="DRAFT — awaiting approval")

### docs/change request/CR-007-frostline-deck-refresh.md

- [L94] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")
- [L127] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=139, symbol="import_archive")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-008-login-hardening.md

- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=365, symbol="set_master_mode")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=372, symbol="set_master_api_key")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=381, symbol="master_api_key_present")
- [L76] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=596, symbol="set_oauth_pending")
- [L77] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=628, symbol="take_oauth_pending")
- [L80] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=337, symbol="oauth_callback")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-009-gannstudio-authoring-install-contract.md

- [L36] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")
- [L77] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/tests.rs", anchor=182, symbol="real_pack_mrijgajn_maps_voice_and_banners")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-010-overlay-exact-kill-victim.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-011-cold-booth-ux-direction.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-013-one-canvas-sitemap-gstore-ios-settings.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-014-document-impact-map-gmaiden-adapter.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/CR-016-gmad-beta-download-admin-controller.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.2b", changelog="0.1.0")

### docs/change request/CR-017-gstore-migration-history-reconciliation.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/CR-019-owner-role-and-operator-delegation.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.1b", changelog="0.1.0b")

### docs/change request/CR-020-gmad-beta-notification-and-open-beta-countdown.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.4.0b", changelog="0.1.0b")

### docs/change request/CR-021-closed-beta-terms-consent-and-entitlement-acceptance.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.0b", changelog="0.1.0b")

### docs/change request/CR-022-gmad-desktop-first-run-entitlement-account-handoff.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.8.2b", changelog="0.1.0b")

### docs/change request/CR-023-gmaiden-original-3d-hero-scroll-narrative.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.7.1b", changelog="0.1.0b")

### docs/change request/CR-024-gmaiden-3d-studio-and-portable-blender.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.8.1b", changelog="0.1.0b")

### docs/change request/CR-025-codedoc-aligner-structured-output-reliability.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/CR-026-mpfb2-character-authoring-and-guarded-image-to-3d-import.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.1b", changelog="0.1.0b")

### docs/change request/CR-028-gmaiden-3d-hero-production-handoff.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="2.0.0b", changelog="0.1.0b")

### docs/change request/CR-029-gmaiden-art-first-2-5d-hero-replacement.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.1.0b", changelog="1.0.0b")

### docs/change request/CR-030-landing-scroll-driven-cinematic-narrative.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.1.1b", changelog="1.0.0b")

### docs/change request/CR-031-landing-hero-layer-separated-wind-motion.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.1.2b", changelog="1.0.0b")

### docs/change request/CR-032-landing-hero-scene-depth-and-character-rig-decomposition.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.0.1b", changelog="1.0.0b")

### docs/change request/CR-033-pr-gate-agent-required-status-review-gate.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/closed-beta-privacy-notice-draft.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="closed-beta-privacy-notice-draft", siblings=["docs/product/closed-beta-privacy-notice-draft.md"])
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/closed-beta-terms-of-use-draft.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="closed-beta-terms-of-use-draft", siblings=["docs/product/closed-beta-terms-of-use-draft.md"])
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/design-system/02-tokens.md

- [L207] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2227, symbol="g-deck-panel")

### docs/design-system/03-layout.md

- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2438, symbol="g-l1-white-glass")
- [L71] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2227, symbol="g-deck-panel")
- [L72] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2530, symbol="g-panel-rim")
- [L73] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2186, symbol="g-sidebar-fab")
- [L73] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2212, symbol="g-topbar-fab")
- [L73] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2892, symbol="g-audio-rail")
- [L74] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2611, symbol="g-power-radial")
- [L74] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2261, symbol="g-signals-fab")
- [L135] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2400, symbol="--cr6-panel-left")
- [L136] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2401, symbol="--cr6-panel-top")
- [L137] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2402, symbol="--cr6-panel-width")
- [L138] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2403, symbol="--cr6-panel-height")
- [L139] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2404, symbol="--cr6-topbar-left")
- [L140] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2405, symbol="--cr6-topbar-top")
- [L141] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2406, symbol="--cr6-topbar-width")
- [L142] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2407, symbol="--cr6-sidebar-left")
- [L143] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2408, symbol="--cr6-sidebar-top")
- [L144] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2419, symbol="--cr6-power-left")
- [L145] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2420, symbol="--cr6-power-top")
- [L146] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2421, symbol="--cr6-power-main-left")
- [L147] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2422, symbol="--cr6-power-main-top")
- [L316] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3007, symbol="gm-fung-layout")

### docs/design-system/04-components.md

- [L59] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2212, symbol="g-topbar-fab")
- [L83] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=960, symbol="profile-wrap")
- [L84] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=965, symbol="profile-trigger")
- [L85] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=1028, symbol="profile-dropdown")
- [L107] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2186, symbol="g-sidebar-fab")
- [L108] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2202, symbol="g-nav-item")
- [L128] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2611, symbol="g-power-radial")
- [L129] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2621, symbol="g-power-main")
- [L130] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2645, symbol="g-power-menu")
- [L155] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2892, symbol="g-audio-rail")
- [L180] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3022, symbol="gm-score-header")
- [L198] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3078, symbol="gm-phase-chip")
- [L199] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/deck/onair.tsx", anchor=216, symbol="PhaseChip")
- [L240] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3126, symbol="gm-mini-stat")
- [L257] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3187, symbol="gm-hero-slot")
- [L273] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3501, symbol="gm-agent-card")
- [L294] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3674, symbol="gm-tally")
- [L294] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3684, symbol="gm-tally-onair")
- [L295] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3525, symbol="gm-sector-log")
- [L315] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3697, symbol="gm-onair")
- [L350] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2783, symbol="g-ping-pill")
- [L374] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3251, symbol="gm-rundown")
- [L397] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3318, symbol="gm-debrief")
- [L413] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2261, symbol="g-signals-fab")
- [L414] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2266, symbol="g-sig")
- [L439] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3819, symbol="gm-palette-backdrop")
- [L439] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3838, symbol="gm-palette")
- [L478] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3820, symbol="gm-sheet-backdrop")
- [L524] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2782, symbol="g-status-pill")
- [L573] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2227, symbol="g-deck-panel")
- [L575] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2530, symbol="g-panel-rim")
- [L591] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2906, symbol="g-volume-rail")

### docs/design-system/05-sitemap-ia.md

- [L62] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CompanionPages.tsx", anchor=196, symbol="HistoryPage")
- [L100] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3078, symbol="gm-phase-chip")
- [L138] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CompanionPages.tsx", anchor=153, symbol="InsightsPage")
- [L138] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CompanionPages.tsx", anchor=196, symbol="HistoryPage")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="2.4.1-draft", changelog="2.4.0-draft")

### docs/design-system/08-account-gid.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.1.1-draft", changelog="1.1.0-draft")

### docs/design-system/landing_page_prompt.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-COACH.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-LOG.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MASTER.md

- [L42] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=493, symbol="known_enemies")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MEMORY.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MIND.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MOTION.md

- [L17] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=192, symbol="heading_multiplier")
- [L20] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=234, symbol="missing_risk")
- [L40] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=192, symbol="heading_multiplier")
- [L58] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=234, symbol="missing_risk")
- [L60] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=192, symbol="heading_multiplier")
- [L64] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=248, symbol="eta_estimate")
- [L66] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=121, symbol="record")
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

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="closed-beta-privacy-notice-draft", siblings=["docs/change request/closed-beta-privacy-notice-draft.md"])
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="1.0.1b", changelog="0.1.0b")

### docs/product/closed-beta-terms-of-use-draft.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="closed-beta-terms-of-use-draft", siblings=["docs/change request/closed-beta-terms-of-use-draft.md"])
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

- [L6] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=283, symbol="active_event_clips")
- [L10] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")
- [L12] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=139, symbol="import_archive")
- [L23] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")
- [L25] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")
- [L28] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")
- [L37] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=194, symbol="extract_pack_zip")
- [L41] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=347, symbol="sanitize_id")
- [L42] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=363, symbol="sanitize_file_name")
- [L55] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")
- [L60] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=283, symbol="active_event_clips")
- [L61] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")

### docs/reference/dota-ui/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/releases/README.md

- [L25] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="RELEASE-CHANNEL-ARCHITECTURE")
- [L26] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="BETA-ROADMAP")
- [L27] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="PUBLIC-DEMO-SPEC")
- [L28] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLOSED-BETA-WAVE-0-SPEC")
- [L29] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLOSED-BETA-WAVE-0-DOD")
- [L30] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLOSED-BETA-WAVE-1-SPEC")
- [L31] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLOSED-BETA-WAVE-1-DOD")
- [L32] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLOSED-BETA-WAVE-2-SPEC")
- [L33] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="CLOSED-BETA-WAVE-2-DOD")
- [L34] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="OPEN-BETA-SPEC")
- [L35] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="OPEN-BETA-DOD")

### docs/releases/closed-beta/wave-0/definition-of-done.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="definition-of-done", siblings=["docs/releases/closed-beta/wave-1/definition-of-done.md","docs/releases/closed-beta/wave-2/definition-of-done.md","docs/releases/open-beta/definition-of-done.md"])

### docs/releases/closed-beta/wave-0/specification.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="specification", siblings=["docs/releases/closed-beta/wave-1/specification.md","docs/releases/closed-beta/wave-2/specification.md","docs/releases/open-beta/specification.md","docs/releases/public-demo/specification.md"])

### docs/releases/closed-beta/wave-1/definition-of-done.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="definition-of-done", siblings=["docs/releases/closed-beta/wave-0/definition-of-done.md","docs/releases/closed-beta/wave-2/definition-of-done.md","docs/releases/open-beta/definition-of-done.md"])
- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/releases/closed-beta/wave-1/specification.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="specification", siblings=["docs/releases/closed-beta/wave-0/specification.md","docs/releases/closed-beta/wave-2/specification.md","docs/releases/open-beta/specification.md","docs/releases/public-demo/specification.md"])
- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/releases/closed-beta/wave-2/definition-of-done.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="definition-of-done", siblings=["docs/releases/closed-beta/wave-0/definition-of-done.md","docs/releases/closed-beta/wave-1/definition-of-done.md","docs/releases/open-beta/definition-of-done.md"])
- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/releases/closed-beta/wave-2/specification.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="specification", siblings=["docs/releases/closed-beta/wave-0/specification.md","docs/releases/closed-beta/wave-1/specification.md","docs/releases/open-beta/specification.md","docs/releases/public-demo/specification.md"])
- [-] **missing-changelog** — มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table

### docs/releases/open-beta/definition-of-done.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="definition-of-done", siblings=["docs/releases/closed-beta/wave-0/definition-of-done.md","docs/releases/closed-beta/wave-1/definition-of-done.md","docs/releases/closed-beta/wave-2/definition-of-done.md"])

### docs/releases/open-beta/specification.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="specification", siblings=["docs/releases/closed-beta/wave-0/specification.md","docs/releases/closed-beta/wave-1/specification.md","docs/releases/closed-beta/wave-2/specification.md","docs/releases/public-demo/specification.md"])

### docs/releases/public-demo/specification.md

- [-] **duplicate-slug** — สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug) (slug="specification", siblings=["docs/releases/closed-beta/wave-0/specification.md","docs/releases/closed-beta/wave-1/specification.md","docs/releases/closed-beta/wave-2/specification.md","docs/releases/open-beta/specification.md"])

### docs/releases/release-channel-implementation.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.4.0", changelog="0.1.0")

### docs/research/assets/dota2-hud-reference.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/competitor-brightgir-opendota-analysis.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/concepts/subagent-context-scoping.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="stable")

### docs/research/huggingface-dota2-resources.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/superpowers/plans/2026-08-09-gid-pipeline-phase1.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/superpowers/plans/2026-08-09-gid-pipeline-phase2-annstudio.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

