"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task } from "@agent-comms/hub";
import { identity } from "@/lib/format";
import { callHub } from "./hub-client";
import { EmptyState, ErrorBanner } from "./shell";
import { useHubLive } from "./use-hub-live";

const COLUMNS = ["open", "claimed", "done"] as const;

export function TaskBoard({
  initial,
  meId,
  project,
}: {
  initial: Task[];
  meId: string;
  project?: string;
}) {
  const [tasks, setTasks] = useState(initial);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void callHub<Task[]>("list_tasks", { project }).then(setTasks);
  }, [project]);
  useHubLive(reload);
  useEffect(() => setTasks(initial), [initial]);

  const grouped = useMemo(
    () => ({
      open: tasks.filter((t) => t.status === "open"),
      claimed: tasks.filter((t) => t.status === "claimed"),
      done: tasks.filter((t) => t.status === "done"),
    }),
    [tasks],
  );

  async function act(tool: string, input: unknown) {
    setError(null);
    try {
      await callHub(tool, input);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "task action failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">Task board</h1>
          <p className="text-sm text-mist-400">Claim before you start. One holder at a time.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="new task title"
            className="w-56 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="optional description"
            className="w-64 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              if (!title.trim()) return;
              void act("create_task", { title, description, project }).then(() => {
                setTitle("");
                setDescription("");
              });
            }}
            className="rounded-md bg-ember px-3 py-1.5 text-sm font-medium text-ink-950"
          >
            add
          </button>
        </div>
      </div>
      <ErrorBanner message={error} />
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <section key={column} className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-mist-400">
              {column} · {grouped[column].length}
            </h2>
            {grouped[column].length === 0 ? (
              <EmptyState title={`No ${column} tasks`} body="Create one or wait for a handoff." />
            ) : (
              <ul className="space-y-2">
                {grouped[column].map((task) => (
                  <li key={task.id} className="rounded-md border border-ink-700 bg-ink-950 p-3">
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.description ? (
                      <p className="mt-1 text-xs text-mist-400">{task.description}</p>
                    ) : null}
                    <p className="mt-2 font-mono text-[11px] text-mist-500">
                      {task.claimant
                        ? identity(task.claimant.handle, task.claimant.machineLabel)
                        : "unclaimed"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {task.status === "open" ||
                      (task.status === "claimed" && task.claimedBy !== meId) ? (
                        <button
                          type="button"
                          onClick={() => void act("claim_task", { taskId: task.id })}
                          className="text-xs text-lake hover:underline"
                        >
                          claim
                        </button>
                      ) : null}
                      {task.status === "claimed" && task.claimedBy === meId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void act("release_task", { taskId: task.id })}
                            className="text-xs text-mist-400 hover:underline"
                          >
                            release
                          </button>
                          <button
                            type="button"
                            onClick={() => void act("complete_task", { taskId: task.id })}
                            className="text-xs text-moss hover:underline"
                          >
                            complete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
