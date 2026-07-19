# G-Maiden Doc Graph Report

สร้างเมื่อ / Generated at: 2026-07-19T15:15:08.369Z

สแกน 87 ไฟล์เอกสาร, 200 nodes, 1145 edges, 276 รายการปัญหา (218 ตัวบล็อก exit code) / scanned 87 doc files, 200 nodes, 1145 edges, 276 violations (218 blocking exit code).

ผลลัพธ์ / Result: **FAIL (exit 1)**

## สรุปตามประเภทปัญหา / Summary by violation reason

| Reason | คำอธิบาย / Description | Count | Blocking? |
| --- | --- | --- | --- |
| anchor-symbol-mismatch | anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) | 90 | yes |
| bad-anchor | เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range | 46 | yes |
| doc-id-slug-mismatch | doc_id ไม่ตรงกับ slug ของไฟล์ (--strict) / doc_id does not match the file's slug (--strict) | 1 | yes |
| glob-slug | สแลกแบบ wildcard (informational) / glob slug (informational) | 3 | no (informational) |
| invalid-status | ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) | 10 | yes |
| legacy-status-case | status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) | 8 | no (informational) |
| missing-approval | status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) | 9 | yes |
| missing-required-field | ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) | 62 | yes |
| no-metadata | ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational) | 47 | no (informational) |

## รายการปัญหารายไฟล์ / Per-file violation list

### docs/DOC-GRAPH-REPORT.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/DOC-INDEX.md

- [L70] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="SPEC--*")
- [L72] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="ADR-O-*")
- [L79] **glob-slug** — สแลกแบบ wildcard (informational) / glob slug (informational) (slug="FEAT-G-*")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/DOCS-IA-REORG-PROPOSAL.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/CR-001-dxgi-capture-migration.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="Submitted")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/architecture/adr/ADR-10-hybrid-ingestion-resilience.md

- [-] **legacy-status-case** — status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) (severity="warning", status="Accepted")
- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="Accepted")

### docs/architecture/adr/ADR-11-optin-data-contribution-flywheel.md

- [-] **legacy-status-case** — status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) (severity="warning", status="Accepted")
- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="Accepted")

### docs/architecture/adr/ADR-12-community-ai-marketplace.md

- [-] **legacy-status-case** — status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) (severity="warning", status="Accepted")
- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="Accepted")

### docs/architecture/adr/ADR-14-gid-account-identity.md

- [-] **legacy-status-case** — status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) (severity="warning", status="Accepted")
- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="Accepted")

### docs/architecture/adr/ADR-15-command-deck-hud-v2-design-system.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="accepted (design) · pending implementation")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="version")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/architecture/adr/ADR-16-credit-economy-and-mint-oracle.md

- [-] **legacy-status-case** — status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) (severity="warning", status="Accepted")
- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="Accepted")

### docs/architecture/adr/ADR-17-dev-runtime-governance-split.md

- [-] **legacy-status-case** — status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) (severity="warning", status="Accepted")
- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="Accepted")

### docs/architecture/assets/design-references/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/design-system.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="candidate")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/architecture/engineering-spec.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/g-maiden-ui-sitemap-flow-board.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="accepted")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/architecture/implementation-plan.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/product-family-design-map.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="candidate")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/architecture/spec-orchestra-codedoc-agent.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/spikes/S-1-minimap-cv.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/tech-stack.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/architecture/technical-design-document.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/audits/2026-07-07-independent-full-audit.md

- [L16] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/cv/mod.rs", anchor=16, symbol="rs")
- [L138] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/voice_api/banner.rs", anchor=3, symbol="rs:437, 571-577, 379, 456")
- [L144] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/gsi.rs", anchor=189, symbol="rs:189-199")

### docs/change request/ADR-13-dxgi-capture-migration.md

- [-] **legacy-status-case** — status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) (severity="warning", status="Accepted")
- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="Accepted")

### docs/change request/CR-001-REVIEW-and-execution-plan.md

- [-] **doc-id-slug-mismatch** — doc_id ไม่ตรงกับ slug ของไฟล์ (--strict) / doc_id does not match the file's slug (--strict) (severity="error", docId="CR-001-REVIEW-execution-plan", expectedSlug="CR-001-REVIEW-and-execution-plan")
- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="Wave A+B code-complete & gate-green (2026-06-29); Wave C in-game test pending Boss")

### docs/change request/CR-001-Wave-C-test-plan.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="ready to execute")

### docs/change request/CR-002-Phase2-wire-backend.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="IMPLEMENTED — merged to main 170805b8 (2026-07-02)")

### docs/change request/CR-003-account-phase1-wallet-billing.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="Approved")

### docs/change request/CR-003-payment-golive-checklist.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="Open — blocked on Phase 0 (legal/terms) + Phase 1 (Omise)")

### docs/change request/CR-004-voice-command-browser.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-005-landing-auth-social.md

- [-] **invalid-status** — ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict) (severity="error", status="DRAFT — awaiting approval")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="version")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/change request/CR-007-frostline-deck-refresh.md

- [L82] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/announcer.rs", anchor=79, symbol="most_important")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-008-login-hardening.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-009-gannstudio-authoring-install-contract.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-010-overlay-exact-kill-victim.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-011-cold-booth-ux-direction.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/change request/CR-013-one-canvas-sitemap-gstore-ios-settings.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/design-system/01-foundations.md

- [L44] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=39, symbol="var(--g-blur-console)")
- [L48] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=36, symbol="var(--g-instrument)")
- [L48] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=37, symbol="var(--g-hairline)")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/design-system/02-tokens.md

- [L203] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4448, symbol="g-deck-panel")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/design-system/03-layout.md

- [L66] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4667, symbol="g-l1-white-glass")
- [L66] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L67] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4448, symbol="g-deck-panel")
- [L68] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4759, symbol="g-panel-rim")
- [L68] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L69] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4406, symbol="g-sidebar-fab")
- [L69] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4432, symbol="g-topbar-fab")
- [L69] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5121, symbol="g-audio-rail")
- [L69] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4840, symbol="g-power-radial")
- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4490, symbol="g-signals-fab")
- [L70] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L81] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=136, symbol="FUNG_PANEL_PATH")
- [L90] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=144, symbol="FUNG_PANEL_PATH_SIGNALS")
- [L131] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4629, symbol="--cr6-panel-left")
- [L131] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L132] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4630, symbol="--cr6-panel-top")
- [L132] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L133] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4631, symbol="--cr6-panel-width")
- [L133] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L134] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4632, symbol="--cr6-panel-height")
- [L134] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L135] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4633, symbol="--cr6-topbar-left")
- [L135] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L136] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4634, symbol="--cr6-topbar-top")
- [L136] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L137] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4635, symbol="--cr6-topbar-width")
- [L137] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L138] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4636, symbol="--cr6-sidebar-left")
- [L138] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L139] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4637, symbol="--cr6-sidebar-top")
- [L139] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L140] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4648, symbol="--cr6-power-left")
- [L140] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L141] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4649, symbol="--cr6-power-top")
- [L141] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L142] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4650, symbol="--cr6-power-main-left")
- [L142] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L143] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4651, symbol="--cr6-power-main-top")
- [L143] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L312] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5236, symbol="gm-fung-layout")
- [L312] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/design-system/04-components.md

- [L55] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4432, symbol="g-topbar-fab")
- [L79] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=1958, symbol="profile-wrap")
- [L80] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=1963, symbol="profile-trigger")
- [L81] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=2026, symbol="profile-dropdown")
- [L103] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4406, symbol="g-sidebar-fab")
- [L104] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4422, symbol="g-nav-item")
- [L124] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4840, symbol="g-power-radial")
- [L124] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L125] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4850, symbol="g-power-main")
- [L125] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L126] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4874, symbol="g-power-menu")
- [L126] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L127] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4893, symbol="*")
- [L127] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L151] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5121, symbol="g-audio-rail")
- [L151] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L152] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=43, symbol=")")
- [L176] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5251, symbol="gm-score-header")
- [L176] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L194] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5315, symbol="gm-phase-chip")
- [L194] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L195] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=42, symbol=")")
- [L236] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5362, symbol="gm-mini-stat")
- [L236] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L253] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5424, symbol="gm-hero-slot")
- [L253] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L269] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5761, symbol="gm-agent-card")
- [L269] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L270] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5784, symbol="gm-card-head")
- [L270] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5804, symbol="gm-agent-art")
- [L270] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L270] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L290] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5970, symbol="gm-tally")
- [L290] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5980, symbol="gm-tally-onair")
- [L290] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L290] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L291] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5819, symbol="gm-sector-log")
- [L291] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L311] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5993, symbol="gm-onair")
- [L311] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L346] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5011, symbol="g-ping-pill")
- [L346] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L370] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5488, symbol="gm-rundown")
- [L370] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L393] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5555, symbol="gm-debrief")
- [L393] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L409] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4490, symbol="g-signals-fab")
- [L410] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4495, symbol="g-sig")
- [L434] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/MaidenLine.tsx", anchor=62, symbol="tsx")
- [L435] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=6115, symbol="gm-palette-backdrop")
- [L435] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=6157, symbol="gm-palette")
- [L435] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L435] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L474] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=6116, symbol="gm-sheet-backdrop")
- [L474] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L484] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=52, symbol="GLOBAL_HOTKEYS")
- [L497] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=6299, symbol="gm-menu-*")
- [L497] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L520] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5011, symbol="g-status-pill")
- [L520] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L569] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4448, symbol="g-deck-panel")
- [L571] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4759, symbol="g-panel-rim")
- [L571] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L587] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5135, symbol="g-volume-rail")
- [L587] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [L593] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=4701, symbol="is-dragging")
- [L593] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/CommandDeck.tsx", anchor=582, symbol="startWindowDrag")
- [L593] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/design-system/05-sitemap-ia.md

- [L70] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/live/phase.ts", anchor=71, symbol="stepPhase(prev, input)")
- [L96] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src/src/styles.css", anchor=5315, symbol="gm-phase-chip")
- [L96] **bad-anchor** — เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range (target="src/src/styles.css")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/design-system/06-stack.md

- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/design-system/07-combat-hud.md

- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/design-system/08-account-gid.md

- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/design-system/README.md

- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="title")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/features/FEAT-G-COACH.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-LOG.md

- [L67] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/log.rs", anchor=310, symbol="delete_match")
- [L67] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/log.rs", anchor=327, symbol="delete_all")
- [L68] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/log.rs", anchor=533, symbol="open_log_dir")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MASTER.md

- [L36] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/master.rs", anchor=23, symbol="THROTTLE = 30s")
- [L43] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/counter_advice.rs", anchor=11, symbol="counter_advice_text(enemies)")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MEMORY.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MIND.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-MOTION.md

- [L17] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=126, symbol="heading_multiplier")
- [L20] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=168, symbol="missing_risk(ms)")
- [L40] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=126, symbol="heading_multiplier")
- [L58] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=168, symbol="missing_risk")
- [L60] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=126, symbol="heading_multiplier(hero)")
- [L64] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=181, symbol="eta_estimate(ms)")
- [L66] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/motion.rs", anchor=55, symbol="record")
- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-PERSONA.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-REVIVE.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SCORE.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/features/FEAT-G-SENSORY.md

- [L71] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/governor.rs", anchor=87, symbol="ResourceStats { ram_mb, cpu_pct, over_budget, gpu_pct, gpu_temp_c, vram_used_mb, vram_total_mb }")
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

### docs/product/MASTERPLAN-account-phase1.md

- [-] **legacy-status-case** — status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict) (severity="warning", status="Active")

### docs/product/business-validation-plan.md

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

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/product/software-requirements-specification.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/rca/2026-07-10-release-gate-drift-v0.9.0.md

- [L12] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/master.rs", anchor=196, symbol="rs:196")
- [L13] **anchor-symbol-mismatch** — anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict) (target="src-tauri/src/slm.rs", anchor=83, symbol="rs:83")

### docs/reference/dota-ui/README.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/assets/dota2-hud-reference.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/competitor-brightgir-opendota-analysis.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

### docs/research/concepts/subagent-context-scoping.md

- [-] **missing-approval** — status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict) (severity="error", status="stable")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="doc_id")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="version")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="updated")
- [-] **missing-required-field** — ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict) (severity="error", field="owner")

### docs/research/huggingface-dota2-resources.md

- [-] **no-metadata** — ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)

