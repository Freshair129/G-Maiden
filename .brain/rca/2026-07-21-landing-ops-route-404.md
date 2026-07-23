# RCA — Vercel returns 404 for the GMAD ops route

## Symptom

Opening `https://g-maiden-landing.vercel.app/ops` returns Vercel `404 NOT_FOUND` before the
operator page can render.

## Evidence

- Direct HTTP verification returns `HTTP/1.1 404 Not Found` and `X-Vercel-Error: NOT_FOUND`.
- `landing/src/App.tsx` routes `window.location.pathname === '/ops'` to `OpsPage`.
- `landing/vercel.json` defines build settings only; it has no rewrite for `/ops` to `index.html`.
- The deployed landing root itself returns HTTP 200.

## Root cause

The Vite single-page application route exists only after `index.html` loads. Vercel receives a
direct `/ops` request first and has no static file or rewrite rule for that path, so it returns 404
before the client router expression in `App.tsx` executes.

## Why it escaped detection

The production verification checked the root alias and build status, but did not request the
direct protected route after deployment.

## Proposed prevention

Add a narrow Vercel rewrite from `/ops` to `/index.html`, then verify direct-route HTTP 200 and
the post-login admin authorization path. Include direct-route checks in all landing deployments
that introduce a client-side route.
