#!/usr/bin/env node
/**
 * Minimal SQL query utility for the COSMOZ dev DB (5433).
 * Usage: node scripts/db-query.js "SELECT ..."
 */
const path = '/home/z/my-project/node_modules/.pnpm/pg@8.23.1/node_modules/pg';
const { Client } = require(path);

const sql = process.argv[2];
if (!sql) {
  console.error('Usage: node scripts/db-query.js "<sql>"');
  process.exit(1);
}

const client = new Client({ connectionString: 'postgresql://cosmoz@127.0.0.1:5433/cosmoz' });
client
  .connect()
  .then(() => client.query(sql))
  .then((r) => {
    if (r.rows && r.rows.length > 0) {
      console.log(JSON.stringify(r.rows, null, 1));
    } else {
      console.log(`OK (${r.command}, rowCount=${r.rowCount})`);
    }
    return client.end();
  })
  .catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
  });
