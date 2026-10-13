// READ-ONLY diagnostic for the Accounts/Trading-Connectivity audit (Phase 00).
// Uses PrismaClient.$queryRawUnsafe exclusively — SELECT / information_schema
// only. No writes, no migrations. Prints table names + row counts and column
// types; never touches env values.
import { createRequire } from "node:module";
// Resolve the API workspace's generated Prisma client (pnpm layout).
const requireFromApi = createRequire("/home/z/my-project/apps/api/package.json");
const { PrismaClient } = requireFromApi("@prisma/client");

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://cosmoz@127.0.0.1:5433/cosmoz" } },
});

const ACCOUNT_RELATED = [
  "TradingAccount",
  "TradingConnection",
  "TradingAccountSnapshot",
  "TradingPosition",
  "TradingOrder",
  "TradingDeal",
  "TradingSyncRun",
  "Trade",
  "TradeExecution",
  "TradeExit",
  "TradeEvent",
  "TradeScreenshot",
  "TradePlan",
  "Instrument",
  "IntegrationRow",
  "IntegrationConnection",
  "IntegrationEvent",
  "IntegrationError",
  "IntegrationWebhookEndpoint",
  "IntegrationWebhookDelivery",
  "User",
];

async function main() {
  // 1. All user tables in the public schema (to find un-modeled tables).
  const tables = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  console.log("=== USER TABLES (public schema) ===");
  const names = tables.map((t) => t.table_name);
  console.log(names.join("\n"));

  // 2. Row counts for account/integration-related tables that exist.
  console.log("\n=== ROW COUNTS (account/integration-related) ===");
  for (const name of ACCOUNT_RELATED) {
    if (!names.includes(name)) {
      console.log(`${name}: <table does not exist>`);
      continue;
    }
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "${name}"`,
    );
    console.log(`${name}: ${rows[0].count}`);
  }

  // 3. Column types for the core account-domain tables.
  const detailTables = [
    "TradingAccount",
    "TradingConnection",
    "TradingAccountSnapshot",
    "TradingDeal",
    "TradingPosition",
    "TradingSyncRun",
    "IntegrationConnection",
    "IntegrationWebhookEndpoint",
  ];
  console.log("\n=== COLUMN TYPES (information_schema.columns) ===");
  for (const table of detailTables) {
    if (!names.includes(table)) continue;
    const cols = await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      table,
    );
    console.log(`\n-- ${table}`);
    for (const c of cols) {
      console.log(
        `  ${c.column_name} : ${c.data_type}${c.udt_name && c.data_type === "USER-DEFINED" ? `(${c.udt_name})` : ""}${c.is_nullable === "NO" ? " NOT NULL" : ""}`,
      );
    }
  }

  // 4. Unique + partial indexes on the account-domain tables (constraint evidence).
  console.log("\n=== UNIQUE INDEXES (account-domain) ===");
  const idx = await prisma.$queryRawUnsafe(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND (
       tablename LIKE 'Trading%' OR tablename LIKE 'Integration%'
     )
     ORDER BY tablename, indexname`,
  );
  for (const row of idx) {
    console.log(`${row.tablename} :: ${row.indexname}\n    ${row.indexdef}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("AUDIT SCRIPT ERROR:", err?.message ?? err);
    await prisma.$disconnect();
    process.exit(1);
  });
