export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isOnline(lastSeen: string, now = Date.now()): boolean {
  const then = new Date(lastSeen).getTime();
  if (Number.isNaN(then)) return false;
  return now - then <= ONLINE_WINDOW_MS;
}

export function withPresence<T extends { lastSeen: string; online?: boolean }>(
  agent: T,
  now = Date.now(),
): T & { online: boolean } {
  return { ...agent, online: isOnline(agent.lastSeen, now) };
}
