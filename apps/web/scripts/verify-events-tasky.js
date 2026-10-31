/**
 * Combined regression runner for the two independent Academy workspaces.
 * Events verifies its authenticated PostgreSQL board; Tasky verifies its own
 * persisted Kanban workflow. Kept as one entry point for existing workflows.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification launcher */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const scripts = ["verify-events.js", "verify-tasky.js"];
let failed = false;

for (const script of scripts) {
  console.log(`\n=== Running ${script} ===\n`);
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Unable to start ${script}:`, result.error);
    failed = true;
  } else if (result.status !== 0) {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
