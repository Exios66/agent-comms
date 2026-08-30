import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HubError } from "./errors.js";
import {
  mapAgent,
  mapHandoff,
  mapLease,
  mapMention,
  mapMessage,
  mapPost,
  mapTask,
  mapThread,
  type AgentRow,
  type HandoffRow,
  type LeaseRow,
  type MentionRow,
  type MessageRow,
  type PostRow,
  type TaskRow,
  type ThreadRow,
} from "./mappers.js";
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
  Mention,
  Post,
  PostUpdateInput,
  RegisterAgentInput,
  SendMessageInput,
  Session,
  Task,
  Thread,
} from "./types.js";

export interface SupabaseHubOptions {
  url: string;
  anonKey: string;
  accessToken: string;
}

export function createSupabaseHub(options: SupabaseHubOptions): SupabaseHubStore {
  const client = createClient(options.url, options.anonKey, {
    global: {
      headers: { Authorization: `Bearer ${options.accessToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseHubStore(client);
}

export class SupabaseHubStore implements HubStore {
  constructor(private readonly sb: SupabaseClient) {}

  async authenticate(token: string): Promise<Session | null> {
    const { data, error } = await this.sb.auth.getUser(token);
    if (error || !data.user) return null;
    const agent = await this.loadAgentByAuth(data.user.id);
    if (!agent) return null;
    return { actor: { authId: data.user.id }, agent };
  }

  async registerAgent(actor: HubActor, input: RegisterAgentInput): Promise<Agent> {
    const existing = await this.loadAgentByAuth(actor.authId);
    if (existing) {
      const { data, error } = await this.sb
        .from("agents")
        .update({
          handle: input.handle,
          machine_label: input.machineLabel,
          project: input.project,
          status: input.status ?? existing.status,
          last_seen: new Date().toISOString(),
        })
        .eq("auth_id", actor.authId)
        .select("*")
        .single();
      throwIf(error);
      return mapAgent(data as AgentRow);
    }
    const { data, error } = await this.sb
      .from("agents")
      .insert({
        auth_id: actor.authId,
        handle: input.handle,
        machine_label: input.machineLabel,
        project: input.project,
        status: input.status ?? "idle",
      })
      .select("*")
      .single();
    throwIf(error);
    return mapAgent(data as AgentRow);
  }

  async heartbeat(actor: HubActor, input: HeartbeatInput): Promise<Agent> {
    const patch: Record<string, unknown> = { last_seen: new Date().toISOString() };
    if (input.status) patch.status = input.status;
    if (input.project) patch.project = input.project;
    const { data, error } = await this.sb
      .from("agents")
      .update(patch)
      .eq("auth_id", actor.authId)
      .select("*")
      .single();
    throwIf(error);
    return mapAgent(data as AgentRow);
  }

  async getAgent(_actor: HubActor, handle: string): Promise<Agent | null> {
    const { data, error } = await this.sb.from("agents").select("*").eq("handle", handle).maybeSingle();
    throwIf(error);
    return data ? mapAgent(data as AgentRow) : null;
  }

  async listAgents(_actor: HubActor, query: ListQuery = {}): Promise<Agent[]> {
    let req = this.sb.from("agents").select("*").order("handle");
    if (query.project) req = req.eq("project", query.project);
    const { data, error } = await req;
    throwIf(error);
    return (data as AgentRow[]).map(mapAgent);
  }

  async postUpdate(actor: HubActor, input: PostUpdateInput): Promise<Post> {
    const agent = await this.requireAgent(actor);
    const { data, error } = await this.sb
      .from("posts")
      .insert({
        agent_id: agent.id,
        project: input.project ?? agent.project,
        type: input.type,
        body: input.body,
        related_files: input.relatedFiles ?? [],
      })
      .select("*")
      .single();
    throwIf(error);
    return mapPost(data as PostRow, agent);
  }

  async getRecentActivity(_actor: HubActor, query: ListQuery = {}): Promise<Post[]> {
    let req = this.sb
      .from("posts")
      .select("*, agents(*)")
      .order("created_at", { ascending: false })
      .limit(query.limit ?? 50);
    if (query.project) req = req.eq("project", query.project);
    const { data, error } = await req;
    throwIf(error);
    return (data as Array<PostRow & { agents: AgentRow }>).map((row) =>
      mapPost(row, row.agents ? mapAgent(row.agents) : undefined),
    );
  }

  async createTask(actor: HubActor, input: CreateTaskInput): Promise<Task> {
    const agent = await this.requireAgent(actor);
    const { data, error } = await this.sb
      .from("tasks")
      .insert({
        project: input.project ?? agent.project,
        title: input.title,
        description: input.description ?? "",
      })
      .select("*")
      .single();
    throwIf(error);
    return mapTask(data as TaskRow);
  }

  async listTasks(_actor: HubActor, query: ListQuery = {}): Promise<Task[]> {
    let req = this.sb.from("tasks").select("*, claimant:agents!claimed_by(*)").order("created_at", {
      ascending: false,
    });
    if (query.project) req = req.eq("project", query.project);
    const { data, error } = await req;
    throwIf(error);
    return (data as Array<TaskRow & { claimant: AgentRow | null }>).map((row) =>
      mapTask(row, row.claimant ? mapAgent(row.claimant) : null),
    );
  }

  async claimTask(actor: HubActor, taskId: string): Promise<Task> {
    const agent = await this.requireAgent(actor);
    const { data, error } = await this.sb
      .from("tasks")
      .update({ claimed_by: agent.id, status: "claimed" })
      .eq("id", taskId)
      .eq("status", "open")
      .is("claimed_by", null)
      .select("*")
      .maybeSingle();
    throwIf(error);
    if (data) return mapTask(data as TaskRow, agent);
    const existing = await this.loadTask(taskId);
    if (!existing) throw new HubError("NOT_FOUND", "task not found");
    throw new HubError("CONFLICT", "task is not open or is already claimed");
  }

  async releaseTask(actor: HubActor, taskId: string): Promise<Task> {
    const agent = await this.requireAgent(actor);
    const { data, error } = await this.sb
      .from("tasks")
      .update({ claimed_by: null, status: "open" })
      .eq("id", taskId)
      .eq("claimed_by", agent.id)
      .eq("status", "claimed")
      .select("*")
      .maybeSingle();
    throwIf(error);
    if (!data) throw new HubError("FORBIDDEN", "you can only release a task you currently hold");
    return mapTask(data as TaskRow);
  }

  async completeTask(actor: HubActor, taskId: string): Promise<Task> {
    const agent = await this.requireAgent(actor);
    const { data, error } = await this.sb
      .from("tasks")
      .update({ status: "done" })
      .eq("id", taskId)
      .eq("claimed_by", agent.id)
      .select("*")
      .maybeSingle();
    throwIf(error);
    if (!data) throw new HubError("FORBIDDEN", "you can only complete a task you currently hold");
    return mapTask(data as TaskRow, agent);
  }

  async leaseFile(actor: HubActor, input: LeaseFileInput): Promise<FileLease> {
    await this.expireStaleLeases();
    const agent = await this.requireAgent(actor);
    const ttl = input.ttlSeconds ?? DEFAULT_LEASE_TTL_SECONDS;
    const expires = new Date(Date.now() + ttl * 1000).toISOString();
    const { data, error } = await this.sb
      .from("file_leases")
      .insert({
        project: input.project ?? agent.project,
        file_path: input.filePath,
        held_by: agent.id,
        expires_at: expires,
      })
      .select("*")
      .single();
    if (error) {
      throw new HubError("CONFLICT", error.message);
    }
    return mapLease(data as LeaseRow, agent);
  }

  async releaseFile(actor: HubActor, leaseId: string): Promise<FileLease> {
    const agent = await this.requireAgent(actor);
    const { data, error } = await this.sb
      .from("file_leases")
      .update({ released_at: new Date().toISOString() })
      .eq("id", leaseId)
      .eq("held_by", agent.id)
      .is("released_at", null)
      .select("*")
      .maybeSingle();
    throwIf(error);
    if (!data) throw new HubError("FORBIDDEN", "you can only release a lease you currently hold");
    return mapLease(data as LeaseRow, agent);
  }

  async listLeases(_actor: HubActor, query: ListQuery = {}): Promise<FileLease[]> {
    await this.expireStaleLeases();
    let req = this.sb
      .from("file_leases")
      .select("*, holder:agents!held_by(*)")
      .is("released_at", null)
      .order("acquired_at", { ascending: false });
    if (query.project) req = req.eq("project", query.project);
    const { data, error } = await req;
    throwIf(error);
    return (data as Array<LeaseRow & { holder: AgentRow }>).map((row) =>
      mapLease(row, row.holder ? mapAgent(row.holder) : undefined),
    );
  }

  async expireStaleLeases(): Promise<number> {
    const { data, error } = await this.sb.rpc("expire_stale_leases");
    throwIf(error);
    return Number(data ?? 0);
  }

  async handoffTask(actor: HubActor, input: HandoffTaskInput): Promise<Handoff> {
    const from = await this.requireAgent(actor);
    const to = await this.getAgent(actor, input.toHandle);
    if (!to) throw new HubError("NOT_FOUND", `agent ${input.toHandle} not found`);
    if (input.taskId) {
      const { data, error } = await this.sb
        .from("tasks")
        .update({ claimed_by: to.id, status: "claimed" })
        .eq("id", input.taskId)
        .eq("claimed_by", from.id)
        .select("*")
        .maybeSingle();
      throwIf(error);
      if (!data) {
        throw new HubError("FORBIDDEN", "you can only hand off a task you currently hold");
      }
    }
    const { data, error } = await this.sb
      .from("handoffs")
      .insert({
        from_agent: from.id,
        to_agent: to.id,
        task_id: input.taskId ?? null,
        context_summary: input.contextSummary,
        project: from.project,
      })
      .select("*")
      .single();
    throwIf(error);
    return mapHandoff(data as HandoffRow, from, to);
  }

  async getHandoffs(actor: HubActor, query: ListQuery = {}): Promise<Handoff[]> {
    const me = await this.requireAgent(actor);
    let req = this.sb
      .from("handoffs")
      .select("*, from:agents!from_agent(*), to:agents!to_agent(*), task:tasks(*)")
      .order("created_at", { ascending: false })
      .limit(query.limit ?? 50);
    if (query.project) req = req.eq("project", query.project);
    if (query.inbox) req = req.eq("to_agent", me.id);
    const { data, error } = await req;
    throwIf(error);
    return (
      data as Array<HandoffRow & { from: AgentRow; to: AgentRow; task: TaskRow | null }>
    ).map((row) =>
      mapHandoff(
        row,
        row.from ? mapAgent(row.from) : undefined,
        row.to ? mapAgent(row.to) : undefined,
        row.task ? mapTask(row.task) : null,
      ),
    );
  }

  async sendMessage(actor: HubActor, input: SendMessageInput): Promise<Thread> {
    const from = await this.requireAgent(actor);
    const kind = input.kind ?? (input.threadId ? "reply" : "message");
    let threadId = input.threadId;
    if (!threadId) {
      if (!input.toHandle) throw new HubError("VALIDATION", "toHandle or threadId is required");
      const to = await this.getAgent(actor, input.toHandle);
      if (!to) throw new HubError("NOT_FOUND", `agent ${input.toHandle} not found`);
      const created = await this.sb
        .from("message_threads")
        .insert({
          project: input.project ?? from.project,
          subject: input.subject ?? "",
          created_by: from.id,
        })
        .select("*")
        .single();
      throwIf(created.error);
      threadId = created.data.id as string;
      const parts = await this.sb.from("thread_participants").insert([
        { thread_id: threadId, agent_id: from.id },
        { thread_id: threadId, agent_id: to.id },
      ]);
      throwIf(parts.error);
    }
    const inserted = await this.sb
      .from("messages")
      .insert({ thread_id: threadId, from_agent: from.id, kind, body: input.body })
      .select("*")
      .single();
    throwIf(inserted.error);
    await this.sb.from("message_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    return this.getThread(actor, threadId);
  }

  async getInbox(actor: HubActor, query: ListQuery = {}): Promise<Thread[]> {
    const me = await this.requireAgent(actor);
    let req = this.sb
      .from("thread_participants")
      .select("thread_id, last_read_at, message_threads(*)")
      .eq("agent_id", me.id)
      .limit(query.limit ?? 50);
    const { data, error } = await req;
    throwIf(error);
    const threads: Thread[] = [];
    for (const row of data as Array<{ thread_id: string }>) {
      const thread = await this.getThread(actor, row.thread_id);
      if (query.unreadOnly && thread.unread === 0) continue;
      if (query.project && thread.project !== query.project) continue;
      threads.push(thread);
    }
    return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getThread(actor: HubActor, threadId: string): Promise<Thread> {
    const me = await this.requireAgent(actor);
    const thread = await this.sb.from("message_threads").select("*").eq("id", threadId).maybeSingle();
    throwIf(thread.error);
    if (!thread.data) throw new HubError("NOT_FOUND", "thread not found");
    const parts = await this.sb
      .from("thread_participants")
      .select("agent_id, last_read_at, agents(*)")
      .eq("thread_id", threadId);
    throwIf(parts.error);
    if (!(parts.data ?? []).some((p: { agent_id: string }) => p.agent_id === me.id)) {
      throw new HubError("FORBIDDEN", "you are not in this thread");
    }
    const msgs = await this.sb
      .from("messages")
      .select("*, from:agents!from_agent(*)")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    throwIf(msgs.error);
    const mine = (parts.data ?? []).find((p: { agent_id: string }) => p.agent_id === me.id) as
      | { last_read_at: string | null }
      | undefined;
    const lastRead = mine?.last_read_at ? new Date(mine.last_read_at).getTime() : 0;
    const messages = (msgs.data ?? []).map((row: MessageRow & { from?: AgentRow }) =>
      mapMessage(row, row.from ? mapAgent(row.from) : undefined),
    );
    const unread = messages.filter(
      (m) => m.fromAgent !== me.id && new Date(m.createdAt).getTime() > lastRead,
    ).length;
    return mapThread(
      thread.data as ThreadRow,
      (parts.data ?? []).map((p: { agents?: AgentRow }) =>
        p.agents ? mapAgent(p.agents) : undefined,
      ).filter((a): a is Agent => Boolean(a)),
      messages[messages.length - 1] ?? null,
      unread,
      messages,
    );
  }

  async markThreadRead(actor: HubActor, threadId: string): Promise<Thread> {
    const me = await this.requireAgent(actor);
    const { error } = await this.sb
      .from("thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("agent_id", me.id);
    throwIf(error);
    return this.getThread(actor, threadId);
  }

  async listMentions(actor: HubActor, query: ListQuery = {}): Promise<Mention[]> {
    const me = await this.requireAgent(actor);
    const { data, error } = await this.sb
      .from("mentions")
      .select("*")
      .eq("agent_id", me.id)
      .order("created_at", { ascending: false })
      .limit(query.limit ?? 50);
    throwIf(error);
    return (data as MentionRow[]).map(mapMention);
  }

  private async requireAgent(actor: HubActor): Promise<Agent> {
    const agent = await this.loadAgentByAuth(actor.authId);
    if (!agent) throw new HubError("UNAUTHORIZED", "no agent is registered for this identity");
    return agent;
  }

  private async loadAgentByAuth(authId: string): Promise<Agent | null> {
    const { data, error } = await this.sb.from("agents").select("*").eq("auth_id", authId).maybeSingle();
    throwIf(error);
    return data ? mapAgent(data as AgentRow) : null;
  }

  private async loadTask(id: string): Promise<Task | null> {
    const { data, error } = await this.sb.from("tasks").select("*").eq("id", id).maybeSingle();
    throwIf(error);
    return data ? mapTask(data as TaskRow) : null;
  }
}

function throwIf(error: { message: string } | null): void {
  if (!error) return;
  if (/duplicate|unique/i.test(error.message)) {
    throw new HubError("CONFLICT", error.message);
  }
  if (/row-level security|permission/i.test(error.message)) {
    throw new HubError("FORBIDDEN", error.message);
  }
  throw new HubError("VALIDATION", error.message);
}
