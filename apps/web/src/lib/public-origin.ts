/** Public origin for Agent Card / A2A links. Prefer forwarded Host over bind address. */
export function publicOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ||
    (host?.includes("trycloudflare.com") ? "https" : new URL(request.url).protocol.replace(":", ""));
  if (host && !host.startsWith("0.0.0.0") && !host.startsWith("127.0.0.1")) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  const configured = process.env.HUB_PUBLIC_URL || process.env.HUB_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}
