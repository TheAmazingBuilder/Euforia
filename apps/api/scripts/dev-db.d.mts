/**
 * Test database (embedded PostgreSQL) — shared with scripts/dev-db.mjs.
 * Only the CJS/TS-facing surface needed by test/global-setup.ts.
 */
export declare function ensureDevDb(): Promise<void>;
export declare const TEST_DB_URL: string;
export declare const DEV_DB_URL: string;
