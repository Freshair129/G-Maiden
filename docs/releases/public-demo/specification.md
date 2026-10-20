---
title: "G-Maiden Public Demo Specification"
doc_id: "specification"
status: "active"
version: "0.2.0"
updated: "2026-10-18"
owner: "Boss"
related_docs: ["product-requirements", "software-requirements-specification"]
---

# G-Maiden Public Demo Specification

## Objective

Explain the product through a deterministic browser scenario without requiring desktop
installation, account sign-in, or a live Dota session.

## Experience

```text
Product value
→ deterministic match scenario
→ G-Sentry/G-Motion/G-Signal explanation
→ voice transcript and belief-revision preview
→ honest feature-status view
```

## Included

- Synthetic incoming-gank scenario with deterministic playback
- Play, pause, restart, timeline, and event-jump controls
- Overlay simulation, danger score, captions, and mute control
- Feature status labels that distinguish shipped, partial, preview, and planned behavior
- Responsive summary for mobile and full interaction on desktop

## Excluded

- Live screen capture, Dota integration, microphone input, or access to user files
- Payment, account enrollment, distribution access, or persistent match data
- Claims that planned features are shipped

## Privacy and security

- Scenario data is synthetic and stays in the browser.
- No client-side secrets or account/game identifiers are collected by the demo.
- Analytics, if enabled on the landing, is limited to redacted aggregate page views.

## Acceptance

- A visitor can replay the scenario and understand its key signals without installing the desktop
  application.
- Playback controls, captions, mute, and responsive layout work in supported browsers.
- Every feature-status claim matches the reviewed source evidence.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.2.0 | 2026-10-18 | Removed account-enrollment and distribution flow from the demo contract. |
