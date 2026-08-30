import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { PageFrame } from "@/components/page-frame";
import { MessagesView } from "@/components/messages-view";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { project } = await searchParams;
  const store = await getStore();
  const [threads, agents] = await Promise.all([
    store.getInbox(session.actor, { project, limit: 80 }),
    store.listAgents(session.actor, { project }),
  ]);
  return (
    <PageFrame me={session.agent} project={project} unread={threads.reduce((n, t) => n + t.unread, 0)}>
      <MessagesView initial={threads} me={session.agent} agents={agents} project={project} />
    </PageFrame>
  );
}
