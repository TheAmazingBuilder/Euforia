/** Recreate the cosmoz_test database from scratch (fixes dirty migration state). */
const { createRequire } = require("module");
const path = require("path");

const { Client } = require("/home/z/my-project/node_modules/.pnpm/pg@8.23.1/node_modules/pg");

(async () => {
  const c = new Client({ host: "127.0.0.1", port: 5433, user: "cosmoz", database: "postgres" });
  await c.connect();
  await c.query('DROP DATABASE IF EXISTS "cosmoz_test"');
  await c.query('CREATE DATABASE "cosmoz_test" OWNER "cosmoz"');
  console.log("cosmoz_test recreated");
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
