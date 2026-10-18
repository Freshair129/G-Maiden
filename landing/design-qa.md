---
title: "Landing Design QA"
doc_id: "landing-design-qa"
version: "2.0.0"
updated: "2026-10-18"
status: "active"
owner: "Boss"
---

# Landing Design QA

## Current acceptance status

**Status: pending a fresh browser review.** Historical screenshots and deployment notes in the
repository record earlier visual work; they do not prove the current source or production page has
passed after the access-flow removal.

## Required review

| Area | Check |
| --- | --- |
| Hero | Approved artwork, Thai hierarchy, demo link, feature link, and no clipped copy. |
| Responsive layout | Check 320×568, 390×844, 768×1024, 1366×768, and 1440×900 for horizontal overflow. |
| Navigation | Keyboard focus, mobile menu open/close, `Escape`, and focus return. |
| Motion | Scroll behavior and static appearance with reduced motion and coarse pointer. |
| Videos | Local media loads, controls work, and fallback remains readable. |
| Public demo | Deterministic playback, pause/restart, timeline, event jumps, captions, and mute. |
| Privacy | Synthetic demo data only; no account requirement or live-game requests. |

## Evidence to record

Before marking a review passed, capture the source revision, browser and viewport, screenshots for
desktop and mobile, console result, and the exact routes checked. A source build alone is not browser
acceptance, and a local review does not prove the deployed page matches the source.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 2.0.0 | 2026-10-18 | Replaced stale countdown and enrollment acceptance claims with a fresh-review checklist. |
