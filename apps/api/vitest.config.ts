import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // SWC restores TypeScript decorator metadata (emitDecoratorMetadata) that
  // esbuild (vitest's default transformer) cannot emit - required for Nest
  // dependency injection in tests. Only workspace sources are transformed;
  // node_modules stay untouched.
  plugins: [
    swc.vite({ module: { type: "es6" } }),
  ],
  test: {
    environment: "node",
    // Default run = pure unit specs only (no database required). E2E specs
    // live behind an explicit flag because they need a real local PostgreSQL
    // server (see test/global-setup.ts header).
    include: ["test/unit/**/*.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Isolated process per test file: each e2e file boots its own Nest app.
    pool: "forks",

    // ---- E2E harness (opt-in) --------------------------------------------
    // Activate with:  COSMOZ_E2E=1 pnpm --filter @cosmoz/api exec vitest run
    // or:             pnpm --filter @cosmoz/api test:e2e
    //
    // global-setup: creates the dedicated test database (DATABASE_URL_TEST,
    // default cosmoz_test), applies Prisma migrations, and exports the test
    // DATABASE_URL so no test can ever target another DB.
    // setup: fail-fast guard asserting the process env is the TEST database
    // (defense in depth on top of global-setup).
    ...(process.env.COSMOZ_E2E === "1"
      ? {
          include: ["test/e2e/**/*.spec.ts"],
          globalSetup: ["test/global-setup.ts"],
          setupFiles: ["test/setup.ts"],
        }
      : {}),
  },
});
