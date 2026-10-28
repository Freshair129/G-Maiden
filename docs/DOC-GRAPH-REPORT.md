# G-Maiden Doc Graph Report

สร้างเมื่อ / Generated at: 2026-10-28T09:54:09.234Z

สแกน 143 ไฟล์เอกสาร, 259 nodes, 1218 edges, 209 รายการปัญหา (178 ตัวบล็อก exit code) / scanned 143 doc files, 259 nodes, 1218 edges, 209 violations (178 blocking exit code).

ผลลัพธ์ / Result: **FAIL (exit 1)**

## สรุปตามประเภทปัญหา / Summary by violation reason

| Reason | คำอธิบาย / Description | Count | Blocking? |
| --- | --- | --- | --- |
| anchor-symbol-mismatch | anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) | 145 | yes |
| glob-slug | สแลกแบบ wildcard (informational) / glob slug (informational) | 3 | no (informational) |
| invalid-status | ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) | 7 | yes |
| missing-approval | status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) | 7 | yes |
| no-metadata | ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational) | 28 | no (informational) |
| unresolved | wikilink หาไม่เจอ / unresolved wikilink | 6 | yes |
| version-changelog-mismatch | version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row | 13 | yes |

## รายการปัญหารายไฟล์ / Per-file violation list

### docs/DOC-GRAPH-REPORT.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/DOC-INDEX.md

- [L132] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="SPEC--*")
- [L134] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="ADR-O-*")
- [L143] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="FEAT-G-*")

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

- [L133] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=422, symbol="rs:L422")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.4.3b", changelog="0.4.2b")

### docs/architecture/assets/design-references/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/engineering-spec.md

- [L271] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/companion.ts", anchor=941, symbol="useCompanionData")
- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.1", changelog="0.3.0")

### docs/architecture/g-maiden-ui-sitemap-flow-board.md

- [L187] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/setup.rs", anchor=72, symbol="exclusive_fullscreen_active")
- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")

### docs/architecture/oauth-jwt-client-authorization-flows.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.4b", changelog="0.3.2b")

### docs/architecture/spikes/S-1-minimap-cv.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/audits/2026-07-07-independent-full-audit.md

- [L122] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/companion.ts", anchor=941, symbol="useCompanionData")

### docs/audits/2026-10-27-400mb-remediation-plan.md

- [L14] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="PLAN-MVP-EVENT-CORRECTIONS-20261028")

### docs/audits/2026-10-27-feature-logic-audit.md

- [L13] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="RESULTS-AUDIT-COMPLETION-20261028")

### docs/audits/2026-10-27-memory-budget-decision-proposal.md

- [L13] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="PLAN-MVP-EVENT-CORRECTIONS-20261028")

### docs/audits/2026-10-27-p1-remediation-results.md

- [L13] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="PLAN-MVP-EVENT-CORRECTIONS-20261028")

### docs/audits/2026-10-28-audit-completion-results.md

- [L35] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="AUDIT-P1-REMEDIATION-RESULTS-20261027")
- [L35] **unresolved** — wikilink หาไม่เจอ / unresolved wikilink (slug="RESULTS-MVP-EVENT-CORRECTIONS-20261028")

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

- [L82] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/announcer.rs", anchor=84, symbol="most_important")
- [L94] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")
- [L99] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=182, symbol="activate_if_exists")
- [L102] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=128, symbol="install_report")
- [L126] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=23, symbol="state")
- [L127] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=139, symbol="import_archive")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-008-login-hardening.md

- [L19] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/auth.ts", anchor=98, symbol="signInWithGoogle")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/secret.rs", anchor=229, symbol="load_secret")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=365, symbol="set_master_mode")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=372, symbol="set_master_api_key")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=381, symbol="master_api_key_present")
- [L76] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=596, symbol="set_oauth_pending")
- [L77] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=628, symbol="take_oauth_pending")
- [L80] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=337, symbol="oauth_callback")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-009-gannstudio-authoring-install-contract.md

- [L36] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")
- [L36] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=182, symbol="activate_if_exists")
- [L61] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=206, symbol="image_mime")
- [L72] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=206, symbol="image_mime")
- [L77] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/tests.rs", anchor=182, symbol="real_pack_mrijgajn_maps_voice_and_banners")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-010-overlay-exact-kill-victim.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-011-cold-booth-ux-direction.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-013-one-canvas-sitemap-gstore-ios-settings.md

- [L38] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/StorePage.tsx", anchor=80, symbol="rowsThatFit")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-014-document-impact-map-gmaiden-adapter.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/CR-017-gstore-migration-history-reconciliation.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

### docs/change request/CR-019-owner-role-and-operator-delegation.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.1b", changelog="0.1.0b")

### docs/change request/CR-023-gmaiden-original-3d-hero-scroll-narrative.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.7.2b", changelog="0.1.0b")

### docs/change request/CR-024-gmaiden-3d-studio-and-portable-blender.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.8.1b", changelog="0.1.0b")

### docs/change request/CR-026-mpfb2-character-authoring-and-guarded-image-to-3d-import.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.3.1b", changelog="0.1.0b")

### docs/change request/CR-028-gmaiden-3d-hero-production-handoff.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="2.0.0b", changelog="0.1.0b")

### docs/change request/CR-033-pr-gate-agent-required-status-review-gate.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.0b", changelog="0.1.0b")

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
- [L80] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=44, symbol="SignalGrid")
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
- [L200] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/live/phase.ts", anchor=71, symbol="stepPhase")
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
- [L597] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=444, symbol="startWindowDrag")

### docs/design-system/05-sitemap-ia.md

- [L61] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=42, symbol="DeckTabs")
- [L61] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/StorePage.tsx", anchor=80, symbol="rowsThatFit")
- [L62] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CompanionPages.tsx", anchor=196, symbol="HistoryPage")
- [L74] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/live/phase.ts", anchor=71, symbol="stepPhase")
- [L100] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=3078, symbol="gm-phase-chip")
- [L135] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CompanionPages.tsx", anchor=126, symbol="BuildAdvisorPage")
- [L138] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CompanionPages.tsx", anchor=153, symbol="InsightsPage")
- [L138] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CompanionPages.tsx", anchor=196, symbol="HistoryPage")
- [L140] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/App.tsx", anchor=5, symbol="Control")

### docs/design-system/landing_page_prompt.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-DAMAGE.md

- [L20] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=334, symbol="can_i_kill")
- [L20] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=465, symbol="self_burst")
- [L20] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/master.rs", anchor=51, symbol="build_prompt")
- [L20] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=334, symbol="can_i_kill")
- [L242] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=334, symbol="can_i_kill")
- [L247] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=334, symbol="can_i_kill")
- [L248] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=444, symbol="loadout_from_names")

### docs/features/FEAT-G-LOG.md

- [L54] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/log.rs", anchor=205, symbol="note_event")
- [L67] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/log.rs", anchor=154, symbol="note_tick")
- [L79] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/log.rs", anchor=359, symbol="delete_match")
- [L79] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/log.rs", anchor=376, symbol="delete_all")
- [L80] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/log.rs", anchor=582, symbol="open_log_dir")

### docs/features/FEAT-G-MASTER.md

- [L55] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/master.rs", anchor=23, symbol="THROTTLE")
- [L64] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/runtime.rs", anchor=493, symbol="known_enemies")

### docs/features/FEAT-G-MOTION.md

- [L33] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=192, symbol="heading_multiplier")
- [L36] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=234, symbol="missing_risk")
- [L44] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/sentry.rs", anchor=164, symbol="missing")
- [L56] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=192, symbol="heading_multiplier")
- [L74] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=234, symbol="missing_risk")
- [L76] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=192, symbol="heading_multiplier")
- [L80] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=248, symbol="eta_estimate")
- [L82] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=121, symbol="record")

### docs/features/FEAT-G-PERSONA.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-REVIVE.md

- [L98] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/revive.rs", anchor=105, symbol="advise_buyback")
- [L102] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/revive.rs", anchor=170, symbol="narrate_prompt")
- [L102] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/slm.rs", anchor=22, symbol="advise_offline")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SENSORY.md

- [L37] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/governor.rs", anchor=45, symbol="POLL_INTERVAL_S")
- [L99] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/governor.rs", anchor=276, symbol="measure")
- [L103] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/governor.rs", anchor=319, symbol="ingest_gpu")

### docs/features/FEAT-G-SENTRY.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/G-SERIES-DATA-LINEAGE.md

- [L122] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=193, symbol="parse_tick_from_value")

### docs/features/README.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.2.2", changelog="0.2.0")

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

- [L6] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/audio.rs", anchor=145, symbol="play_file")
- [L6] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=283, symbol="active_event_clips")
- [L10] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")
- [L10] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=23, symbol="state")
- [L12] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=139, symbol="import_archive")
- [L19] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/audio.rs", anchor=145, symbol="play_file")
- [L21] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=194, symbol="read_banner_data_url")
- [L23] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")
- [L24] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=23, symbol="state")
- [L25] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=23, symbol="state")
- [L25] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")
- [L26] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=194, symbol="read_banner_data_url")
- [L28] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=268, symbol="announcer_install")
- [L37] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=194, symbol="extract_pack_zip")
- [L41] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=347, symbol="sanitize_id")
- [L42] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=363, symbol="sanitize_file_name")
- [L55] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")
- [L55] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=23, symbol="state")
- [L60] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/commands.rs", anchor=283, symbol="active_event_clips")
- [L61] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=128, symbol="install_report")
- [L61] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/pack_io.rs", anchor=66, symbol="build_pack")

### docs/rca/2026-10-04-g-damage-magic-resistance-unit-mismatch.md

- [L35] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=33, symbol="magic_multiplier")
- [L36] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=456, symbol="BASELINE_TARGET_MAGIC_RES")
- [L37] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/damage.rs", anchor=465, symbol="self_burst")
- [L38] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/master.rs", anchor=51, symbol="build_prompt")

### docs/reference/dota-ui/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/releases/release-channel-implementation.md

- [-] **version-changelog-mismatch** — version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row (frontmatter="0.5.0", changelog="0.1.0")

### docs/research/assets/dota2-hud-reference.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/competitor-brightgir-opendota-analysis.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/concepts/subagent-context-scoping.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="stable")

### docs/research/huggingface-dota2-resources.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/superpowers/plans/2026-08-09-gid-pipeline-phase2-annstudio.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

