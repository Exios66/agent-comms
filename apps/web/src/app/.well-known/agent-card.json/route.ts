import { buildAgentCard } from "@agent-comms/hub";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = `${url.protocol}//${url.host}`;
  return Response.json(buildAgentCard(base), {
    headers: { "cache-control": "no-store" },
  });
}
