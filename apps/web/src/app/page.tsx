import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { PageFrame } from "@/components/page-frame";
import { FeedView } from "@/components/feed-view";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { project } = await searchParams;
  const store = await getStore();
  const posts = await store.getRecentActivity(session.actor, { project, limit: 80 });
  return (
    <PageFrame me={session.agent} project={project}>
      <FeedView initial={posts} project={project} />
    </PageFrame>
  );
}
