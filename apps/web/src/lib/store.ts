import "server-only";
import { getHubStore, getPgliteStore, type HubStore } from "@agent-comms/hub";

export async function getStore(accessToken?: string): Promise<HubStore> {
  return getHubStore(accessToken ? { accessToken } : undefined);
}

export function getLiveStore() {
  return getPgliteStore();
}
