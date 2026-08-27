---
title: "RCA: CR-034 Phase 2 security activity cursor drops tied timestamps"
date: "2026-08-24"
status: "confirmed"
scope: "CR-034 Phase 2 iam-security-events pagination"
---

# RCA — CR-034 Phase 2 security activity cursor

## Symptom

The Phase 2 security-activity endpoint can omit events when more than one event has the same
`occurred_at` timestamp and the caller requests the next page.

## Evidence

- `iam_private.security_events_for_user` orders rows by `occurred_at desc, id desc`.
- `iam-security-events` returned only `next_before` (the last timestamp).
- The next query filtered with `occurred_at < before`, so rows tied at the boundary timestamp were
  excluded even when their `id` was after the page boundary.
- Existing tests covered own-user isolation and redaction, but did not page through tied timestamps.

## Root Cause

The cursor represented only the first component of a two-column ordering. A timestamp-only cursor
cannot identify the exact last row in a stable `(occurred_at, id)` ordering.

## Why the issue escaped detection

The Account Security UI reads only its first page, and the pgTAP test fixtures used one event per
user. Neither path exercised a boundary with equal timestamps.

## Proposed prevention

Use a composite cursor containing both `before` and `before_id`, reject incomplete cursors, return
both values for the next page, and keep a regression fixture with tied timestamps in pgTAP.
