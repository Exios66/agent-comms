import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { HubError } from "./errors.js";
import {
  mapAgent,
  mapHandoff,
  mapLease,
  mapPost,
  mapTask,
  type AgentRow,
  type HandoffRow,
  type LeaseRow,
  type PostRow,
  type TaskRow,
} from "./mappers.js";
import { mapPgError } from "./pg-errors.js";
import { findRepoRoot, migrationsDir } from "./paths.js";
import { HubRealtime } from "./realtime.js";
import { DEFAULT_LEASE_TTL_SECONDS, type HubStore } from "./store.js";
import type {
  Agent,
  CreateTaskInput,
  FileLease,
  Handoff,
  HandoffTaskInput,
  HeartbeatInput,
  HubActor,
  LeaseFileInput,
  ListQuery,
  Post,
  PostUpdateInput,
  RegisterAgentInput,
  Session,
  Task,
} from "./types.js";

const PGLITE_BOOTSTRAP_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.gen_random_uuid()
RETURNS uuid
LANGUAGE sql
AS $$
  SELECT uuid_in(
    overlay(
      overlay(md5(random()::text || clock_timestamp()::text) placing '4' from 13)
      placing 'a' from 17
    )::cstring
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;

GRANT authenticated TO CURRENT_USER;
GRANT anon TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
`;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface PgliteHubOptions {
  dataDir?: string;
  migrate?: boolean;
  realtime?: HubRealtime;
}

export class PgliteHubStore implements HubStore {
  readonly realtime: HubRealtime;
  private constructor(
    readonly db: PGlite,
    realtime: HubRealtime,
  ) {
    this.realtime = realtime;
  }

  static async open(options: PgliteHubOptions = {}): Promise<PgliteHubStore> {
    const db = options.dataDir ? new PGlite(options.dataDir) : new PGlite();
    await db.waitReady;
    if (options.migrate !== false) {
      await applyMigrations(db);
    }
    return new PgliteHubStore(db, options.realtime ?? new HubRealtime());
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async authenticate(token: string): Promise<Session | null> {
    const hash = hashToken(token);
    const found = await this.db.query<{ auth_id: string }>(
      `SELECT auth_id FROM public.agent_tokens WHERE token_hash = $1`,
      [hash],
    );
    const authId = found.rows[0]?.auth_id;
    if (!authId) return null;
    const agent = await this.loadAgentByAuth(authId);
    if (!agent) return null;
    return { actor: { authId }, agent };
  }

  async registerAgent(actor: HubActor, input: RegisterAgentInput): Promise<Agent> {
    return this.asActor(actor, "agents", "UPDATE", async () => {
      const existing = await this.currentAgent();
      if (existing) {
        const updated = await this.db.query<AgentRow>(
          `UPDATE public.agents
           SET handle = $2, machine_label = $3, project = $4,
               status = COALESCE($5, status), last_seen = now()
           WHERE auth_id = $1
           RETURNING *`,
          [actor.authId, input.handle, input.machineLabel, input.project, input.status ?? null],
        );
        return mapAgent(required(updated.rows[0], "agent"));
      }
      const inserted = await this.db.query<AgentRow>(
        `INSERT INTO public.agents (auth_id, handle, machine_label, project, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          actor.authId,
          input.handle,
          input.machineLabel,
          input.project,
          input.status ?? "idle",
        ],
      );
      return mapAgent(required(inserted.rows[0], "agent"));
    });
  }

  async heartbeat(actor: HubActor, input: HeartbeatInput): Promise<Agent> {
    return this.asActor(actor, "agents", "UPDATE", async () => {
      const updated = await this.db.query<AgentRow>(
        `UPDATE public.agents
         SET last_seen = now(),
             status = COALESCE($2, status),
             project = COALESCE($3, project)
         WHERE auth_id = $1
         RETURNING *`,
        [actor.authId, input.status ?? null, input.project ?? null],
      );
      return mapAgent(required(updated.rows[0], "agent"));
    });
  }

  async getAgent(actor: HubActor, handle: string): Promise<Agent | null> {
    return this.asActor(actor, null, null, async () => {
      const rows = await this.db.query<AgentRow>(
        `SELECT * FROM public.agents WHERE handle = $1`,
        [handle],
      );
      return rows.rows[0] ? mapAgent(rows.rows[0]) : null;
    });
  }

  async listAgents(actor: HubActor, query: ListQuery = {}): Promise<Agent[]> {
    return this.asActor(actor, null, null, async () => {
      const rows = query.project
        ? await this.db.query<AgentRow>(
            `SELECT * FROM public.agents WHERE project = $1 ORDER BY handle`,
            [query.project],
          )
        : await this.db.query<AgentRow>(`SELECT * FROM public.agents ORDER BY handle`);
      return rows.rows.map(mapAgent);
    });
  }

  async postUpdate(actor: HubActor, input: PostUpdateInput): Promise<Post> {
    return this.asActor(actor, "posts", "INSERT", async () => {
      const agent = await this.requireCurrentAgent();
      const inserted = await this.db.query<PostRow>(
        `INSERT INTO public.posts (agent_id, project, type, body, related_files)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          agent.id,
          input.project ?? agent.project,
          input.type,
          input.body,
          input.relatedFiles ?? [],
        ],
      );
      return mapPost(required(inserted.rows[0], "post"), agent);
    });
  }

  async getRecentActivity(actor: HubActor, query: ListQuery = {}): Promise<Post[]> {
    return this.asActor(actor, null, null, async () => {
      const limit = query.limit ?? 50;
      const rows = query.project
        ? await this.db.query<PostRow & AgentRow & { agent_id: string }>(
            `SELECT p.*, a.id AS agent_pk, a.auth_id, a.handle, a.machine_label,
                    a.project AS agent_project, a.status, a.last_seen,
                    a.created_at AS agent_created_at
             FROM public.posts p
             JOIN public.agents a ON a.id = p.agent_id
             WHERE p.project = $1
             ORDER BY p.created_at DESC
             LIMIT $2`,
            [query.project, limit],
          )
        : await this.db.query<PostRow & Record<string, string>>(
            `SELECT p.*, a.auth_id, a.handle, a.machine_label,
                    a.project AS agent_project, a.status, a.last_seen,
                    a.created_at AS agent_created_at
             FROM public.posts p
             JOIN public.agents a ON a.id = p.agent_id
             ORDER BY p.created_at DESC
             LIMIT $1`,
            [limit],
          );
      return rows.rows.map((row) =>
        mapPost(row, mapAgent({
          id: row.agent_id,
          auth_id: row.auth_id,
          handle: row.handle,
          machine_label: row.machine_label,
          project: row.agent_project,
          status: row.status,
          last_seen: row.last_seen,
          created_at: row.agent_created_at,
        })),
      );
    });
  }

  async createTask(actor: HubActor, input: CreateTaskInput): Promise<Task> {
    return this.asActor(actor, "tasks", "INSERT", async () => {
      const agent = await this.requireCurrentAgent();
      const inserted = await this.db.query<TaskRow>(
        `INSERT INTO public.tasks (project, title, description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.project ?? agent.project, input.title, input.description ?? ""],
      );
      return mapTask(required(inserted.rows[0], "task"));
    });
  }

  async listTasks(actor: HubActor, query: ListQuery = {}): Promise<Task[]> {
    return this.asActor(actor, null, null, async () => {
      const rows = query.project
        ? await this.db.query<TaskRow>(
            `SELECT * FROM public.tasks WHERE project = $1 ORDER BY created_at DESC`,
            [query.project],
          )
        : await this.db.query<TaskRow>(
            `SELECT * FROM public.tasks ORDER BY created_at DESC`,
          );
      const agents = await this.agentMap();
      return rows.rows.map((row) =>
        mapTask(row, row.claimed_by ? agents.get(row.claimed_by) ?? null : null),
      );
    });
  }

  async claimTask(actor: HubActor, taskId: string): Promise<Task> {
    return this.asActor(actor, "tasks", "UPDATE", async () => {
      const agent = await this.requireCurrentAgent();
      const updated = await this.db.query<TaskRow>(
        `UPDATE public.tasks
         SET claimed_by = $2, status = 'claimed'
         WHERE id = $1 AND status = 'open' AND claimed_by IS NULL
         RETURNING *`,
        [taskId, agent.id],
      );
      if (updated.rows[0]) return mapTask(updated.rows[0], agent);

      const existing = await this.db.query<TaskRow>(
        `SELECT * FROM public.tasks WHERE id = $1`,
        [taskId],
      );
      const task = existing.rows[0];
      if (!task) throw new HubError("NOT_FOUND", "task not found");
      if (task.claimed_by === agent.id) return mapTask(task, agent);
      const holder = task.claimed_by
        ? await this.loadAgentById(task.claimed_by)
        : null;
      throw new HubError(
        "CONFLICT",
        holder
          ? `task already claimed by ${holder.handle}@${holder.machineLabel}`
          : "task is not open",
        { status: task.status, claimedBy: holder?.handle },
      );
    });
  }

  async releaseTask(actor: HubActor, taskId: string): Promise<Task> {
    return this.asActor(actor, "tasks", "UPDATE", async () => {
      const agent = await this.requireCurrentAgent();
      const updated = await this.db.query<TaskRow>(
        `UPDATE public.tasks
         SET claimed_by = NULL, status = 'open'
         WHERE id = $1 AND claimed_by = $2 AND status = 'claimed'
         RETURNING *`,
        [taskId, agent.id],
      );
      if (!updated.rows[0]) {
        throw new HubError("FORBIDDEN", "you can only release a task you currently hold");
      }
      return mapTask(updated.rows[0]);
    });
  }

  async completeTask(actor: HubActor, taskId: string): Promise<Task> {
    return this.asActor(actor, "tasks", "UPDATE", async () => {
      const agent = await this.requireCurrentAgent();
      const updated = await this.db.query<TaskRow>(
        `UPDATE public.tasks
         SET status = 'done'
         WHERE id = $1 AND claimed_by = $2 AND status IN ('claimed', 'done')
         RETURNING *`,
        [taskId, agent.id],
      );
      if (!updated.rows[0]) {
        throw new HubError("FORBIDDEN", "you can only complete a task you currently hold");
      }
      return mapTask(updated.rows[0], agent);
    });
  }

  async leaseFile(actor: HubActor, input: LeaseFileInput): Promise<FileLease> {
    return this.asActor(actor, "file_leases", "INSERT", async () => {
      await this.db.query(`SELECT public.expire_stale_leases()`);
      const agent = await this.requireCurrentAgent();
      const ttl = input.ttlSeconds ?? DEFAULT_LEASE_TTL_SECONDS;
      const project = input.project ?? agent.project;
      const existing = await this.db.query<LeaseRow>(
        `SELECT * FROM public.file_leases
         WHERE project = $1 AND file_path = $2 AND released_at IS NULL`,
        [project, input.filePath],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        const holder = await this.loadAgentById(row.held_by);
        if (holder?.id === agent.id) {
          throw new HubError("CONFLICT", "you already hold a lease on this file", {
            leaseId: row.id,
            expiresAt: row.expires_at,
          });
        }
        throw new HubError(
          "CONFLICT",
          holder
            ? `file leased by ${holder.handle}@${holder.machineLabel} until ${new Date(row.expires_at).toISOString()}`
            : "file is already leased",
          { heldBy: holder?.handle, expiresAt: row.expires_at },
        );
      }
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      try {
        const inserted = await this.db.query<LeaseRow>(
          `INSERT INTO public.file_leases (project, file_path, held_by, expires_at)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [project, input.filePath, agent.id, expiresAt],
        );
        return mapLease(required(inserted.rows[0], "lease"), agent);
      } catch (error) {
        mapPgError(error);
      }
    });
  }

  async releaseFile(actor: HubActor, leaseId: string): Promise<FileLease> {
    return this.asActor(actor, "file_leases", "UPDATE", async () => {
      const agent = await this.requireCurrentAgent();
      const updated = await this.db.query<LeaseRow>(
        `UPDATE public.file_leases
         SET released_at = now()
         WHERE id = $1 AND held_by = $2 AND released_at IS NULL
         RETURNING *`,
        [leaseId, agent.id],
      );
      if (!updated.rows[0]) {
        throw new HubError("FORBIDDEN", "you can only release a lease you currently hold");
      }
      return mapLease(updated.rows[0], agent);
    });
  }

  async listLeases(actor: HubActor, query: ListQuery = {}): Promise<FileLease[]> {
    return this.asActor(actor, null, null, async () => {
      await this.db.query(`SELECT public.expire_stale_leases()`);
      const rows = query.project
        ? await this.db.query<LeaseRow>(
            `SELECT * FROM public.file_leases
             WHERE project = $1 AND released_at IS NULL
             ORDER BY acquired_at DESC`,
            [query.project],
          )
        : await this.db.query<LeaseRow>(
            `SELECT * FROM public.file_leases
             WHERE released_at IS NULL
             ORDER BY acquired_at DESC`,
          );
      const agents = await this.agentMap();
      return rows.rows.map((row) => mapLease(row, agents.get(row.held_by)));
    });
  }

  async expireStaleLeases(): Promise<number> {
    const result = await this.db.query<{ expire_stale_leases: number }>(
      `SELECT public.expire_stale_leases()`,
    );
    const n = Number(result.rows[0]?.expire_stale_leases ?? 0);
    if (n > 0) {
      this.realtime.emitChange({ table: "file_leases", eventType: "UPDATE" });
    }
    return n;
  }

  async handoffTask(actor: HubActor, input: HandoffTaskInput): Promise<Handoff> {
    return this.asActor(actor, "handoffs", "INSERT", async () => {
      const from = await this.requireCurrentAgent();
      const toRows = await this.db.query<AgentRow>(
        `SELECT * FROM public.agents WHERE handle = $1`,
        [input.toHandle],
      );
      const to = toRows.rows[0] ? mapAgent(toRows.rows[0]) : null;
      if (!to) throw new HubError("NOT_FOUND", `agent ${input.toHandle} not found`);
      if (to.id === from.id) {
        throw new HubError("VALIDATION", "cannot hand off a task to yourself");
      }

      let task: Task | null = null;
      if (input.taskId) {
        const claimed = await this.db.query<TaskRow>(
          `UPDATE public.tasks
           SET claimed_by = $2, status = 'claimed'
           WHERE id = $1 AND claimed_by = $3 AND status IN ('claimed', 'open')
           RETURNING *`,
          [input.taskId, to.id, from.id],
        );
        if (!claimed.rows[0]) {
          throw new HubError(
            "FORBIDDEN",
            "you can only hand off a task you currently hold",
          );
        }
        task = mapTask(claimed.rows[0], to);
      }

      const inserted = await this.db.query<HandoffRow>(
        `INSERT INTO public.handoffs (from_agent, to_agent, task_id, context_summary)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [from.id, to.id, input.taskId ?? null, input.contextSummary],
      );
      return mapHandoff(required(inserted.rows[0], "handoff"), from, to, task);
    });
  }

  async getHandoffs(actor: HubActor, query: ListQuery = {}): Promise<Handoff[]> {
    return this.asActor(actor, null, null, async () => {
      const limit = query.limit ?? 50;
      const rows = await this.db.query<HandoffRow>(
        `SELECT * FROM public.handoffs ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      const agents = await this.agentMap();
      const tasks = await this.taskMap();
      return rows.rows.map((row) =>
        mapHandoff(
          row,
          agents.get(row.from_agent),
          agents.get(row.to_agent),
          row.task_id ? tasks.get(row.task_id) ?? null : null,
        ),
      );
    });
  }

  async provisionLocalAgent(input: {
    handle: string;
    machineLabel: string;
    project: string;
    token: string;
    status?: Agent["status"];
    authId?: string;
  }): Promise<Agent> {
    const authId = input.authId ?? randomUUID();
    const inserted = await this.db.query<AgentRow>(
      `INSERT INTO public.agents (auth_id, handle, machine_label, project, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [authId, input.handle, input.machineLabel, input.project, input.status ?? "idle"],
    );
    await this.db.query(
      `INSERT INTO public.agent_tokens (auth_id, token_hash) VALUES ($1, $2)`,
      [authId, hashToken(input.token)],
    );
    return mapAgent(required(inserted.rows[0], "agent"));
  }

  private async asActor<T>(
    actor: HubActor,
    table: HubChangeTable | null,
    eventType: "INSERT" | "UPDATE" | "DELETE" | null,
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.db.exec("BEGIN");
    try {
      await this.db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [
        actor.authId,
      ]);
      await this.db.exec("SET LOCAL ROLE authenticated");
      const result = await fn();
      await this.db.exec("COMMIT");
      if (table && eventType) {
        this.realtime.emitChange({ table, eventType });
      }
      return result;
    } catch (error) {
      try {
        await this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      if (error instanceof HubError) throw error;
      mapPgError(error);
    }
  }

  private async currentAgent(): Promise<Agent | null> {
    const rows = await this.db.query<AgentRow>(
      `SELECT * FROM public.agents WHERE auth_id = auth.uid()`,
    );
    return rows.rows[0] ? mapAgent(rows.rows[0]) : null;
  }

  private async requireCurrentAgent(): Promise<Agent> {
    const agent = await this.currentAgent();
    if (!agent) throw new HubError("UNAUTHORIZED", "no agent is registered for this identity");
    return agent;
  }

  private async loadAgentByAuth(authId: string): Promise<Agent | null> {
    const rows = await this.db.query<AgentRow>(
      `SELECT * FROM public.agents WHERE auth_id = $1`,
      [authId],
    );
    return rows.rows[0] ? mapAgent(rows.rows[0]) : null;
  }

  private async loadAgentById(id: string): Promise<Agent | null> {
    const rows = await this.db.query<AgentRow>(
      `SELECT * FROM public.agents WHERE id = $1`,
      [id],
    );
    return rows.rows[0] ? mapAgent(rows.rows[0]) : null;
  }

  private async agentMap(): Promise<Map<string, Agent>> {
    const rows = await this.db.query<AgentRow>(`SELECT * FROM public.agents`);
    return new Map(rows.rows.map((row) => [row.id, mapAgent(row)]));
  }

  private async taskMap(): Promise<Map<string, Task>> {
    const rows = await this.db.query<TaskRow>(`SELECT * FROM public.tasks`);
    return new Map(rows.rows.map((row) => [row.id, mapTask(row)]));
  }
}

type HubChangeTable = "agents" | "posts" | "tasks" | "file_leases" | "handoffs";

function required<T>(value: T | undefined, label: string): T {
  if (!value) throw new HubError("NOT_FOUND", `${label} not found`);
  return value;
}

export async function applyMigrations(db: PGlite): Promise<void> {
  const applied = await db.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth'`,
  );
  if (applied.rows.length === 0 || true) {
    await db.exec(PGLITE_BOOTSTRAP_SQL);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dir = migrationsDir(findRepoRoot());
  if (!existsSync(dir)) {
    throw new Error(`migrations directory not found: ${dir}`);
  }
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const filename of files) {
    const already = await db.query<{ filename: string }>(
      `SELECT filename FROM public.schema_migrations WHERE filename = $1`,
      [filename],
    );
    if (already.rows[0]) continue;
    const sql = readFileSync(join(dir, filename), "utf8");
    await db.exec(sql);
    await db.query(`INSERT INTO public.schema_migrations (filename) VALUES ($1)`, [
      filename,
    ]);
  }
}
