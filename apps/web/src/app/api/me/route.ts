import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ agent: null }, { status: 401 });
  return NextResponse.json({ agent: session.agent });
}
