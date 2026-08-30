import { NextResponse } from "next/server";
import { loginSchema } from "@agent-comms/hub";
import { getStore } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: "handle and token required" }, { status: 400 });
  }
  let store;
  try {
    store = await getStore();
  } catch (error) {
    const message = error instanceof Error ? error.message : "store init failed";
    console.error("hub store init failed", error);
    return NextResponse.json({ error: "VALIDATION", message }, { status: 500 });
  }
  const session = await store.authenticate(parsed.data.token);
  if (!session || session.agent.handle !== parsed.data.handle) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "unknown handle or token" }, { status: 401 });
  }
  const response = NextResponse.json({ agent: session.agent });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: parsed.data.token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
