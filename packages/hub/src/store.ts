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

export interface HubStore {
  authenticate(token: string): Promise<Session | null>;
  registerAgent(actor: HubActor, input: RegisterAgentInput): Promise<Agent>;
  heartbeat(actor: HubActor, input: HeartbeatInput): Promise<Agent>;
  getAgent(actor: HubActor, handle: string): Promise<Agent | null>;
  listAgents(actor: HubActor, query?: ListQuery): Promise<Agent[]>;
  postUpdate(actor: HubActor, input: PostUpdateInput): Promise<Post>;
  getRecentActivity(actor: HubActor, query?: ListQuery): Promise<Post[]>;
  createTask(actor: HubActor, input: CreateTaskInput): Promise<Task>;
  listTasks(actor: HubActor, query?: ListQuery): Promise<Task[]>;
  claimTask(actor: HubActor, taskId: string): Promise<Task>;
  releaseTask(actor: HubActor, taskId: string): Promise<Task>;
  completeTask(actor: HubActor, taskId: string): Promise<Task>;
  leaseFile(actor: HubActor, input: LeaseFileInput): Promise<FileLease>;
  releaseFile(actor: HubActor, leaseId: string): Promise<FileLease>;
  listLeases(actor: HubActor, query?: ListQuery): Promise<FileLease[]>;
  expireStaleLeases(): Promise<number>;
  handoffTask(actor: HubActor, input: HandoffTaskInput): Promise<Handoff>;
  getHandoffs(actor: HubActor, query?: ListQuery): Promise<Handoff[]>;
}

export const DEFAULT_LEASE_TTL_SECONDS = 30 * 60;
