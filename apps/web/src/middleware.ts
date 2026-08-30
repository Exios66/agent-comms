import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

function withCors(response: NextResponse) {
  for (const [key, value] of Object.entries(CORS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return withCors(new NextResponse(null, { status: 204 }));
  }
  return withCors(NextResponse.next());
}

export const config = {
  matcher: ["/api/:path*", "/a2a", "/mcp", "/.well-known/:path*"],
};
