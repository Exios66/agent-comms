#!/usr/bin/env bash
# Start the hub as one Node process (shared PGlite) and publish it on a
# Cloudflare quick tunnel so remote agents can read/write the same store.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export HUB_BACKEND="${HUB_BACKEND:-pglite}"
export HUB_DATA_DIR="${HUB_DATA_DIR:-.data/hub}"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"
HUB_ORIGIN="http://127.0.0.1:${PORT}"

mkdir -p "$HUB_DATA_DIR" .data

if [[ ! -d apps/web/.next/BUILD_ID && ! -f apps/web/.next/BUILD_ID ]]; then
  echo "building @agent-comms/web…"
  pnpm --filter @agent-comms/web build
fi

if ! curl -sf "${HUB_ORIGIN}/api/health" >/dev/null 2>&1; then
  echo "starting hub on ${HUB_ORIGIN} (HUB_DATA_DIR=${HUB_DATA_DIR})…"
  nohup pnpm --filter @agent-comms/web start >.data/hub-server.log 2>&1 &
  echo $! >.data/hub-server.pid
  for _ in $(seq 1 60); do
    if curl -sf "${HUB_ORIGIN}/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ! curl -sf "${HUB_ORIGIN}/api/health" >/dev/null 2>&1; then
    echo "hub failed to become healthy. last log lines:" >&2
    tail -n 40 .data/hub-server.log >&2 || true
    exit 1
  fi
fi

CLOUDFLARED="${CLOUDFLARED:-$ROOT/.data/cloudflared}"
if [[ ! -x "$CLOUDFLARED" ]]; then
  echo "downloading cloudflared…"
  curl -fsSL -o "$CLOUDFLARED" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
  chmod +x "$CLOUDFLARED"
fi

if [[ -f .data/hub-public-url ]]; then
  existing="$(tr -d '[:space:]' <.data/hub-public-url || true)"
  if [[ -n "$existing" ]] && curl -sf "${existing}/api/health" >/dev/null 2>&1; then
    echo "$existing"
    echo "$existing" >.data/hub-public-url
    exit 0
  fi
fi

echo "opening Cloudflare quick tunnel…"
rm -f .data/hub-tunnel.log
nohup "$CLOUDFLARED" tunnel --no-autoupdate --url "$HUB_ORIGIN" >.data/hub-tunnel.log 2>&1 &
echo $! >.data/hub-tunnel.pid

url=""
for _ in $(seq 1 45); do
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' .data/hub-tunnel.log | head -n 1 || true)"
  if [[ -n "$url" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$url" ]]; then
  echo "failed to obtain trycloudflare URL. last log lines:" >&2
  tail -n 40 .data/hub-tunnel.log >&2 || true
  exit 1
fi

echo "$url" >.data/hub-public-url
echo "$url"
