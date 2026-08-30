import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HubError } from "../src/errors.js";
import { PgliteHubStore } from "../src/pglite-adapter.js";
import { seedLocalHub } from "../src/seed.js";
import { dispatchHubTool } from "../src/tools.js";

let store: PgliteHubStore | undefined;

beforeEach(async () => {
  store = await PgliteHubStore.open({ dataDir: undefined });
  await seedLocalHub(store);
});

afterEach(async () => {
  await store?.close();
});

describe("auth and seed", () => {
  it("authenticates seeded local tokens", async () => {
    const session = await store.authenticate("alpha-dev-token");
    expect(session?.agent.handle).toBe("alpha");
    expect(session?.agent.machineLabel).toBe("workstation");
    expect(await store.authenticate("nope-nope-nope")).toBeNull();
  });

  it("seeds feed, tasks, a lease, and a handoff", async () => {
    const alpha = await store.authenticate("alpha-dev-token");
    const posts = await store.getRecentActivity(alpha!.actor);
    expect(posts.length).toBeGreaterThanOrEqual(2);
    const tasks = await store.listTasks(alpha!.actor, { project: "capstone" });
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    const leases = await store.listLeases(alpha!.actor);
    expect(leases.some((l) => l.filePath.includes("page.tsx"))).toBe(true);
    const handoffs = await store.getHandoffs(alpha!.actor);
    expect(handoffs[0]?.to?.handle ?? handoffs[0]?.toAgent).toBeTruthy();
  });
});

describe("tasks", () => {
  it("prevents a second agent from claiming the same task", async () => {
    const alpha = (await store.authenticate("alpha-dev-token"))!;
    const bravo = (await store.authenticate("bravo-dev-token"))!;
    const task = await store.createTask(alpha.actor, {
      title: "Only one owner",
      project: "capstone",
    });
    const claimed = await store.claimTask(alpha.actor, task.id);
    expect(claimed.status).toBe("claimed");
    await expect(store.claimTask(bravo.actor, task.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const after = await store.listTasks(bravo.actor);
    const row = after.find((t) => t.id === task.id);
    expect(row?.claimant?.handle ?? row?.claimedBy).toBeTruthy();
    expect(row?.status).toBe("claimed");
  });

  it("forbids releasing someone else's task", async () => {
    const alpha = (await store.authenticate("alpha-dev-token"))!;
    const bravo = (await store.authenticate("bravo-dev-token"))!;
    const task = await store.createTask(alpha.actor, { title: "Held by alpha" });
    await store.claimTask(alpha.actor, task.id);
    await expect(store.releaseTask(bravo.actor, task.id)).rejects.toBeInstanceOf(HubError);
  });
});

describe("file leases", () => {
  it("rejects a second lease on the same path", async () => {
    const alpha = (await store.authenticate("alpha-dev-token"))!;
    const bravo = (await store.authenticate("bravo-dev-token"))!;
    await store.leaseFile(alpha.actor, {
      filePath: "apps/web/src/lib/session.ts",
      ttlSeconds: 600,
    });
    await expect(
      store.leaseFile(bravo.actor, { filePath: "apps/web/src/lib/session.ts" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("frees a path after expiry", async () => {
    const alpha = (await store.authenticate("alpha-dev-token"))!;
    const bravo = (await store.authenticate("bravo-dev-token"))!;
    await store.leaseFile(alpha.actor, {
      filePath: "packages/hub/src/store.ts",
      ttlSeconds: 5,
    });
    await store.db.query(
      `UPDATE public.file_leases
       SET expires_at = now() - interval '1 second'
       WHERE file_path = $1 AND released_at IS NULL`,
      ["packages/hub/src/store.ts"],
    );
    const expired = await store.expireStaleLeases();
    expect(expired).toBeGreaterThanOrEqual(1);
    const leased = await store.leaseFile(bravo.actor, {
      filePath: "packages/hub/src/store.ts",
    });
    expect(leased.heldBy).toBe(bravo.agent.id);
  });
});

describe("handoffs and tools", () => {
  it("transfers a claimed task with full context", async () => {
    const alpha = (await store.authenticate("alpha-dev-token"))!;
    const bravo = (await store.authenticate("bravo-dev-token"))!;
    const task = await store.createTask(alpha.actor, { title: "Pass this over" });
    await store.claimTask(alpha.actor, task.id);
    const handoff = await store.handoffTask(alpha.actor, {
      toHandle: "bravo",
      taskId: task.id,
      contextSummary: "Take the lease sweep next. Do not touch PII.",
    });
    expect(handoff.to?.handle).toBe("bravo");
    const tasks = await store.listTasks(bravo.actor);
    expect(tasks.find((t) => t.id === task.id)?.claimedBy).toBe(bravo.agent.id);
  });

  it("dispatches MCP tool names", async () => {
    const alpha = (await store.authenticate("alpha-dev-token"))!;
    const post = await dispatchHubTool(store, alpha.actor, "post_update", {
      type: "status",
      body: "Tool path works.",
    });
    expect((post as { body: string }).body).toBe("Tool path works.");
  });
});
