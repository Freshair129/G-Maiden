---
title: "G-Maiden Closed Beta Wave 0 Specification"
doc_id: "specification"
status: "draft"
version: "0.1.0"
updated: "2026-07-23"
owner: "Boss"
related_docs: ["BETA-ROADMAP", "CLOSED-BETA-WAVE-0-DOD", "RELEASE-CHANNEL-ARCHITECTURE"]
---

# G-Maiden Closed Beta Wave 0 — Technical Preview

## Objective

พิสูจน์ว่า Desktop Runtime ติดตั้ง เชื่อม Dota 2 ทำงานตลอดหนึ่งแมตช์ อัปเดต และสร้าง diagnostic evidence ได้บนเครื่องจริงหลาย configuration โดยไม่สร้างความเสี่ยงต่อผู้ใช้ทั่วไป

## Cohort

- Minimum 10 testers
- Target 20 testers
- Maximum 30 testers
- Windows 10/11
- 1080p, 1440p, ultrawide
- Single and multi-monitor
- Borderless/windowed; exclusive fullscreen used to validate fallback

## Included Runtime

- GSI setup and watchdog
- DXGI capture and minimap CV
- G-Sentry
- Current G-Motion heuristic with Beta label
- G-Signal and Belief Revision
- HP/Mana alerts
- Announcer and voice packs
- Overlay layout editor
- G-Master with accuracy disclaimer
- G-Log local history
- Resource governor
- In-app updater
- Optional GID/Steam link
- Free/redeem-only G-Store capability

## Hard Disabled or Out of Scope

- Real-money payment
- Automatic faucet
- Community marketplace
- G-Voice
- G-Memory
- G-Coach
- G-Persona presets
- G-Stream
- Gemini path
- Always-on microphone
- Public unrestricted installer

## Release Access

- Channel: `closed-beta`
- Access: approved email, GID entitlement or invite token
- Distribution: controlled download endpoint or restricted release
- Revocation and rollout pause must be possible

## First-run Flow

```text
Beta notice
→ privacy consent
→ hardware check
→ Dota detection
→ GSI setup
→ capture/minimap check
→ overlay test
→ audio test
→ readiness result
→ dashboard
```

## Compatibility Mode

When DXGI/minimap vision is unavailable, UI must say:

> Compatibility Mode — Vision features unavailable

The application may continue with GSI-based capabilities, but must clearly state that G-Sentry/G-Motion/G-Signal vision chain is unavailable. Do not market this fallback as a complete Lite product.

### Readiness mapping

`readinessFromRuntime` maps inputs as follows: `gsiInstalled && gsiActive !== false` gives GSI `pass`; `gsiActive === false` gives GSI `warn`; `captureMode === "dxgi"` gives capture `pass`; `captureMode === "lite"` gives capture and minimap `warn`; an empty capture mode gives capture `pending`; minimap is `pass` only when `minimapReady === true` in DXGI mode and otherwise remains `pending` until the detector reports; overlay is `pass`; audio is `pending` until its check reports success. A `warn` capture/minimap result must show the exact Compatibility Mode wording above.

| Runtime input | Readiness result |
| --- | --- |
| `capture-mode=dxgi` | capture `pass`; minimap follows the detector result |
| `capture-mode=lite` | capture `warn`; minimap `warn`; Compatibility Mode required |
| `capture-mode=dxgi` and `minimapReady=true` | minimap `pass` |
| `capture-mode=dxgi` and `minimapReady=false` or not yet reported | minimap `pending` until the detector reports |
| capture mode not yet reported | capture `pending`; no Compatibility Mode claim is made |
| `gsiInstalled=true` and `gsiActive=true` | GSI `pass` |
| `gsiActive=false` | GSI `warn` |
| audio result not yet reported | audio `pending` |

## Required Diagnostics

- App version and channel
- Windows version
- GPU class, resolution and monitor count
- GSI/capture/minimap status
- Recent errors
- Session CPU/RAM/FPS evidence when available
- Update result
- User note

Diagnostics must exclude credentials, API keys, OAuth tokens and raw screen frames by default.

## Tester Tasks

1. Clean install and first-run wizard
2. Overlay/audio checks
3. At least three Dota matches
4. Layout edit and persistence
5. Dota restart/reconnect
6. At least one in-app update
7. Diagnostic bundle creation
8. Structured feedback submission

## Rollout

```text
Internal smoke
→ 5 founder/internal testers
→ review
→ 10 testers
→ review
→ 20–30 testers
```

Pause rollout for S0, repeated S1, crash-free rate below 97%, update failures above 10%, systemic FPS regression or privacy violation.

## Promotion Target

Successful Wave 0 promotes to Closed Beta Wave 1 — Core Intelligence Validation, where the primary metrics shift from compatibility to alert usefulness, false alerts and missed alerts.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-23 | Initial Closed Beta Wave 0 Technical Preview specification |
