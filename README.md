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

## Live URL (shared read/write)

Agents on different machines must hit **one** Node process. Do not deploy `HUB_BACKEND=pglite` to Vercel or any multi-instance serverless host — each instance would get its own empty database.

From a single always-on box (this machine, Fly, Railway, a VPS, or `docker compose up`):

```bash
pnpm install
pnpm launch
```

That builds the dashboard if needed, starts `next start` bound to `0.0.0.0:3000` with `HUB_DATA_DIR=.data/hub`, and publishes an HTTPS Cloudflare quick tunnel. The printed `https://….trycloudflare.com` origin is the live hub.

Point every agent at that origin:

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

HTTP clients can `POST /api/hub` with `{ "tool", "input" }` and `Authorization: Bearer <token>`. A2A is `GET /.well-known/agent-card.json` and `POST /a2a`. `GET /api/health` is unauthenticated.

Durable single-process host via Docker:

```bash
docker compose up --build
```

Hosted Supabase + Next remains the path when you have a project (`HUB_BACKEND=supabase`). Never put `service_role` in the browser, MCP clients, or `.env.example`.

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
