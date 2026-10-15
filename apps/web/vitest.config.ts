import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Web unit tests (Phase 01) — pure logic only (dashboard customization
 * model/registry/templates/persistence/reducer). No DOM, no jsdom, no
 * component mounting: UI flows are verified by the Playwright probes in
 * /scripts (the established web verification infrastructure).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/dashboard-customization/__tests__/**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
