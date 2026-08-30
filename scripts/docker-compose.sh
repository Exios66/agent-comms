#!/usr/bin/env bash
# Run docker compose with repo defaults (compose.env, remote DOCKER_HOST fallback).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f compose.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source compose.env
  set +a
  COMPOSE_ENV=(--env-file compose.env)
else
  COMPOSE_ENV=()
fi

if [[ -z "${DOCKER_HOST:-}" ]] && curl -sf --max-time 2 http://127.0.0.1:2375/version >/dev/null 2>&1; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI not found. Install Docker Desktop or the Docker Engine CLI." >&2
  exit 1
fi

exec docker compose "${COMPOSE_ENV[@]}" "$@"
