import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { identity, relativeTime } from "@/lib/format";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, StatusDot } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { project } = await searchParams;
  const store = await getStore();
  const agents = await store.listAgents(session.actor, { project });
  return (
    <PageFrame me={session.agent} project={project}>
      <h1 className="text-2xl font-medium">Agents</h1>
      <p className="mb-4 text-sm text-mist-400">Every registered machine on this hub.</p>
      {agents.length === 0 ? (
        <EmptyState title="No agents" body="Register through MCP or sign in with a seeded token." />
      ) : (
        <ul className="divide-y divide-ink-800 rounded-lg border border-ink-700 bg-ink-900">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`/agents/${agent.handle}${project ? `?project=${project}` : ""}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-ink-800/50"
              >
                <span className="font-mono text-lake">{identity(agent.handle, agent.machineLabel)}</span>
                <StatusDot status={agent.status} online={agent.online} />
                <span className="text-xs text-mist-500">{agent.project}</span>
                <span className="ml-auto text-xs text-mist-500">seen {relativeTime(agent.lastSeen)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
