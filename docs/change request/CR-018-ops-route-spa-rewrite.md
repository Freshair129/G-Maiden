---
title: "CR-018: Serve the GMAD operator route through the SPA shell"
doc_id: "CR-018-ops-route-spa-rewrite"
status: "superseded"
version: "0.3.1b"
updated: "2026-08-28"
owner: "Boss"
superseded_by: "EXEC-PLAN-CR-034-iam-remediation"
attributes:
  domain: "closed-beta-distribution"
  cluster: "landing-routing"
  system: "G-Maiden landing"
  risk: "LOW"
  execution_level: "C-2"
---

# CR-018 — Serve `/ops` through the SPA shell

## Root cause

The deployed Vite SPA has an `OpsPage` client route, but Vercel currently has no rewrite for a
direct `/ops` request. Vercel therefore returns 404 before `App.tsx` can select `OpsPage`.
See [RCA](../../.brain/rca/2026-07-21-landing-ops-route-404.md).

> **Reconciliation note (2026-08-28).** The `OpsPage` client route described by this CR is no
> longer present in `landing/src` (verified 2026-08-28). The operator console is not shipped in
> the current source state; this CR is superseded by `EXEC-PLAN-CR-034-iam-remediation`.

## Proposed change

Add this narrow rule to `landing/vercel.json`:

```json
{
  "rewrites": [{ "source": "/ops", "destination": "/index.html" }]
}
```

It only serves the existing SPA shell for `/ops`; authorization remains in the deployed
`admin-gmad-controller` Function, which checks `profiles.role` server-side. It does not create an
admin role or weaken download access.

## Acceptance criteria

- Direct `GET /ops` returns HTTP 200 from the deployed landing.
- The SPA renders the signed-in/out operator experience rather than Vercel's 404 page.
- Non-admin callers remain rejected by the server-side controller.
- Existing root and asset requests remain HTTP 200.

## Risk and rollback

**LOW / C-2.** One static hosting rewrite. Roll back by removing the `rewrites` entry and
redeploying; it changes no Supabase schema, user data, or authorization rule.

## Execution evidence

- Production deployment: `dpl_5pLibYGAF6sSR6rUksSWiRKPFiXk`.
- `GET https://g-maiden-landing.vercel.app/ops` returns HTTP 200 and serves `index.html`.
- `GET https://g-maiden-landing.vercel.app/` remains HTTP 200.
- `pnpm typecheck` and `pnpm build` passed before deployment.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.3.0b | 2026-07-21 | implemented | Production rewrite deployed and direct `/ops` plus root HTTP 200 verified. | null | ATHER |
| 0.2.0b | 2026-07-21 | accepted | Boss approved the narrow SPA rewrite; deployment verification pending. | null | ATHER |
| 0.1.0b | 2026-07-21 | candidate | Proposed narrow SPA rewrite for the deployed `/ops` 404. | null | ATHER |
| 0.3.1b | 2026-08-28 | superseded | Superseded after verifying that the described `OpsPage` route is absent from `landing/src`; the current operator console is not shipped. | null | Codex (lane A1) |
