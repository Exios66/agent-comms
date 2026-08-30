import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { findRepoRoot } from "./paths.js";
import { PgliteHubStore } from "./pglite-adapter.js";
import { seedLocalHub } from "./seed.js";
import type { HubStore } from "./store.js";
import { createSupabaseHub } from "./supabase-adapter.js";

const globalForHub = globalThis as unknown as {
  __agentCommsStore?: PgliteHubStore;
  __agentCommsExpiry?: ReturnType<typeof setInterval>;
};

export async function getHubStore(options?: {
  accessToken?: string;
}): Promise<HubStore> {
  const backend = process.env.HUB_BACKEND ?? "pglite";
  if (backend === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const token = options?.accessToken || process.env.SUPABASE_AGENT_JWT;
    if (!url || !anon || !token) {
      throw new Error("HUB_BACKEND=supabase requires URL, anon key, and an access token");
    }
    return createSupabaseHub({ url, anonKey: anon, accessToken: token });
  }

  if (!globalForHub.__agentCommsStore) {
    const root = findRepoRoot();
    const persist = process.env.HUB_DATA_DIR;
    const dataDir = persist ? join(root, persist) : undefined;
    if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
    const store = await PgliteHubStore.open({ dataDir });
    await seedLocalHub(store);
    globalForHub.__agentCommsStore = store;
    if (!globalForHub.__agentCommsExpiry) {
      globalForHub.__agentCommsExpiry = setInterval(() => {
        void store.expireStaleLeases();
      }, 15_000);
      globalForHub.__agentCommsExpiry.unref?.();
    }
  }
  return globalForHub.__agentCommsStore;
}

export function getPgliteStore(): PgliteHubStore | undefined {
  return globalForHub.__agentCommsStore;
}
