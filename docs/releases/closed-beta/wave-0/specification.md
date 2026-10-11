---
title: "G-Maiden Closed Beta Wave 0 Specification"
doc_id: "specification"
status: "historical"
version: "0.2.0"
updated: "2026-10-11"
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

เอกสาร Wave 0 เดิมเคยใช้ `pass`/`warn`/`pending`; mapping นั้นเป็นประวัติของแผน Closed Beta ที่ยกเลิกแล้ว ไม่ใช่เกณฑ์ MVP ปัจจุบัน เอกสารนี้ถูกเก็บเป็น `historical` เพื่อรักษาประวัติ งานปัจจุบันยึด [MVP backlog — MVP-011](../../../product/mvp-backlog.md) และ [execution DAG](../../../product/mvp-execution-dag.md)

MVP-011.A กำหนดผลเป็น `ready`, `degraded` หรือ `unknown` ตาม evidence จาก runtime เท่านั้น เมื่อไม่มี producer หรือยังไม่มีผล ให้เป็น `unknown`; ห้ามตีความ null หรือการ preview เป็น `ready` ตารางนี้บันทึก contract/UI ของขั้น A ไม่ได้ปิด MVP-011 ทั้งงาน เพราะการวัด minimap coverage และ audio health จริงยังอยู่ใน MVP-011.B

UI แสดง `ready` เป็น “พร้อม”, `degraded` เป็น “บกพร่อง” และ `unknown` เป็น “ยังไม่ทราบ” ผ่าน `readinessLabel` ค่า `setup.installed` เป็น evidence ของ GSI config เท่านั้น; readiness นี้เป็นข้อมูลสถานะ ไม่ได้เปลี่ยน account/entitlement eligibility หรือเงื่อนไขเปิด Dashboard

| Runtime evidence | Readiness result |
| --- | --- |
| GSI server เป็น `port_conflict`/`bind_error` | GSI `degraded` |
| `gsi-status.gsi_active=true` และ server ไม่ได้เป็น `port_conflict`/`bind_error` | GSI `ready` |
| `setup.installed=false` และไม่มี live GSI หรือ Dota เปิดอยู่ขณะ `gsi_active=false` | GSI `degraded` |
| ยังไม่มี GSI status หรือไม่มี live GSI ขณะ Dota ไม่ได้ทำงาน และยังไม่มีหลักฐานว่า config เสีย | GSI `unknown` |
| `sensor-health.healthy=true` / `false` | Capture health `ready` / `degraded` |
| ยังไม่ได้รับ `sensor-health` | Capture health `unknown` |
| Sensor backend เป็น `lite` หรือไม่มี classifier | Minimap coverage `degraded`; Compatibility Mode แสดง |
| ยังไม่ได้รับ `sensor-health` | Minimap coverage `unknown` |
| Sensor ทำงานและมี classifier แต่ยังไม่มีผลวัด coverage | Minimap coverage `unknown` — classifier/capture พร้อมไม่ใช่หลักฐาน coverage |
| ได้รับ event `overlay-ready` | Overlay runtime `ready`; หาก event ยังไม่สังเกตเห็น ให้เป็น `unknown` |
| Audio playback | `unknown` จนกว่าจะมี producer วัด audio health; การ preview อย่างเดียวไม่ใช่ผลผ่าน |

เมื่อ minimap coverage เป็น `degraded`, UI ใช้ข้อความ `Compatibility Mode — Vision features unavailable` และแจ้งว่า capture อยู่ Lite mode หรือไม่มี ONNX classifier; ฟีเจอร์ที่ใช้ GSI ยังทำงานได้

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
| 0.2.0 | 2026-10-11 | Marked the cancelled Wave 0 specification historical and reconciled readiness with the current MVP-011.A evidence contract. |
| 0.1.0 | 2026-07-23 | Initial Closed Beta Wave 0 Technical Preview specification |
