import { Suspense } from "react";
import type { Agent } from "@agent-comms/hub";
import { Shell } from "./shell";

export function PageFrame({
  me,
  project,
  unread,
  children,
}: {
  me: Agent;
  project?: string;
  unread?: number;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-mist-400">loading floor…</div>}>
      <Shell me={me} project={project} unread={unread}>
        {children}
      </Shell>
    </Suspense>
  );
}
