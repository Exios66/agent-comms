"use client";

import { useCallback, useEffect, useState } from "react";
import type { Post, PostType } from "@agent-comms/hub";
import { identity, relativeTime } from "@/lib/format";
import { callHub } from "./hub-client";
import { MentionText } from "./mention-text";
import { EmptyState, ErrorBanner, TypeBadge } from "./shell";
import { useHubLive } from "./use-hub-live";

export function FeedView({ initial, project }: { initial: Post[]; project?: string }) {
  const [posts, setPosts] = useState(initial);
  const [body, setBody] = useState("");
  const [type, setType] = useState<PostType>("status");
  const [files, setFiles] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void callHub<Post[]>("get_recent_activity", { project, limit: 80 }).then(setPosts);
  }, [project]);

  useHubLive(reload);
  useEffect(() => setPosts(initial), [initial]);

  async function publish() {
    setError(null);
    try {
      await callHub("post_update", {
        type,
        body,
        project,
        relatedFiles: files
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setBody("");
      setFiles("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to post");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-medium">Floor</h1>
            <p className="text-sm text-mist-400">Chronological posts from every machine on this hub.</p>
          </div>
        </div>
        <ErrorBanner message={error} />
        {posts.length === 0 ? (
          <EmptyState
            title="No posts yet"
            body="Publish a status update so the other side can see what you are doing."
          />
        ) : (
          <ol className="space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-lake">
                    {identity(post.agent?.handle, post.agent?.machineLabel)}
                  </span>
                  <TypeBadge type={post.type} />
                  <span className="text-mist-500">{post.project}</span>
                  <span className="ml-auto text-mist-500" title={post.createdAt}>
                    {relativeTime(post.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  <MentionText text={post.body} />
                </p>
                {post.relatedFiles.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {post.relatedFiles.map((file) => (
                      <li key={file} className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-mist-400">
                        {file}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
      <aside className="h-fit rounded-lg border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-medium">Post an update</h2>
        <p className="mt-1 text-xs text-mist-400">Metadata only — no document contents.</p>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PostType)}
          className="mt-3 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
        >
          <option value="status">status</option>
          <option value="completed">completed</option>
          <option value="blocked">blocked</option>
          <option value="handoff">handoff</option>
        </select>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={4096}
          placeholder="What are you doing, finishing, or handing off?"
          className="mt-2 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm"
        />
        <input
          value={files}
          onChange={(e) => setFiles(e.target.value)}
          placeholder="related files, comma-separated"
          className="mt-2 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => void publish()}
          disabled={!body.trim()}
          className="mt-3 w-full rounded-md bg-ember px-3 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-50"
        >
          publish
        </button>
      </aside>
    </div>
  );
}
