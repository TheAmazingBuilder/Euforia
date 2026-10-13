import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * apps/web unit tests (Phase 2 drawing subsystem). Node environment: the
 * drawing domain model, projection math, geometry, state machine and
 * persistence schema are all pure TypeScript — no DOM required. Canvas
 * rendering itself is verified through the Playwright browser probe
 * (scripts/verify-oryon-drawings.js), mirroring the repo's verification
 * convention. The `@/` alias mirrors apps/web/tsconfig.json.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
