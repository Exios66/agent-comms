import { NextResponse } from "next/server";
import {
  dispatchHubTool,
  formatToolError,
  formatToolResult,
  HUB_TOOL_NAMES,
  hubToolDescriptions,
  isHubError,
} from "@agent-comms/hub";
import { getRequestToken } from "@/lib/session";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Minimal Streamable-HTTP MCP endpoint so agents can POST tools to this hub
 * without fighting PGlite. Full stdio clients should use apps/mcp.
 */
export async function POST(request: Request) {
  const token = await getRequestToken(request);
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const store = await getStore();
  const session = await store.authenticate(token);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    method?: string;
    params?: { name?: string; arguments?: unknown };
    id?: string | number | null;
    jsonrpc?: string;
  } | null;

  if (body?.method === "tools/list" || body?.method === "initialize") {
    if (body.method === "initialize") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "agent-comms", version: "0.1.0" },
        },
      });
    }
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: {
        tools: HUB_TOOL_NAMES.map((name) => ({
          name,
          description: hubToolDescriptions[name],
          inputSchema: { type: "object", additionalProperties: true },
        })),
      },
    });
  }

  if (body?.method === "tools/call") {
    const name = body.params?.name ?? "";
    try {
      const result = await dispatchHubTool(store, session.actor, name, body.params?.arguments ?? {});
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: { content: [{ type: "text", text: formatToolResult(result) }] },
      });
    } catch (error) {
      const formatted = formatToolError(error);
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: { content: [{ type: "text", text: formatted.text }], isError: true },
      });
    }
  }

  if (body?.method) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: { code: -32601, message: `method not found: ${body.method}` },
    });
  }

  return NextResponse.json({ error: "VALIDATION", message: "MCP JSON-RPC body required" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    name: "agent-comms",
    tools: HUB_TOOL_NAMES,
    note: isHubError.toString() ? "POST JSON-RPC tools/call with Bearer token" : "",
  });
}
