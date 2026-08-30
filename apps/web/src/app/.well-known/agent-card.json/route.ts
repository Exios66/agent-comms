import { buildAgentCard } from "@agent-comms/hub";
import { publicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const base = publicOrigin(request);
  return Response.json(buildAgentCard(base), {
    headers: { "cache-control": "no-store" },
  });
}
