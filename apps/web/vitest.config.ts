import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Web unit tests — pure logic only: (Phase 01 + Phase 07) the dashboard
 * customization model/registry/templates/persistence/reducer + notification
 * rule summaries, and (MASTER QA) the canonical API-mode matrix. No DOM,
 * no jsdom, no component mounting: UI flows are verified by the Playwright
 * probes in /scripts (the established web verification infrastructure).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/lib/dashboard-customization/__tests__/**/*.spec.ts",
      "src/lib/notifications/__tests__/**/*.spec.ts",
      "src/lib/api/__tests__/**/*.spec.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
