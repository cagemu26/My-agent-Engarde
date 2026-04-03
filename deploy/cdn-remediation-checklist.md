# CDN Remediation Checklist

## What Caused The Incident

The font error was not caused by a generic frontend bug. It came from a mismatch between:

- the frontend build-time config, which enabled `assetPrefix` and emitted `https://static.linlay.store/_next/static/...`,
- the CDN/static domain response headers, which did not return `Access-Control-Allow-Origin`,
- the actual deployment state, where the main site was using the static CDN domain but the CDN side was not fully configured for cross-origin font loading.

This means the issue was partly a source/deployment gap:

- the source code allowed switching static assets to a CDN domain,
- but the deployment prerequisites for that switch were not fully satisfied.

## Current Safe State

- `NEXT_PUBLIC_CDN_STATIC_BASE_URL` should stay empty in production until the CDN path is fully validated.
- The site should serve `/_next/static/*` from the same origin by default.
- Nginx should keep returning CORS headers for `/_next/static/*` so fonts continue to work if a static domain is reintroduced later.

## Required Checks Before Re-enabling Static CDN

1. Build config
- Confirm only one build input controls static CDN: `NEXT_PUBLIC_CDN_STATIC_BASE_URL`.
- Confirm production build output actually matches the intended asset host.

2. Domain and certificate
- Confirm `static.<domain>` DNS points to the intended CDN/origin.
- Confirm TLS certificate covers `static.<domain>`.

3. CDN behavior
- Confirm the CDN serves `/_next/static/*`.
- Confirm the CDN preserves or injects:
  - `Access-Control-Allow-Origin`
  - `Access-Control-Allow-Methods`
  - `Cache-Control`
- Confirm fonts (`.woff`, `.woff2`) are not stripped of CORS headers.

4. Origin behavior
- Confirm origin `/_next/static/*` responses include:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
  - long-lived cache headers

5. Cache invalidation
- Purge CDN cache after every frontend rebuild that changes hashed assets or asset host behavior.
- Verify the CDN is not serving stale headers from old cached objects.

6. Runtime verification
- Check homepage HTML for the final asset host.
- Check one CSS file and one font file in browser devtools and with `curl -I`.
- Verify there are no browser console CORS errors.

## Deployment Guardrails

1. Keep same-origin static assets as the default.
2. Treat static CDN as an explicit opt-in release step, not a passive env default.
3. Document the exact source of truth for:
- `NEXT_PUBLIC_CDN_STATIC_BASE_URL`
- CDN cache purge procedure
- Nginx config for `/_next/static/*`

## Rollback Procedure

If static CDN breaks again:

1. Set `NEXT_PUBLIC_CDN_STATIC_BASE_URL=` to empty.
2. Rebuild the frontend image.
3. Restart only the frontend container.
4. Confirm homepage HTML references `/_next/static/...` instead of `https://static...`.
5. Hard refresh the browser.

## Quick Verification Commands

```bash
curl -sS https://www.example.com/ | head -c 1200
curl -I https://www.example.com/_next/static/media/<font>.woff
curl -I https://static.example.com/_next/static/media/<font>.woff
```

Expected when static CDN is enabled:

- homepage HTML references `https://static.example.com/_next/static/...`
- font response includes `Access-Control-Allow-Origin`

Expected when static CDN is disabled:

- homepage HTML references `/_next/static/...`

