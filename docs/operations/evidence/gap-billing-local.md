---
title: "CR-003 Local Billing and Share Evidence Inventory"
doc_id: "gap-billing-local"
status: draft
version: "0.2.1"
updated: "2026-10-01"
owner: "RWANG"
---

# CR-003 Local Billing and Share Evidence Inventory

- **Scope:** source and existing-test inventory for `match-share-submit`, `topup-create`, and `payment-webhook`, including same-event retry recovery.
- **Classification:** C-2 documentation review; HIGH financial-integrity risk. This artifact changes no application behavior.
- **Source baseline:** `2d969ac643533b4b8e24494356da2e818eac874f`; this documentation worktree is based on `b9712fd9ffed472a7bf666e8a829e4b025e563cb`.
- **Evidence limit:** static inspection of linked handlers, helper tests, SQL tests, and CR-003 parent/checklist documents only. A source comment or checklist result is not a result independently verified in this task.

## 1. Execution and authorization status

| Activity | Status for this task | Boundary |
| --- | --- | --- |
| Read the assigned handlers, pure webhook helper/test, SQL test, and CR-003 parent/checklist | COMPLETED | Source inspection only; no handler was invoked. |
| `supabase test db` / pgTAP | NOT_RUN / NOT_AUTHORIZED | No local Supabase stack was started and no SQL was executed. |
| Deno or HTTP handler tests | NOT_RUN / NOT_AUTHORIZED | `webhook.test.ts` contains pure parse/status-mapping tests, not `index.ts` handler or retry-recovery tests. No endpoint tests were run. The SQL file tests database RPC/RLS behavior, not HTTP handlers. |
| Provider sandbox, live Omise, production, package activation, or migration apply | NOT_RUN / NOT_AUTHORIZED | No provider, remote project, database, or package state was accessed or changed. |

The SQL file says it assumes the CR-003 §2 schema/migration is already applied and gives `supabase test db` as its run command. A future local run requires an isolated local Supabase database with that schema applied. These prerequisites are recorded for planning only; they do not authorize starting services or applying migrations in this task.

The [go-live checklist](../../change%20request/CR-003-payment-golive-checklist.md#L70) records a status snapshot dated 2026-07-18: it reports package tiers seeded with `active=false`, economy RPCs verified in a local simulation, webhook parse/decide plus DB simulation reported as verified, and the payment Edge Functions not deployed. It also marks Omise re-fetch unverified and retains legal, sandbox, deployment, and real-transaction gates. These are statements in that dated checklist, not fresh verification of present external state; they do not establish same-event retry recovery after a post-insert failure. The checked-in [webhook helper tests](../../../supabase/functions/payment-webhook/webhook.test.ts#L1-L3) exercise pure parsing/status mapping, while DB-06 tests `credit_topup` directly; neither executes the HTTP handler retry path. The checklist says its SQL suite had 69/69 pgTAP assertions; the assigned SQL file currently declares `plan(63)`. This inventory does not reconcile that historical count difference or infer a later test result.

## 2. Handler source observations

| Path | What the assigned source shows | What this does not prove |
| --- | --- | --- |
| [match-share-submit](../../../supabase/functions/match-share-submit/index.ts#L35) | Authenticates a user; validates `match_id`; derives an HMAC `match_ref`; uses the raw id for the OpenDota lookup; calls the service-role-only `mint_shard_from_match` RPC. The comments state raw `match_id` is not persisted or returned. Duplicate/cap RPC errors map to an honest-state HTTP 200 with zero minted. | No handler was executed here. The assigned SQL tests the RPC, not the HTTP response mapping, OpenDota failure path, or receipt response. |
| [topup-create](../../../supabase/functions/topup-create/index.ts#L49) | Requires POST and a valid user JWT; takes package/provider input; reads package price server-side and rejects inactive packages; counts the user's pending orders over one hour and returns 429 when `isRateLimited` says the limit is exceeded; then creates an Omise charge and inserts a pending order. | The handler source labels the charge-create shape/form encoding as sandbox assumptions. No local DB test in the assigned SQL invokes this handler or creates a provider charge. |
| [payment-webhook](../../../supabase/functions/payment-webhook/index.ts#L27) | Parses an event, first inserts `(provider,event_id)` into `webhook_events`, acknowledges a unique-conflict duplicate with 200, re-fetches the charge from Omise, then updates a matching order. Paid outcomes call `credit_topup`; failed/expired outcomes update only a still-pending order. `processed_at` is best-effort. | After a successful event insert, failures in later processing return non-2xx, but a retry with the same event key hits the duplicate branch and returns 200 before re-fetching or crediting. This is a static path inference, not an observed runtime/production failure. Source comments also state payload/status assumptions are not verified against a live Omise account; existing tests do not exercise this handler retry path. See [insert and duplicate branch](../../../supabase/functions/payment-webhook/index.ts#L54-L71) and [post-insert processing](../../../supabase/functions/payment-webhook/index.ts#L74-L89). |

**Same-event retry recovery gap (static source inference; not runtime/production proof).** A fresh event is inserted before Omise re-fetch and order/credit processing. If a later step fails, the handler can return non-2xx while the event remains durably recorded and `processed_at` is still unset. Omise may retry that same event, but its duplicate-key path returns HTTP 200 immediately, before another charge re-fetch or `credit_topup` call. The event can therefore remain recorded but unprocessed, while the duplicate retry is acknowledged without recovery. The same early return also means the handler cannot rely on the RPC's idempotent status guard to recover a credit that was never applied. No failure injection, handler invocation, or production observation was performed. See [post-insert failure and duplicate control flow](../../../supabase/functions/payment-webhook/index.ts#L54-L89) and the later [best-effort processed marker](../../../supabase/functions/payment-webhook/index.ts#L123-L132).

The `topup-create` handler path contains no explicit request idempotency token or pre-charge deduplication guard in the inspected file: it creates the charge before inserting the order. This is a bounded source observation; helper files and any provider-side behavior are outside the assigned read set. The assigned SQL suite does not exercise charge-create retry, concurrent create requests, or compensation when order insertion fails after charge creation.

## 3. Existing SQL assertions in the assigned test file

[`cr003_wallet_billing.sql`](../../../supabase/tests/cr003_wallet_billing.sql#L24) declares `plan(63)`, seeds fixed test identities and fixtures, runs in one pgTAP transaction, then calls `finish()` and `rollback()`. Its header explicitly says DB-05 and DB-12 are sequential double-calls, not true concurrent sessions ([concurrency caveat](../../../supabase/tests/cr003_wallet_billing.sql#L13)).

| Test ID | Assertions present in the file |
| --- | --- |
| DB-01 | `authenticated` cannot directly update `wallets` or insert `wallet_ledger` rows. |
| DB-02 | User A cannot read another user's wallet, ledger, inventory, or top-up order rows. |
| DB-03 | Successful wallet- and shard-priced purchases debit only the correct balance and produce matching purchase, inventory, and ledger rows. |
| DB-04 | An insufficient-balance purchase raises, leaves balance unchanged, and inserts no purchase, inventory, or ledger row. |
| DB-05 | Sequential 60-cost purchases against 100: first succeeds; second is rejected; balance stays 40 and the second purchase is absent. |
| DB-06 | Calls `credit_topup` three times sequentially for one pending order; asserts paid status, one 1000-coin credit, and exactly one ledger row for that order. |
| DB-07 | A valid code redeems once; same-user repeat, max-use overflow, and expired code are rejected; `used_count` remains unchanged on rejected attempts. |
| DB-08 | After the seeded operations, every wallet's shard and wallet balances equal the corresponding per-currency sum of ledger amounts. |
| DB-09 | Rejects a catalog row with shard currency and a non-null creator via check constraint. |
| DB-10 | Calls `mint_shard_from_match` twice with the same `(user_id, match_ref)`; second call violates unique constraint; balance remains 50 and there is one `match_submissions` row. |
| DB-11 | Allows a mint to the daily cap, rejects one more shard, leaves balance unchanged, and inserts no cap-rejected submission. |
| DB-12 | Sequential wallet tips reject an unaffordable repeat; sequential shard tips reject a receive-cap overage. Checks sender balance, one tip, recipient ledger total, and no second debit. |
| DB-13 | `authenticated` cannot execute service-role-only `credit_topup` or `mint_shard_from_match`. |

These are assertions written in the SQL file. Since the suite was NOT_RUN, none is reported here as passing in this worktree or at a current database state.

## 4. Coverage boundaries and missing cases in the assigned sources

- **True concurrency:** DB-05 and DB-12 prove sequential guards only. The SQL header states one session cannot establish a race between transactions. No simultaneous-session harness/assertion appears in the assigned SQL file. Concurrent purchase/tip caps, concurrent same-match mint, concurrent credits, and competing webhook deliveries therefore remain unverified by this test artifact.
- **Webhook idempotency and recovery:** CR-003 §2.5 describes the event key as a duplicate guard, and EF-04 expects five deliveries of the same event to return 200 with one credit. The current handler's duplicate branch returns before retrying processing, so a same-event retry after a post-insert failure is not a recovery path in the inspected source. `webhook.test.ts` covers pure parse/status helpers, not `index.ts`; DB-06 verifies direct sequential `credit_topup` calls yield one credit and one ledger row. Neither test artifact exercises handler insert failure/retry recovery, provider re-fetch retry, or processed-state behavior. The checklist's dated “verified” status is not evidence for that missing case. See the [parent handler contract](../../change%20request/CR-003-account-phase1-wallet-billing.md#L584-L588) and [EF-04 acceptance row](../../change%20request/CR-003-account-phase1-wallet-billing.md#L802-L810).
- **Share endpoint versus mint RPC:** DB-10 verifies duplicate RPC behavior and resulting balance/submission count. It does not assert the handler's duplicate HTTP response or receipt contents. DB-10 also has no per-match ledger-row-count assertion; DB-08 checks only the aggregate balance-to-ledger invariant.
- **Top-up creation:** no assertion in the assigned SQL invokes `topup-create` or tests package gating, the pending-order rate limit, a provider charge, request retries, or order-insert failure after charge creation. The handler source shows those steps, not their test results.
- **Ledger evidence:** DB-03/04 assert purchase ledger creation/rollback; DB-06 asserts exactly one top-up ledger row after sequential repeats; DB-08 asserts aggregate balance/ledger equality; DB-12 checks recipient shard-tip ledger totals. This does not amount to an endpoint-level or concurrent exactly-once ledger test for webhook events or match receipts.

## 5. Provisional rules versus verified policy

The share handler labels `scoreShardForMatch` scoring as a placeholder pending balancing and labels `signReceipt`'s scheme provisional ([scoring and receipt call sites](../../../supabase/functions/match-share-submit/index.ts#L111)). It prefers `RECEIPT_SIG_HMAC_KEY` but falls back to `MATCH_REF_HMAC_KEY` when the separate key is absent ([key selection](../../../supabase/functions/match-share-submit/index.ts#L42)). These are current source behaviors and explicit provisional comments; they are not an approved scoring formula, receipt contract, or key-separation policy. The SQL file's sample shard amounts and RPC/cap assertions do not validate those business/security policies.

The dated checklist keeps the faucet gated on legal prerequisites, real shard scoring, and a `match_id` source; it separately calls for sandbox verification of Omise event shape, charge status mapping, and charge-create fields before deployment. It also lists sandbox end-to-end payment, package activation, and a real low-value transaction as later gates. None of those gates is satisfied by this source/test inventory.

## 6. Acceptance for this evidence node

This node is complete as a source inventory when assigned artifacts and claims are linked, existing assertions are distinguished from missing coverage, provisional scoring/receipt behavior is not promoted to policy, and execution status remains explicit. Local pgTAP, handler, provider-sandbox, and production acceptance remain separate work; this artifact supplies no approval to execute them.

**Prevention gate proposal (test/contract only; no code-fix decision).** Before treating EF-04 or webhook retry acceptance as complete, add an isolated failure-injection case: persist a new event, fail a post-insert processing step, then deliver the same event id again. Require the test contract to assert an explicit recoverable processing outcome, at-most-once credit, and observable event/order completion state; the retry must not pass solely because the unique key returns 200 before processing is rechecked. Use fake provider/database dependencies. The implementation mechanism remains undecided; this evidence update changes no code and adds no test.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 2026-10-01 | Inventory billing/share handler sources and SQL assertions; record unrun and unauthorized execution boundaries. |
| 0.2.0 | 2026-10-01 | Recorded the static same-event retry recovery gap: post-insert processing failures can be acknowledged by a duplicate retry before re-fetch/credit; added an isolated test/contract prevention gate. |
| 0.2.1 | 2026-10-01 | Ordered the changelog chronologically and aligned frontmatter version with the final row. |
