export async function callHub<T = unknown>(tool: string, input: unknown = {}): Promise<T> {
  const response = await fetch("/api/hub", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, input }),
  });
  const payload = (await response.json()) as { result?: T; error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `request failed (${response.status})`);
  }
  return payload.result as T;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}
