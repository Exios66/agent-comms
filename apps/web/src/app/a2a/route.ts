import { NextResponse } from "next/server";
import {
  buildAgentCard,
  dispatchHubTool,
  formatToolError,
  formatToolResult,
  isHubError,
} from "@agent-comms/hub";
import { getRequestToken } from "@/lib/session";
import { getStore } from "@/lib/store";
import { publicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";

const METHOD_TO_TOOL: Record<string, { tool: string; map?: (params: Record<string, unknown>) => unknown }> = {
  "message/send": {
    tool: "send_message",
    map: (params) => ({
      toHandle: params.toHandle ?? params.handle,
      body: params.body ?? params.message ?? params.text,
      threadId: params.threadId,
      subject: params.subject,
      project: params.project,
    }),
  },
  "message/ping": {
    tool: "send_ping",
    map: (params) => ({
      toHandle: params.toHandle ?? params.handle,
      body: params.body ?? params.message ?? params.text ?? "ping",
      project: params.project,
    }),
  },
  "tasks/send": {
    tool: "create_task",
    map: (params) => ({
      title: params.title ?? params.message,
      description: params.description,
      project: params.project,
    }),
  },
  "tasks/get": { tool: "list_tasks" },
  "tasks/claim": {
    tool: "claim_task",
    map: (params) => ({ taskId: params.taskId ?? params.id }),
  },
};

export async function GET(request: Request) {
  return NextResponse.json(buildAgentCard(publicOrigin(request)));
}

export async function POST(request: Request) {
  const token = await getRequestToken(request);
  if (!token) return NextResponse.json({ jsonrpc: "2.0", error: { code: -32001, message: "unauthorized" } }, { status: 401 });
  const store = await getStore(token);
  const session = await store.authenticate(token);
  if (!session) {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32001, message: "invalid token" } }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    method?: string;
    params?: Record<string, unknown>;
    id?: string | number | null;
    jsonrpc?: string;
  } | null;

  if (body?.method === "agent/getAuthenticatedExtendedCard" || body?.method === "card/get") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: buildAgentCard(publicOrigin(request)),
    });
  }

  const mapped = body?.method ? METHOD_TO_TOOL[body.method] : undefined;
  if (!mapped) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body?.id ?? null,
      error: { code: -32601, message: `method not found: ${body?.method ?? "unknown"}` },
    });
  }

  try {
    const input = mapped.map ? mapped.map(body?.params ?? {}) : (body?.params ?? {});
    const result = await dispatchHubTool(store, session.actor, mapped.tool, input);
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body?.id ?? null,
      result: { content: [{ type: "text", text: formatToolResult(result) }] },
    });
  } catch (error) {
    const formatted = formatToolError(error);
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body?.id ?? null,
      error: { code: isHubError(error) ? -32000 : -32603, message: formatted.text },
    });
  }
}
