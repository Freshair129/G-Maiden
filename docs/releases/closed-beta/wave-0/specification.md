---
title: "G-Maiden Closed Beta Wave 0 Specification"
doc_id: "CLOSED-BETA-WAVE-0-SPEC"
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
