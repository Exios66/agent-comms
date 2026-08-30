import { HubError } from "./errors.js";

export function mapPgError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    throw new HubError("CONFLICT", "that record is already held or already exists");
  }
  if (code === "P0001" || /rate_limit/i.test(message)) {
    throw new HubError("RATE_LIMITED", "too many writes in the last minute");
  }
  if (
    code === "42501" ||
    /row-level security|permission denied|violates row-level security/i.test(message)
  ) {
    throw new HubError("FORBIDDEN", "not allowed to change a record you do not hold");
  }
  if (error instanceof HubError) throw error;
  throw new HubError("VALIDATION", message);
}
