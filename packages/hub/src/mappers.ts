import type { Agent, FileLease, Handoff, Post, Task } from "./types.js";

export interface AgentRow {
  id: string;
  auth_id: string;
  handle: string;
  machine_label: string;
  project: string;
  status: Agent["status"];
  last_seen: string;
  created_at: string;
}

export interface PostRow {
  id: string;
  agent_id: string;
  project: string;
  type: Post["type"];
  body: string;
  related_files: string[] | null;
  created_at: string;
}

export interface TaskRow {
  id: string;
  project: string;
  title: string;
  description: string;
  claimed_by: string | null;
  status: Task["status"];
  created_at: string;
  updated_at: string;
}

export interface LeaseRow {
  id: string;
  project: string;
  file_path: string;
  held_by: string;
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
}

export interface HandoffRow {
  id: string;
  from_agent: string;
  to_agent: string;
  task_id: string | null;
  context_summary: string;
  created_at: string;
}

export function mapAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    authId: row.auth_id,
    handle: row.handle,
    machineLabel: row.machine_label,
    project: row.project,
    status: row.status,
    lastSeen: toIso(row.last_seen),
    createdAt: toIso(row.created_at),
  };
}

export function mapPost(row: PostRow, agent?: Agent): Post {
  return {
    id: row.id,
    agentId: row.agent_id,
    project: row.project,
    type: row.type,
    body: row.body,
    relatedFiles: row.related_files ?? [],
    createdAt: toIso(row.created_at),
    agent,
  };
}

export function mapTask(row: TaskRow, claimant?: Agent | null): Task {
  return {
    id: row.id,
    project: row.project,
    title: row.title,
    description: row.description,
    claimedBy: row.claimed_by,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    claimant: claimant ?? null,
  };
}

export function mapLease(row: LeaseRow, holder?: Agent): FileLease {
  return {
    id: row.id,
    project: row.project,
    filePath: row.file_path,
    heldBy: row.held_by,
    acquiredAt: toIso(row.acquired_at),
    expiresAt: toIso(row.expires_at),
    releasedAt: row.released_at ? toIso(row.released_at) : null,
    holder,
  };
}

export function mapHandoff(
  row: HandoffRow,
  from?: Agent,
  to?: Agent,
  task?: Task | null,
): Handoff {
  return {
    id: row.id,
    fromAgent: row.from_agent,
    toAgent: row.to_agent,
    taskId: row.task_id,
    contextSummary: row.context_summary,
    createdAt: toIso(row.created_at),
    from,
    to,
    task: task ?? null,
  };
}

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? String(value) : asDate.toISOString();
}
