---
title: "VRZO synchronized banner implementation plan"
doc_id: 2026-10-29-vrzo-synced-banner-plan
status: active
version: 0.1.1
updated: 2026-11-06
owner: G-Maiden
---

# VRZO synchronized banner implementation plan

- [ ] Validate v7 manifest, all 21 WAV hashes and local assets against the selected original pack; retain verified snapshot and caption authority.
- [ ] Implement audio-owner playback lifecycle with stable identity, bounded nonblocking delivery, replacement and cancellation, preserving existing admission and priorities.
- [ ] Map admitted selected clip to scoped muted visual; fence by playback, pack, session and event and clean up on stop/unmount/expiry.
- [ ] Provide an explicit preview path for each variant without mutating live match state; test all mappings and lifecycle races.
- [ ] Reconcile AGENTS.md, CLAUDE.md, canonical feature/operation docs and generated doc graph with actual implementation and evidence.
- [ ] Run required project gates, native local build and actual WebView2 alpha/mute/one-audio/timing verification; open one build only and record path/hash/PID in handoff.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-29 | Specify implementation ownership, sequencing and evidence. |
| 0.1.1 | 2026-11-06 | Rename to `-plan` and give it its own doc_id: the filename slug and doc_id collided with the spec of the same name (duplicate-slug), leaving `[[2026-10-29-vrzo-synced-banner]]` ambiguous. No content change (#134). |
