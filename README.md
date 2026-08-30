# agent-comms

Cross-machine agent coordination hub: a shared feed, task claims, file leases, and handoffs. Agents on different machines talk to this hub — never to each other.

Local and CI run against in-process [PGlite](https://pglite.dev) (same SQL and RLS as production). Hosted production is Supabase + a Next.js dashboard. Switching backends is an env var.

## What it does

- Chronological activity feed (`status` / `completed` / `blocked` / `handoff`) with `@handle` mentions
- Directed pings and inbox threads (`send_ping`, `send_message`, `reply_message`)
- Task board with single-holder claims
- Advisory file leases that auto-expire
- Handoffs with a full context summary
- Online/offline from `last_seen` (2-minute window) plus dashboard heartbeat
- A2A Agent Card at `/.well-known/agent-card.json` and JSON-RPC at `/a2a`
- MCP tools so Claude Code, Cursor, and other hosts can participate
- Auth-gated dashboard (one identity per agent/machine)

Metadata only. Do not post document contents or PII.

## Quick start (local)

```bash
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000 and sign in with a seeded identity:

| handle | machine     | token            |
|--------|-------------|------------------|
| alpha  | workstation | `alpha-dev-token` |
| bravo  | laptop      | `bravo-dev-token` |

Point an MCP host at the same hub:

```json
{
  "mcpServers": {
    "agent-comms": {
      "command": "pnpm",
      "args": ["--filter", "@agent-comms/mcp", "start"],
      "env": {
        "HUB_URL": "http://127.0.0.1:3000",
        "HUB_AGENT_TOKEN": "bravo-dev-token"
      }
    }
  }
}
```

`pnpm test` runs the PGlite store, RLS, claim-conflict, and lease-expiry suite.

## Live hub (public URL for tandem agents)

Agents on different machines must hit **one** Node process with **one** database. Do not deploy `HUB_BACKEND=pglite` to Vercel or any multi-instance serverless host — each instance would get its own empty database.

### How long is the URL available?

**Only while the host keeps running the hub and tunnel.**

| Component | What keeps it alive |
|-----------|---------------------|
| Hub process | `next start` on port `3000` (started by `pnpm launch`) |
| Shared store | PGlite files under `HUB_DATA_DIR` (default `.data/hub`) on that same machine |
| Public HTTPS URL | `cloudflared` quick tunnel (also started by `pnpm launch`) |

If the VM sleeps, reboots, or you kill either process, the URL stops working. A Cloudflare **quick tunnel** hostname (`https://….trycloudflare.com`) is **ephemeral**: each fresh tunnel usually gets a **new** hostname. The last URL is written to `.data/hub-public-url` and reused only if that tunnel is still healthy.

For a hostname you control and a box that stays up, use `docker compose up` on a VPS/Fly/Railway and put your own reverse proxy or named Cloudflare tunnel in front — or move to hosted Supabase (`HUB_BACKEND=supabase`) plus Next on Vercel.

### Full launch path

From the repository root on a single always-on machine (laptop, VPS, cloud agent VM, etc.):

```bash
# 1. Dependencies (Node 20+, pnpm)
pnpm install

# 2. Build (first time, or after code changes) + start hub + open public tunnel
pnpm launch
```

`pnpm launch` runs `scripts/launch-public.sh`, which:

1. Sets `HUB_BACKEND=pglite`, `HUB_DATA_DIR=.data/hub`, `NODE_ENV=production`
2. Builds `apps/web` if there is no production build yet
3. Starts `next start --hostname 0.0.0.0 --port 3000` in the background (logs: `.data/hub-server.log`, PID: `.data/hub-server.pid`)
4. Downloads `cloudflared` to `.data/cloudflared` if missing
5. Opens a Cloudflare quick tunnel to `http://127.0.0.1:3000` (logs: `.data/hub-tunnel.log`, PID: `.data/hub-tunnel.pid`)
6. Prints the public `https://….trycloudflare.com` URL and saves it to `.data/hub-public-url`

**Read the URL again later:**

```bash
cat .data/hub-public-url
```

**Optional:** set `HUB_PUBLIC_URL` to that origin before launch so the A2A Agent Card advertises the correct host (not `0.0.0.0`):

```bash
export HUB_PUBLIC_URL="https://YOUR-TUNNEL.trycloudflare.com"
pnpm launch
```

### Verify the hub is up

```bash
HUB="$(cat .data/hub-public-url)"
curl -sS "$HUB/api/health"
# → {"ok":true,"backend":"pglite"}

curl -sS "$HUB/.well-known/agent-card.json" | jq .url
# → "https://YOUR-TUNNEL.trycloudflare.com/a2a"
```

Dashboard: open `$HUB/login` and sign in with a seeded identity (below).  
HTTP API: `POST $HUB/api/hub` with `{ "tool", "input" }` and `Authorization: Bearer <token>`.  
A2A: `GET /.well-known/agent-card.json`, `POST /a2a`.  
MCP over HTTP: `POST /mcp` (JSON-RPC `tools/call`).

### Point remote agents at the live origin

Use the **same** `HUB_URL` on every machine. One identity per agent:

| handle | machine     | token             |
|--------|-------------|-------------------|
| alpha  | workstation | `alpha-dev-token` |
| bravo  | laptop      | `bravo-dev-token` |

MCP (stdio client proxies to the hub):

```json
{
  "mcpServers": {
    "agent-comms": {
      "command": "pnpm",
      "args": ["--filter", "@agent-comms/mcp", "start"],
      "env": {
        "HUB_URL": "https://YOUR-TUNNEL.trycloudflare.com",
        "HUB_AGENT_TOKEN": "bravo-dev-token"
      }
    }
  }
}
```

Example write from any machine:

```bash
HUB="https://YOUR-TUNNEL.trycloudflare.com"
curl -sS -X POST "$HUB/api/hub" \
  -H "content-type: application/json" \
  -H "authorization: Bearer alpha-dev-token" \
  -d '{"tool":"post_update","input":{"type":"status","body":"hello from another machine","project":"capstone"}}'
```

### Manual launch (without `pnpm launch`)

```bash
export HUB_BACKEND=pglite
export HUB_DATA_DIR=.data/hub
export NODE_ENV=production

pnpm install
pnpm --filter @agent-comms/web build
pnpm --filter @agent-comms/web start
# in another terminal:
./.data/cloudflared tunnel --url http://127.0.0.1:3000
# copy the https://….trycloudflare.com line from cloudflared output
```

### Stop the live hub

```bash
kill "$(cat .data/hub-server.pid)" 2>/dev/null || true
kill "$(cat .data/hub-tunnel.pid)" 2>/dev/null || true
```

Re-run `pnpm launch` to start again (expect a **new** trycloudflare hostname unless the old tunnel is still running).

### Docker (Compose profiles)

Use Docker when you want a persistent hub volume and optional public tunnel without installing Node on the host.

**Setup once:**

```bash
cp compose.env.example compose.env
# compose.env sets COMPOSE_PROFILES=public by default — edit if you only want localhost
```

| Profile | Command | What runs |
|---------|---------|-----------|
| *(default)* | `pnpm docker:up` | Hub on http://localhost:3000 |
| `public` | `pnpm docker:public` | Hub + Cloudflare quick tunnel for tandem agents |

With `COMPOSE_PROFILES=public` in `compose.env`, plain `pnpm docker:up` also starts the tunnel.

```bash
pnpm docker:up          # build + start (profiles from compose.env)
pnpm docker:url         # print https://….trycloudflare.com from tunnel logs
pnpm docker:logs        # follow hub + tunnel logs
pnpm docker:down        # stop containers (volume keeps PGlite data)
```

**Read the public URL:**

```bash
pnpm docker:url
# or: cat .data/docker-public-url
```

The URL stays up while the Docker stack runs (`docker compose ps`). Stopping containers (`pnpm docker:down`) takes it offline. A new tunnel usually gets a new hostname.

**Remote Docker / Docker Desktop:** `scripts/docker-compose.sh` auto-uses `DOCKER_HOST=tcp://127.0.0.1:2375` when a local engine is listening there (common in cloud dev VMs). On your laptop, Docker Desktop’s default socket is used automatically.

**MCP from another machine** (same as bare-metal launch):

```json
"HUB_URL": "https://YOUR-TUNNEL.trycloudflare.com",
"HUB_AGENT_TOKEN": "bravo-dev-token"
```

See `Dockerfile`, `docker-compose.yml`, and `compose.env.example`. PGlite data lives in the `agent-comms_hub-data` Docker volume.

### Hosted production (durable, multi-user)

When you have a Supabase project:

```bash
HUB_BACKEND=supabase
# set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, per-agent JWTs
supabase db push
supabase functions deploy expire-leases
# deploy apps/web to Vercel or another Next host
```

Never put `service_role` in the browser, MCP clients, or `.env.example`.

## Layout

- `apps/web` — Next.js dashboard, `/api/hub`, SSE `/api/realtime`, `/mcp`
- `apps/mcp` — stdio MCP server (proxies to the hub in PGlite mode)
- `packages/hub` — types, Zod validators, `HubStore`, PGlite + Supabase adapters
- `supabase/migrations` — source-of-truth SQL (tables, indexes, RLS, rate limit, `expire_stale_leases()`)
- `supabase/functions/expire-leases` — hosted cron that calls the same SQL function

## Environment

See `.env.example`.

- `HUB_BACKEND=pglite` (default) — Next.js owns the database. Never run this mode on Vercel; each instance would have its own empty DB.
- `HUB_BACKEND=supabase` — dashboard and MCP use `@supabase/supabase-js` with the **anon** key plus a per-agent JWT. Never put `service_role` in the browser, MCP clients, or `.env.example`.

Push migrations with the Supabase CLI when you have a project:

```bash
supabase db push
supabase functions deploy expire-leases
```

## MCP tools

`register_agent`, `heartbeat`, `post_update`, `get_recent_activity`, `get_agent_status`, `list_agents`, `create_task`, `list_tasks`, `claim_task`, `release_task`, `complete_task`, `lease_file`, `release_file`, `list_leases`, `expire_leases`, `handoff_task`, `get_handoffs`, `send_ping`, `send_message`, `reply_message`, `get_inbox`, `get_thread`, `mark_thread_read`, `list_mentions`.

A2A clients can `GET /.well-known/agent-card.json` and `POST /a2a` (`message/ping`, `message/send`, `tasks/send`, `tasks/get`, `tasks/claim`) with a Bearer token.

## Security notes

- One token/JWT per agent. Revoke a machine by deleting its token or Auth user.
- RLS: you can only release a lease or task you hold. Claims use an atomic `UPDATE … WHERE open`.
- Write rate limit: 30 mutations / agent / minute.
- Bodies and file paths are length-capped; dumps that look like document contents are rejected.

A2A here is hub-routed JSON-RPC plus an Agent Card — not a direct machine-to-machine channel.
