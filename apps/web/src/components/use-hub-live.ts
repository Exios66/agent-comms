"use client";

import { useEffect, useState } from "react";

export function useHubLive(onChange?: () => void) {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const bump = () => {
      setGeneration((n) => n + 1);
      onChange?.();
    };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      let unsubscribe = () => {};
      void import("@supabase/supabase-js").then(({ createClient }) => {
        const client = createClient(supabaseUrl, supabaseKey);
        const channel = client
          .channel("hub-live")
          .on("postgres_changes", { event: "*", schema: "public" }, bump)
          .subscribe();
        unsubscribe = () => {
          void client.removeChannel(channel);
        };
      });
      return () => unsubscribe();
    }

    const source = new EventSource("/api/realtime");
    source.addEventListener("change", bump);
    source.onmessage = bump;
    return () => source.close();
  }, [onChange]);

  return generation;
}
