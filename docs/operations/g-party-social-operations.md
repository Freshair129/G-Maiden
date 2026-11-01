---
title: "G-Party social operations and evidence"
doc_id: "g-party-social-operations"
status: "active"
version: "0.1.0"
updated: "2026-11-01"
owner: "G-Maiden"
complexity: "C-3"
risk: "HIGH"
related_docs: ["FEAT-G-FRIENDS", "FEAT-G-PARTY", "ADR-20", "CR-038-party-friends-presence-invitations", "2026-11-01-g-party-friends-design", "2026-11-01-g-party-friends"]
---

# G-Party social operations and evidence

## 1. Source readiness and operational authority

CR-038 permits implementation through protected source merge. It does **not** deploy the database migration, Edge functions, relay, credentials, release artifacts or channel manifests. This runbook gives an authorized operator concrete readiness/rollback checks; it is not a claim that a hosted service exists.

Tracking: [CR issue #106](https://github.com/Freshair129/G-Maiden/issues/106). G-Party prerequisite [PR #104](https://github.com/Freshair129/G-Maiden/pull/104) merged at `a9b31b06ffd1c0ffb6c4177d428bf8ff4923b917`. Its CI run `41278442753` and ready-for-review PR gate `41320018976` passed. That source receipt does not close live Dota, native runtime, two-monitor, resource or hosted acceptance.

The exact protocol, retention and trust boundary is [[2026-11-01-g-party-friends-design]]. Product expectations and acceptance IDs are [[FEAT-G-FRIENDS]]. The implementation plan is [[2026-11-01-g-party-friends]].

## 2. Configuration inventory

| Component | Configuration | Purpose and validation |
| --- | --- | --- |
| Account Edge broker | Existing Supabase URL/publishable configuration | Validate the current Google user and session; no alternate account backend is invented |
| Account Edge broker | `IAM_DATABASE_URL` | Existing dedicated least-privilege login using `gmaiden_iam_runtime`; never a service-role database connection |
| Broker + relay | `G_PARTY_SOCIAL_RELAY_ORIGIN` | Same normalized HTTPS root origin, no credentials/query/fragment/path; arbitrary guest URL is not social registration |
| Broker + relay | `G_PARTY_SOCIAL_HMAC_KEY` | Matching 64 lowercase hex characters representing 32 random bytes; secret-store only, never repo, frontend, logs or CLI output |
| Relay | `G_PARTY_SOCIAL_REDEEM_URL` | Fixed HTTPS URL of the deployed `g-party-social-redeem` function; redirects disabled |
| Relay | `G_PARTY_HOST`, `G_PARTY_PORT` | Existing local listen settings behind a correctly configured HTTPS proxy |
| Desktop | Optional `VITE_G_PARTY_RELAY_URL` | Editable guest-form prefill only; authoritative social origin comes from authenticated broker responses |

Production registration never enables HTTP loopback. Tests may inject loopback fixtures explicitly without changing the production parser. Requests/responses are bounded and must not be logged with their tokens, proofs, tickets, bodies, account-room mappings or GSI stats.

Absent/malformed social relay configuration returns unavailable for proof/link/invite/redemption. Friends/settings/presence remain usable with `relayOrigin:null` when the account service itself is available. A populated desktop guest URL is not a readiness signal.

## 3. Operator readiness checklist

Complete these on an approved environment before advertising the feature as usable across machines:

1. Apply the existing account/IAM migration prerequisites and `20261101090000_cr038_party_friends.sql` through the normal reviewed database process. Confirm `social_private` is not exposed through PostgREST, every social table has RLS, and PUBLIC/anon/authenticated/runtime cannot select social/profile/auth tables directly.
2. Confirm the runtime login has only the intended role membership and narrow function EXECUTE privileges. Verify a valid Google AAL1 session can use social actions, a revoked/invalid session cannot, and existing IAM operations retain their AAL2/audit behavior.
3. Deploy the account and redeem functions with their reviewed configuration. `g-party-social` retains JWT verification; `g-party-social-redeem` has JWT verification disabled only because its own exact-body HMAC+nonce authentication is required. Test wrong keys/origins/nonces and oversized bodies before enabling admission.
4. Update relay and desktop/native together for required `roomGeneration` fields in Membership/RoomSnapshot/rotation. Existing older schemas fail validation; no generation default or protocol downgrade exists. Verify guest code creation/join still works on the updated pair.
5. Configure the same origin/key on broker and relay and the fixed redeem URL on relay. Confirm HTTPS certificate validation, no redirects, request bounds and reachability from the relay to the broker. Do not use a browser CORS workaround or transmit account JWTs to relay.
6. Verify bounded cleanup is scheduled at least daily and alerts only on operational failure/counts, without retaining account activity or payload history. Expired data must already be inaccessible independently of the maintenance schedule.
7. Use two designated test accounts and machines for invite review/consent, expected-room admission, wrong recipient, remove/block, session revoke, room rotation/closure/full-room, timeout and retry. A consumed ticket followed by failed relay admission must show failure and require a fresh invite.
8. Run and record the live acceptance matrix in §7. Do not mark these obligations complete from mocks, source inspection or fixture Google sessions.

## 4. Retention and maintenance

Friendships, settings and blocks persist until user removal or account deletion. Pending requests expire in 30 days. Presence and room bindings expire in 60 seconds; outstanding invite lifetime is 5 minutes, ticket/challenge/proof at most 60 seconds, and redeem nonce retention is 120 seconds. Completed/expired ephemeral data must be removed within 24 hours by bounded maintenance, with no presence/link history.

The migration supplies operator-only `social_private.cleanup() RETURNS integer` and `social_private.revoke_relay(p_origin text) RETURNS void`. Neither is executable by `gmaiden_iam_runtime`. Cleanup handles at most 1,000 rows per expiry table in a call; repeat bounded calls until zero and schedule at least daily. Use an authorized database maintenance context, not the application login:

```sql
SELECT social_private.cleanup();
-- Repeat bounded calls until the returned count is zero.
```

Cleanup does not require opening table access to the application or changing RLS. Measure execution time/backlog, but do not log deleted rows or account identifiers as an activity history. Application grants are limited to schema USAGE plus the reviewed `social_private.action(uuid,uuid,jsonb,text,jsonb,text)` and `social_private.redeem(text,text,text)` entry points; helpers remain private.

Account deletion cascades owned records through explicit foreign keys. Session deletion invalidates session-bound access and leases; tests must also cover deletion waiting behind an already authorized transaction. A preference alone must never make an account appear online.

## 5. HMAC key rotation

Replacing the HMAC key invalidates old signed proofs but **does not revoke opaque tickets already stored in SQL**. Rotate through this order:

1. Disable new social admission at the registered relay and pause new broker proof/invite creation. Guest operations and existing in-memory membership are separate decisions; disabling social does not promise to evict current members.
2. Revoke all pending and accepted-but-unredeemed invitations, join tickets, outstanding challenges and current profile bindings for the registered relay in one authorized maintenance transaction using `social_private.revoke_relay(p_origin text)`. Pass the exact configured origin as a bound parameter, never interpolate untrusted shell text. Confirm no redeemable entry remains before continuing.
3. Generate a fresh secret in the approved secret-management system and replace it on broker and relay without printing it. Never reuse a client-visible room token as this key.
4. Verify matching normalized origin, HMAC vector behavior and signed redemption on test-only data. Verify old proof/ticket attempts fail, and wrong-origin/invalid-signature requests remain denied.
5. Re-enable social operations/admission and ask affected users to send new invitations explicitly. Do not restore revoked invitations or cached sharing consent.

If rotation is interrupted, leave social admission unavailable until both sides are verified. Do not fallback to guest code automatically and do not claim opaque tickets were invalidated by key replacement alone.

## 6. Rollback

Disable social endpoint/configuration and hide/disable its UI entry points first; preserve account-independent local core and updated guest room routes. Reverting frontend code does not roll back hosted infrastructure. If rolling back the relay/native schema, deploy a compatible pair together; do not combine a strict new client with an old membership schema.

Keep private relationships/settings/blocks intact for a controlled restoration. Removing tables or dropping account data needs a separately reviewed migration. Never rollback by exposing `social_private`, disabling RLS, broadening profiles SELECT, replacing least privilege with service-role access or bypassing signature/session checks.

Stop new sharing by explicit native Leave; remote cleanup is best effort if networking fails. Existing peer freshness/membership TTLs still govern what another machine can retain. Block/remove alone does not kick an existing room member.

## 7. Evidence ledger

### Local and CI source checks

Local results below were executed against the CR-038 working branch based on `a9b31b06ffd1c0ffb6c4177d428bf8ff4923b917`. Final immutable PR head, CI runs and protected merge receipts are recorded on [issue #106](https://github.com/Freshair129/G-Maiden/issues/106) and its linked PR after those actions occur. Source checks use fixture Google sessions and disposable local PostgreSQL; they do not prove a live external provider integration.

| Gate | Required evidence | Current result |
| --- | --- | --- |
| SQL | Applied migration; pgTAP under least privilege; actual multi-connection cap/revoke/expiry/replay tests | PASS: 68 pgTAP and 29 deterministic race assertions; isolated child-database safety regression also passed |
| Edge | Deno handler/crypto + existing IAM regressions; real handler→SQL→DTO and signed redeem | PASS: 26 Deno tests and 20 real HTTP/repository assertions, including Unicode name projection and exact-body BOM/whitespace handling |
| Relay/native | Real HTTP proof/admission/rotation/owner/full-room/concurrency; portable Rust tests + Clippy | PASS: 28 Node tests, 37 portable Rust tests, Clippy with warnings denied; one database-dependent Rust test is explicitly run by the combined gate and passed with zero ignored |
| Frontend | Strict DTOs, consent/lifecycle/TTL/UI controls/guest regression; full Vitest, tsc, ESLint, build | Initial PASS: 646 tests/69 files, including 101 Party tests; tsc, ESLint and production build passed. Mutation/read freshness review correction is pending at this checkpoint |
| Documentation | Strict doc graph, checklist rule, generated ledger clean, diff check | Initial PASS: 215 tests, 14 existing checklist-covered errors and zero uncovered; final regeneration required with this evidence update |
| Windows | Existing native root-crate test/Clippy and Tauri smoke/package CI on final PR head | Pending PR CI |
| Independent review | Spec, authorization/transactions, native races, account UI transitions, no open confirmed blockers | Design, backend and native scoped re-reviews passed; frontend correction remains in progress at this checkpoint |
| Protected merge | Final head required checks, resolved review threads, up-to-date branch and verified merge SHA | Pending PR |

Tooling sanity before implementation: isolated PostgreSQL 16.15 and pgTAP 1.3.2 successfully created the extension and passed a one-assertion tooling probe. Rust/Cargo 1.96.0 and Clippy are available. The official Deno 2.7.0 archive used locally reports `2.7.0+fb4db33 (canary, release, x86_64-unknown-linux-gnu)`; JSR imports resolved with system certificate validation enabled. These are tooling receipts, not product tests.

The CI `social` job provisions its own PostgreSQL 16 cluster with pgTAP and runs `node tools/social-tests/run.mjs --native-boundary` plus Deno API/IAM tests. The combined gate was executed locally after the backend review corrections and passed: SQL privileges/transactions → real Edge handler/restricted repository → real relay signed redemption → production portable native client admission, including wrong key/origin and ticket replay rejection. Its final native invocation ran one test with zero ignored; the ordinary portable suite's dependency-related ignore is not a substitute for this gate. The fixture creates and removes only its uniquely owned child database and runtime login; it verifies caller data remains untouched.

Existing `party` and Windows `ci` gates remain required through dependency chaining. The existing Windows Tauri package build is retained; no release/tag/channel promotion is added. Full root-crate native validation is delegated to the required Windows CI because this Linux environment lacks the desktop GTK/GObject build dependencies; no Linux root-crate PASS is claimed.

Reproducible source gate commands (use the repository's pinned dependencies and a local PostgreSQL administrator connection with CREATE DATABASE):

```sh
SOCIAL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/postgres \
  timeout 900 node tools/social-tests/run.mjs --native-boundary
timeout 120 deno test --no-lock --node-modules-dir=none --allow-env \
  supabase/functions/_shared/social.test.ts \
  supabase/functions/_shared/social_crypto.test.ts \
  supabase/functions/_shared/iam.test.ts \
  supabase/functions/_shared/iam_security.test.ts
timeout 120 node --test services/g-party-relay/server.test.mjs services/g-party-relay/social.test.mjs
timeout 900 cargo test --manifest-path src-tauri/g-party/Cargo.toml --locked
timeout 900 cargo clippy --manifest-path src-tauri/g-party/Cargo.toml --all-targets --locked -- -D warnings
timeout 300 pnpm -C src test
timeout 120 pnpm -C src exec tsc --noEmit
timeout 120 pnpm -C src lint --max-warnings=0
timeout 120 pnpm -C src exec vite build
node tools/doc-graph/ci-gate.mjs
```

The local frontend runs used the equivalent direct Node entry points in the installed `src/node_modules` to avoid an unrelated global pnpm-wrapper version change. Its passing full-suite output includes existing multiple-GoTrue-client notices in account tests and React act/deprecation notices in unrelated banner tests; this is not a claim of warning-free test output. ESLint itself passed with zero warnings.

### Rendered frontend evidence

Actual Chrome 156 rendered the new React components with the existing `--g-*` tokens and bundled IBM Plex Sans Thai Looped font. Fixtures are explicitly labeled synthetic; the dim minimap is the existing unavailable/reference state, not live game data. The new room/member/map/Friends layout does not use the old page composition.

| Viewport | Map square | Member visibility / controls |
| --- | --- | --- |
| 1920 × 1080 | 802.1 × 802.1 CSS px | All five member cards visible without scrolling |
| 1366 × 768 | 490.1 × 490.1 CSS px | All five member cards visible without scrolling |
| 800 × 720 | 399.6 × 399.6 CSS px | Map is default; explicit Room and Friends switches reveal bounded panels |

No document overflow, browser page error or initial autofocus was observed. Keyboard-openable member/Friend menus exposed Add Friend, owner Kick, remove and block. All 500 blocked entries remained reachable by internal scrolling. Invitation checks verified canonical relay/expiry disclosure, unchecked initial consent, consent cleared on an attempt and tab remount, and disabled admission while another room was active. A visual pass caught Thai headings incorrectly assigned the Latin monospace token; those human-language labels now use the existing UI font token, while numeric/code styling remains separate.

Saved captures: [wide view](evidence/cr038/wide.png), [1366px view](evidence/cr038/laptop.png), [narrow Friends](evidence/cr038/narrow-friends.png), [invitation consent](evidence/cr038/invitation.png). Machine-readable [layout measurements](evidence/cr038/layout-report.json) and [interaction results](evidence/cr038/interaction-report.json) accompany them. These are isolated component-browser checks, not native WebView2, actual two-monitor, provider or live-match acceptance.

### Live acceptance still required

| Acceptance | Environment and evidence | Status |
| --- | --- | --- |
| Live Google authorization | Actual signup/login, token refresh, account switch, signout and remote session revoke on intended backend | Pending |
| Hosted services | Authorized migration/functions/HTTPS relay, fixed-origin keys, key-rotation revocation, maintenance scheduling | Pending; not deployed by CR source work |
| Two-player own-GSI | Two real clients in same Dota match/team, fresh source, visible HP/MP/alive/respawn, no camera selection, mismatch/stale/unknown cases | Pending |
| Two monitors and focus | Game on primary, large minimap/control UI on secondary; no focus stealing on requests/invites, presence persists while map visible | Pending |
| Supported native matrix | Windows x64 supported builds, Control origin enforcement, guest offline behavior and account transition in WebView2 | Pending runtime acceptance; CI compile/test alone insufficient |
| Resource/latency | Whole-app CPU ≤10% each second, peak aggregate RAM ≤900,000,000 bytes, FPS impact ≤3%, G-Signal p50 ≤250 ms/every sample ≤300 ms | Pending measured evidence under MVP-006 |

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | Separate source integration from hosted/live readiness; document configuration, least privilege, retention, ticket-aware key rotation, rollback and honest acceptance ledger for CR-038. |
