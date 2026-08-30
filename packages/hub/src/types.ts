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
  online?: boolean;
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

export type MessageKind = "ping" | "message" | "reply";

export interface Message {
  id: string;
  threadId: string;
  fromAgent: string;
  kind: MessageKind;
  body: string;
  createdAt: string;
  from?: Agent;
}

export interface Thread {
  id: string;
  project: string;
  subject: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  unread: number;
  lastMessage?: Message | null;
  participants: Agent[];
  messages?: Message[];
}

export interface Mention {
  id: string;
  agentId: string;
  postId: string | null;
  messageId: string | null;
  createdAt: string;
}

export interface HubChange {
  table:
    | "agents"
    | "posts"
    | "tasks"
    | "file_leases"
    | "handoffs"
    | "messages"
    | "message_threads"
    | "mentions";
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

export interface SendMessageInput {
  toHandle?: string;
  threadId?: string;
  body: string;
  subject?: string;
  project?: string;
  kind?: MessageKind;
}

export interface ListQuery {
  project?: string;
  limit?: number;
  unreadOnly?: boolean;
  inbox?: boolean;
}
