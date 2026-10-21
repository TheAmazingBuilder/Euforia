/**
 * Vitest global setup.
 *
 * Tests require an externally managed, dedicated PostgreSQL database:
 * TEST_DATABASE_URL must target /euforia_test and must never equal DATABASE_URL.
 * Migrations are applied to that database before workers start; no database is
 * created, reset, dropped, or truncated by the test harness.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

function loadLocalEnv(): void {
  // Node's --env-file is used by the API runtime, but Vitest does not load
  // process.env from .env automatically. Read only missing keys; never log values.
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    process.env[match[1]] = value;
  }
}

function prismaCliPath(): string {
  const requireFromApi = createRequire(path.join(process.cwd(), "package.json"));
  try {
    return requireFromApi.resolve("prisma/build/index.js");
  } catch {
    const entry = requireFromApi.resolve("prisma");
    let dir = path.dirname(entry);
    for (let i = 0; i < 5; i += 1) {
      const candidate = path.join(dir, "build", "index.js");
      if (fs.existsSync(candidate)) return candidate;
      dir = path.dirname(dir);
    }
    throw new Error("Could not locate the Prisma CLI entry.");
  }
}

function parseDatabaseUrl(value: string, name: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch {
    throw new Error(`[test-safety] ${name} is not a valid URL.`);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`[test-safety] ${name} must use PostgreSQL.`);
  }
  return parsed;
}

export default async function globalSetup(): Promise<void> {
  loadLocalEnv();
  process.env.NODE_ENV = "test";

  const testUrl = process.env.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;
  if (!testUrl) {
    throw new Error("[test-safety] TEST_DATABASE_URL is required. Configure it in apps/api/.env or the shell.");
  }
  const testDb = parseDatabaseUrl(testUrl, "TEST_DATABASE_URL");
  if (testDb.pathname !== "/euforia_test") {
    throw new Error('[test-safety] TEST_DATABASE_URL must target the dedicated "euforia_test" database.');
  }
  if (devUrl) {
    const devDb = parseDatabaseUrl(devUrl, "DATABASE_URL");
    if (testDb.hostname === devDb.hostname && testDb.port === devDb.port &&
        testDb.pathname === devDb.pathname) {
      throw new Error("[test-safety] TEST_DATABASE_URL must not point to the development database.");
    }
  }

  // Hermetic OCR test configuration: do not call a live FastAPI sidecar.
  process.env.OCR_SERVICE_URL = "";
  process.env.OCR_SERVICE_TOKEN = "test-harness-unused-token-000000000000";
  process.env.OCR_MOCK_ENGINE = "enabled";

  process.env.DATABASE_URL = testUrl;
  execFileSync(process.execPath, [prismaCliPath(), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testUrl;
  process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET ??
    "cosmoz-test-only-jwt-secret-0123456789abcdef0123456789";
  process.env.AUTH_MFA_ENCRYPTION_KEY = process.env.AUTH_MFA_ENCRYPTION_KEY ??
    "h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=";
  process.env.ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY = process.env.ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY ??
    "Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo=";
  process.env.INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY = process.env.INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY ??
    "u4xveSMFK0EL4Wp6XsBmPWcimrrG7Tg9KxLFRnGzc1M=";
  process.env.ACCOUNTS_PROVIDER_TIMEOUT_MS = process.env.ACCOUNTS_PROVIDER_TIMEOUT_MS ?? "2000";
  process.env.WEB_APP_URL = process.env.WEB_APP_URL ?? "http://localhost:3000";
}
