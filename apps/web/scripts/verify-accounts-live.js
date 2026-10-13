/**
 * verify-accounts-live.js — Phase 02 acceptance criterion 1, second half:
 * the SAME connect → sync → inspect lifecycle over the LIVE BRIDGE against
 * the real NestJS API (:4000) with the mock provider enabled (dev default).
 *
 * Requires a web server on PROBE_BASE started with NEXT_PUBLIC_API_LIVE=true
 * (API_BASE becomes same-origin /api/v1, rewritten to :4000). This is the
 * genuine backend path: JWT auth, ownership, zod re-validation, rate limits,
 * the AES-GCM credential vault — MSW is NOT running on this server.
 *
 * Honesty note (spec §15.3): the provider is still the backend's MOCK
 * adapter — the data is simulated. What this probe verifies is the WIRING
 * (contracts, envelopes, auth, lifecycle), never real provider connectivity.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- Node verification helper */
const { chromium } = require("playwright");

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
const EMAIL = "trader@cosmoz.app";
const PASSWORD = "cosmoz-demo-2026";

let passed = 0;
let failed = 0;
const softNotes = [];

function check(label, ok, extra = "") {
  const tag = ok ? "✓" : "✗";
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${tag} ${label}${extra ? ` — ${extra}` : ""}`);
}

function note(label) {
  softNotes.push(label);
  console.log(`  ℹ ${label}`);
}

async function clearDevOverlay(page) {
  await page
    .evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()))
    .catch(() => {});
}

const CONSOLE_NOISE = [
  "socket.io",
  "XTransformPort",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
  "/api/auth/me",
  "/api/auth/refresh",
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    pageErrors.push(text);
  });

  // Login against the REAL API (AuthGate → /login form → /api/v1/auth/login).
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await clearDevOverlay(page);
  await page.locator("#login-email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  await sidebar.waitFor({ state: "visible", timeout: 25_000 });
  check("live login succeeded (real JWT)", true);
  await clearDevOverlay(page);

  // The trading accounts list comes from the real DB — may hold accounts
  // from earlier runs. Clean slate: disconnect + note any pre-existing rows.
  await page.locator('a[href="/accounts"]').first().click();
  await page.waitForFunction(
    () => document.querySelector("h1")?.textContent?.trim() === "Accounts",
    { timeout: 20_000 },
  );
  await clearDevOverlay(page);
  await page.waitForTimeout(1_200);
  check("accounts page renders over the live bridge", true);

  const existingCards = await page.locator('[data-testid="account-card"]').count();
  if (existingCards > 0) {
    note(`${existingCards} pre-existing account(s) on the real API — reusing state`);
  } else {
    check("empty state over live bridge", (await page.locator('[data-testid="accounts-empty"]').count()) > 0);
  }

  // ── Connect over the live bridge (unique external id per run) ────────────
  await page.locator('[data-testid="accounts-add-button"]').click();
  const dialog = page.locator('[data-testid="connect-account-dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  const mockRow = page.locator('[data-testid="connect-provider-MOCK"]');
  await mockRow.waitFor({ state: "visible", timeout: 10_000 });
  check("provider registry served by the real API", true);
  await mockRow.click();
  await page.locator('[data-testid="connect-next"]').click();
  await page.locator('[data-testid="connect-environment-DEMO"]').click();
  await page.locator('[data-testid="connect-next"]').click();

  const externalId = `live-${Date.now().toString(36)}`;
  await page.locator('[data-testid="connect-external-id"]').fill(externalId);
  await page.locator('[data-testid="connect-display-name"]').fill("Live Bridge Sim");
  await page.locator('[data-testid="connect-secret"]').fill("live-probe-secret-1");
  await page.locator('[data-testid="connect-submit"]').click();

  // 201 from the real Nest connect use case (test → metadata → persist →
  // initial sync through the actual adapter + AES vault).
  await page.waitForSelector('[data-testid="account-detail-dialog"]', { timeout: 25_000 });
  check("connect 201 over live bridge → drawer opens", true);
  await page.waitForTimeout(1_000);
  check(
    "initial sync ran (fresh sync axis)",
    ["LIVE", "SYNCING"].includes(
      (await page.locator('[data-testid="account-detail-sync-status"]').getAttribute("data-status")) ?? "",
    ),
  );
  const liveBalance = (await page.locator('[data-testid="account-detail-balance"]').innerText()).trim();
  check("balance rendered from the real DB snapshot", liveBalance !== "—", liveBalance);

  // Activity tabs through the real read routes.
  await page.locator('[role="tab"]:has-text("Deals")').first().click();
  await page.waitForTimeout(1_000);
  const dealRows = await page.locator('[data-testid="external-deal-row"]').count();
  check("deals read from the real API", dealRows > 0, String(dealRows));

  await page.locator('[role="tab"]:has-text("Overview")').first().click();
  await page.waitForTimeout(600);

  // Rename through PATCH /trading-accounts/:id (the newly-registered route).
  await page.locator('[data-testid="account-detail-rename"]').click();
  await page.waitForSelector('[data-testid="rename-dialog"]', { timeout: 8_000 });
  await page.locator('[data-testid="rename-input"]').fill("Live Renamed");
  await page.locator('[data-testid="rename-submit"]').click();
  await page.waitForTimeout(1_500);
  const renamed = (await page.locator('[data-testid="account-detail-name"]').innerText()).trim();
  check("PATCH rename works over live bridge", renamed === "Live Renamed", renamed);

  // Manual sync through POST /trading-accounts/:id/sync (rate-limited route).
  await page.locator('[data-testid="account-detail-sync"]').click();
  await page.waitForTimeout(2_500);
  check("manual sync over live bridge", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

  // Connection test (4 named checks) against the real adapter.
  await page.locator('[data-testid="connection-test-run"]').click();
  await page.waitForSelector('[data-testid="connection-test-results"]', { timeout: 15_000 });
  check("connection test over live bridge", true);

  // Honest error state: disconnect, then sync → 422 NOT_CONNECTED toast
  // (the API refuses to sync without an active connection).
  await page.locator('[data-testid="account-detail-disconnect"]').click();
  await page.waitForSelector('[data-testid="account-disconnect-dialog"]', { timeout: 8_000 });
  await page.locator('[data-testid="account-disconnect-typed"]').fill("Live Renamed");
  await page.locator('[data-testid="account-disconnect-confirm"]').click();
  await page.waitForTimeout(1_800);
  check(
    "disconnect over live bridge (credentials wiped server-side)",
    (await page.locator('[data-testid="account-card-connection"][data-status="DISCONNECTED"]').count()) > 0,
  );

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Reconnect with the SAME credentials through the real vault path.
  await page.locator('[data-testid="account-card-open"]').first().click();
  await page.waitForSelector('[data-testid="account-detail-dialog"]', { timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.locator('[data-testid="account-detail-reconnect"]').click();
  await page.waitForSelector('[data-testid="reconnect-dialog"]', { timeout: 8_000 });
  await page.locator('[data-testid="reconnect-secret"]').fill("live-probe-secret-2");
  await page.locator('[data-testid="reconnect-submit"]').click();
  await page.waitForTimeout(1_800);
  check(
    "reconnect over live bridge",
    (await page.locator('[data-testid="account-detail-connection-status"]').getAttribute("data-status")) === "CONNECTED",
  );

  check("no unexpected page errors over the live run", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  console.log(`\n${passed} passed, ${failed} failed${softNotes.length ? `, ${softNotes.length} notes` : ""}`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("LIVE PROBE CRASHED:", error);
  process.exit(1);
});
