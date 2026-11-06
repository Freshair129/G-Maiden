---
title: "G-Party Friends design"
doc_id: "2026-11-01-g-party-friends-design"
status: active
version: "0.2.0"
updated: "2026-11-01"
owner: "G-Maiden"
related_docs: ["FEAT-G-PARTY", "FEAT-G-FRIENDS", "ADR-20", "mvp-decisions", "2026-11-01-g-party-friends"]
---

# G-Party Friends Design

## Authority and outcome

CR-038 / GitHub issue 106 adds optional permanent mutually accepted Friends to G-Party. The owner authorized the previously discussed scope and supervised implementation through merge. The contracts, limits and mechanisms below are assistant implementation decisions within that scope, not separate per-field owner approvals. This document is the cross-lane contract; implementation changes to that contract must be communicated to every affected lane before integration. ADR-20 and FEAT-G-FRIENDS are reserved canonical identifiers; the integrator supplies their canonical documents.

Users with their own active Google session can send an exact server-minted GID a friend request, accept/decline/cancel requests, remove/block/unblock people, control incoming requests/invites, explicitly show online-in-app presence, link their GID to their current room membership, and send/accept targeted room invitations. Accepting a room invitation requires a new unchecked-to-checked GSI sharing consent and an explicit Join action. Friends and account failure never gate guest code create/join or local core.

No chat, voice, Steam import, searchable directory, public profile expansion, last-seen display, match activity tracking, automatic joining, deployment, release or version bump. Latest owner direction (2026-11-01) explicitly authorizes and requires reuse of existing design tokens (color, typography, spacing, radius), while permitting a new layout independent of the old layout. Read token definitions and functional integration code; do not copy the old page layout. Redesign G-Party around a dominant large minimap with room/member and Friends regions; do not steal focus or modify Overlay navigation.

## Architecture and trust

The existing gstore database owns permanent relationships in `social_private`. The authenticated Edge broker owns account authorization and public projections. The existing in-memory G-Party relay owns actual room membership and GSI admission. Native Rust alone retains room member credentials and performs relay requests. The renderer talks to the account broker with its existing Google session and passes only bounded opaque challenges/proofs/short-lived join tickets through trusted Control IPC.

A configured HTTPS relay and broker share a deployment secret. A relay HMAC attests only that this registered relay observed possession of a current room member credential. It is not legal identity, Google attestation, Dota membership, Steam ownership or end-to-end encryption. The broker independently binds a single-use challenge to the authenticated account/session/purpose. No account JWT, UUID, email, phone or GID is sent to the relay. A malicious registered relay can fabricate its own membership proofs: the operator/key is an explicit trust boundary.

Production requires one configured registered origin. A custom guest relay remains supported by the existing route, but social proof/invite controls are unavailable there. No invented hosted URL. Guest room behavior and existing own-stat allowlist stay intact.

## Constants and bounded behavior

| Constant | Value and rule |
| --- | --- |
| `SOCIAL_MAX_FRIENDS` | 200 per account; enforced atomically at acceptance for both accounts |
| `SOCIAL_MAX_PENDING` | 50 combined incoming/outgoing requests per account |
| `SOCIAL_MAX_BLOCKS` | 500 per blocker; unblock remains possible at capacity |
| `SOCIAL_POLL_MS` | 15,000; one state read in flight; one authenticated controller owned by CommandDeck, including while other tabs are active |
| `SOCIAL_HEARTBEAT_MS` | 20,000; only when presence explicitly visible and CommandDeck is mounted |
| `SOCIAL_LEASE_MS` | 60,000 for presence and room profile bindings; no historical last-seen API |
| `SOCIAL_INVITE_MS` | 300,000; pending and accepted-but-unredeemed invitations |
| `SOCIAL_REQUEST_MS` | 2,592,000,000 (30 days); expired requests cease counting/showing |
| `SOCIAL_PROOF_MS` | 60,000 maximum for challenge and proof, bounded by challenge expiry |
| `SOCIAL_TICKET_MS` | 60,000 maximum, bounded by invite expiry |
| `SOCIAL_HTTP_TIMEOUT_MS` | 5,000 broker requests; relay redeem timeout 3,000; no redirects |
| Payload bounds | broker request 8 KiB, response 256 KiB; proof decoded JSON 2 KiB; relay existing 4 KiB request/32 KiB response bounds remain |
| Rate limits | exact-GID request creation 10/minute/account; other mutations 30/minute/account; state reads 12/minute/account; heartbeat 6/minute/account; challenge mint 12/minute/account (one logical flow; consumption is not charged again); redeem 60/minute/registered relay |
| Ephemeral capacity | at most 4 live challenges/session (new mint at cap rejects); 1 live binding/account/session; 50 active sent invites/account, 50 active received/account; 1 live ticket/invite |
| Relay bounds | existing 100 rooms, 5 members/room, 1,024 limiter keys; social proof 30/minute/member, social joins 20/minute/IP, in-flight social joins 32 total |

All time decisions use server clocks and exclusive expiry (`now >= expires` fails). Client countdowns only shorten remaining time. Production wall clock HMAC claims allow at most 5 seconds future skew, never extend a lease. Expired ephemeral rows are inaccessible immediately and removed by a bounded maintenance function at least daily; completed requests/invites may be deleted immediately and must be removed within 24 hours. Permanent relationship/settings/block rows last until removed or account deletion (cascading FKs). No presence or binding history is retained. Failed rate-limit counters expire after their fixed one-minute window. No request bodies, secrets, account-room mappings, heartbeats or social actions are appended to IAM's long-lived security audit.

## Wire vocabulary and public DTOs

All wire properties are camelCase. Exact-key validation rejects unknown properties. IDs called `id`, `requestId` and `inviteId` are UUIDs. `roomId`, `memberId`, `ownerId` and entries of `memberIds` are exactly 32 lowercase hexadecimal characters. Challenges/tickets are random 32-byte values encoded as 64 lowercase hexadecimal characters; store their SHA-256 hashes only. `generation` is a positive safe integer, initialized to 1 for every room and incremented on invite-code rotation. Times are integer Unix milliseconds. GIDs must match the existing shared GID parser/checksum and exact `public.profiles.gid_code`; no client supplied numeric identity or prefix lookup.

```ts
type SocialPerson = { gid: string; displayName: string };
type SocialSettings = {
  presenceVisible: boolean; allowFriendRequests: boolean; allowInvites: boolean;
};
type SocialFriend = SocialPerson & { online: boolean; onlineForMs: number };
type SocialRequest = { id: string; person: SocialPerson; direction: "incoming" | "outgoing"; expiresAtMs: number };
type SocialInvite = {
  id: string; person: SocialPerson; direction: "incoming" | "outgoing";
  status: "pending" | "accepted"; expiresAtMs: number;
};
type SocialState = {
  self: SocialPerson; settings: SocialSettings; bindingRevision: number;
  friends: SocialFriend[]; requests: SocialRequest[]; invites: SocialInvite[];
  blocked: SocialPerson[]; serverNowMs: number; relayOrigin: string | null;
};
type SocialChallenge = { challenge: string; expiresAtMs: number; relayOrigin: string };
type SocialProof = { proof: string };
type SocialBinding = { memberId: string; person: SocialPerson; expiresAtMs: number };
type SocialRoster = { roomId: string; generation: number; bindings: SocialBinding[]; serverNowMs: number };
type SocialJoin = { ticket: string; relayOrigin: string; roomId: string; expiresAtMs: number };
```

`displayName` is an escaped text projection, 1–32 Unicode scalar values, trimmed, no control characters or ill-formed UTF-16; use GID when the existing profile name cannot be projected safely. These DTOs never include internal UUIDs, account contacts, Steam data, auth session identifiers, raw profile objects, room secrets, match keys, source statistics or last-seen timestamps. State returns only the caller's own relationships; `online` means explicit unexpired visible presence associated with at least one currently active Google session. `onlineForMs` is the remaining lease bounded 0–60,000 (zero unless online); the client subtracts the entire request RTT and local monotonic elapsed time, expiring the badge even if polling stalls. It is not a last-seen timestamp. Hidden, expired, revoked and unavailable presence render equally offline/unknown, never inferred from a room roster.

## Account API contract

`POST /functions/v1/g-party-social`, Google `Authorization: Bearer <access token>`. Success status 200 returns the action-specific JSON below. Errors are `{error: code}` with 400 `invalid_request` / `consent_required`, 401 `invalid_session`, 403 `forbidden`, 404 `unavailable`, 409 `conflict` / `limit_reached`, 429 `rate_limited`, 503 `social_unavailable`. The same `unavailable` result covers unknown GID, blocked pair and disallowed incoming request; never disclose who blocked whom. No public lookup/search endpoint.

| Exact request | Success |
| --- | --- |
| `{action:"state"}` | `SocialState` |
| `{action:"settings",presenceVisible:boolean,allowFriendRequests:boolean,allowInvites:boolean}` | `{ok:true}` |
| `{action:"heartbeat"}` | `{ok:true}` |
| `{action:"request",gid:string}` | `{ok:true}` |
| `{action:"request_accept",requestId:string}` | `{ok:true}` |
| `{action:"request_decline",requestId:string}` | `{ok:true}` |
| `{action:"request_cancel",requestId:string}` | `{ok:true}` |
| `{action:"remove",gid:string}` | `{ok:true}` |
| `{action:"block",gid:string}` | `{ok:true}` |
| `{action:"unblock",gid:string}` | `{ok:true}` |
| `{action:"challenge",purpose:"link"\|"roster"\|"invite",recipientGid:string\|null,bindingRevision:number\|null}` | `SocialChallenge` |
| `{action:"link",proof:string,bindingRevision:number,consent:boolean}` | `{ok:true}` |
| `{action:"unlink"}` | `{ok:true}` |
| `{action:"roster",proof:string}` | `SocialRoster` |
| `{action:"invite",proof:string}` | `{ok:true}` |
| `{action:"invite_accept",inviteId:string,consent:true}` | `SocialJoin` |
| `{action:"invite_decline",inviteId:string}` | `{ok:true}` |
| `{action:"invite_revoke",inviteId:string}` | `{ok:true}` |

Defaults are `presenceVisible:false`, `allowFriendRequests:true`, `allowInvites:true`. Presence opt-in is persisted as a preference but never means online without an active heartbeat lease. Turning it off synchronously deletes the caller's presence leases; turning off invites revokes existing incoming unredeemed invites. Heartbeats only renew when preference is visible. State failures hide stale online badges and social controls without hiding the guest room controls.

`request` is idempotent for an existing outgoing request, rejects self, and does not automatically accept a reciprocal request. Only its recipient can accept/decline, and only sender can cancel. Acceptance locks both accounts in stable UUID order, checks both caps and block state, then atomically creates a canonical unordered friendship pair and removes the request. Removing either direction removes friendship, pending requests and unredeemed invitations for the pair. Blocking does the same plus records a directional block; any block direction denies requests, visibility, invitations and room-account projections between that pair. Unblock never restores friendship or old invitations. Block and remove do not kick existing room members: the UI explains Leave/Kick/Rotate separately.

Challenge recipient is required only for `purpose:"invite"`, and must already be a friend with invitations enabled and neither party blocked. Other purposes require null recipient. `bindingRevision` is required as the current nonnegative session revision for link challenges and null for other purposes. Challenges are bound to the verified actor UUID, current session UUID, registered relay origin, purpose, optional recipient UUID and expiry. Each proof consumes exactly one challenge in the same transaction as its operation. Cross-session, cross-purpose, replayed, expired or mismatched-origin proofs fail. `link` with `consent:true` creates a 60-second binding only after explicit “Link my profile in this room” consent; `consent:false` is renewal and requires a still-live existing binding for the exact actor/session/relay/room/member/generation, never creates one. The request and consumed link challenge must carry the current server session `bindingRevision`. `unlink` atomically increments that revision, deletes the caller session's binding and outstanding link challenges. Both challenge mint and link consumption lock/check this revision, so delayed pre-unlink mint, proof or renewal cannot revive old intent. Re-enabling link requires fresh UI consent and a new state revision. A unique constraint on `(relay_origin,room_id,member_id)` permits one current binding; a different actor/session cannot replace it until explicit unbind or lease expiry. Renewals require matching generation and cannot replace newer bindings. Every change of party scope `(relayOrigin, roomId, selfId, roomGeneration)`, including Leave and rotation, resets local link consent and requires an acknowledged server `unlink` that advances bindingRevision and invalidates all old link challenges before any new initial `consent:true` link may be sent. Complete this transition even when a previous initial link is still in flight: serialization plus the old revision check prevents a delayed room-A initial link from replacing room-B identity in the same account/session. The controller waits for unlink acknowledgement, reloads authoritative state/revision, and only then permits fresh explicit consent for the new scope. If unlink fails or the backend is unreachable, new linking stays unavailable until that unlink transition is reconciled; never skip it or infer success from an aborted HTTP request. Renewal runs every 20 seconds only while this explicit local control is on, account remains current and the connected room is unchanged. Consent resets on account/room change; bindings expire after CommandDeck shutdown/network failure. One controller owned by CommandDeck maintains presence, state polling and explicit link renewal across navigation; returning to the map does not imply offline. G-Party contains the only social UI. Passive roster queries may pause when that panel is hidden, while link/presence remain alive.

`roster` requires a fresh member proof. The broker returns only bindings with matching relay/room/generation, a member ID contained in that proof's current roster, a live lease and live provider session, and no block with the viewer. UI additionally intersects with its latest `PartyView.members` and drops mismatched room/generation state. A nickname is never a verified GID. Add Friend buttons are available only on these explicit account bindings; guest members show no invented account identity. At most five bindings return.

`invite` requires an owner member proof, matched challenge recipient and current friendship/control checks. It stores only actor/session, recipient, configured relay origin, room/owner/member IDs, generation, status and expiry. Duplicate live same-owner/recipient/room/generation invite is idempotent. No `GMP1` secret, native token, GSI or persistent roster is stored. Only recipient accepts/declines; only sender revokes. Acceptance rechecks sender and recipient live sessions, friendship/block/control state and expiry, then issues a one-use ticket. Repeating acceptance while accepted but not redeemed replaces the old unredeemed ticket and requires fresh `consent:true`; it does not revive revoked/expired/redeemed invites. This enables explicit retry after a failed join without assuming it succeeded.

## Relay proof and admission contract

`POST /v1/rooms/{roomId}/social-proof`, existing member Bearer credential, exact body `{challenge:string}`. Configured relay only. After body read, re-authenticate/reap the room and member and produce `{proof:string}`. This request never refreshes GSI sample age or membership heartbeat. Proof payload:

```ts
type RelayProofPayload = {
  v: 1; relayOrigin: string; challenge: string;
  roomId: string; memberId: string; ownerId: string; generation: number;
  memberIds: string[]; issuedAtMs: number; expiresAtMs: number;
};
```

`proof = base64url(UTF8(JSON.stringify(payload))) + "." + base64url(HMAC_SHA256(key, UTF8("GPartySocialProof/v1\n" + payloadSegment)))`. Base64url is unpadded and canonical. Verify signature over the exact received segment before parsing bounded payload, reject unknown keys, duplicate/member-missing IDs, wrong origin, future/expired time, excessive lifetime and malformed fields. Broker challenge expiry further bounds acceptance. Room owner/gen and roster IDs are rechecked at proof creation after asynchronous body read. A proof is a bounded observation, not a promise that membership remains current forever; lease/proof expiry and latest roster intersection bound stale account labels.

`POST /v1/rooms/social-join`, no member auth, exact body `{ticket:string,displayName:string}`. Relay does not receive an account JWT. Relay submits a signed request to its fixed configured broker redemption URL, then validates that the referenced room still exists with the same owner and generation, owner is active, and member count is below five. Validation and adding the member occur synchronously with no await between them. Rotation increments generation and invalidates all outstanding social proofs/invites/tickets at admission even if a broker row has not yet expired. Room close, restart and owner loss deny admission. A failed admission after ticket consumption requires a new targeted invitation; UI must report failure truthfully.

`POST /functions/v1/g-party-social-redeem` has Supabase JWT verification disabled because it has independent relay authentication. Exact request `{ticket:string,relayOrigin:string,nonce:string,issuedAtMs:number}`; nonce is random 32-byte lowercase hex. Header `x-g-party-signature` is lowercase HMAC-SHA256 hex over `UTF8("GPartySocialRedeem/v1\n" + rawRequestBody)`. Broker bounds raw body before signing verification, rejects origin mismatch, timestamp older than 60 seconds or over 5 seconds future, and uses constant-time signature verification. Atomically insert the nonce hash in `social_private.redeem_nonces` with a unique key and 120-second retention; duplicate nonce rejects even with a different ticket. Bound this table to 120 live entries for the single registered relay and reject capacity until expiry. The ticket hash is an additional one-use replay fence. Origin, key and endpoint are deployment configuration, never user input. Success 200 is `{roomId:string,ownerId:string,generation:number}`; errors use the broker error envelope and never return ticket/account data.

Redemption is one SQL transaction: lock the sender/recipient auth.sessions rows in stable session UUID order with a row lock that conflicts with deletion/revocation, then lock canonical friendship pair/accounts in stable UUID order and invite/ticket, then revalidate live sender/recipient sessions, relationship, controls, status and expiry using clock_timestamp() after all waits, then consume ticket and mark invite redeemed. Every social mutator follows session locks before account/pair locks. Definer routines alone may perform the bounded session-row lock; runtime gets no direct auth grants. Read an invite provisionally to find session IDs, then lock and recheck it after acquiring the canonical locks. Session existence checks alone are insufficient. A session deletion committed first denies admission; a redemption transaction locking the live session first is authorized before the revocation can commit. This specifies ordering, not instantaneous retroactive cancellation. This transaction is the social authorization linearization point. Block/remove committed first prevents redemption; redemption committed first authorizes that single admission and a later block does not undo it. Relay room/capacity changes can still refuse admission afterward. There is no unsafe fallback to guest code when social admission fails.

## Native and frontend integration signatures

Extend `PartyView` with required nullable `relayUrl:string|null` and `roomGeneration:number|null`; populated only from validated active native credentials/room snapshots. Connected views require a positive safe-integer roomGeneration. Relay Membership and RoomSnapshot include required `roomGeneration:number`; rotate response becomes `{invite:string,roomGeneration:number}`. Native stores this authoritative room generation separately from its existing local cancellation `State.generation`, and accepts updates only for the current room with nondecreasing room generation. Proof payload `generation` and SocialRoster `generation` refer to this same roomGeneration. Strict frontend parser and every fixture must update. This is a coordinated relay/native wire-schema revision: older relay/client schema combinations fail validation/unavailable, never default generation to 1 or reuse a cancellation epoch. Update both components together before configuring a social relay; guest endpoints and semantics remain available on the updated relay. No compatibility shim or automatic downgrade is added. No renderer-supplied relay URL can retarget a proof from a currently joined room.

```ts
// src/src/party/friendsApi.ts
export function socialRequest<T>(body: SocialAction, signal?: AbortSignal): Promise<T>;
// IPC: invoke names and exact argument keys
invoke<SocialProof>("party_social_proof", { challenge, relayUrl });
invoke<PartyView>("party_join_social", { ticket, relayUrl, roomId, displayName, consent });
```

```rust
// src-tauri/g-party/src/client.rs; export DTOs through lib.rs
pub async fn social_proof(&self, challenge: String, relay_url: String) -> Result<SocialProof, String>;
pub async fn join_social(&self, options: SocialJoinOptions) -> Result<PartyView, String>;
// SocialJoinOptions { ticket: String, relay_url: String, room_id: String, display_name: String, consent: bool }
// SocialProof { proof: String }, serde camelCase and deny_unknown_fields.
```

Both Tauri commands use existing `trusted_client` Control/bootstrap checks. Proof requires connected state and exact canonical relay equality, validates bounded challenge, snapshots credentials/generation, performs no-redirect bounded HTTP and discards stale completion. Social join requires `consent == true`, valid HTTPS configured origin, expected broker-returned `roomId`, ticket/name bounds and native idle/closed state with no credentials/action in flight. It must not call the existing connect path that leaves a room first. If already in a room, return `already_in_room`; require explicit Leave and authoritative idle result before Join can be attempted. Generation/cancellation fences ensure late proof/join work cannot restore a departed session; accepted-but-cancelled server membership is best-effort left with the returned native token without exposing it to JS. The admission response must match the supplied expected `roomId`; mismatch is an error and the unexpected returned membership is best-effort left with its native credential, never installed or shown as joined.

`useParty` adds `joinSocial(input: {ticket:string;relayUrl:string;roomId:string;displayName:string;consent:boolean}):Promise<boolean>`; it returns true only for a parsed connected snapshot of the requested admission and false on validation/IPC/stale failure. Do not infer success from existing `connect():Promise<void>`. Existing guest interface can remain unchanged. Account transitions invalidate social callbacks, countdowns, proofs, linked-member maps and tickets synchronously through user/session epoch plus `localAuthBlocked`; late responses from account A cannot update account B. A pending account-A join also needs native cancellation before account-B social controls activate; use explicit `party_leave` on an in-flight social join, without treating normal account signout as an automatic leave of a preexisting guest room.

Create `friendsModel.ts` (strict DTO/limits), `friendsApi.ts` (broker client), `useFriends.ts` (account/room epochs, requests, polling, link renewal and consent lifecycle), and `FriendsPanel.tsx` (bounded lists/actions/inline acceptance). `CommandDeck.tsx` owns exactly one account/room lifecycle controller and passes its state/actions to `GPartyPage.tsx`; `PartyMembers.tsx` receives optional verified binding/Add Friend props. Presence heartbeat only asserts “app currently online”; no system tray/background tracking is introduced. Network failures show unavailable and clear online indicators. Use polite inline updates, no focus() / window.show() / notifications. Preserve existing map dimensions and keep internal scrolling bounded. Buttons cover requests, friend remove/block, blocked unblock, invite decline/revoke, visibility and receive controls. Invitation consent text must retain the existing GSI allowlist/relay disclosure, reset after every attempt and never be reused from room creation or another invitation. Broker `accepted` means consent authorized a ticket; `redeemed` means the one-use ticket was consumed. Neither is proof of relay admission: only the native connected snapshot permits a joined success message. A failed join shows an explicit failure and requires a new invitation if the ticket was consumed. Unlink and account change increment a local epoch; server `bindingRevision` checks additionally invalidate delayed challenge mint/renewal. Session binding revisions are private current counters, not an activity history.

## Private storage and authorization

Migration `20261101090000_cr038_party_friends.sql` creates `social_private.settings`, `friendships`, `requests`, `blocks`, `presence`, `room_bindings`, `challenges`, `invites`, `join_tickets`, `rate_limits`, `redeem_nonces`, and `binding_sessions` (session revision counter). Canonical pair constraints forbid self and duplicate friendships/requests; recipient/sender and session FKs are explicit. Every table has RLS enabled. Revoke schema/table/routine/sequence and default privileges from PUBLIC/anon/authenticated; keep schema outside PostgREST exposed schemas. Preserve profiles own-row RLS; no new broad profile SELECT grant/view. Runtime gets EXECUTE only on narrow fixed-search-path SECURITY DEFINER functions, never direct social/auth/profile table privileges or service-role credentials. Definer functions qualify all objects and enforce actor/session checks and bounded return projections; revoke default public EXECUTE. Existing `gmaiden_iam_runtime` may be reused through `withIamConnection` without expanding IAM table access.

Backend implementation owns SQL RPC internals, but supplies these stable Edge helpers: `handleSocial(request:Request,deps:SocialDependencies):Promise<Response>` in `_shared/social.ts`, `handleSocialRedeem(request:Request,deps:SocialDependencies):Promise<Response>` in the same module, and runtime dependency factory `socialDependencies():SocialDependencies` in `_shared/social_runtime.ts`. Tests inject auth/clock/repository/proof verification; real SQL tests exercise actual privilege and transaction paths. Ordinary social authorization requires a verified Google identity and live session at AAL1 or AAL2; do not reuse `requireIamContext`'s AAL2 default or mandatory audit callback. Factor a dedicated resolver using the existing `resolveIamContext` validation with an explicit `social.use` capability, `requireAal2:false`, and no `recordDecision` dependency. Keep existing IAM callers' AAL2/audit behavior unchanged. SQL again checks the bound live session inside every read and locks/rechecks session rows through commit for mutation/renewal/admission transactions. Session revocation follows the explicit lock ordering above; do not claim a mere EXISTS check closes an auth-to-commit race. Expiry checks use clock_timestamp() after lock waits rather than transaction-start now().

Expected validation/authorization denials after a valid actor has entered SQL return an error envelope without rolling back committed rate charges. Authenticated relay redemption records its nonce and rate charge even when its ticket is invalid; a repeated nonce cannot probe a different ticket. Use normal transactional result values for expected denials, not a RAISE that silently rolls back abuse accounting. Unexpected internal failures may roll back and return a sanitized unavailable error. Test ten denied exact-GID requests still exhausting the creation budget and a consumed nonce rejecting a new ticket.

## Threats and verification obligations

| Threat/failure | Required control and test |
| --- | --- |
| Forge GID/identity or leak account contacts | server exact lookup, narrow SocialPerson projection, no broad profiles grants; SQL and strict DTO tests |
| Enumerate/harass by requests | exact GID only, same unavailable response, fixed rate/caps, directional block controls |
| Autoaccept reciprocal request or capacity race | explicit recipient acceptance, canonical pair/account locks; real concurrent SQL sessions |
| Fake nickname account link | explicit opt-in challenge + member-auth relay proof, registered HMAC, session-bound lease and roster intersection |
| Replay/cross-purpose/cross-account proof | one-use hashed challenge, session binding revision for mint/consume, acknowledged unlink before every new party scope, strict binding and signature/time tests |
| Ticket copied/replayed or revoked during admission | one-use transaction, pair-lock ordering, current sessions and post-await relay state checks |
| SSRF/key exfiltration through custom URL | configured origin/endpoint only, no redirects, no JWT to relay, constant-time HMAC validation |
| Block/remove versus redeem races | deterministic concurrent SQL tests for both commit orders; documented admission linearization |
| Rotate/kick/owner leave while HTTP waits | delayed real relay tests; revalidate at commit, source freshness never renewed by social traffic |
| Account switch/signout/late response | synchronous local epochs plus server binding revisions and unique member bindings, localAuthBlocked, native cancellation, no credentials restored from stale response |
| Privacy/history retention | default hidden, TTL, no last-seen or event audit, heartbeat does not convey match state; expiry/cleanup tests |
| Outage/config mismatch | unavailable social panel; guest/local core continue; real invalid-key/missing-config tests |

## Configuration, rollback and evidence

Broker uses `IAM_DATABASE_URL`, existing Supabase URL/publishable key, `G_PARTY_SOCIAL_RELAY_ORIGIN`, and `G_PARTY_SOCIAL_HMAC_KEY` (64 lowercase hex characters decoded to 32 bytes). Relay uses the same origin/key and `G_PARTY_SOCIAL_REDEEM_URL` (fixed HTTPS function URL). Client may use `VITE_G_PARTY_RELAY_URL` as an editable guest-form prefill only; authoritative social origin comes from authenticated state/challenge/accept responses. Missing or invalid relay configuration makes proof, room-link and targeted-invitation operations fail closed as `social_unavailable`. Ordinary friend/settings/presence operations remain usable with `SocialState.relayOrigin=null`; no client may infer social relay readiness from a populated editable guest URL. This is configuration readiness, not a feature flag. Tests may inject loopback HTTP origins, clocks and keys explicitly; production environment parsing never enables loopback social registration. Both sides must disable redirects, cap bodies and exclude secrets/bodies from logs.

Readiness requires migration applied by authorized operator, existing least-privilege login set to intended runtime role, Edge auth/session connectivity, matching key and normalized registered origin, HTTPS relay health and broker redemption reachability. Document these checks and examples with placeholders; do not create credentials, deploy or claim a public service exists. Key replacement invalidates old signed proofs but does not cryptographically invalidate opaque database tickets. The rotation runbook must disable social admission, atomically revoke all outstanding invitations/tickets and challenges for the registered relay, replace keys on both sides, verify configuration, then re-enable admission. Existing in-memory room membership is separate. Reissue targeted invitations afterward; do not claim key rotation alone invalidates database tickets. Rollback disables social configuration/functions first and removes UI entry points while retaining guest room routes; leave private relationships intact until a separately reviewed data-removal migration. Never roll back by exposing private tables or broadening service-role access. A source revert is not a live infrastructure rollback.

Root integrator records exact-head frontend, portable Rust, relay, Deno/API and real SQL tests plus CI checks. CI must run an actual PostgreSQL/Supabase migration/privilege/transaction harness and Deno tests; syntax-only migration scans do not count. Fixture Google sessions prove enforcement contracts, not live Google acceptance. Real account signup/revocation, deployed relay, Windows native startup, live Dota, two monitors, focus and CPU/RAM/FPS/G-Signal measurements remain pending unless exercised. Merge is distinct from deployment/release and no benchmark result is invented.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | Lock CR-038 scope, account/relay contracts, privacy boundaries, limits, threat cases, rollback and evidence requirements. |
| 0.2.0 | 2026-11-01 | Apply latest owner UI direction: reuse existing tokens and redesign G-Party around a dominant minimap with room/member/Friends regions; chat/voice remain outside this functional CR. |
