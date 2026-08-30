#!/usr/bin/env npx tsx
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  dispatchHubTool,
  formatToolError,
  formatToolResult,
  getHubStore,
  HUB_TOOL_NAMES,
  hubToolDescriptions,
  hubToolSchemas,
  isHubError,
} from "@agent-comms/hub";
import { z } from "zod";

const HUB_URL = process.env.HUB_URL ?? "http://127.0.0.1:3000";
const TOKEN = process.env.HUB_AGENT_TOKEN ?? "";
const BACKEND = process.env.HUB_BACKEND ?? "pglite";

async function callTool(tool: string, input: unknown): Promise<unknown> {
  if (BACKEND === "supabase") {
    const store = await getHubStore({ accessToken: process.env.SUPABASE_AGENT_JWT });
    const jwt = process.env.SUPABASE_AGENT_JWT;
    if (!jwt) throw new Error("SUPABASE_AGENT_JWT is required for HUB_BACKEND=supabase");
    const session = await store.authenticate(jwt);
    if (!session) throw new Error("invalid supabase agent JWT");
    return dispatchHubTool(store, session.actor, tool, input);
  }

  const response = await fetch(`${HUB_URL.replace(/\/$/, "")}/api/hub`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ tool, input }),
  });
  const payload = (await response.json()) as { result?: unknown; error?: string; message?: string };
  if (!response.ok) {
    const err = new Error(payload.message ?? payload.error ?? `hub ${response.status}`);
    (err as Error & { code?: string }).code = payload.error;
    throw err;
  }
  return payload.result;
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "agent-comms",
    version: "0.1.0",
  });

  for (const name of HUB_TOOL_NAMES) {
    server.registerTool(
      name,
      {
        description: hubToolDescriptions[name],
        inputSchema: hubToolSchemas[name] as z.ZodType,
      },
      async (input: unknown) => {
        try {
          const result = await callTool(name, input ?? {});
          return { content: [{ type: "text" as const, text: formatToolResult(result) }] };
        } catch (error) {
          if (isHubError(error)) {
            const formatted = formatToolError(error);
            return { content: [{ type: "text" as const, text: formatted.text }], isError: true };
          }
          const formatted = formatToolError(error);
          return { content: [{ type: "text" as const, text: formatted.text }], isError: true };
        }
      },
    );
  }

  return server;
}

serveStdio(() => createServer());
