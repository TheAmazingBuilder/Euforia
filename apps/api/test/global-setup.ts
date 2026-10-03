/**
 * Vitest global setup (Foundation mandate §24/§25).
 *
 * Guarantees, before any test runs:
 *   1. An embedded PostgreSQL cluster is reachable (started if needed).
 *   2. A DEDICATED test database `cosmoz_test` exists — tests never target
 *      the dev database or anything resembling production.
 *   3. Prisma migrations are applied to the test database.
 *   4. `process.env.DATABASE_URL` points at `cosmoz_test` for every worker.
 *
 * The setup.ts guard re-asserts (4) inside each worker as defense in depth.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { ensureDevDb, TEST_DB_URL } from "../scripts/dev-db.mjs";

/** Locate the prisma CLI entry (resilient to exports-map restrictions). */
function prismaCliPath(): string {
  // Resolution context = the api package (vitest runs with cwd=apps/api).
  const requireFromApi = createRequire(path.join(process.cwd(), "package.json"));
  try {
    return requireFromApi.resolve("prisma/build/index.js");
  } catch {
    // Walk up from the resolved package main to its build/index.js.
    const entry = requireFromApi.resolve("prisma");
    let dir = path.dirname(entry);
    for (let i = 0; i < 5; i += 1) {
      const candidate = path.join(dir, "build", "index.js");
      if (fs.existsSync(candidate)) return candidate;
      dir = path.dirname(dir);
    }
    throw new Error("Could not locate the prisma CLI entry.");
  }
}

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = "test";

  // 1. Cluster up (idempotent — reuses a running one).
  await ensureDevDb();

  // 2/3. Dedicated test database + migrations.
  process.env.DATABASE_URL = TEST_DB_URL;
  execFileSync(
    process.execPath,
    [prismaCliPath(), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: "pipe",
      encoding: "utf8",
    },
  );

  // 4. Exported for all forked test workers (see setup.ts for the re-check).
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = TEST_DB_URL;
}
