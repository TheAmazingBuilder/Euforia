/**
 * Baseline the cosmoz_test database (Prisma "baselining an existing database"):
 *   1. drop + recreate cosmoz_test
 *   2. prisma db push — builds the CURRENT schema.prisma state (the migration
 *      history is order-inverted for a from-scratch deploy: 20261003145823_
 *      trade_review references "Trade", created by 20261004120000_trade_
 *      journal_core — a recovery-session artifact; the dev DB predates this)
 *   3. mark every migration directory as applied in _prisma_migrations so
 *      `migrate deploy` (vitest globalSetup) is a no-op and future migrations
 *      apply normally on top.
 */
const { createRequire } = require("module");
const path = require("path");
const fs = require("fs");
const { Client } = require("/home/z/my-project/node_modules/.pnpm/pg@8.23.1/node_modules/pg");

const API = "/home/z/my-project/apps/api";
const req = createRequire(path.join(API, "package.json"));
const prismaCli = req.resolve("prisma/build/index.js");
const { spawnSync } = require("child_process");

const TEST_URL = "postgresql://cosmoz@127.0.0.1:5433/cosmoz_test";
const ADMIN = { host: "127.0.0.1", port: 5433, user: "cosmoz", database: "postgres" };

function run(cli, args) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: API,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
  if (r.status !== 0) throw new Error(`prisma ${args.join(" ")} failed`);
}

(async () => {
  // 1. recreate
  const admin = new Client(ADMIN);
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS "cosmoz_test"');
  await admin.query('CREATE DATABASE "cosmoz_test" OWNER "cosmoz"');
  await admin.end();
  console.log("[baseline] cosmoz_test recreated");

  // 2. current schema, no migration history
  run(prismaCli, ["db", "push", "--skip-generate", "--accept-data-loss"]);
  console.log("[baseline] schema pushed");

  // 3. mark all migrations applied
  const migrationsDir = path.join(API, "prisma", "migrations");
  const names = fs
    .readdirSync(migrationsDir)
    .filter((n) => fs.statSync(path.join(migrationsDir, n)).isDirectory());
  const c = new Client({ host: "127.0.0.1", port: 5433, user: "cosmoz", database: "cosmoz_test" });
  await c.connect();
  await c.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ(6),
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ(6),
      started_at TIMESTAMPTZ(6) NOT NULL,
      applied_steps_count INTEGER NOT NULL DEFAULT 0
  )`);
  for (const name of names) {
    await c.query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES (gen_random_uuid(), '', now(), $1, NULL, NULL, now(), 1)
       ON CONFLICT DO NOTHING`,
      [name],
    );
  }
  const { rows } = await c.query('SELECT count(*)::int AS n FROM "_prisma_migrations"');
  console.log(`[baseline] ${rows[0].n} migrations marked applied`);
  await c.end();
  console.log("[baseline] done");
})().catch((e) => {
  console.error("[baseline] FAILED:", e.message);
  process.exit(1);
});
