---
version: "0.1.0"
status: "active"
updated: "2026-09-13"
owner: "RWANG"
---

# WF-01–WF-07: local implementation verification

[ภาพหลังแก้](index.html) · [Audit](../../../../docs/audits/ui-wireframe-alignment-2026-09-13.md) · [Approved spec](../../../../docs/operations/ui-wireframe-remediation-proposal.md)

Source: `e5012bf` plus the uncommitted UI remediation; app `0.13.2`. `source-sha256.json` and `ui-code.diff` bind this evidence to the edited source. No release, tag, deployment or real account login was performed.

## Results

- **84 browser states**: 28 page/tab/category states at each of 1200×780, 1265×817, 1920×1080. All seven primary pages, Voice modes/editor sections, Live/Build, Store tabs, Insights/History, Account tabs and seven Settings categories visited. `*-matrix.json` records per-region geometry and computed card material.
- **12 signed-in component states**: real AccountPage/AuthPanel/SteamLink/WalletTab/LedgerTab/AccountSecurity views in the existing deck surface. Auth/profile/wallet/security/native hooks are isolated synthetic substitutes. The surrounding deck header intentionally remains Guest; this is a component layout test, not signed-in application acceptance.
- Synthetic data: 12 voice packs, 24 events and 20 clip entries with no media URLs; separate edge checks cover one/zero packs, page clamp, read-only packs and a visible editor error. Signed-in fixtures supply 60 ledger records (20 per fetched batch), 20 devices and 50 security events. No credential, account/GID, media asset or transaction represents a real person or purchase.
- **6 keyboard-to-end checks**: last Ledger/Security content reachable at all three viewports, while Account title position is unchanged. `keyboard-scroll.json` stores actual scroll extents. `edge-checks.json` covers Insights Enter navigation and editor Save reachability under an error notice. `settings-persistence.json` verifies the existing signalSensitivity key and restores it in disposable browser storage.
- Desktop Vitest **290 passed / 30 files**, TypeScript and ESLint exit 0. Rust **293 passed / 5 ignored** outside the DPAPI-restricted sandbox. Clippy `--all-targets --locked --offline -- -D warnings` exit 0. Final unsigned Tauri `--no-bundle` smoke build exit 0; not an installer/release or native visual acceptance.
- CodeDoc **exit 2 / INDETERMINATE**: configured Mellum model is absent. `codedoc.log` records the preflight failure; no semantic alignment result exists. No substitute model was used.
- Doc-graph results are recorded in `docgraph.log`. Structural checks are distinct from CodeDoc and visual acceptance.

## Reproduction and fixture boundaries

Start installed Vite from `src/` on 127.0.0.1:1420. Use `bootstrap.py`, then `matrix.py WIDTH HEIGHT`; the Python helper invokes the cached Agent Browser binary directly. All app pages use their real React components/CSS. Voice uses the installed Tauri mock module; provider requests are blocked.

For signed-in layout only, run `node build-account-fixture.mjs`, copy its generated bundle into `src/node_modules/.cache/gmad-ui/account-fixture.js` (inside Vite's allow list), then run `signedin.py` after bootstrap. The builder stubs only specified data/auth/native modules; it renders the real Account components. The top-up package read returns an explicitly empty list. All payment/session/native mutations throw in this fixture. The generated bundle is disposable, and not included in product code.

The first 1265 run lost its dev server/browser session and produced no passing matrix; it was stopped, the server/session restarted and the complete matrix rerun. The direct CLI helper writes process output to a temporary file and has a 45s call timeout. Clicks settle React rendering before follow-up assertions; keyboard scroll checks allow the existing smooth-scroll animation to finish.

The initial signed-in fixture threw on a background coin-package read. `browser-errors.json` preserves those fixture-only errors; the final fixture supplies an empty read response and `browser-final-errors.json` retains the prior fixture errors without new errors in the repeat (`browser-error-comparison.json`). A failed attempt to serve the bundle outside Vite's allow list returned 403; no server security setting was changed.

Native Google sign-in/Terms/entitlement, real purchases/top-ups, actual Dota GSI phases and native Overlay playback/positioning are **not tested by this browser fixture**. Release gating/privacy is covered by React regression tests and the unsigned build, not a real provider session. Build warnings about the existing bundle identifier, large JS chunk and a pre-existing CSS comment remain outside this fix.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-13 | Record approved local UI fixes, 96 states, keyboard/edge checks, source provenance and unresolved native/model boundaries. |
