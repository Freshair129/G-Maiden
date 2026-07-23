---
version: "0.2.1b"
created_at: "2026-07-21T21:00:37+07:00,ATHER"
last_update: "2026-07-21T21:48:00+07:00,ATHER"
status: "beta"
attributes:
  domain: "identity-access"
  doc_type: "technical-spike"
  scope: "ADR-17 hosted OAuth Server activation and client registration"
  language: "th/en"
title: "S-2: Supabase OAuth Server Provider-Capability Spike"
doc_id: "S-2-oauth-broker-provider-capability"
owner: "Boss"
related_docs:
  - "ADR-17-brokered-oauth-transaction-boundary"
  - "SEC-001-auth-identity-hardening"
---

# S-2: Supabase OAuth Server Provider-Capability Spike

## Question

Can Supabase OAuth Server be enabled and configured for separately registered Desktop and future
Mobile public clients using Authorization Code + S256 PKCE, without custom user JWT minting or
weakened redirect security?

## Read-only evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Local OAuth server feature | Present but disabled | `supabase/config.toml`: `[auth.oauth_server] enabled = false` |
| Dynamic registration | Disabled | `allow_dynamic_registration = false` |
| Cloud project linkage/config | Not present in workspace | `project_id = "G-Maiden"` is local CLI identity, not a remote ref/config proof |
| Management connector | Available, read-only discovery | Lists hosted `gstore` as `ACTIVE_HEALTHY`, but exposes no OAuth Server enablement/client registration operation |
| Existing desktop guard | Present and tested | DPAPI-backed `secureStorage`; single-use/time-bounded `oauth_begin` callback gate |
| Hosted OAuth Server protocol | Supported by current official documentation | Authorization Code + S256 PKCE, public clients, exact redirects, issuer-issued access/refresh tokens |
| Hosted OAuth configuration | Not observable or writable through available tooling | Management connector can list `gstore`, but exposes no OAuth Server enablement/client registration operation |

## Result

**Hosted capability supported; project activation blocked, fail-closed.** Supabase OAuth Server
supports public Authorization Code + PKCE clients with issuer-issued tokens, but this project's
hosted discovery endpoint returned HTTP 404 on 2026-07-21. This spike does not authorize OAuth
client/UI code, Edge Functions, schema, redirect/provider changes, deployment, custom JWTs, or
session-token transfer.

## Activation runbook and evidence required to close S-2

1. In the `gstore` Supabase Dashboard, enable OAuth Server and set the owned HTTPS authorization path.
   That UI must authenticate users only with the existing Google sign-in path, preserve
   `authorization_id`, show client/scopes, and call `getAuthorizationDetails` followed by explicit
   `approveAuthorization` or `denyAuthorization`.
2. Register a distinct **Desktop public client** with `token_endpoint_auth_method: none`, S256 PKCE,
   minimum scopes, and exactly `http://127.0.0.1:3000/auth/callback`. Do not add `localhost`, LAN,
   wildcard, custom URI-scheme, dynamic-port, or pattern variants.
3. Register a separate **Mobile public client** later, with a platform-owned exact claimed HTTPS
   universal/app-link callback. It must not reuse Desktop client id, refresh token, device code, or
   offline receipt.
4. Keep Google as the only primary sign-in provider used by the authorization UI. Do not add password,
   GID, Steam, email-password, or recovery credentials as an alternative path.
5. In a non-production environment, prove discovery metadata is available; correct state/nonce,
   authorization id, exact redirect, S256 verifier, expiry, one-time-code replay, denial, client-id,
   refresh rotation, and revocation behavior fail closed where applicable.
6. Complete security review for authorization-UI integrity, audit redaction/retention, rate limiting,
   session revocation, and Mobile deep-link ownership. Legal approval remains required for Terms,
   privacy, receipt retention, data controller, age, and jurisdiction before CR-021/CR-022 gates.

## Changelog

| Version | Date | Status | Summary | Agent |
| --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-21 | need review | Initial read-only spike: Supabase OAuth Server supports the model, but hosted activation/client configuration is absent (HTTP 404). | ATHER |
| 0.2.0b | 2026-07-21 | beta | Corrected the chosen model from custom broker to Supabase OAuth Server and added the fail-closed activation/client-registration runbook. | ATHER |
| 0.2.1b | 2026-07-21 | beta | Bound the Desktop public-client runbook to the ADR-17 fixed loopback callback decision. | ATHER |
