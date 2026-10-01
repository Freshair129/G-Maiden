---
title: "CR-018: Serve the GMAD operator route through the SPA shell"
doc_id: "CR-018-ops-route-spa-rewrite"
status: "historical"
version: "0.3.1b"
updated: "2026-10-01"
owner: "Boss"
attributes:
  domain: "closed-beta-distribution"
  cluster: "landing-routing"
  system: "G-Maiden landing"
  risk: "LOW"
  execution_level: "C-2"
---

# CR-018 — Serve `/ops` through the SPA shell

## Current source and deployment status (2026-10-01)

D4=B: do not claim a current shipped /ops operator UI.

- **UI entrypoint source:** [landing/src/main.tsx](../../landing/src/main.tsx) routes /demo and /public-demo to PublicDemo; all other paths render App. This entrypoint has no explicit /ops branch. It does not establish what App renders.
- **Hosting configuration source:** [landing/vercel.json](../../landing/vercel.json) specifies Vite install/build/output settings and contains no rewrite. This source fact does not establish what a deployed edge currently serves.
- **Deployed route:** DEPLOYED: UNKNOWN / NOT_VERIFIED. No current browser or HTTP probe is represented here. The deployment id and HTTP 200 assertion below remain dated historical evidence only.
- **Queue/support:** [CLAUDE.md](../../CLAUDE.md) describes a production G-Maiden queue sector; preserve that support/queue claim. The same overview mentions an owner/admin controller at /ops, but that prose does not establish current UI source or deployed route and is not a shipped-UI claim under D4=B.

## Historical root cause (2026-07-21 context)

At the time CR-018 was authored, the deployed Vite SPA was reported to have an `OpsPage` client route, but Vercel had no rewrite for a
direct `/ops` request. The resulting 404 statement is historical context, not current deployment evidence.
See [RCA](../../.brain/rca/2026-07-21-landing-ops-route-404.md).

## Historical proposed change

The historical CR-018 proposal was to add this narrow rule to `landing/vercel.json`:

```json
{
  "rewrites": [{ "source": "/ops", "destination": "/index.html" }]
}
```

Under the historical proposal, the rewrite served the SPA shell for `/ops`; authorization remained in the then-deployed
`admin-gmad-controller` Function, which checks `profiles.role` server-side. It does not create an
admin role or weaken download access.

## Historical acceptance criteria

- Direct `GET /ops` returns HTTP 200 from the deployed landing.
- The SPA renders the signed-in/out operator experience rather than Vercel's 404 page.
- Non-admin callers remain rejected by the server-side controller.
- Existing root and asset requests remain HTTP 200.

## Historical risk and rollback

**LOW / C-2.** One static hosting rewrite. Roll back by removing the `rewrites` entry and
redeploying; it changes no Supabase schema, user data, or authorization rule.

## Historical execution evidence (recorded 2026-07-21)

- Production deployment: `dpl_5pLibYGAF6sSR6rUksSWiRKPFiXk`.
- `GET https://g-maiden-landing.vercel.app/ops` returns HTTP 200 and serves `index.html`.
- `GET https://g-maiden-landing.vercel.app/` remains HTTP 200.
- `pnpm typecheck` and `pnpm build` passed before deployment.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
| 0.1.0b | 2026-07-21 | candidate | Proposed narrow SPA rewrite for the deployed `/ops` 404. | null | ATHER |
| 0.2.0b | 2026-07-21 | accepted | Boss approved the narrow SPA rewrite; deployment verification pending. | null | ATHER |
| 0.3.0b | 2026-07-21 | implemented | Production rewrite deployed and direct `/ops` plus root HTTP 200 verified. | null | ATHER |
| 0.3.1b | 2026-10-01 | clarified | Reconciled the historical deployment claim with current entrypoint/config evidence; current deployed route is not verified and queue support remains a separate claim. | null | RWANG |
