import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // SWC restores TypeScript decorator metadata (emitDecoratorMetadata) that
  // esbuild (vitest's default transformer) cannot emit — required for Nest
  // dependency injection in tests. Only workspace sources are transformed;
  // node_modules stay untouched.
  plugins: [
    swc.vite({ module: { type: "es6" } }),
  ],
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    // global-setup validates TEST_DATABASE_URL for the dedicated external
    // `euforia_test` database, applies migrations, and exports DATABASE_URL.
    globalSetup: ["test/global-setup.ts"],
    // setup: fail-fast guard asserting the process env is the TEST database
    // (defense in depth on top of global-setup).
    setupFiles: ["test/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Isolated process per test file: each e2e file boots its own Nest app.
    pool: "forks",
  },
});
