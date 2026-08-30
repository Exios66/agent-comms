"use client";

import { useCallback, useEffect, useState } from "react";
import type { FileLease } from "@agent-comms/hub";
import { identity, remaining } from "@/lib/format";
import { callHub } from "./hub-client";
import { EmptyState, ErrorBanner } from "./shell";
import { useHubLive } from "./use-hub-live";

export function LeaseBoard({
  initial,
  meId,
  project,
}: {
  initial: FileLease[];
  meId: string;
  project?: string;
}) {
  const [leases, setLeases] = useState(initial);
  const [filePath, setFilePath] = useState("");
  const [ttl, setTtl] = useState(1800);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void callHub<FileLease[]>("list_leases", { project }).then(setLeases);
  }, [project]);
  useHubLive(reload);
  useEffect(() => setLeases(initial), [initial]);

  const stale = leases.filter((lease) => new Date(lease.expiresAt).getTime() <= Date.now());
  const soon = leases.filter((lease) => {
    const ms = new Date(lease.expiresAt).getTime() - Date.now();
    return ms > 0 && ms < 2 * 60 * 1000;
  });

  async function act(tool: string, input: unknown) {
    setError(null);
    try {
      await callHub(tool, input);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "lease action failed");
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-medium">File leases</h1>
        <p className="text-sm text-mist-400">
          Advisory locks. Check before you edit; they auto-expire so a dead machine cannot hold a path forever.
        </p>
      </div>
      {stale.length > 0 || soon.length > 0 ? (
        <div className="mb-4 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
          {stale.length > 0
            ? `${stale.length} lease${stale.length === 1 ? "" : "s"} expired — sweep to free the path.`
            : `${soon.length} lease${soon.length === 1 ? "" : "s"} expire in under two minutes.`}
        </div>
      ) : null}
      <ErrorBanner message={error} />
      <div className="mb-6 flex flex-wrap gap-2">
        <input
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="apps/web/src/app/page.tsx"
          className="min-w-64 flex-1 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-sm"
        />
        <input
          type="number"
          min={5}
          max={86400}
          value={ttl}
          onChange={(e) => setTtl(Number(e.target.value))}
          className="w-28 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => {
            const path = filePath.trim();
            if (!path) return;
            const held = leases.find((lease) => lease.filePath === path);
            if (held && held.heldBy !== meId) {
              setError(
                `file leased by ${identity(held.holder?.handle, held.holder?.machineLabel)} until ${held.expiresAt}`,
              );
              return;
            }
            void act("lease_file", { filePath: path, project, ttlSeconds: ttl });
          }}
          className="rounded-md bg-ember px-3 py-1.5 text-sm font-medium text-ink-950"
        >
          lease
        </button>
        <button
          type="button"
          onClick={() => void act("expire_leases", {})}
          className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-mist-100"
        >
          sweep expired
        </button>
      </div>
      {leases.length === 0 ? (
        <EmptyState title="No active leases" body="Lease a path before editing so the other agent backs off." />
      ) : (
        <ul className="divide-y divide-ink-800 rounded-lg border border-ink-700 bg-ink-900">
          {leases.map((lease) => (
            <li key={lease.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{lease.filePath}</p>
                <p className="text-xs text-mist-400">
                  {identity(lease.holder?.handle, lease.holder?.machineLabel)} · {lease.project} ·{" "}
                  {remaining(lease.expiresAt)}
                </p>
              </div>
              {lease.heldBy === meId ? (
                <button
                  type="button"
                  onClick={() => void act("release_file", { leaseId: lease.id })}
                  className="text-xs text-mist-400 hover:underline"
                >
                  release
                </button>
              ) : (
                <span className="text-xs text-rose">held</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
