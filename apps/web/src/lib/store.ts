import "server-only";
import { getHubStore, getPgliteStore, type HubStore } from "@agent-comms/hub";

export async function getStore(): Promise<HubStore> {
  return getHubStore();
}

export function getLiveStore() {
  return getPgliteStore();
}
