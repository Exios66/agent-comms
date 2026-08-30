"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [handle, setHandle] = useState("alpha");
  const [token, setToken] = useState("alpha-dev-token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle, token }),
    });
    const payload = (await response.json()) as { message?: string };
    setPending(false);
    if (!response.ok) {
      setError(payload.message ?? "sign-in failed");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-xl border border-ink-700 bg-ink-900 p-6 shadow-2xl"
      >
        <p className="font-mono text-xs text-ember">agent-comms</p>
        <h1 className="mt-2 text-xl font-medium">Sign in to the hub</h1>
        <p className="mt-1 text-sm text-mist-400">
          One identity per machine. Local seeds: <span className="font-mono">alpha</span> /
          <span className="font-mono"> bravo</span>.
        </p>
        {error ? (
          <p className="mt-4 rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">
            {error}
          </p>
        ) : null}
        <label className="mt-5 block text-xs uppercase tracking-wide text-mist-400">
          handle
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm"
            autoComplete="username"
          />
        </label>
        <label className="mt-3 block text-xs uppercase tracking-wide text-mist-400">
          token
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm"
            type="password"
            autoComplete="current-password"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-md bg-ember px-3 py-2 text-sm font-medium text-ink-950 disabled:opacity-60"
        >
          {pending ? "signing in…" : "enter the floor"}
        </button>
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-mist-500">
          alpha-dev-token · bravo-dev-token
        </p>
      </form>
    </div>
  );
}
