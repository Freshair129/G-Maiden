---
title: "ADR-17: Supabase OAuth Server Transaction Boundary"
doc_id: "ADR-17-brokered-oauth-transaction-boundary"
version: "0.4.3b"
created_at: "2026-07-21T20:30:58+07:00,ATHER"
last_update: "2026-07-22T13:45:00+07:00,ATHER"
status: "active"
updated: "2026-07-22"
owner: "Boss"
source_of_truth: true
attributes:
  domain: "identity-access"
  doc_type: "architecture-decision"
  scope: "desktop, future-mobile, OAuth transaction security"
  language: "th/en"
related_docs:
  - "ADR-14-gid-account-identity"
  - "SEC-001-auth-identity-hardening"
  - "CR-022-gmad-desktop-first-run-entitlement-account-handoff"
  - "oauth-jwt-client-authorization-flows"
---

# ADR-17: Supabase OAuth Server Transaction Boundary

## Status

**Accepted for implementation planning** by Boss on 2026-07-21. C-3/HIGH. No provider, schema,
function, client, redirect, or deployment change is authorized by this ADR alone.

## Context

Desktop currently uses Supabase social Google OAuth with PKCE, protected session storage, and a
single-use/time-bounded loopback callback gate. The loopback endpoint does not yet bind an
app-generated OAuth `state` to a transaction. Passing a guessed `state` through social-login
`queryParams` is unsafe: authorization servers reserve/manage `state`, and a dynamic redirect URL
would pressure the system toward wildcard allowlists.

Future Mobile must not inherit Desktop refresh tokens, offline receipts, installer URLs, or a
custom password/recovery path. The selected architecture must retain Google as the only primary
sign-in and keep GID as display-only.

## Decision

Use **Supabase OAuth Server** as the high-assurance transaction boundary. Desktop and future Mobile
are separately registered public clients using Authorization Code + S256 PKCE. Supabase Auth owns
authorization state, exact redirect validation, one-time code issuance, refresh rotation, and
issuer-issued JWTs. The G-Maiden authorization/consent UI is an application surface at the configured
authorization path, not a custom token broker. Google remains the only primary sign-in inside it.

```mermaid
sequenceDiagram
  participant C as "Desktop or future Mobile"
  participant S as "Supabase OAuth Server / gstore"
  participant U as "G-Maiden authorization UI"
  participant G as "Google OAuth"
  participant A as "G-Maiden API"

  C->>C: Generate PKCE verifier/challenge and random local state
  C->>S: /authorize (client id, exact redirect, state, S256 challenge)
  S->>U: Redirect with authorization id
  U->>G: Google sign-in if user has no session
  G-->>U: Authenticated session
  U->>S: Get details; approve authorization
  S-->>C: One-time code + client state at exact redirect
  C->>S: /token (code, client id, redirect, PKCE verifier)
  S-->>C: Issuer access JWT + refresh token for this client only
  C->>A: Bearer JWT
  A->>A: Validate JWT; derive UUID then GID/entitlement server-side
```

### Non-negotiable controls

1. Redirects are exact registered values only. Desktop uses the fixed RFC 8252 loopback exception
   `http://127.0.0.1:3000/auth/callback`; it is bound only to `127.0.0.1`, never `localhost`, `0.0.0.0`,
   LAN, wildcard, or a dynamic port/pattern. Mobile uses an exact claimed HTTPS App/Universal Link.
   No arbitrary `redirect_to`, query-state workaround, embedded webview sign-in, or client-secret
   distribution.
2. Each transaction binds client state, S256 PKCE challenge, client id, exact redirect, issued/expiry
   time, and one-time code at Supabase Auth. State, verifier, code, JWT, refresh token, and Google
   tokens are never logged or returned in a QR/link.
3. The authorization UI retrieves authorization details from Supabase, authenticates only through
   Google, displays requested scopes, then explicitly approves/denies authorization.
4. Supabase-issued codes are opaque, short-lived, single-use, bound to the original PKCE challenge,
   and cannot be redeemed by another device/client type.
5. Supabase remains the identity/authorization source for UUID/profile/GID/RLS. Every G-Maiden grant or
   Terms decision remains server-derived; an OAuth session is not an entitlement.
6. Mobile receives an independently issued session in OS-protected storage. Device Authorization is
   pairing-only and remains disabled until issuer support and its separate threat model are approved.

## Consequences

### Positive

- Eliminates dependence on undocumented social-login state passthrough.
- Retains S256 PKCE with Supabase-managed state, one-time redemption, transaction TTL, client
  binding, and issuer-issued JWTs without a custom confidential token service.
- Gives Desktop and future Mobile the same high-assurance protocol without token transfer.

### Costs and gates

- Requires hosted OAuth Server activation, an authorization-path UI, separate public-client
  registrations, exact redirects, rate limits, redacted audit design, and independent security review.
- Do not emulate a Supabase session, mint custom user JWTs, or weaken Google-only sign-in.

## Alternatives rejected

| Alternative | Reason rejected |
| --- | --- |
| Override `state` via Supabase social-login `queryParams` | `state` is authorization-server-managed; behavior is not a safe contract. |
| Dynamic loopback `redirectTo` with a nonce | Forces dynamic/wildcard redirect policy and weakens redirect integrity. |
| Private-use desktop URI scheme | A second application can claim a scheme; fixed loopback + S256 PKCE is the chosen desktop profile. |
| Keep only the existing pending callback gate | Useful defense in depth, but does not meet the selected explicit end-to-end transaction binding target. |
| Send Desktop session/refresh token to Mobile | Transfers a bearer credential across devices. |
| Custom JWT or GID/Steam recovery | Violates the Google-only identity and server-authoritative authorization boundary. |

## Implementation exit criteria

1. A provider-capability spike proves the supported Supabase identity/session handoff with no custom
   user JWT minting.
2. Threat model covers login CSRF, code interception, redirect takeover, transaction replay, mix-up,
   authorization-UI compromise, token theft, mobile deep-link interception, and revoke propagation.
3. Exact redirects, secrets, rate limits, redacted audit retention, incident/revocation runbook, and
   legal approval are recorded before code.
4. Tests prove wrong/expired/replayed state, code, authorization decision, verifier, redirect, and client type
   fail closed; Desktop/Mobile tokens never cross devices; match/CV/G-Log remain local-only.

## Native redirect decision

**Desktop decision: fixed loopback callback.** The G-Maiden Desktop public client will register only
`http://127.0.0.1:3000/auth/callback`. It uses the system browser, Authorization Code + S256 PKCE,
random client state, exact redirect match, and protected token storage. This is the native-app
profile permitted by RFC 8252; HTTPS is required for remotely reachable redirects, while the local
loopback listener remains HTTP because it never leaves the host. The current listener is already
bound to `127.0.0.1` in [`gsi.rs:L422`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L422).

The callback is not trusted merely because it arrives on loopback. Before exchange it must bind the
received `state` to the locally stored state and original PKCE verifier, consume the transaction once,
limit its lifetime, and reject a second callback. Existing `oauth_begin` is defense in depth, not a
replacement for the OAuth-server state check. The callback must never render the code, state, or error
details into logs, UI, analytics, or a browser history page.

**Legacy callback hardening implemented (pending hosted OAuth Server migration).** `auth.ts` reads
the issuer-created `state` from the returned authorization URL and passes it directly to the native
gate; it does not override the authorization-server parameter. The native gate stores `{state, since}`
as one mutex-protected transaction, consumes it once, and requires an exact callback-state match before
emitting the code. Both the TypeScript boundary and native gate reject missing, shorter-than-16-byte,
or larger-than-4096-byte state values before opening the browser or arming the transaction. This
preserves the existing Supabase social-login flow while closing the local
callback injection gap. It does not activate OAuth Server, register a client, change redirect allowlists,
or replace the future issuer-owned state validation.

**Mobile decision: claimed HTTPS redirect only.** Each future platform gets a separate public client
and one exact HTTPS redirect verified by OS domain association. It never receives Desktop tokens or
uses the Desktop loopback URL. Private-use schemes remain out of scope unless a later platform threat
model demonstrates equivalent verified ownership.

## Provider-capability spike — 2026-07-21

**Verdict: supported platform, but project activation remains blocked fail-closed.** Read-only workspace inspection found
the local Supabase capability configuration at [`supabase/config.toml`](file:///g:/G-Maiden/supabase/config.toml):
`auth.oauth_server.enabled = false` and `allow_dynamic_registration = false`. The workspace has no
Supabase CLI binary, linked remote project metadata, cloud OAuth-client registration, exact client
redirect registration, or an OAuth Server configuration endpoint in the available management connector.
The connector does prove that hosted project `gstore` is active, but does not expose OAuth Server
enablement or client registration. The current hosted project reference in
[`supabase.ts`](file:///g:/G-Maiden/src/src/supabase.ts) proves neither that the OAuth Server is
enabled in cloud nor that Desktop/Mobile clients are registered.

Do not scaffold or deploy a broker from this evidence. The next allowed action is the approved
Supabase OAuth Server activation and client-registration runbook in S-2, followed by a non-production
protocol proof. If that proof cannot preserve Supabase-issued sessions and Google-only identity,
ADR-17 implementation remains blocked and the existing PKCE + protected storage + single-use callback
gate remains the only deployed path.

**Capability correction:** Supabase official OAuth Server documentation confirms Authorization Code
PKCE, public clients, exact redirect registration, and Supabase-issued JWT/refresh tokens. A
read-only request to this project's OAuth discovery endpoint returned HTTP 404 on 2026-07-21;
therefore the supported hosted capability is currently disabled, not absent. ADR-17 selects this
hosted capability instead of a custom broker once it is enabled and configured.

## Changelog

| Version | Date | Status | Summary | Agent |
| --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-21 | beta | Chosen high-assurance target: brokered OAuth transaction boundary for Desktop and future Mobile. | ATHER |
| 0.2.0b | 2026-07-21 | beta | Provider-capability spike could not prove a supported cloud handoff; broker implementation is fail-closed pending authorized configuration evidence. | ATHER |
| 0.3.0b | 2026-07-21 | beta | Verified Supabase OAuth Server supports the required public PKCE/session model; select it over a custom broker. Hosted discovery remains disabled (HTTP 404). | ATHER |
| 0.3.1b | 2026-07-21 | beta | Recorded read-only confirmation that `gstore` is active; its available management surface has no OAuth Server configuration operation. | ATHER |
| 0.4.0b | 2026-07-21 | beta | Chose the RFC 8252 fixed-loopback Desktop callback and claimed-HTTPS Mobile callback profiles; recorded required loopback binding controls. | ATHER |
| 0.4.1b | 2026-07-21 | beta | Implemented legacy callback state binding: issuer-created state is stored in the single-use native gate and exact-matched before code exchange. | ATHER |
| 0.4.3b | 2026-07-22 | beta | Normalized reader-facing authorization wording from GMAD to G-Maiden while preserving technical identifiers and linked CR names. | ATHER |
| 0.4.2b | 2026-07-21 | beta | Bounded OAuth state input before the native transaction is armed; Desktop frontend, Rust tests, and clippy pass. | ATHER |
