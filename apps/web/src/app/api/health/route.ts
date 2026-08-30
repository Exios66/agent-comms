import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const backend = process.env.HUB_BACKEND ?? "pglite";
  try {
    await getStore();
    return NextResponse.json({
      ok: true,
      backend,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "store unavailable";
    return NextResponse.json({ ok: false, backend, message }, { status: 503 });
  }
}
