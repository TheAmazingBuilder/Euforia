// Sanity check: count rows in key tables of the embedded Postgres (cosmoz)
// Run from apps/api so it resolves @prisma/client and apps/api/.env
process.env.DATABASE_URL = 'postgresql://cosmoz@127.0.0.1:5433/cosmoz';
const { PrismaClient } = require('/home/z/my-project/apps/api/node_modules/@prisma/client');
const p = new PrismaClient();

const TABLES = [
  'Trade', 'TradePlan', 'AnalysisScenario', 'OryonAnalysis',
  'TradingAccount', 'User', 'JournalEntry', 'Playbook',
];

(async () => {
  const results = {};
  for (const t of TABLES) {
    try {
      const exists = await p.$queryRawUnsafe(
        `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_name = $1`, t
      );
      if (!exists[0] || exists[0].c === 0) { results[t] = 'TABLE_ABSENT'; continue; }
      const r = await p.$queryRawUnsafe(`SELECT count(*)::int AS c FROM "${t}"`);
      results[t] = r[0].c;
    } catch (e) {
      results[t] = 'ERR:' + String(e.message).slice(0, 60);
    }
  }
  console.log(JSON.stringify(results, null, 2));
  const total = Object.values(results).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
  console.log('TOTAL_ROWS_SAMPLED:', total);
  await p.$disconnect();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
