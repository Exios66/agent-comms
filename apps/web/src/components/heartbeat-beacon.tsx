"use client";

import { useEffect } from "react";
import { callHub } from "./hub-client";

export function HeartbeatBeacon() {
  useEffect(() => {
    const beat = () => {
      void callHub("heartbeat", {}).catch(() => undefined);
    };
    beat();
    const id = setInterval(beat, 30_000);
    return () => clearInterval(id);
  }, []);
  return null;
}
