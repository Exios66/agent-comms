"use client";

import { useCallback, useEffect, useState } from "react";
import type { Agent, Handoff, Task } from "@agent-comms/hub";
import { identity, relativeTime } from "@/lib/format";
import { callHub } from "./hub-client";
import { EmptyState, ErrorBanner } from "./shell";
import { useHubLive } from "./use-hub-live";

export function HandoffInbox({
  initial,
  me,
  agents,
  tasks,
}: {
  initial: Handoff[];
  me: Agent;
  agents: Agent[];
  tasks: Task[];
}) {
  const [handoffs, setHandoffs] = useState(initial);
  const [toHandle, setToHandle] = useState(agents.find((a) => a.id !== me.id)?.handle ?? "");
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [context, setContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initial[0]?.id ?? null);

  const reload = useCallback(() => {
    void callHub<Handoff[]>("get_handoffs", { limit: 50 }).then(setHandoffs);
  }, []);
  useHubLive(reload);
  useEffect(() => setHandoffs(initial), [initial]);

  async function send() {
    setError(null);
    try {
      await callHub("handoff_task", {
        toHandle,
        contextSummary: context,
        taskId: taskId || undefined,
      });
      setContext("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "handoff failed");
    }
  }

  const incoming = handoffs.filter((h) => h.toAgent === me.id || h.to?.id === me.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <h1 className="text-2xl font-medium">Handoffs</h1>
        <p className="mb-4 text-sm text-mist-400">Full context for the receiving agent — not just a status ping.</p>
        <ErrorBanner message={error} />
        {handoffs.length === 0 ? (
          <EmptyState title="No handoffs" body="When you pass work across machines, the write-up lands here." />
        ) : (
          <ul className="space-y-2">
            {handoffs.map((handoff) => {
              const incomingRow = handoff.toAgent === me.id || handoff.to?.id === me.id;
              return (
                <li key={handoff.id} className="rounded-lg border border-ink-700 bg-ink-900">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === handoff.id ? null : handoff.id)}
                    className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
                  >
                    <span className="font-mono text-xs text-lake">
                      {identity(handoff.from?.handle, handoff.from?.machineLabel)}
                    </span>
                    <span className="text-mist-500">→</span>
                    <span className="font-mono text-xs text-ember">
                      {identity(handoff.to?.handle, handoff.to?.machineLabel)}
                    </span>
                    {incomingRow ? (
                      <span className="rounded bg-ember/15 px-1.5 py-0.5 text-[10px] uppercase text-ember">
                        inbox
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-mist-500">{relativeTime(handoff.createdAt)}</span>
                  </button>
                  {openId === handoff.id ? (
                    <div className="border-t border-ink-800 px-4 py-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{handoff.contextSummary}</p>
                      {handoff.task ? (
                        <p className="mt-2 text-xs text-mist-400">task: {handoff.task.title}</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {incoming.length === 0 ? (
          <p className="mt-4 text-xs text-mist-500">Nothing in your inbox right now.</p>
        ) : null}
      </section>
      <aside className="h-fit rounded-lg border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-medium">Hand off work</h2>
        <label className="mt-3 block text-xs text-mist-400">
          to
          <select
            value={toHandle}
            onChange={(e) => setToHandle(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
          >
            {agents
              .filter((a) => a.id !== me.id)
              .map((agent) => (
                <option key={agent.id} value={agent.handle}>
                  {identity(agent.handle, agent.machineLabel)}
                </option>
              ))}
          </select>
        </label>
        <label className="mt-3 block text-xs text-mist-400">
          task (optional)
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
          >
            <option value="">none — context only</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={6}
          maxLength={4096}
          placeholder="What they need to know to continue."
          className="mt-3 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={!context.trim() || !toHandle}
          onClick={() => void send()}
          className="mt-3 w-full rounded-md bg-ember px-3 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-50"
        >
          send handoff
        </button>
      </aside>
    </div>
  );
}
