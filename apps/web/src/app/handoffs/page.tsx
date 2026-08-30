import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { PageFrame } from "@/components/page-frame";
import { HandoffInbox } from "@/components/handoff-inbox";

export const dynamic = "force-dynamic";

export default async function HandoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { project } = await searchParams;
  const store = await getStore();
  const [handoffs, agents, tasks] = await Promise.all([
    store.getHandoffs(session.actor, { limit: 50 }),
    store.listAgents(session.actor, { project }),
    store.listTasks(session.actor, { project }),
  ]);
  return (
    <PageFrame me={session.agent} project={project}>
      <HandoffInbox
        initial={handoffs}
        me={session.agent}
        agents={agents}
        tasks={tasks.filter((t) => t.claimedBy === session.agent.id && t.status === "claimed")}
      />
    </PageFrame>
  );
}
