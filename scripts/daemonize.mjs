#!/usr/bin/env node
/**
 * Daemonize a command the way pg_ctl does it (double-detach): the child is
 * spawned with detached: true (new process group + session), stdio ignored,
 * and unref()d so the parent Node process exits immediately — the child is
 * re-parented to init and survives the agent tool-session teardown.
 *
 * Usage: node scripts/daemonize.mjs -- <command> [args...]
 */
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const dashdash = argv.indexOf("--");
const cmd = argv.slice(dashdash === -1 ? 0 : dashdash + 1);
if (cmd.length === 0) {
  console.error("usage: node daemonize.mjs [--] <command> [args...]");
  process.exit(1);
}

const child = spawn(cmd[0], cmd.slice(1), {
  detached: true,
  stdio: "ignore",
  cwd: process.env.DAEMON_CWD ?? process.cwd(),
  env: process.env,
});
child.unref();
console.log(`daemonized pid=${child.pid} cmd=${cmd.join(" ")}`);
