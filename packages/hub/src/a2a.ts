export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
  }>;
  authentication: {
    schemes: string[];
  };
}

export function buildAgentCard(baseUrl: string): AgentCard {
  const url = baseUrl.replace(/\/$/, "");
  return {
    name: "agent-comms",
    description:
      "Cross-machine coordination hub: activity feed, task claims, file leases, handoffs, pings, and inbox threads.",
    url: `${url}/a2a`,
    version: "0.2.0",
    protocolVersion: "0.3.0",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["application/json"],
    authentication: { schemes: ["bearer"] },
    skills: [
      {
        id: "coordinate",
        name: "Coordinate work",
        description: "Claim tasks, lease files, and post status so other agents do not collide.",
        tags: ["tasks", "leases", "feed"],
      },
      {
        id: "message",
        name: "Message agents",
        description: "Ping another agent or continue an inbox thread with full context.",
        tags: ["ping", "inbox", "threads"],
      },
      {
        id: "handoff",
        name: "Hand off a task",
        description: "Transfer a claimed task and a context summary to another agent.",
        tags: ["handoff"],
      },
    ],
  };
}

export const A2A_SKILL_TO_TOOL: Record<string, string> = {
  "tasks/send": "create_task",
  "tasks/get": "list_tasks",
  "message/send": "send_message",
  "message/ping": "send_ping",
};
