/**
 * Per-worker test-safety guard (Phase 1 mandate §25 + §33).
 *
 * FAILS the run unless the process environment targets the dedicated
 * `euforia_test` database with NODE_ENV=test. This is the last line of
 * defense against ever touching a production database from tests.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "[test-safety] DATABASE_URL is not set. The test harness must provide it (vitest global-setup).",
  );
}

let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  throw new Error("[test-safety] DATABASE_URL is not a valid URL.");
}

if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
  throw new Error(`[test-safety] DATABASE_URL must be PostgreSQL (got ${parsed.protocol}).`);
}

if (parsed.pathname !== "/euforia_test") {
  throw new Error(
    `[test-safety] Refusing to run tests against database "${parsed.pathname}". ` +
      `Tests require the dedicated "euforia_test" database.`,
  );
}

if (process.env.NODE_ENV !== "test") {
  throw new Error(
    `[test-safety] NODE_ENV must be "test" (got "${process.env.NODE_ENV ?? "unset"}").`,
  );
}
