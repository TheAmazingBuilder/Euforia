/**
 * COSMOZ — Phase 20 §59 database integrity checks.
 *
 * Runs user-scoped integrity assertions over the REAL tables (test database
 * populated by the e2e suite): orphaned references, duplicated records,
 * inconsistent status. Read-only — no repair logic is applied (§59: create
 * repair/migration logic only when genuinely required).
 *
 * Usage: node scripts/phase20-db-integrity.mjs <DATABASE_URL>
 */
import { createRequire } from "node:module";
import path from "node:path";

const url = process.argv[2];
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error("Usage: node scripts/phase20-db-integrity.mjs <postgres://-url>");
  process.exit(2);
}

const requireFromApi = createRequire(path.join(process.cwd(), "package.json"));
const { PrismaClient } = requireFromApi("@prisma/client");

const prisma = new PrismaClient({ datasources: { db: { url } } });

const CHECKS = `
SELECT 'orphan_sessions' AS check, count(*)::int AS n FROM "Session" s LEFT JOIN "User" u ON u.id=s."userId" WHERE u.id IS NULL
UNION ALL SELECT 'orphan_security_events', count(*)::int FROM "SecurityEvent" e LEFT JOIN "User" u ON u.id=e."userId" WHERE e."userId" IS NOT NULL AND u.id IS NULL
UNION ALL SELECT 'orphan_login_records', count(*)::int FROM "LoginRecord" l LEFT JOIN "User" u ON u.id=l."userId" WHERE u.id IS NULL
UNION ALL SELECT 'orphan_trading_accounts', count(*)::int FROM "TradingAccount" a LEFT JOIN "User" u ON u.id=a."userId" WHERE u.id IS NULL
UNION ALL SELECT 'orphan_connections', count(*)::int FROM "TradingConnection" c LEFT JOIN "TradingAccount" a ON a.id=c."accountId" WHERE a.id IS NULL
UNION ALL SELECT 'orphan_snapshots', count(*)::int FROM "TradingAccountSnapshot" s LEFT JOIN "TradingAccount" a ON a.id=s."accountId" WHERE a.id IS NULL
UNION ALL SELECT 'orphan_positions', count(*)::int FROM "TradingPosition" p LEFT JOIN "TradingAccount" a ON a.id=p."accountId" WHERE a.id IS NULL
UNION ALL SELECT 'orphan_orders', count(*)::int FROM "TradingOrder" o LEFT JOIN "TradingAccount" a ON a.id=o."accountId" WHERE a.id IS NULL
UNION ALL SELECT 'orphan_deals', count(*)::int FROM "TradingDeal" d LEFT JOIN "TradingAccount" a ON a.id=d."accountId" WHERE a.id IS NULL
UNION ALL SELECT 'orphan_sync_runs', count(*)::int FROM "TradingSyncRun" r LEFT JOIN "TradingAccount" a ON a.id=r."accountId" WHERE a.id IS NULL
UNION ALL SELECT 'orphan_ocr_assets', count(*)::int FROM "OcrAsset" x LEFT JOIN "User" u ON u.id=x."userId" WHERE u.id IS NULL
UNION ALL SELECT 'orphan_ocr_recognitions', count(*)::int FROM "OcrRecognition" g LEFT JOIN "OcrAsset" x ON x.id=g."assetId" WHERE x.id IS NULL
UNION ALL SELECT 'orphan_ocr_recognition_users', count(*)::int FROM "OcrRecognition" g LEFT JOIN "User" u ON u.id=g."userId" WHERE u.id IS NULL
UNION ALL SELECT 'orphan_monitoring_settings', count(*)::int FROM "MonitoringSetting" m LEFT JOIN "User" u ON u.id=m."userId" WHERE u.id IS NULL
UNION ALL SELECT 'dup_ocr_idempotency', count(*)::int FROM (SELECT 1 FROM "OcrRecognition" GROUP BY "userId","idempotencyKey" HAVING count(*)>1) t
UNION ALL SELECT 'dup_ocr_asset_checksum', count(*)::int FROM (SELECT 1 FROM "OcrAsset" GROUP BY "userId","checksumSha256" HAVING count(*)>1) t
UNION ALL SELECT 'dup_provider_identity', count(*)::int FROM (SELECT 1 FROM "TradingAccount" GROUP BY "userId","providerId","externalAccountId" HAVING count(*)>1) t
UNION ALL SELECT 'concurrent_running_syncs', count(*)::int FROM (SELECT 1 FROM "TradingSyncRun" WHERE status='RUNNING' GROUP BY "accountId" HAVING count(*)>1) t
UNION ALL SELECT 'invalid_recognition_status', count(*)::int FROM "OcrRecognition" WHERE status NOT IN ('QUEUED','PROCESSING','REVIEW_REQUIRED','FAILED','CONFIRMED')
UNION ALL SELECT 'invalid_connection_status', count(*)::int FROM "TradingConnection" WHERE status NOT IN ('DISCONNECTED','CONNECTING','CONNECTED','ERROR')
UNION ALL SELECT 'confirmed_without_corrections', count(*)::int FROM "OcrRecognition" WHERE status='CONFIRMED' AND ("corrections" IS NULL OR "confirmedAt" IS NULL)
`;

try {
  const rows = await prisma.$queryRawUnsafe(CHECKS);
  let failures = 0;
  for (const row of rows) {
    const bad = Number(row.n) > 0;
    if (bad) failures += 1;
    console.log(`${bad ? "FAIL" : " ok "}  ${row.check.padEnd(30)} ${row.n}`);
  }
  console.log(failures === 0 ? "\nINTEGRITY: ALL CHECKS PASSED" : `\nINTEGRITY: ${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await prisma.$disconnect();
}
