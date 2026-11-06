---
version: "0.1.0"
created_at: "2026-09-13T02:00:11+07:00,RWANG,e5012bf"
last_update: "2026-09-13T02:00:11+07:00,RWANG"
status: "active"
attributes:
  scope: "desktop-ui-wireframe-review"
  doc_type: "verification-record"
---

# UI wireframe evidence

[รายงานรายหน้าและ findings](../../../docs/audits/ui-wireframe-alignment-2026-09-13.md) · [แกลเลอรี](gallery.html)

Source: `e5012bf`, application `0.13.2`, branch `fix/auth-failure-state`. Browser: Agent Browser session `gmad-wireframe`, current React/CSS through Vite DEV on `http://127.0.0.1:5179`. This review did not run a native app, authenticate a user, import/equip voice packs, call payment actions or alter application source.

## Capture method

1. Start installed Vite: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5179 --strictPort` from `src/`.
2. Open with Agent Browser, set viewport 1420×760, inspect Dashboard snapshot/screenshot and browser errors. Initial Dashboard rendered meaningful content with no Vite error overlay; stage 1420×760, panel 1280×720.
3. Block `**/*.supabase.co/**` in this browser session before Store/Account visits. Initial Voice/Settings native read errors and Store loading are limitations of this browser setup, not proof of native failures.
4. Navigate using observed seven-page Ctrl+1..7 registry and observed tab/category labels; snapshot after navigation, save viewport screenshot and DOM geometry. Dismiss the actual onboarding dialog with “ข้าม (ตั้งค่าเองภายหลัง)” in the disposable browser session. No setup installation was performed.
5. To inspect populated Voice layout, dynamically import the installed Tauri `mocks.js` into this browser page, call `mockIPC` and `mockWindows("control")`. Return a synthetic `VoiceState` only for `voice_api_state`; allow empty `secret_get` and no-op `lock_gmad_runtime` in this mock; reject other native commands. All mock data stays in browser memory.
6. Fixture: 12 packs named `UI fixture pack 1`…`12`, IDs `fixture-0`…`11`, author `Synthetic UI fixture`, version `0.0.0`, no covers/clips/events/assets, no active pack, no groups; root/packs/cache paths are literal `fixture-only`. Each pack has the exact array fields required by `voice-types.ts`. This tests layout, not native voice behavior or advertised products.
7. Measure all seven destinations at 1200×780, 1265×817, 1920×1080. [Responsive geometry](responsive-geometry.json) includes computed card background/shadow and root dimensions. Active sub-tabs vary during this traversal, so use the explicitly named screenshots/probes for state-specific conclusions.
8. At 1420×760, set each observed scrolling element's `scrollTop` to its `scrollHeight`, capture, then restore zero. [Scroll probes](scroll-probes.json): Voice 1225/720 → 505px, Account wallet 868/622 → 246px, Settings audio 836/622 → 214px. No content/style mutation was used to force overflow.

## Reading the files

- `01`–`07`: seven primary pages in guest/offline browser state. Voice `03` is a missing-native-IPC state; Store `04` is loading and does not establish catalog error/empty behavior.
- `08`–`13`: remaining six Settings categories after dismissing onboarding; `07` is General.
- `14`–`23`: Live/Build, Voice modes, Store tabs, Insights History and Account sub-tabs. Voice editor `16` is also missing-native-IPC state.
- `24`: actual onboarding dialog, captured before dismissal.
- `25`–`26`: Voice grid/editor with the explicitly synthetic mock.
- `27`–`28`: Maiden Line and shortcut sheet, inspected visually; only navigation/open/close, not every command execution.
- `29`–`31`: explicit scroll reproduction after inspection.
- `reference-wireframe.png`: browser rendering of the existing annotated SVG. This is historical, not an up-to-date expected image for every page.
- Named viewport screenshots and JSON: responsive evidence. Browser's white exterior is the transparent Tauri background rendered over a browser canvas; do not score it as a desktop theme defect.

Some early `*-geometry.json` files contain a JSON-encoded string because Agent Browser serialized a `JSON.stringify` return value. Decode that string once to get the measurement object. Later records are direct JSON arrays/objects.

## Boundaries

No visual claim is made for real GSI phases, native Combat HUD, signed-in Security/MFA, successful purchase/top-up/receipt, or release entitlement/Terms/grace states. The earlier native cold-start screenshot remains a separately dated artifact. Missing model CodeDoc is INDETERMINATE and structural graph validation is not UI parity.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-13 | Record source/browser/fixture provenance, captures and measured overflow; no implementation change. |
