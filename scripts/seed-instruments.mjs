#!/usr/bin/env node
/**
 * seed-instruments.mjs — idempotent re-application of the canonical
 * Instrument catalog seed (7 rows with FIXED UUIDs from migration
 * 20261004120000_trade_journal_core).
 *
 * WHY THIS EXISTS: the sandbox-recovery path (`db push` + `migrate resolve
 * --applied`) syncs the SCHEMA but never executes migration SQL — so a
 * rebuilt database has NO instruments, and both the deals→trades
 * reconstruction AND the CSV import skip every symbol as "unknown".
 * This script restores the catalog without touching any other table.
 *
 * Usage: node scripts/seed-instruments.mjs [postgres-url]
 *   default url: postgresql://cosmoz@127.0.0.1:5433/cosmoz
 * Idempotent: ON CONFLICT DO NOTHING (fixed ids + unique symbols).
 */
const URL = process.argv[2] ?? "postgresql://cosmoz@127.0.0.1:5433/cosmoz";

const INSTRUMENTS = [
  ["3f9a1c2e-7b64-4d2a-9f1e-2c8b5a7d1001", "EURUSD", "Euro / US Dollar", "FOREX", "USD", "0.0001", 5, "100000"],
  ["4a8b2d3f-8c75-4e3b-8a2f-3d9c6b8e1002", "GBPUSD", "British Pound / US Dollar", "FOREX", "USD", "0.0001", 5, "100000"],
  ["5b9c3e4a-9d86-4f4c-9b3a-4e0d7c9f1003", "XAUUSD", "Gold / US Dollar", "METAL", "USD", "0.01", 2, "100"],
  ["6c0d4f5b-0e97-4a5d-8c4b-5f1e8d0a1004", "BTCUSDT", "Bitcoin / US Dollar", "CRYPTO", "USD", "1", 2, "1"],
  ["7d1e5a6c-1fa8-4b6e-9d5c-6a2f9e1b1005", "BOOM500", "Boom 500 Index", "SYNTHETIC", "USD", "0.01", 2, "1"],
  ["8e2f6b7d-2ab9-4c7f-8e6d-7b3a0f2c1006", "CRASH500", "Crash 500 Index", "SYNTHETIC", "USD", "0.01", 2, "1"],
  ["9f3a7c8e-3bca-4d8a-9f7e-8c4b1a3d1007", "VOL75(1s)", "Volatility 75 (1s) Index", "SYNTHETIC", "USD", "0.01", 2, "1"],
];

const SQL = `
INSERT INTO "Instrument" ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "digits", "contractSize", "isActive") VALUES
${INSTRUMENTS.map(
  ([id, symbol, name, assetClass, quote, pip, digits, contract]) =>
    `('${id}', '${symbol}', '${name}', '${assetClass}', '${quote}', '${pip}', ${digits}, '${contract}', true)`,
).join(",\n")}
ON CONFLICT DO NOTHING;

-- InstrumentSpecification rows (from scripts/migration-seeds.sql, unwired
-- until now) — required by the trade-plan risk engine / validator and the
-- calculators. BTCUSDT added to mirror the Instrument catalog.
INSERT INTO "InstrumentSpecification"
  ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "contractSize", "minVolume", "maxVolume", "volumeStep", "digits", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'EURUSD', 'Euro / US Dollar',        'FOREX',    'USD', 0.0001, 100000, 0.01, 100, 0.01, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GBPUSD', 'British Pound / US Dollar','FOREX',   'USD', 0.0001, 100000, 0.01, 100, 0.01, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'USDJPY', 'US Dollar / Japanese Yen', 'FOREX',    'JPY', 0.01,   100000, 0.01, 100, 0.01, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'XAUUSD', 'Gold / US Dollar',         'METAL',    'USD', 0.1,    100,    0.01, 50,  0.01, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BTCUSD', 'Bitcoin / US Dollar',      'CRYPTO',   'USD', 1,      1,      0.01, 100, 0.01, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BTCUSDT', 'Bitcoin / USDT',         'CRYPTO',   'USD', 1,      1,      0.01, 100, 0.01, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'US30',   'Dow Jones 30',             'INDEX',    'USD', 1,      1,      0.1,  100, 0.1,  1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NAS100', 'Nasdaq 100',               'INDEX',    'USD', 1,      1,      0.1,  100, 0.1,  1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("symbol") DO NOTHING;
`;

// pg resolves through the repo's pnpm store (embedded-postgres dependency) —
// no direct dependency needed. Version discovered dynamically, fallback by glob.
const { readdirSync } = await import("node:fs");
const pnpmDir = "/home/z/my-project/node_modules/.pnpm";
const pgDir = readdirSync(pnpmDir).find((name) => name.startsWith("pg@"));
if (!pgDir) throw new Error("pg package not found in the pnpm store");
const mod = await import(`${pnpmDir}/${pgDir}/node_modules/pg/lib/index.js`);
const { Client } = mod.default ?? mod;

const client = new Client({ connectionString: URL });
await client.connect();
const before = await client.query('SELECT count(*)::int AS n FROM "Instrument"');
await client.query(SQL);
const after = await client.query('SELECT count(*)::int AS n FROM "Instrument"');
console.log(
  `instruments: ${before.rows[0].n} → ${after.rows[0].n} (seeded 7, ON CONFLICT skipped)`,
);
await client.end();
