# Tencent Cloud Static CDN Setup

This document is for enabling a dedicated static domain such as `https://static.linlay.store` for Next.js assets in this project.

## Source Of Truth

Use exactly one deployment input to turn static CDN on:

```env
NEXT_PUBLIC_CDN_STATIC_BASE_URL=https://static.example.com
```

This value is consumed at frontend build time by [frontend/next.config.mjs](/Users/cage/Engarde AI部署/frontend/next.config.mjs).

If this value is empty, the app serves static assets from the same origin:

```text
/_next/static/...
```

If this value is set, the app emits:

```text
https://static.example.com/_next/static/...
```

## Tencent Cloud CDN Requirements

Before enabling `NEXT_PUBLIC_CDN_STATIC_BASE_URL`, make sure the Tencent Cloud CDN domain is fully ready.

1. Domain
- Add an acceleration domain such as `static.linlay.store`.
- Point DNS for `static.linlay.store` to Tencent Cloud CDN.

2. Origin
- Point CDN origin to your application source.
- If CDN pulls over HTTPS, make sure the origin certificate strategy is valid for your CDN setup.
- If the origin certificate does not cover `static.linlay.store`, configure the Tencent CDN origin host/protocol accordingly instead of assuming direct host-name parity.
- If Tencent CDN uses `HTTP` origin pulls, the origin must serve `static.linlay.store/_next/static/*` over plain HTTP without redirecting back to HTTPS. Otherwise the CDN will return a self-referential `301` loop to clients.

3. Response headers
- In Tencent Cloud CDN response header configuration, set:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
- Apply the rule at least to:
  - `/_next/static/*`
  - `.woff`
  - `.woff2`

4. Cache policy
- Cache `/_next/static/*` aggressively.
- Purge CDN cache after every frontend rebuild that changes asset hashes or static asset host.

5. Runtime verification
- Verify homepage HTML emits the expected asset host.
- Verify one font file returns `Access-Control-Allow-Origin`.
- Verify browser console has no font or stylesheet CORS errors.

## Origin Requirements

The nginx template in [deploy/nginx/engarde-https.conf](/Users/cage/Engarde AI部署/deploy/nginx/engarde-https.conf) already adds origin-side headers for `/_next/static/*`.

It also keeps a dedicated `static.linlay.store` port-80 origin block so Tencent CDN can fetch `/_next/static/*` over HTTP without getting trapped in an HTTPS redirect loop.

That is a fallback and should remain enabled even when Tencent CDN is used.

## Recommended Enable Flow

1. Configure Tencent Cloud CDN domain and response headers.
2. Purge CDN cache.
3. Set:

```env
NEXT_PUBLIC_CDN_STATIC_BASE_URL=https://static.linlay.store
```

4. Rebuild and restart the frontend.
5. Run:

```bash
deploy/verify-static-cdn.sh https://www.linlay.store https://static.linlay.store
```

## Recommended Rollback Flow

If static CDN breaks:

1. Set:

```env
NEXT_PUBLIC_CDN_STATIC_BASE_URL=
```

2. Rebuild the frontend.
3. Restart only the frontend container.
4. Run:

```bash
deploy/verify-static-cdn.sh https://www.linlay.store
```

## Notes

- The static CDN switch is build-time only. Changing the env var without rebuilding the frontend will not update emitted asset URLs.
- If Tencent CDN serves stale headers, a code fix on origin will not be enough until CDN cache is refreshed.
