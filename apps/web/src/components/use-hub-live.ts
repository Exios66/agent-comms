"use client";

import { useEffect, useState } from "react";

export function useHubLive(onChange?: () => void) {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const source = new EventSource("/api/realtime");
    const bump = () => {
      setGeneration((n) => n + 1);
      onChange?.();
    };
    source.addEventListener("change", bump);
    source.onmessage = bump;
    return () => source.close();
  }, [onChange]);

  return generation;
}
