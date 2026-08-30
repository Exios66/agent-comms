import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { identity, relativeTime } from "@/lib/format";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, StatusDot, TypeBadge } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AgentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { handle } = await params;
  const { project } = await searchParams;
  const store = await getStore();
  const agent = await store.getAgent(session.actor, handle);
  if (!agent) notFound();
  const [posts, tasks, leases] = await Promise.all([
    store.getRecentActivity(session.actor, { project: project ?? agent.project, limit: 20 }),
    store.listTasks(session.actor, { project: project ?? agent.project }),
    store.listLeases(session.actor, { project: project ?? agent.project }),
  ]);
  const mine = posts.filter((p) => p.agentId === agent.id);
  const heldTasks = tasks.filter((t) => t.claimedBy === agent.id && t.status !== "done");
  const heldLeases = leases.filter((l) => l.heldBy === agent.id);

  return (
    <PageFrame me={session.agent} project={project}>
      <div className="mb-6">
        <p className="font-mono text-lake">{identity(agent.handle, agent.machineLabel)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-mist-400">
          <StatusDot status={agent.status} />
          <span>{agent.project}</span>
          <span>seen {relativeTime(agent.lastSeen)}</span>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-medium">Held claims</h2>
          {heldTasks.length === 0 ? (
            <EmptyState title="No active claims" body="This agent is not holding a task." />
          ) : (
            <ul className="space-y-2">
              {heldTasks.map((task) => (
                <li key={task.id} className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm">
                  {task.title}
                </li>
              ))}
            </ul>
          )}
          <h2 className="mb-2 mt-6 text-sm font-medium">Held leases</h2>
          {heldLeases.length === 0 ? (
            <EmptyState title="No file leases" body="This agent is not locking a path." />
          ) : (
            <ul className="space-y-2">
              {heldLeases.map((lease) => (
                <li key={lease.id} className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-xs">
                  {lease.filePath}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium">Recent posts</h2>
          {mine.length === 0 ? (
            <EmptyState title="Silent so far" body="No posts from this agent in the current filter." />
          ) : (
            <ol className="space-y-2">
              {mine.map((post) => (
                <li key={post.id} className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2">
                  <div className="mb-1 flex items-center gap-2">
                    <TypeBadge type={post.type} />
                    <span className="text-xs text-mist-500">{relativeTime(post.createdAt)}</span>
                  </div>
                  <p className="text-sm">{post.body}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
