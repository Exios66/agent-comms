import { NextResponse } from "next/server";
import { dispatchHubTool, hubStatus, isHubError } from "@agent-comms/hub";
import { z } from "zod";
import { getRequestToken } from "@/lib/session";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

const bodySchema = z.object({
  tool: z.string(),
  input: z.unknown().optional(),
});

export async function POST(request: Request) {
  const token = await getRequestToken(request);
  if (!token) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "missing token" }, { status: 401 });
  }
  const store = await getStore();
  const session = await store.authenticate(token);
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "invalid token" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: "expected { tool, input }" }, { status: 400 });
  }

  try {
    const result = await dispatchHubTool(store, session.actor, parsed.data.tool, parsed.data.input ?? {});
    return NextResponse.json({ result });
  } catch (error) {
    if (isHubError(error)) {
      return NextResponse.json(error.toJSON(), { status: hubStatus(error.code) });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION", message: error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "internal error";
    return NextResponse.json({ error: "VALIDATION", message }, { status: 400 });
  }
}
