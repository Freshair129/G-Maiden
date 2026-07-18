---
title: "CR-003 Payment Path — Go-Live Checklist"
doc_id: "CR-003-payment-golive-checklist"
status: "Open — blocked on Phase 0 (legal/terms) + Phase 1 (Omise)"
version: "1.0.0"
updated: "2026-07-18"
owner: "Boss"
related_docs: ["ADR-16", "ADR-11", "ADR-12", "CR-003"]
language: "th/en"
---

# CR-003 Payment Path — Go-Live Checklist

Ordered gate before the payment Edge Functions (`topup-create` / `payment-webhook`)
and the shard faucet (`match-share-submit`) may be deployed and money may flow.

**Why this exists:** the wallet/billing SCHEMA is live on gstore (2026-07-17) and every
economy RPC + the webhook DB-flow is verified. What is deliberately NOT deployed is the
real-money path — ADR-16 §Prerequisites gate it on legal/terms/consent, and the Omise
integration is sandbox-unverified. This doc is the sequence to clear those gates.

**Legend:** 🔴 business/legal (Boss) · 🔑 requires Omise secret (Boss sets it — an assistant
must never enter financial API keys) · 🤖 assistant-doable once earlier phases are met.

---

## Phase 0 — Business / Legal (ADR-16 §Prerequisites)  🔴

- [ ] Clear the **legal status with Valve** re CV minimap reading (ADR-11 §5: Valve banned
      ~40k accounts + killed Overwolf for live position feeding). "ต้องเคลียร์ก่อนเปิด
      ingestion เชิงพาณิชย์" — before, not after, holding user data.
- [ ] Write **Terms**: shard is non-transferable · non-withdrawable · non-refundable · has an
      expiry · redeemable only for first-party digital goods (ADR-16 §Prereq 2).
- [ ] Write **PDPA consent** for payment/data-ingestion — **separate from sign-in** (ADR-14 is
      additive) and revocable/deletable retroactively (ADR-16 §Prereq 3).
- [ ] Update **`CLAUDE.md`** to cite ADR-11/12/16 so the absolute privacy rule stops silently
      dropping the flywheel strategy (ADR-16 §Prereq 4).
- [ ] Respect ADR-16's order-of-operations: silent-arm efficacy study → ingestion → shard →
      **payment/payout is last**.

## Phase 1 — Omise account  🔑

- [ ] Open an Omise/Opn merchant account; enable **PromptPay** + **TrueMoney**.
- [ ] **Verify the sandbox assumptions** the code flags as unconfirmed (CR-003 §7):
  - webhook event envelope shape `{ id, key, data: { object, id } }` (`webhook.ts` parseWebhookEvent)
  - charge `status` enum `successful | failed | expired` mapping (`webhook.ts` decideOrderOutcome)
  - the charge-create field names `topup-create` sends to `POST /charges`
- [ ] Set **`OMISE_SECRET_KEY`** (and public key if needed) as a Supabase secret — via the Supabase
      dashboard/CLI **by Boss**. An assistant cannot enter this (financial credential).
- [ ] Register the Omise webhook endpoint → point it at the deployed `payment-webhook` URL.

## Phase 2 — Deploy Edge Functions  🤖 (once Phase 0–1 are met)

- [ ] Deploy `topup-create` with **`verify_jwt = true`** (needs the signed-in user's JWT).
- [ ] Deploy `payment-webhook` with **`verify_jwt = false`** (Omise posts no JWT; authenticity
      comes from re-fetching the charge from Omise with the secret key — `index.ts` header).
- [ ] (Faucet, separate track) `match-share-submit` also stays gated: needs Phase 0 legal +
      real shard-scoring (currently a placeholder) + a `match_id` source in `MatchShareCard`.

## Phase 3 — Verify sandbox → go-live  🤖 / 🔑

- [ ] End-to-end test on Omise **sandbox**: create charge → pay test PromptPay/TrueMoney →
      Omise webhook → `payment-webhook` → `credit_topup` credits the wallet.
- [ ] `update coin_packages set active = true;` → the 3 tiers surface in `TopupModal`
      (currently hidden by the `for select using (active)` RLS while inactive).
- [ ] Swap Omise to **live keys**; run one real low-value transaction end-to-end before opening.

---

## Current status (2026-07-18)

| Layer | State |
| --- | --- |
| Wallet/billing schema + RLS + RPCs | 🟢 live on gstore (69/69 pgTAP, advisors clean) |
| Store catalog (1 free pack + 2 coming-soon) | 🟢 seeded, rendering |
| Redeem codes (item + coins) | 🟢 seeded + flow verified signed-in |
| Coin packages (3 tiers) | 🟡 seeded, `active=false` (hidden until Phase 3) |
| Economy RPCs (redeem / purchase_item / tip / topup) | 🟢 behaviorally verified (local sim) |
| payment-webhook flow (parse/decide + DB dedup/credit) | 🟢 verified (Deno 8/8 + DB sim); Omise re-fetch unverified |
| Payment Edge Functions (`topup-create` / `payment-webhook`) | 🔴 NOT deployed — this checklist |
| Faucet (`match-share-submit` / `mint_shard_from_match`) | 🔴 NOT deployed — ADR-16 gated |

Technically ready; blocked on Phase 0 (legal/terms/consent) + Phase 1 (Omise account + secret),
both of which are Boss's to complete.
