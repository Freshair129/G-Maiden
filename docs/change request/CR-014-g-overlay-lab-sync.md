---
version: "0.1.0"
title: "CR-014 - G-Overlay Lab sync receiver"
doc_id: "CR-014-g-overlay-lab-sync"
updated: "2026-08-10"
owner: "ATHER"
created_at: "2026-08-10T00:00:00+07:00,ATHER"
last_update: "2026-08-10T00:00:00+07:00,ATHER"
status: "accepted"
approved_by: "Boss"
approved_date: "2026-08-10"
attributes:
  doc_type: "change-request"
  scope: "G-AnnStudio layout authoring to G-Maiden runtime sync"
---

# CR-014 — G-Overlay Lab sync receiver

## Decision

G-AnnStudio owns the G-Overlay Lab draft and event preview. G-Maiden remains the only owner of live overlay rendering and persisted settings. This avoids a second editable layout surface inside Command Deck.

## Runtime contract

- Route: `POST /overlay/layout` on the existing loopback-only `127.0.0.1:3000` GSI server.
- Schema: `G-Suite/schemas/gmaiden-overlay-layout.schema.json`, `schemaVersion: 1`.
- Receiver accepts exactly all current module ids and a bounded `{x,y,scale,enabled}` value for each.
- A valid request merges only `settings.layout`, uses the existing atomic `settings.json` writer, then emits `settings` so the active overlay updates immediately. It also emits `overlay-layout-sync` so an open Command Deck updates its local state and cannot overwrite the synchronized layout on its next setting change.
- Invalid, partial, or unknown payloads return an error and do not modify settings.

## Boundaries

- This route must not write packs, files, audio, game data, CV output, credentials, or any field other than `settings.layout`.
- It is not on the GSI to G-Signal critical path and must not block it.
- `/announcer/install` remains unchanged: it only activates an already-installed voice pack.

## Verification

- Rust unit tests cover successful merge, unknown module rejection, missing module rejection, and range rejection.
- G-Ann type-check covers its schema-compatible sender.
- Manual smoke: change `banner` geometry in G-Ann, sync, and fire a G-Maiden kill preview.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0 | 2026-08-10 | approved | Initial approved C-3 contract for bounded G-Ann layout sync. | pending | ATHER |
