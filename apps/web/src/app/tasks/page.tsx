import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { PageFrame } from "@/components/page-frame";
import { TaskBoard } from "@/components/task-board";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { project } = await searchParams;
  const store = await getStore();
  const tasks = await store.listTasks(session.actor, { project });
  return (
    <PageFrame me={session.agent} project={project}>
      <TaskBoard initial={tasks} meId={session.agent.id} project={project} />
    </PageFrame>
  );
}
