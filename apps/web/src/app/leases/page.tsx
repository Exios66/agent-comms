import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { PageFrame } from "@/components/page-frame";
import { LeaseBoard } from "@/components/lease-board";

export const dynamic = "force-dynamic";

export default async function LeasesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { project } = await searchParams;
  const store = await getStore();
  const leases = await store.listLeases(session.actor, { project });
  return (
    <PageFrame me={session.agent} project={project}>
      <LeaseBoard initial={leases} meId={session.agent.id} project={project} />
    </PageFrame>
  );
}
