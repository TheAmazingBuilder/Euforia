/**
 * Vitest global setup (Foundation mandate §24/§25).
 *
 * Guarantees, before any test runs:
 *   1. A DEDICATED test database `cosmoz_test` is reachable via
 *      DATABASE_URL_TEST (or the derived default on localhost:5432) -
 *      tests never target the dev database or anything resembling
 *      production. The project no longer ships an embedded PostgreSQL;
 *      a real local PostgreSQL server is required for e2e tests.
 *   2. Prisma migrations are applied to the test database.
 *   3. `process.env.DATABASE_URL` points at `cosmoz_test` for every worker.
 *
 * The setup.ts guard re-asserts (3) inside each worker as defense in depth.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

/**
 * Test database URL. Override with DATABASE_URL_TEST when your local
 * PostgreSQL listens on a non-default port or needs credentials, e.g.:
 *   DATABASE_URL_TEST="postgresql://postgres:secret@localhost:5432/cosmoz_test"
 */
const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ?? "postgresql://postgres@127.0.0.1:5432/cosmoz_test";

/** Test database name (last path segment of TEST_DB_URL). */
const parsedTestDbUrl = new URL(TEST_DB_URL);
export const TEST_DB_NAME = parsedTestDbUrl.pathname.split("/").pop() ?? "cosmoz_test";

// E2E setup creates a database and applies migrations. Refuse remote hosts,
// non-test database names, and unsafe identifiers before running any SQL.
// This is a guardrail against accidentally pointing DATABASE_URL_TEST at dev
// or production; E2E is intentionally limited to a local PostgreSQL instance.
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!["postgresql:", "postgres:"].includes(parsedTestDbUrl.protocol)) {
  throw new Error("[test-db] DATABASE_URL_TEST must use PostgreSQL.");
}
if (!localHosts.has(parsedTestDbUrl.hostname)) {
  throw new Error("[test-db] E2E tests may only use a local PostgreSQL host.");
}
if (!/^[A-Za-z_][A-Za-z0-9_]*_test$/i.test(TEST_DB_NAME)) {
  throw new Error(
    '[test-db] DATABASE_URL_TEST must target a database whose name ends in "_test" ' +
      "and contains only safe PostgreSQL identifier characters.",
  );
}

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

  // 0. HERMETIC ENGINE PINNING - the e2e suite documents and asserts the
  // DETERMINISTIC engine's scenario buckets (fixture nonces are calibrated
  // against fnv1a32(checksum|profile) % 50). A dev .env that carries
  // OCR_SERVICE_URL(+TOKEN) would silently switch the whole suite onto the
  // real FastAPI sidecar (the factory prefers it), making every upload a
  // network call to a service that may not be running - non-hermetic,
  // environment-dependent results. The harness therefore strips the sidecar
  // config and pins the mock engine for TEST RUNS ONLY (the dev .env file
  // itself is untouched - live sidecar testing stays available to dev runs).
  // Empty URL is contract-valid ("" → undefined). The token's schema has an
  // unconditional min(32) when the string is present, so the test provides a
  // throwaway 32-char value that NEVER reaches an engine: with no serviceUrl
  // the FastAPI adapter is not registered at all.
  process.env.OCR_SERVICE_URL = "";
  process.env.OCR_SERVICE_TOKEN = "test-harness-unused-token-000000000000";
  process.env.OCR_MOCK_ENGINE = "enabled";

  // 1. Dedicated test database on the developer's own PostgreSQL server -
  // the embedded dev cluster has been removed from the project. Create it
  // best-effort via the `postgres` maintenance DB; if it already exists (or
  // the role cannot create databases), tests simply run against it.
  {
    const adminUrl = new URL(TEST_DB_URL);
    adminUrl.pathname = "/postgres";
    try {
      execFileSync(
        process.execPath,
        [prismaCliPath(), "db", "execute", "--url", adminUrl.toString(), "--command",
          `CREATE DATABASE "${TEST_DB_NAME}"`],
        { env: { ...process.env, DATABASE_URL: adminUrl.toString() }, stdio: "pipe", encoding: "utf8" },
      );
      console.log(`[test-db] created database "${TEST_DB_NAME}"`);
    } catch (error) {
      const message = String((error as { stderr?: string })?.stderr ?? error);
      if (!/already exists/i.test(message)) {
        console.warn(
          `[test-db] could not create "${TEST_DB_NAME}" (${message.trim().split("\n").pop()}). ` +
            `Assuming it exists - create it manually if tests fail to connect.`,
        );
      }
    }
  }

  // 2/3. Prisma migrations on the test database.
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
  // Fixed test-only auth secrets - NEVER used outside `cosmoz_test` runs.
  process.env.AUTH_JWT_SECRET =
    process.env.AUTH_JWT_SECRET ??
    "cosmoz-test-only-jwt-secret-0123456789abcdef0123456789";
  process.env.AUTH_MFA_ENCRYPTION_KEY =
    process.env.AUTH_MFA_ENCRYPTION_KEY ?? "h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=";
  // Accounts (Phase 3) - test-only encryption key + fast provider timeout.
  process.env.ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY =
    process.env.ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY ?? "Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo=";
  // Integration Hub (B14) - test-only webhook-secret vault key.
  process.env.INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY =
    process.env.INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY ?? "u4xveSMFK0EL4Wp6XsBmPWcimrrG7Tg9KxLFRnGzc1M=";
  process.env.ACCOUNTS_PROVIDER_TIMEOUT_MS = process.env.ACCOUNTS_PROVIDER_TIMEOUT_MS ?? "2000";
  process.env.WEB_APP_URL = process.env.WEB_APP_URL ?? "http://localhost:3000";
}
