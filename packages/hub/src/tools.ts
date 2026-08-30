import { z } from "zod";
import { HubError, hubStatus, isHubError } from "./errors.js";
import type { HubStore } from "./store.js";
import type { HubActor } from "./types.js";
import {
  createTaskSchema,
  handoffTaskSchema,
  heartbeatSchema,
  idSchema,
  leaseFileSchema,
  listQuerySchema,
  postUpdateSchema,
  registerAgentSchema,
} from "./validators.js";

export const HUB_TOOL_NAMES = [
  "register_agent",
  "heartbeat",
  "post_update",
  "get_recent_activity",
  "get_agent_status",
  "list_agents",
  "create_task",
  "list_tasks",
  "claim_task",
  "release_task",
  "complete_task",
  "lease_file",
  "release_file",
  "list_leases",
  "expire_leases",
  "handoff_task",
  "get_handoffs",
] as const;

export type HubToolName = (typeof HUB_TOOL_NAMES)[number];

const handleQuery = z.object({ handle: z.string().min(1) });
const taskIdInput = z.object({ taskId: idSchema });
const leaseIdInput = z.object({ leaseId: idSchema });

export const hubToolSchemas: Record<HubToolName, z.ZodType> = {
  register_agent: registerAgentSchema,
  heartbeat: heartbeatSchema,
  post_update: postUpdateSchema,
  get_recent_activity: listQuerySchema,
  get_agent_status: handleQuery,
  list_agents: listQuerySchema,
  create_task: createTaskSchema,
  list_tasks: listQuerySchema,
  claim_task: taskIdInput,
  release_task: taskIdInput,
  complete_task: taskIdInput,
  lease_file: leaseFileSchema,
  release_file: leaseIdInput,
  list_leases: listQuerySchema,
  expire_leases: z.object({}),
  handoff_task: handoffTaskSchema,
  get_handoffs: listQuerySchema,
};

export const hubToolDescriptions: Record<HubToolName, string> = {
  register_agent: "Create or update this agent's handle, machine, and project.",
  heartbeat: "Refresh last_seen and optionally status/project.",
  post_update: "Publish a status/completed/blocked/handoff post to the shared feed.",
  get_recent_activity: "Read the chronological activity feed.",
  get_agent_status: "Look up one agent by handle.",
  list_agents: "List known agents, optionally filtered by project.",
  create_task: "Add an open task to the board.",
  list_tasks: "List tasks, optionally filtered by project.",
  claim_task: "Claim an open task. Fails if another agent already holds it.",
  release_task: "Release a task you currently hold.",
  complete_task: "Mark a task you hold as done.",
  lease_file: "Acquire an advisory lease on a file path. Fails if another agent holds it.",
  release_file: "Release a file lease you hold.",
  list_leases: "List active file leases.",
  expire_leases: "Sweep expired file leases so paths become claimable again.",
  handoff_task: "Hand a task and a context summary to another agent.",
  get_handoffs: "Read recent handoffs (full context summaries).",
};

export async function dispatchHubTool(
  store: HubStore,
  actor: HubActor,
  tool: string,
  rawInput: unknown,
): Promise<unknown> {
  if (!isHubToolName(tool)) {
    throw new HubError("VALIDATION", `unknown tool: ${tool}`);
  }
  const input = hubToolSchemas[tool].parse(rawInput ?? {});

  switch (tool) {
    case "register_agent":
      return store.registerAgent(actor, input as never);
    case "heartbeat":
      return store.heartbeat(actor, input as never);
    case "post_update":
      return store.postUpdate(actor, input as never);
    case "get_recent_activity":
      return store.getRecentActivity(actor, input as never);
    case "get_agent_status":
      return store.getAgent(actor, (input as { handle: string }).handle);
    case "list_agents":
      return store.listAgents(actor, input as never);
    case "create_task":
      return store.createTask(actor, input as never);
    case "list_tasks":
      return store.listTasks(actor, input as never);
    case "claim_task":
      return store.claimTask(actor, (input as { taskId: string }).taskId);
    case "release_task":
      return store.releaseTask(actor, (input as { taskId: string }).taskId);
    case "complete_task":
      return store.completeTask(actor, (input as { taskId: string }).taskId);
    case "lease_file":
      return store.leaseFile(actor, input as never);
    case "release_file":
      return store.releaseFile(actor, (input as { leaseId: string }).leaseId);
    case "list_leases":
      return store.listLeases(actor, input as never);
    case "expire_leases":
      return { expired: await store.expireStaleLeases() };
    case "handoff_task":
      return store.handoffTask(actor, input as never);
    case "get_handoffs":
      return store.getHandoffs(actor, input as never);
    default:
      throw new HubError("VALIDATION", `unknown tool: ${tool}`);
  }
}

export function isHubToolName(value: string): value is HubToolName {
  return (HUB_TOOL_NAMES as readonly string[]).includes(value);
}

export function formatToolResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

export function formatToolError(error: unknown): { text: string; isError: true } {
  if (isHubError(error)) {
    return {
      text: JSON.stringify({ ...error.toJSON(), httpStatus: hubStatus(error.code) }, null, 2),
      isError: true,
    };
  }
  if (error instanceof z.ZodError) {
    return {
      text: JSON.stringify(
        { error: "VALIDATION", message: error.issues.map((i) => i.message).join("; ") },
        null,
        2,
      ),
      isError: true,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { text: message, isError: true };
}
