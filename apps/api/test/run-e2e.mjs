/**
 * Cross-platform launcher for the E2E harness (Windows PowerShell/cmd safe:
 * no shell-dependent `VAR=value cmd` prefix needed).
 * Usage: pnpm --filter @cosmoz/api test:e2e [extra vitest args]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const vitestBin = path.join(here, "..", "..", "..", "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest");

const result = spawnSync(vitestBin, ["run", ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.join(here, ".."),
  env: { ...process.env, COSMOZ_E2E: "1" },
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
