/**
 * COSMOZ API — embedded development PostgreSQL manager.
 *
 * The sandbox/dev environment has no Docker and no root, so the dev/test
 * database runs from PORTABLE PostgreSQL binaries (via the
 * `embedded-postgres` devDependency, PostgreSQL 17) initialized as the
 * current user. This is a DEVELOPMENT/TEST convenience ONLY:
 *   - trust auth on 127.0.0.1 (no password) — never use outside localhost
 *   - real deployments use docker-compose.yml / managed PostgreSQL
 *
 * Commands:
 *   node scripts/dev-db.mjs up      → ensure the cluster runs + databases exist
 *   node scripts/dev-db.mjs status  → report cluster reachability
 *   node scripts/dev-db.mjs down    → stop the cluster
 *
 * Layout: apps/api/.localpg/{data,postgres.log} (gitignored)
 * Databases created: `cosmoz` (dev) and `cosmoz_test` (tests — guarded).
 */
import { spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const HOST = "127.0.0.1";
const PORT = 5433;
const USER = "cosmoz";
const API_ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(API_ROOT, ".localpg", "data");
const SOCKET_DIR = path.join(API_ROOT, ".localpg", "sockets");
const LOG_FILE = path.join(API_ROOT, ".localpg", "postgres.log");
const DATABASES = ["cosmoz", "cosmoz_test"];

export const DEV_DB_URL = `postgresql://${USER}@${HOST}:${PORT}/cosmoz`;
export const TEST_DB_URL = `postgresql://${USER}@${HOST}:${PORT}/cosmoz_test`;

const require_ = createRequire(import.meta.url);

/** Locate the native binaries shipped by @embedded-postgres/<platform>. */
function platformPackage() {
  const map = {
    "linux-x64": "@embedded-postgres/linux-x64",
    "darwin-arm64": "@embedded-postgres/darwin-arm64",
    "darwin-x64": "@embedded-postgres/darwin-x64",
    "win32-x64": "@embedded-postgres/windows-x64",
  };
  const key = `${process.platform}-${process.arch}`;
  const pkg = map[key];
  if (!pkg) throw new Error(`No embedded PostgreSQL binaries for platform "${key}".`);
  return pkg;
}

function bin(name) {
  const exe = process.platform === "win32" ? ".exe" : "";
  // Resolve THROUGH the embedded-postgres package context: pnpm isolation
  // hides its platform dependencies from direct require.resolve.
  const embeddedRequire = createRequire(require_.resolve("embedded-postgres"));
  const pkg = platformPackage();
  const base = packageRoot(embeddedRequire, pkg);
  const dir = path.join(base, "native", "bin");
  return path.join(dir, name + exe);
}

/**
 * Find the package root of `pkgName` as seen from `requirer`'s context.
 * Uses ./package.json when exported; otherwise resolves the main entry and
 * walks up to the directory holding its package.json.
 */
function packageRoot(requirer, pkgName) {
  try {
    return path.dirname(requirer.resolve(`${pkgName}/package.json`));
  } catch {
    const entry = requirer.resolve(pkgName);
    let dir = path.dirname(entry);
    for (let i = 0; i < 5; i += 1) {
      const candidate = path.join(dir, "package.json");
      if (fs.existsSync(candidate)) {
        const manifest = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (manifest.name === pkgName) return dir;
      }
      dir = path.dirname(dir);
    }
    throw new Error(`Could not locate package root for ${pkgName}`);
  }
}

function run(binPath, args, options = {}) {
  const result = spawnSync(binPath, args, {
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: {
      ...process.env,
      // initdb refuses to run without a writable TMPDIR in some sandboxes.
      TMPDIR: process.env.TMPDIR ?? path.join(API_ROOT, ".localpg"),
      LC_ALL: "C",
    },
    ...(options.spawn || {}),
  });
  return result;
}

function isPortOpen(port, host, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(port, host, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port, host, 500)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function ensureRunning() {
  if (await isPortOpen(PORT, HOST)) return "already-running";

  const pidFile = path.join(DATA_DIR, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    try { fs.unlinkSync(pidFile); } catch {}
  }

  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  if (!fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log(`[dev-db] initializing cluster in ${DATA_DIR} (trust auth, localhost only)`);
    const init = run(bin("initdb"), [
      "-D", DATA_DIR,
      "-U", USER,
      "-A", "trust",
      "-E", "UTF8",
      "--locale=C",
    ]);
    if (init.status !== 0) {
      throw new Error(`initdb failed with code ${init.status}`);
    }
  }

  console.log(`[dev-db] starting PostgreSQL 17 on ${HOST}:${PORT}`);
  fs.mkdirSync(SOCKET_DIR, { recursive: true });
  const start = run(bin("pg_ctl"), [
    "-D", DATA_DIR,
    "-l", LOG_FILE,
    "-o", `-p ${PORT} -k ${SOCKET_DIR}`,
    "-w", "-t", "60",
    "start",
  ]);
  if (start.status !== 0) {
    throw new Error(`pg_ctl start failed (see ${LOG_FILE})`);
  }
  if (!(await waitForPort(PORT, HOST))) {
    throw new Error(`PostgreSQL did not accept connections on ${HOST}:${PORT}`);
  }
  return "started";
}

function ensureDatabases() {
  const adminUrl = `postgresql://${USER}@${HOST}:${PORT}/postgres`;
  for (const database of DATABASES) {
    // No psql/createdb in the binary bundle — run SQL through the prisma CLI
    // (already a devDependency of apps/api, zero extra deps).
    const result = spawnSync(process.execPath, [prismaCliPath(), "db", "execute", "--url", adminUrl, "--stdin"], {
      input: `CREATE DATABASE "${database}";`,
      stdio: ["pipe", "ignore", "pipe"],
      encoding: "utf8",
    });
    if (result.status === 0) {
      console.log(`[dev-db] created database "${database}"`);
    } else if (result.stderr?.includes("already exists")) {
      // expected on re-runs
    } else {
      console.warn(`[dev-db] create "${database}": ${result.stderr?.trim().split("\n").slice(-1)[0] ?? "unknown error"}`);
    }
  }
}

/** Absolute path of the prisma CLI (node_modules/.bin is a shell shim — unreliable). */
function prismaCliPath() {
  const root = packageRoot(require_, "prisma");
  return path.join(root, "build", "index.js");
}

async function main() {
  const command = process.argv[2] ?? "status";
  if (command === "up") {
    const state = await ensureRunning();
    console.log(`[dev-db] cluster ${state}`);
    ensureDatabases();
    console.log(`[dev-db] DEV : ${DEV_DB_URL}`);
    console.log(`[dev-db] TEST: ${TEST_DB_URL}`);
    if (process.argv.includes("--watch") || process.argv.includes("--foreground")) {
      console.log("[dev-db] running in foreground (Ctrl+C to stop)...");
      const cleanup = () => {
        run(bin("pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "stop"]);
        process.exit(0);
      };
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
      setInterval(() => {}, 1000 * 60 * 60);
      await new Promise(() => {});
    }
    return;
  }
  if (command === "status") {
    const open = await isPortOpen(PORT, HOST);
    console.log(open ? `[dev-db] running at ${HOST}:${PORT}` : `[dev-db] not running`);
    return;
  }
  if (command === "down") {
    const stop = run(bin("pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "stop"]);
    process.exitCode = stop.status === 0 ? 0 : 1;
    return;
  }
  console.error(`[dev-db] unknown command "${command}" (use: up | status | down)`);
  process.exitCode = 1;
}

/** Importable API (used by vitest global-setup): cluster up + databases exist. */
export async function ensureDevDb() {
  const state = await ensureRunning();
  if (state === "started") console.log(`[dev-db] cluster started`);
  ensureDatabases();
}

// CLI mode — also importable by test/global-setup.
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    console.error("[dev-db] fatal:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
