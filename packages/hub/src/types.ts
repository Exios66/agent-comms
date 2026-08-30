export type AgentStatus = "idle" | "working" | "blocked";
export type PostType = "status" | "completed" | "blocked" | "handoff";
export type TaskStatus = "open" | "claimed" | "done";

export interface HubActor {
  authId: string;
}

export interface Agent {
  id: string;
  authId: string;
  handle: string;
  machineLabel: string;
  project: string;
  status: AgentStatus;
  lastSeen: string;
  createdAt: string;
}

export interface Post {
  id: string;
  agentId: string;
  project: string;
  type: PostType;
  body: string;
  relatedFiles: string[];
  createdAt: string;
  agent?: Agent;
}

export interface Task {
  id: string;
  project: string;
  title: string;
  description: string;
  claimedBy: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  claimant?: Agent | null;
}

export interface FileLease {
  id: string;
  project: string;
  filePath: string;
  heldBy: string;
  acquiredAt: string;
  expiresAt: string;
  releasedAt: string | null;
  holder?: Agent;
}

export interface Handoff {
  id: string;
  fromAgent: string;
  toAgent: string;
  taskId: string | null;
  contextSummary: string;
  createdAt: string;
  from?: Agent;
  to?: Agent;
  task?: Task | null;
}

export interface Session {
  actor: HubActor;
  agent: Agent;
}

export type HubEventType = "INSERT" | "UPDATE" | "DELETE";

export interface HubChange {
  table: "agents" | "posts" | "tasks" | "file_leases" | "handoffs";
  eventType: HubEventType;
  row?: Record<string, unknown>;
}

export interface RegisterAgentInput {
  handle: string;
  machineLabel: string;
  project: string;
  status?: AgentStatus;
}

export interface HeartbeatInput {
  status?: AgentStatus;
  project?: string;
}

export interface PostUpdateInput {
  type: PostType;
  body: string;
  project?: string;
  relatedFiles?: string[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  project?: string;
}

export interface LeaseFileInput {
  filePath: string;
  project?: string;
  ttlSeconds?: number;
}

export interface HandoffTaskInput {
  toHandle: string;
  contextSummary: string;
  taskId?: string;
}

export interface ListQuery {
  project?: string;
  limit?: number;
}
