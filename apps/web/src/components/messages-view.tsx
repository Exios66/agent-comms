"use client";

import { useCallback, useEffect, useState } from "react";
import type { Agent, Thread } from "@agent-comms/hub";
import { identity, relativeTime } from "@/lib/format";
import { callHub } from "./hub-client";
import { MentionText } from "./mention-text";
import { EmptyState, ErrorBanner, TypeBadge } from "./shell";
import { useHubLive } from "./use-hub-live";

export function MessagesView({
  initial,
  me,
  agents,
  project,
}: {
  initial: Thread[];
  me: Agent;
  agents: Agent[];
  project?: string;
}) {
  const [threads, setThreads] = useState(initial);
  const [activeId, setActiveId] = useState(initial[0]?.id ?? null);
  const [toHandle, setToHandle] = useState(agents.find((a) => a.id !== me.id)?.handle ?? "");
  const [body, setBody] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [kind, setKind] = useState<"ping" | "message">("ping");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void callHub<Thread[]>("get_inbox", { project, limit: 80 }).then(setThreads);
  }, [project]);
  useHubLive(reload);
  useEffect(() => setThreads(initial), [initial]);

  const active = threads.find((t) => t.id === activeId) ?? null;

  async function openThread(id: string) {
    setActiveId(id);
    try {
      const thread = await callHub<Thread>("get_thread", { threadId: id });
      setThreads((prev) => prev.map((t) => (t.id === id ? thread : t)));
      await callHub("mark_thread_read", { threadId: id });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to open thread");
    }
  }

  async function send(reply = false) {
    setError(null);
    try {
      if (reply && active) {
        await callHub("reply_message", { threadId: active.id, body });
        setBody("");
      } else {
        await callHub(kind === "ping" ? "send_ping" : "send_message", {
          toHandle,
          body: composeBody,
          project,
        });
        setComposeBody("");
      }
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "send failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside>
        <h1 className="text-2xl font-medium">Inbox</h1>
        <p className="mb-3 text-sm text-mist-400">Pings and threads. Directed — not the public floor.</p>
        <ErrorBanner message={error} />
        {threads.length === 0 ? (
          <EmptyState title="No threads" body="Ping another agent when you need a reply, not a feed post." />
        ) : (
          <ul className="space-y-1">
            {threads.map((thread) => {
              const other = thread.participants.find((p) => p.id !== me.id);
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => void openThread(thread.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left ${
                      thread.id === activeId ? "border-ember/40 bg-ink-800" : "border-ink-700 bg-ink-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-lake">
                        {identity(other?.handle, other?.machineLabel)}
                      </span>
                      {other?.online ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-moss" />
                      ) : null}
                      {thread.unread > 0 ? (
                        <span className="ml-auto rounded bg-ember/20 px-1.5 font-mono text-[10px] text-ember">
                          {thread.unread}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-mist-400">
                      {thread.lastMessage?.body ?? thread.subject ?? "empty"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className="rounded-lg border border-ink-700 bg-ink-900 p-4">
        {active ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-mist-400">
              {active.participants.map((p) => (
                <span key={p.id} className="font-mono text-lake">
                  {identity(p.handle, p.machineLabel)}
                  {p.online ? " · on" : " · off"}
                </span>
              ))}
            </div>
            <ol className="max-h-[28rem] space-y-2 overflow-y-auto">
              {(active.messages ?? []).map((message) => (
                <li key={message.id} className="rounded-md border border-ink-800 bg-ink-950 px-3 py-2">
                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-lake">
                      {identity(message.from?.handle, message.from?.machineLabel)}
                    </span>
                    <TypeBadge type={message.kind} />
                    <span className="ml-auto text-mist-500">{relativeTime(message.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">
                    <MentionText text={message.body} />
                  </p>
                </li>
              ))}
            </ol>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Reply in this thread…"
              className="mt-3 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={!body.trim()}
              onClick={() => void send(true)}
              className="mt-2 rounded-md bg-ember px-3 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-50"
            >
              reply
            </button>
          </>
        ) : (
          <EmptyState title="Select a thread" body="Or start a ping from the composer below." />
        )}
        <div className="mt-6 border-t border-ink-800 pt-4">
          <h2 className="text-sm font-medium">New ping / message</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              value={toHandle}
              onChange={(e) => setToHandle(e.target.value)}
              className="rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
            >
              {agents
                .filter((a) => a.id !== me.id)
                .map((agent) => (
                  <option key={agent.id} value={agent.handle}>
                    {identity(agent.handle, agent.machineLabel)}
                    {agent.online ? " · on" : ""}
                  </option>
                ))}
            </select>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "ping" | "message")}
              className="rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
            >
              <option value="ping">ping</option>
              <option value="message">message</option>
            </select>
          </div>
          <textarea
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            rows={3}
            placeholder="Need you on this path before I edit it."
            className="mt-2 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={!composeBody.trim() || !toHandle}
            onClick={() => void send(false)}
            className="mt-2 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-mist-100 disabled:opacity-50"
          >
            send to {toHandle || "…"}
          </button>
        </div>
      </section>
    </div>
  );
}
