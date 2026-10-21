---
version: "0.2.0"
created_at: "2026-09-13T02:00:11+07:00,RWANG,e5012bf"
last_update: "2026-09-13T02:00:11+07:00,RWANG"
status: "active"
attributes:
  scope: "source-confirmed-ui-layout-drift"
  doc_type: "rca"
---

# UI wireframe alignment — source-confirmed causes

Full findings/visual scope: [audit](../../docs/audits/ui-wireframe-alignment-2026-09-13.md). Boss approved the WF-01–WF-07 remediation on 2026-09-13; implementation and post-fix validation are in progress.

## Symptom

Voice pack grid/editor, Account wallet and Settings audio exceed their planned fixed canvas/category. Live/Build/Insights cards retain a second visual language despite CR-013's shared design-language rule.

## Evidence

- Real rendered Voice components with 12 synthetic packs: page scroll 1225/720px. Account guest wallet: complete Account wrapper scroll 868/622px. Audio Settings category: 836/622px. [Measured scroll probes](../verification/ui-wireframe-2026-09-13/scroll-probes.json) show nonzero scroll offsets for all three.
- [styles.css](../../src/src/styles.css): line 1164 gives Account `height:100%` and auto-scroll; lines 1351–1357 retain unbounded pack-page layout; lines 2624–2633 explicitly preserve interim page-level auto-scroll; lines 4303–4312 keep Settings detail auto-scroll.
- [AccountPage](../../src/src/AccountPage.tsx) stacks title/lead/entitlement/tabs before [WalletTab](../../src/src/WalletTab.tsx), whose `.wallet-tab` also requests 100% height.
- Non-dashboard `.card-shell` still computes a semi-transparent gradient and 18px/40px shadow from styles.css lines 272–277. [Responsive record](../verification/ui-wireframe-2026-09-13/responsive-geometry.json) captures the actual computed style.

## Root Cause

The One Canvas conversion is incomplete across existing page wrappers. Several retained, explicitly interim rules override the fixed-surface policy or size complete tab content without subtracting page chrome. Root-window clipping keeps the exterior within bounds while full-page/category children remain scrollable. The material conversion similarly applies to Dashboard/settings/economy surfaces but leaves the legacy domain-card selector effective in Live/Build/Insights.

### Populated Ledger follow-up within WF-02

The signed-in component fixture renders 20 fetched ledger rows, but `LedgerTab.tsx` fixes the frame at 400px and sets the list to `overflow: hidden`. After Account chrome takes its height, only the first rows are visible, and the page controls skip the remainder of that fetched batch. This is source-confirmed clipping, not a provider pagination failure. The approved bounded-list contract requires a remaining-height frame and a keyboard-scrollable inner list while keeping cursor pagination unchanged. See [populated screenshot](../verification/ui-wireframe-2026-09-13/after/before-populated-ledger-clipping.png).

## Why the issue escaped detection

Checking only document/root overflow, navigation presence or build success cannot detect these inner-page failures. Empty/error Voice states do not grow the grid. Source comments already label some rules as interim, while CR-013 says shipped. This is a coverage gap inferred from the observed criteria and implementation; no historical CI run was replayed to claim exactly how it passed.

## Proposed prevention

Before implementation, approve the minimal per-page height/material contract. Assert that page headers/tabs stay fixed and paginate/bound genuinely long lists; exercise populated Voice, Account wallet and the longest Settings category at the CR-013 viewport sizes. Check computed materials on non-dashboard cards. Keep native/provider acceptance separate. Update SVG/flow docs to the approved current design so future reviews do not revert valid later decisions.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-13 | Document measured layout/material drift and source causes before any proposed fix. |
| 0.2.0 | 2026-09-13 | Record approved implementation and source-confirmed clipping of populated Ledger rows within WF-02. |
