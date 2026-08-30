"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Agent, Thread } from "@agent-comms/hub";
import { identity } from "@/lib/format";
import { HeartbeatBeacon } from "./heartbeat-beacon";
import { callHub, logout } from "./hub-client";
import { useHubLive } from "./use-hub-live";

const NAV = [
  { href: "/", label: "Feed" },
  { href: "/tasks", label: "Tasks" },
  { href: "/leases", label: "Leases" },
  { href: "/messages", label: "Inbox" },
  { href: "/agents", label: "Agents" },
  { href: "/handoffs", label: "Handoffs" },
];

export function Shell({
  me,
  project,
  unread: unreadProp,
  children,
}: {
  me: Agent;
  project?: string;
  unread?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const currentProject = project ?? search.get("project") ?? "";
  const [unread, setUnread] = useState(unreadProp ?? 0);

  const refreshUnread = () => {
    void callHub<Thread[]>("get_inbox", { limit: 80 }).then((threads) => {
      setUnread(threads.reduce((n, t) => n + t.unread, 0));
    });
  };
  useHubLive(refreshUnread);
  useEffect(() => {
    refreshUnread();
  }, []);

  function setProject(next: string) {
    const params = new URLSearchParams(search.toString());
    if (next) params.set("project", next);
    else params.delete("project");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <div className="min-h-screen">
      <HeartbeatBeacon />
      <header className="sticky top-0 z-20 border-b border-ink-700/80 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="font-mono text-sm tracking-tight text-ember">
            agent-comms
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const href = currentProject ? `${item.href}?project=${encodeURIComponent(currentProject)}` : item.href;
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={`rounded-md px-2.5 py-1 ${
                    active ? "bg-ink-800 text-mist-100" : "text-mist-400 hover:text-mist-100"
                  }`}
                >
                  {item.label}
                  {item.href === "/messages" && unread > 0 ? (
                    <span className="ml-1 rounded bg-ember/20 px-1 font-mono text-[10px] text-ember">
                      {unread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-mist-400">
              project
              <input
                defaultValue={currentProject}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setProject(!next || next === "all" || next === "*" ? "" : next);
                  if (!next || next === "all" || next === "*") e.target.value = "";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="all"
                className="w-32 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-mist-100"
              />
            </label>
            <span className="font-mono text-xs text-lake">{identity(me.handle, me.machineLabel)}</span>
            <StatusDot status={me.status} online={me.online} />
            <button
              type="button"
              onClick={() => void logout()}
              className="text-xs text-mist-400 hover:text-mist-100"
            >
              sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

export function StatusDot({ status, online }: { status: Agent["status"]; online?: boolean }) {
  const color =
    status === "working" ? "bg-ember" : status === "blocked" ? "bg-rose" : "bg-mist-500";
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-mist-400">
      <span className={`h-1.5 w-1.5 rounded-full ${online === false ? "bg-ink-600" : color}`} />
      {online === false ? "offline" : status}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-600 bg-ink-900/40 px-4 py-10 text-center">
      <p className="font-medium text-mist-100">{title}</p>
      <p className="mt-1 text-sm text-mist-400">{body}</p>
    </div>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const color =
    type === "completed"
      ? "text-moss border-moss/30"
      : type === "blocked"
        ? "text-rose border-rose/30"
        : type === "handoff"
          ? "text-ember border-ember/30"
          : "text-lake border-lake/30";
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${color}`}>
      {type}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="sticky top-14 z-10 mb-4 rounded-md border border-rose/40 bg-rose/15 px-3 py-2 text-sm text-rose"
    >
      {message}
    </div>
  );
}
