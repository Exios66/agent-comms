import { EventEmitter } from "node:events";
import type { HubChange } from "./types.js";

export type HubRealtimeListener = (change: HubChange) => void;

export class HubRealtime extends EventEmitter {
  emitChange(change: HubChange) {
    this.emit("change", change);
  }

  subscribe(listener: HubRealtimeListener): () => void {
    this.on("change", listener);
    return () => {
      this.off("change", listener);
    };
  }
}

export function encodeSse(change: HubChange): string {
  return `event: change\ndata: ${JSON.stringify(change)}\n\n`;
}
