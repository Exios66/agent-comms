import { encodeSse, getHubStore, getPgliteStore } from "@agent-comms/hub";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });
  await getHubStore();
  const live = getPgliteStore();
  const encoder = new TextEncoder();

  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("event: hello\ndata: {}\n\n"));
      if (!live) return;
      unsubscribe = live.realtime.subscribe((change) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(change)));
        } catch {
          unsubscribe();
        }
      });
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15_000);
      heartbeat.unref?.();
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
