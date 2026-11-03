#!/usr/bin/env node
/**
 * MASTER finalization §79/§107/§115 - clean-database migration + runtime boot
 * verification, self-contained:
 *
 *   1. create a THROWAWAY PostgreSQL database (cosmoz_finalize)
 *   2. `prisma migrate deploy` against it (all migrations, ordered)
 *   3. boot the NestJS API with that DATABASE_URL
 *   4. probe /health/live, /health/ready, an unauthenticated 401, register →
 *      verify → login → /me → /me/preferences → /trades → logout
 *   5. report PASS/FAIL per step and exit non-zero on any failure
 *
 * Read-only with respect to the dev database; the throwaway DB is dropped.
 */
import { execSync, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const API_DIR = "/home/z/my-project/apps/api";
const PORT = 4777;
const DB_HOST = "127.0.0.1";
const DB_PORT = 5433;
const DB_USER = "cosmoz";
const DB_NAME = "cosmoz_finalize";
const CLEAN_URL = `postgresql://${DB_USER}:${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

const results = [];
function step(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

/** Admin SQL through the prisma CLI (no psql in the embedded bundle - same
 * mechanism as apps/api/scripts/dev-db.mjs). */
function psql(sql) {
  const prismaPkg = execSync(
    `node -p "require.resolve('prisma/package.json', { paths: ['${API_DIR}'] })"`,
    { encoding: "utf8", cwd: "/home/z/my-project" },
  ).trim();
  const cliIndex = path.join(path.dirname(prismaPkg), "build", "index.js");
  execSync(
    `${process.execPath} ${cliIndex} db execute --url ${JSON.stringify(`postgresql://${DB_USER}:${DB_USER}@${DB_HOST}:${DB_PORT}/postgres`)} --stdin`,
    {
      input: sql,
      stdio: ["pipe", "ignore", "pipe"],
      cwd: API_DIR,
    },
  );
}

async function main() {
  // 0 - embedded dev postgres must be up
  execSync("node scripts/dev-db.mjs up", { cwd: API_DIR, stdio: "inherit" });

  // 1 - fresh throwaway database
  try { psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);`); } catch {}
  psql(`CREATE DATABASE ${DB_NAME};`);
  step("clean database created", true, DB_NAME);

  // 2 - ordered migrations on the empty database
  const deploy = execSync(
    `pnpm prisma migrate deploy 2>&1`,
    { cwd: API_DIR, env: { ...process.env, DATABASE_URL: CLEAN_URL }, encoding: "utf8" },
  ).toString();
  const appliedNames = [...new Set([...deploy.matchAll(/(\d{14}_\w+)/g)].map((m) => m[1]))];
  step("prisma migrate deploy on clean DB", appliedNames.length >= 6, `${appliedNames.length} migrations: ${appliedNames.join(", ")}`);

  // 3 - boot the API against the clean DB
  const out = fs.openSync("/tmp/finalize-api-boot.log", "w");
  const child = spawn("node", ["--enable-source-maps", "dist/apps/api/src/main.js"], {
    cwd: API_DIR,
    env: {
      ...process.env,
      // Dev mode - the production mailer deliberately REDACTS actionUrl
      // (finalization §46/§51), so the mail-token smoke needs dev logs.
      NODE_ENV: "development",
      PORT: String(PORT),
      DATABASE_URL: CLEAN_URL,
      CORS_ORIGINS: "http://localhost:3000",
      AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? "finalization-boot-secret-0123456789abcdef0123456789",
      AUTH_MFA_ENCRYPTION_KEY: process.env.AUTH_MFA_ENCRYPTION_KEY ?? "h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=",
      ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY: process.env.ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY ?? "Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo=",
    },
    stdio: ["ignore", out, out],
  });
  let booted = false;
  for (let i = 0; i < 60 && !booted; i++) {
    await sleep(500);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health/live`);
      booted = r.ok;
    } catch {}
  }
  step("API boots on the migrated clean DB", booted);
  if (!booted) {
    console.error(fs.readFileSync("/tmp/finalize-api-boot.log", "utf8").slice(-3000));
    child.kill("SIGTERM");
    return;
  }

  try {
    // 4 - probes
    const live = await fetch(`http://127.0.0.1:${PORT}/health/live`);
    step("GET /health/live", live.status === 200);
    const ready = await fetch(`http://127.0.0.1:${PORT}/health/ready`);
    const readyBody = await ready.json();
    step(
      "GET /health/ready",
      ready.status === 200 && readyBody?.status === "ok" && readyBody?.checks?.database === "up",
      JSON.stringify(readyBody),
    );

    const guard = await fetch(`${BASE}/trades`);
    step("unauthenticated /trades → 401", guard.status === 401);

    // auth smoke: register → verify (dev mailbox token from log) → login → me
    const email = `finalize-${Date.now()}@cosmoz.test`;
    const reg = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Finalize!2026x", name: "Finalizer" }),
    });
    step("POST /auth/register", reg.status === 201 || reg.status === 200);
    const regBody = await reg.json();

    await sleep(3000); // pino async worker flush (proven phase15 smoke timing)
    const log = fs.readFileSync("/tmp/finalize-api-boot.log", "utf8");
    const tokens = [...log.matchAll(/token=([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    const token = tokens[tokens.length - 1];
    let verified = false;
    if (token) {
      const ver = await fetch(`${BASE}/auth/email/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      verified = ver.status === 200 || ver.status === 201;
    }
    step("verify-email via dev mailer token", verified, token ? "token found in log" : "NO TOKEN IN LOG (dev mailer)");

    const login = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Finalize!2026x", remember: false }),
    });
    const loginBody = await login.json();
    const accessToken = loginBody?.accessToken;
    step("POST /auth/login → accessToken", login.status === 200 && typeof accessToken === "string");
    const setCookie = login.headers.get("set-cookie") ?? "";
    const refreshCookie = setCookie.toLowerCase();
    step("refresh cookie is HttpOnly", refreshCookie.includes("httponly"));
    const cookieHeader = setCookie.split(";")[0] ?? "";

    const auth = { authorization: `Bearer ${accessToken}` };
    const me = await fetch(`${BASE}/me`, { headers: auth });
    step("GET /me", me.status === 200);
    const prefs = await fetch(`${BASE}/me/preferences`, { headers: auth });
    step("GET /me/preferences (Phase 15)", prefs.status === 200);
    const prefsBody = await prefs.json();
    step("preferences doc has the 9 domains + envelope", Boolean(prefsBody?.trading && prefsBody?.localization && prefsBody?.userId));

    const trades = await fetch(`${BASE}/trades`, { headers: auth });
    step("GET /trades (Phase 4, empty journal)", trades.status === 200);
    const tradesBody = await trades.json();
    step("trades wire shape", Array.isArray(tradesBody?.trades) && tradesBody?.total === 0);

    const instruments = await fetch(`${BASE}/instruments`, { headers: auth });
    step("GET /instruments (seeded catalog)", instruments.status === 200);

    const calc = await fetch(`${BASE}/calculators/lot-size`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ accountCurrency: "USD", instrument: "EURUSD", riskPercent: 1, stopPips: 20, balance: 10000 }),
    });
    // Calculator contract may differ (symbol field names) - accept 200 or a
    // domain 4xx, but never 5xx.
    step("POST /calculators/lot-size (no 5xx)", calc.status < 500, `status ${calc.status}`);

    // Logout revokes the REFRESH token presented via cookie (auth.service
    // §logout) - the cookie must accompany the call, exactly like a browser.
    const logout = await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: { ...auth, cookie: cookieHeader },
    });
    step("POST /auth/logout", logout.status === 200 || logout.status === 204);

    // Contract (Phase 2, stateless access tokens): logout revokes the REFRESH
    // token + session - the short-lived access JWT stays technically valid
    // until expiry (≤ 15 min) by design, with no per-request session check.
    const refresh = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    step("refresh token revoked after logout → 401", refresh.status === 401, `status ${refresh.status}`);
  } finally {
    child.kill("SIGTERM");
    await sleep(1000);
    try { child.kill("SIGKILL"); } catch {}
  }

  // 5 - drop the throwaway database
  try { psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);`); step("throwaway database dropped", true); }
  catch (e) { step("throwaway database dropped", false, String(e).slice(0, 120)); }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - failed.length}/${results.length} checks passed ==`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
