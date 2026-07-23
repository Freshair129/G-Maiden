# RCA - Closed Beta GID mint CORS preflight failure

## Symptom

- After Google OAuth returned to the public landing page, the page appeared to start over and did not show a GID or Closed Beta registration.
- Browser console reported that the request to `mint-gid` was blocked because the preflight response lacked `Access-Control-Allow-Origin`.

## Evidence

- The production browser request originated at `https://g-maiden-landing.vercel.app`.
- The deployed `mint-gid` function returned only `Content-Type` and did not handle `OPTIONS`.
- The landing calls `supabase.functions.invoke('mint-gid')` after a session is established in `landing/src/beta.ts`.
- Supabase documents that browser-invoked Edge Functions must handle CORS preflight and include CORS headers on responses.

## Root Cause

`mint-gid` was deployed as an authenticated Edge Function without browser CORS handling. The browser therefore rejected the authenticated invocation before its JWT validation or GID minting logic could run.

## Why The Issue Escaped Detection

- The initial OAuth test verified only the redirect to Google, not the post-callback call to `mint-gid` from the Vercel origin.
- Existing function tests cover the pure mint decision and do not exercise an `OPTIONS` request or browser CORS response headers.

## Proposed Prevention

- Every browser-invoked Edge Function must handle `OPTIONS` and include CORS headers on success and error responses.
- Add a production smoke check for `OPTIONS /functions/v1/mint-gid` from the Landing origin whenever the function or Landing auth flow changes.
- Preserve `verify_jwt: true`; CORS only permits the browser to read the response and does not replace authentication.
