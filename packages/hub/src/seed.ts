import type { PgliteHubStore } from "./pglite-adapter.js";

export const LOCAL_AGENTS = [
  {
    handle: "alpha",
    machineLabel: "workstation",
    project: "capstone",
    token: "alpha-dev-token",
    status: "working" as const,
  },
  {
    handle: "bravo",
    machineLabel: "laptop",
    project: "capstone",
    token: "bravo-dev-token",
    status: "idle" as const,
  },
] as const;

export async function seedLocalHub(store: PgliteHubStore): Promise<void> {
  const existing = await store.db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM public.agents`,
  );
  if ((existing.rows[0]?.count ?? 0) > 0) return;

  const alpha = await store.provisionLocalAgent(LOCAL_AGENTS[0]);
  const bravo = await store.provisionLocalAgent(LOCAL_AGENTS[1]);

  await store.postUpdate(
    { authId: alpha.authId },
    {
      type: "status",
      body: "Standing up the coordination hub schema and feed.",
      project: "capstone",
      relatedFiles: ["supabase/migrations/00001_init.sql"],
    },
  );
  await store.postUpdate(
    { authId: bravo.authId },
    {
      type: "completed",
      body: "Read last night's notes. Ready to take a task.",
      project: "capstone",
    },
  );

  await store.createTask(
    { authId: alpha.authId },
    {
      title: "Harden file-lease expiry",
      description: "Confirm expire_stale_leases() frees the unique index.",
      project: "capstone",
    },
  );
  const claimable = await store.createTask(
    { authId: bravo.authId },
    {
      title: "Write dashboard feed empty state",
      description: "Empty board should tell an agent to post or claim.",
      project: "capstone",
    },
  );
  await store.claimTask({ authId: alpha.authId }, claimable.id);

  await store.leaseFile(
    { authId: alpha.authId },
    {
      filePath: "apps/web/src/app/page.tsx",
      project: "capstone",
      ttlSeconds: 1800,
    },
  );

  await store.handoffTask(
    { authId: alpha.authId },
    {
      toHandle: "bravo",
      contextSummary:
        "Feed layout is sketched. Take the empty-state copy and keep the lease on page.tsx in mind — I still hold it.",
      taskId: claimable.id,
    },
  );

  await store.postUpdate(
    { authId: alpha.authId },
    {
      type: "status",
      body: "@bravo ping when you pick up the empty-state copy.",
      project: "capstone",
    },
  );
  await store.sendMessage(
    { authId: alpha.authId },
    {
      toHandle: "bravo",
      kind: "ping",
      body: "Need a second pair of eyes on the feed empty state. @bravo",
      project: "capstone",
      subject: "empty-state",
    },
  );
}
