---
title: "ADR-20: Optional Friends and brokered G-Party invitations"
doc_id: "ADR-20"
status: "active"
version: "0.1.0"
updated: "2026-11-01"
owner: "G-Maiden"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
related_docs: ["FEAT-G-FRIENDS", "FEAT-G-PARTY", "ADR-14-gid-account-identity", "CR-038-party-friends-presence-invitations", "2026-11-01-g-party-friends-design", "g-party-social-operations"]
---

# ADR-20 — Optional Friends and brokered G-Party invitations

## Context and authority

G-Party lets consenting players share their own local GSI status. Repeated parties need a convenient way to find and invite the same people. Requiring every guest to add an account/friend first would add an unnecessary gate to the existing room-code route. A shared nickname is also insufficient evidence for binding a room member to an account.

The owner authorized Friends implementation with a supervised multi-agent workflow through protected PR merge in [[CR-038-party-friends-presence-invitations]]. This ADR records assistant architecture choices within that delegated scope after independent design review. Selected architecture does not mean hosted deployment, live Google/Dota acceptance or release approval.

## Decision

1. **Keep room-code access and local core account-optional.** Add Google-backed mutually accepted friends only for persistent social actions. Friendship, presence visibility, profile linking and GSI sharing are separate permissions.
2. **Reuse the existing private account backend.** Store relationships/settings/blocks in an unexposed RLS-enabled `social_private` schema. Expose only GID plus a safe display name through bounded definer functions invoked by the existing least-privilege runtime. Do not broaden profiles SELECT or create a public directory.
3. **Make presence opt-in and ephemeral.** A visible preference plus an unexpired lease tied to a live provider session means online in G-Maiden. No last-seen, match status or heartbeat audit history. CommandDeck owns one lifecycle controller across tab changes.
4. **Prove membership without exporting account or room secrets.** Broker-generated, single-use account/session challenges are signed by the registered relay after native proves possession of the room member credential. No account JWT/GID/UUID reaches the relay and no GMP1/member credential enters social storage.
5. **Bind profile leases to explicit consent and server revisions.** Scope transitions require acknowledged unlink and a fresh authoritative revision before relinking. A unique room-member binding prevents another session from silently replacing the account label. UI intersects broker bindings with its current room/member/generation view.
6. **Admit targeted invitations through one-use tickets.** Recipient approval requires fresh GSI consent. SQL checks sender/recipient sessions, friendship/blocks, controls and expiry atomically; relay rechecks owner/generation/capacity after redemption. Native joins only while idle and verifies the requested room ID. Ticket acceptance/redemption is not success until native admission is connected.
7. **Specify concurrent authorization explicitly.** Live auth session row locks precede canonical account/pair locks. Expiry uses the post-wait clock. Block/remove/revoke committed first denies redemption; an earlier authorized redemption can admit once. Expected denials commit rate/nonce accounting instead of rolling it back.
8. **Treat the configured operator as a trust boundary.** HMAC authenticates the registered relay, not official Dota membership or end-to-end secrecy. Production social registration accepts a single normalized HTTPS origin and fixed broker endpoint, with no redirects. Custom relays continue through guest codes.

## Alternatives considered

| Alternative | Outcome |
| --- | --- |
| Mandatory friend/account before any room join | Rejected: prevents the existing quick guest flow without improving per-join sharing consent |
| Full chat/voice/server community system | Deferred: not needed to invite a recurring party; substantially enlarges scope and retention |
| Store GMP1 secrets in an account invitation | Rejected: creates reusable room credentials in durable social storage and weakens recipient authorization |
| Send Google JWT to the relay | Rejected: expands account credential exposure to a separate service and custom origins |
| Trust room nicknames or client-supplied GIDs | Rejected: cannot prove the account controls that member's actual relay credential |
| Require peer-to-peer connectivity | Deferred: current HTTPS relay is already the transport boundary; no NAT traversal or new realtime package is needed |
| Keep friendships only in memory | Rejected: fails the repeat-party goal; ephemeral presence/invites remain separate from durable relationships |

## Consequences and failure behavior

The account backend now stores a private social graph and temporary room account links, but never gameplay stats. This needs a migration, least-privilege functions, bounded cleanup and operator configuration before hosted use. Friends/settings/presence do not depend on relay configuration; proof/link/invitations fail unavailable when that configuration is absent. Local core and guest party actions continue.

Relay/native membership schemas gain a required roomGeneration and must be deployed together. Older schema combinations fail validation; this change does not silently invent compatibility. Key rotation must revoke pending database invitations/tickets/challenges before replacing keys because an opaque ticket does not contain an HMAC that key replacement can invalidate.

Removal/blocking does not evict an already admitted room member. A cancelled admission is cleaned up best effort with its native credential; network failure cannot promise immediate remote erase. Presence/profile leases and room TTLs bound stale state. The UI must expose these distinctions without pulling focus from Dota or shrinking the large minimap.

## Threat model and validation

The normative threat cases, limits, signature bytes and exact DTOs are in [[2026-11-01-g-party-friends-design]]. They cover account/GID forgery, public-profile leakage, harassment/enumeration, capability replay, stale account/scope transitions, binding replacement, concurrent caps, auth revocation, block-versus-redeem ordering, SSRF, configuration mismatch and retention.

Validation requires real PostgreSQL privilege and multi-connection transaction tests, Edge handler/SQL integration, common HMAC vectors, real HTTP relay/native races, strict frontend consent/lifecycle tests, existing guest/IAM regressions, Windows CI and independent review. Live OAuth, hosted configuration, Dota/two-monitor focus and resource acceptance remain separate and are recorded in [[g-party-social-operations]].

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | Record delegated CR-038 architecture, alternatives, private social graph, registered relay trust, consent and transaction boundaries, rollout and verification obligations. |
