#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy/verify-static-cdn.sh <site_url> [expected_static_base_url]

Examples:
  deploy/verify-static-cdn.sh https://www.linlay.store
  deploy/verify-static-cdn.sh https://www.linlay.store https://static.linlay.store
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

SITE_URL="${1%/}"
EXPECTED_STATIC_BASE_URL="${2:-}"
EXPECTED_STATIC_BASE_URL="${EXPECTED_STATIC_BASE_URL%/}"

for cmd in curl grep sed head tr; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

SITE_ORIGIN="$(printf '%s' "$SITE_URL" | sed -E 's#^(https?://[^/]+).*$#\1#')"
HTML="$(curl -fsSL "$SITE_URL")"

FONT_PATH="$(printf '%s' "$HTML" | grep -Eo '(https?://[^"'"'"']+/_next/static/[^"'"'"']+\.woff2?|/_next/static/[^"'"'"']+\.woff2?)' | head -n 1 || true)"
ASSET_PATH="$FONT_PATH"
if [[ -z "$ASSET_PATH" ]]; then
  ASSET_PATH="$(printf '%s' "$HTML" | grep -Eo '(https?://[^"'"'"']+/_next/static/[^"'"'"']+|/_next/static/[^"'"'"']+)' | head -n 1 || true)"
fi

if [[ -z "$ASSET_PATH" ]]; then
  echo "Could not find any /_next/static asset in homepage HTML." >&2
  exit 1
fi

if [[ "$ASSET_PATH" =~ ^https?:// ]]; then
  ASSET_URL="$ASSET_PATH"
else
  ASSET_URL="${SITE_ORIGIN}${ASSET_PATH}"
fi

STATIC_BASE_URL="${ASSET_URL%%/_next/static/*}"
if [[ -z "$STATIC_BASE_URL" ]]; then
  STATIC_BASE_URL="$SITE_ORIGIN"
fi

echo "Site URL: $SITE_URL"
echo "Site origin: $SITE_ORIGIN"
echo "Detected static asset URL: $ASSET_URL"
echo "Detected static base URL: $STATIC_BASE_URL"

if [[ -n "$EXPECTED_STATIC_BASE_URL" && "$STATIC_BASE_URL" != "$EXPECTED_STATIC_BASE_URL" ]]; then
  echo "Static base URL mismatch. Expected: $EXPECTED_STATIC_BASE_URL" >&2
  exit 1
fi

HEADERS="$(curl -fsSL -D - -o /dev/null "$ASSET_URL" | tr -d '\r')"
echo
echo "Response headers:"
printf '%s\n' "$HEADERS"

if [[ "$STATIC_BASE_URL" != "$SITE_ORIGIN" ]]; then
  ACAO_LINE="$(printf '%s\n' "$HEADERS" | grep -i '^access-control-allow-origin:' | head -n 1 || true)"
  if [[ -z "$ACAO_LINE" ]]; then
    echo "Missing Access-Control-Allow-Origin header for cross-origin static asset." >&2
    exit 1
  fi

  ACAO_VALUE="$(printf '%s' "$ACAO_LINE" | sed -E 's/^[^:]+:[[:space:]]*//I')"
  if [[ "$ACAO_VALUE" != "*" && "$ACAO_VALUE" != "$SITE_ORIGIN" ]]; then
    echo "Unexpected Access-Control-Allow-Origin value: $ACAO_VALUE" >&2
    exit 1
  fi
fi

echo
echo "Static CDN verification passed."
