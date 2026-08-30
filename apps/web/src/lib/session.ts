import { cookies } from "next/headers";
import { HubError } from "@agent-comms/hub";
import { getStore } from "./store";

export const SESSION_COOKIE = "hub_session";

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const store = await getStore(token);
  return store.authenticate(token);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new HubError("UNAUTHORIZED", "sign in required");
  }
  return session;
}

export async function getRequestToken(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}
