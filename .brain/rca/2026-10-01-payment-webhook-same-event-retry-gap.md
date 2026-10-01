# RCA — Payment webhook retry can acknowledge an unprocessed event

Date: 2026-10-01
Owner: Codex
Scope: Static source review of `payment-webhook` at source baseline `2d969ac643533b4b8e24494356da2e818eac874f`
Status: Source-path finding; runtime, deployment, and affected transactions are unverified
Risk: HIGH financial-integrity risk if this handler is active; production impact is unknown

## Symptom

If the first delivery of a valid Omise event is recorded in `webhook_events` but the handler cannot fetch the charge, the handler returns a non-2xx response. A retry carrying the same `(provider, event_id)` can then receive HTTP 200 before the charge is fetched or the order is credited/updated. The source path can therefore leave a recorded event unprocessed and a matching order unsettled unless a different event or a separate reconciliation path later repairs it. No live payment loss or production deployment is established by this review.

## Evidence

- `supabase/functions/payment-webhook/index.ts` inserts the event key before processing and returns 200 on a unique conflict at [the idempotency branch](../../supabase/functions/payment-webhook/index.ts#L54-L65).
- A missing Omise secret returns 500 after insertion; a fetch exception or non-success response returns 502 after insertion at [the charge re-fetch branch](../../supabase/functions/payment-webhook/index.ts#L68-L89).
- Order lookup and `credit_topup` happen only after a successful charge re-fetch; `processed_at` is updated later and best-effort at [the settlement path](../../supabase/functions/payment-webhook/index.ts#L90-L132).
- The handler's current duplicate branch does not inspect `processed_at` or retry settlement. The parent CR-003 contract says duplicate events return 200, but its wording does not cover recovery when an event was recorded and processing later failed.
- The assigned Deno test file exercises pure event parsing and status mapping, not the handler's HTTP/DB/provider retry path. `supabase/tests/cr003_wallet_billing.sql` tests sequential `credit_topup` calls but does not invoke `payment-webhook`. These sources were inspected; tests and services were not run.

## Root Cause

The idempotency record conflates “event received durably” with “event processing completed.” The unique-key duplicate branch acknowledges every previously inserted event without checking whether its settlement side effects completed or providing a resume path. The handler comments expect a provider retry after a non-2xx, but this review does not verify Omise delivery policy. On the inspected same-event retry path, the duplicate branch cannot recover processing because it returns 200 before re-fetch or settlement.

## Why the issue escaped detection

- Existing helper tests cover parsing and status mapping, not the Deno request handler's ordered DB and HTTP interactions.
- The SQL suite covers an idempotent credit RPC sequentially, which does not exercise an event recorded before a failed provider fetch.
- The parent acceptance text expects duplicate-event 200 responses but does not distinguish processed duplicates from recorded-but-unprocessed events.
- No handler failure-injection, retry-recovery, or provider-sandbox test was run in this review.

## Proposed prevention

Before implementation is considered, specify and test a durable processing state that distinguishes received, in-progress, and completed events. A duplicate may be acknowledged as complete only after settlement is complete; a recorded but unprocessed event needs a safe retry/reconciliation path. The local handler test matrix should include missing secret, transient fetch exception, non-2xx provider response, DB settlement failure, retry of the identical event id, and concurrent duplicate deliveries, while proving credit remains exactly once. This is a prevention requirement, not authorization to change code, start a database, call a provider, or run production recovery.
