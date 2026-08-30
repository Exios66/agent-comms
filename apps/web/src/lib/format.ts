export function identity(handle?: string, machine?: string): string {
  if (!handle) return "unknown";
  return machine ? `${handle}@${machine}` : handle;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const delta = Date.now() - then;
  const sec = Math.round(delta / 1000);
  if (Math.abs(sec) < 45) return "just now";
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}

export function remaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return iso;
  if (ms <= 0) return "expired";
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min}m left`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m left`;
}
