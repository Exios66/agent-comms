import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (
      existsSync(join(dir, "pnpm-workspace.yaml")) ||
      existsSync(join(dir, "supabase", "migrations"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function migrationsDir(root = findRepoRoot()): string {
  return join(root, "supabase", "migrations");
}

export function bootstrapSqlPath(hubPackageDir: string): string {
  return join(hubPackageDir, "sql", "pglite_bootstrap.sql");
}
