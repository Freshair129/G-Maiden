# G-Maiden Landing

React + Vite + Tailwind public landing and deterministic product demo.

## Local development

```powershell
cd landing
pnpm install
pnpm dev
```

## Verification

```powershell
pnpm test
pnpm typecheck
pnpm build
```

The landing page is informational. It does not enroll users, issue GIDs, or gate desktop access.
Google sign-in and Steam linking are optional account features in the desktop application; the
local GSI, capture, and overlay runtime do not require an account.

## Configuration and privacy

- The public page uses only browser-safe configuration. Never place `service_role` or another
  secret in a `VITE_*` variable.
- Aggregate page-view analytics must not include query strings, fragments, account data, or game
  data.
- The interactive `/demo` scenario uses synthetic data and does not read user files, screen
  contents, or the Dota process.

## Deployment

The Vercel project is `g-maiden-landing`. Deployment is a separate reviewed operation; this
repository cleanup does not publish the landing site.
