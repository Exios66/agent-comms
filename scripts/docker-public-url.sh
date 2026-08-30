#!/usr/bin/env bash
# Print the trycloudflare URL from the tunnel container logs (public profile).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .data/docker-public-url ]]; then
  existing="$(tr -d '[:space:]' <.data/docker-public-url || true)"
  if [[ -n "$existing" ]] && curl -sf --max-time 5 "${existing}/api/health" >/dev/null 2>&1; then
    echo "$existing"
    exit 0
  fi
fi

logs="$("$ROOT/scripts/docker-compose.sh" logs tunnel 2>/dev/null || true)"
url="$(printf '%s\n' "$logs" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n 1 || true)"
if [[ -z "$url" ]]; then
  url="$(printf '%s\n' "$logs" | sed -n 's/.*|  \(https:\/\/[^ ]*trycloudflare\.com\).*/\1/p' | tail -n 1 || true)"
fi

if [[ -z "$url" ]]; then
  echo "No public URL yet. Start the public profile:" >&2
  echo "  pnpm docker:public" >&2
  echo "Then watch logs:" >&2
  echo "  pnpm docker:logs" >&2
  exit 1
fi

mkdir -p .data
echo "$url" >.data/docker-public-url
echo "$url"
