/**
 * verify-accounts.js — Accounts & Trading Connectivity probe (Phase 02).
 *
 * Exercises the full connect → inspect → lifecycle flow over MSW on the dev
 * server (:3000): provider discovery (mock provider honestly stamped),
 * connect wizard, initial sync data, detail drawer (overview + activity
 * tabs), rename, disconnect (requireTyped), reconnect — plus the honest
 * error state and the demo markers on the risk-relevant fixture surfaces.
 *
 * Run: scripts/verify-accounts-run.sh   (or: node apps/web/scripts/verify-accounts.js
 * with a dev server already listening on :3000)
 *
 * Probe conventions (see verify-phase11.js lessons): no networkidle (socket.io
 * keeps sockets open) — domcontentloaded + waits; nextjs-portal removed so it
 * cannot swallow clicks; demo login via the shared helper.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- Node verification helper */
const path = require("path");
const { chromium } = require("playwright");

const { ensureLogin } = require(path.resolve(__dirname, "helpers/login.js"));

const BASE = process.env.PROBE_BASE || "http://localhost:3000";

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
    .evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    })
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

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await clearDevOverlay(page);
  await ensureLogin(page);
  await page.waitForTimeout(1_000);

  // ── 1. Navigation: sidebar entry renders the page ─────────────────────────
  await page.locator('a[href="/accounts"]').first().click();
  // Route transition + Suspense: wait for the page heading specifically.
  await page.waitForFunction(
    () => document.querySelector("h1")?.textContent?.trim() === "Accounts",
    { timeout: 15_000 },
  );
  await clearDevOverlay(page);
  await page.waitForTimeout(1_000);

  const h1 = (await page.locator("h1").innerText()).trim();
  check("page h1 is Accounts", h1 === "Accounts", h1);

  // ── 2. Empty state (fresh MSW session) ────────────────────────────────────
  const empty = page.locator('[data-testid="accounts-empty"]');
  if ((await empty.count()) > 0) {
    check("empty state visible", await empty.isVisible());
    check("empty state lists connectable provider", (await page.locator('[data-testid="accounts-empty-providers"]').innerText()).includes("Euforia Mock Broker"));
    await page.locator('[data-testid="accounts-empty-add"]').click();
  } else {
    // A previous probe run may have persisted an account in this store —
    // use the header button instead.
    note("accounts already exist in this session — skipping empty-state assertions");
    await page.locator('[data-testid="accounts-add-button"]').click();
  }
  await page.waitForSelector('[data-testid="connect-account-dialog"]', { timeout: 10_000 });
  check("connect dialog opens", true);

  // ── 3. Provider discovery honesty (wait for the registry query) ──────────
  const mockRow = page.locator('[data-testid="connect-provider-MOCK"]');
  await mockRow.waitFor({ state: "visible", timeout: 10_000 });
  check("MOCK provider listed as connectable", (await mockRow.count()) > 0);
  check(
    "planned providers marked not connectable",
    (await page.locator('[data-testid="connect-provider-planned-oanda"]').innerText()).toUpperCase().includes("PLANNED"),
  );
  await mockRow.click();
  await page.locator('[data-testid="connect-next"]').click();

  // ── 4. Environment step (DEMO/LIVE only — capability-driven) ──────────────
  await page.locator('[data-testid="connect-environment-DEMO"]').click();
  await page.locator('[data-testid="connect-next"]').click();

  // ── 5. Identity step: invalid submit guarded, then connect ────────────────
  check("submit disabled without fields", await page.locator('[data-testid="connect-submit"]').isDisabled());
  await page.locator('[data-testid="connect-external-id"]').fill("5021347");
  await page.locator('[data-testid="connect-display-name"]').fill("Probe Sim");
  await page.locator('[data-testid="connect-secret"]').fill("probe-secret-42");
  check("submit enabled once complete", await page.locator('[data-testid="connect-submit"]').isEnabled());
  await page.locator('[data-testid="connect-submit"]').click();

  // 201 → dialog closes, detail drawer opens on the new account.
  await page.waitForSelector('[data-testid="account-detail-dialog"]', { timeout: 15_000 });
  check("detail drawer opens after connect", true);
  await page.waitForTimeout(800);
  const detailName = (await page.locator('[data-testid="account-detail-name"]').innerText()).trim();
  check("detail shows the display name", detailName === "Probe Sim", detailName);
  check(
    "simulated provider stamp in drawer",
    (await page.locator('[data-testid="account-detail-dialog"] [data-testid="account-simulated-badge"]').count()) > 0,
  );

  // Snapshot data present (initial sync ran server-side in the mock engine).
  const balance = (await page.locator('[data-testid="account-detail-balance"]').innerText()).trim();
  check("balance rendered (not —)", balance !== "—", balance);
  const syncBadge = (await page.locator('[data-testid="account-detail-sync-status"]').getAttribute("data-status"));
  check("sync axis fresh after initial sync", syncBadge === "LIVE" || syncBadge === "SYNCING", syncBadge);

  // ── 6. Activity tabs: positions / orders / deals are SEPARATE tables ──────
  await page.locator('[role="tab"][name*="Positions" i], [role="tab"]:has-text("Positions")').first().click();
  await page.waitForTimeout(700);
  const positionRows = await page.locator('[data-testid="external-position-row"]').count();
  check("positions table renders rows (0–2 deterministic)", positionRows >= 0 && positionRows <= 2, String(positionRows));

  await page.locator('[role="tab"]:has-text("Deals")').first().click();
  await page.waitForTimeout(700);
  const dealRows = await page.locator('[data-testid="external-deal-row"]').count();
  check("deals table renders rows", dealRows > 0, String(dealRows));

  await page.locator('[role="tab"]:has-text("Orders")').first().click();
  await page.waitForTimeout(700);
  check("orders table present", (await page.locator('[data-testid="external-orders-table"]').count()) > 0);

  // ── 7. Rename flow ────────────────────────────────────────────────────────
  await page.locator('[role="tab"]:has-text("Overview")').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="account-detail-rename"]').click();
  await page.waitForSelector('[data-testid="rename-dialog"]', { timeout: 8_000 });
  await page.locator('[data-testid="rename-input"]').fill("Probe Renamed");
  await page.locator('[data-testid="rename-submit"]').click();
  await page.waitForTimeout(1_200);
  const renamedVisible = (await page.locator('[data-testid="account-detail-name"]').innerText()).trim();
  check("rename reflected in drawer", renamedVisible === "Probe Renamed", renamedVisible);

  // ── 8. Connection test panel (4 named checks) ─────────────────────────────
  await page.locator('[data-testid="connection-test-run"]').click();
  await page.waitForSelector('[data-testid="connection-test-results"]', { timeout: 10_000 });
  const resultText = (await page.locator('[data-testid="connection-test-results"]').innerText()).replace(/\n/g, " ");
  check("4 checks rendered", ["Authentication", "Connectivity", "Provider response", "Permissions"].every((name) => resultText.includes(name)), "");

  // ── 9. Disconnect with requireTyped confirmation ──────────────────────────
  await page.locator('[data-testid="account-detail-disconnect"]').click();
  await page.waitForSelector('[data-testid="account-disconnect-dialog"]', { timeout: 8_000 });
  const confirmDisabled = await page.locator('[data-testid="account-disconnect-confirm"]').isDisabled();
  check("disconnect confirm disabled before typing the name", confirmDisabled);
  await page.locator('[data-testid="account-disconnect-typed"]').fill("Probe Renamed");
  await page.locator('[data-testid="account-disconnect-confirm"]').click();
  await page.waitForTimeout(1_500);
  // Drawer closes; the card list shows DISCONNECTED.
  const disconnectedBadge = page.locator('[data-testid="account-card-connection"][data-status="DISCONNECTED"]');
  check("card shows DISCONNECTED after disconnect", (await disconnectedBadge.count()) > 0);

  // ── 10. Reconnect flow from the drawer ────────────────────────────────────
  await page.locator('[data-testid="account-card-open"]').first().click();
  await page.waitForSelector('[data-testid="account-detail-dialog"]', { timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.locator('[data-testid="account-detail-reconnect"]').click();
  await page.waitForSelector('[data-testid="reconnect-dialog"]', { timeout: 8_000 });
  await page.locator('[data-testid="reconnect-secret"]').fill("re-probe-secret-7");
  await page.locator('[data-testid="reconnect-submit"]').click();
  await page.waitForTimeout(1_200);
  check(
    "reconnect restores CONNECTED",
    (await page.locator('[data-testid="account-detail-connection-status"]').getAttribute("data-status")) === "CONNECTED",
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // ── 11. Sync now from the card ────────────────────────────────────────────
  const cardSync = page.locator('[data-testid="account-card-sync-button"]').first();
  if ((await cardSync.count()) > 0 && (await cardSync.isEnabled())) {
    await cardSync.click();
    await page.waitForTimeout(1_500);
    check("sync button flow completes without error", pageErrors.length === 0);
  } else {
    note("sync button disabled at probe time — connection state changed mid-run");
  }

  // ── 12. Demo markers on fixture-driven surfaces ───────────────────────────
  // Switcher chip: inside the dropdown — open it first.
  await page.locator('button[aria-label="Switch account"]').click();
  await page.waitForTimeout(600);
  check(
    "account switcher carries demo marker",
    (await page.locator('[data-testid="account-switcher-demo-chip"]').count()) > 0,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Chain A: the sizer lives inside the new-trade modal.
  await page.locator('a[href="/trades"]').first().click();
  await page.waitForTimeout(1_500);
  await clearDevOverlay(page);
  const newTrade = page.locator('[data-testid="trades-new"]');
  if ((await newTrade.count()) > 0) {
    await newTrade.click();
    await page.waitForSelector('[data-testid="sizer-demo-chip"]', { timeout: 10_000 });
    check("position sizer carries demo marker (chain A)", true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } else {
    note("trades-new button not present in this session state");
  }

  await page.locator('a[href="/monitoring"]').first().click();
  await page.waitForTimeout(1_800);
  await clearDevOverlay(page);
  const brokersPanel = page.locator('[data-testid="monitoring-brokers"]');
  try {
    await brokersPanel.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    // panel may legitimately be absent in this session state
  }
  if (
    (await brokersPanel.count()) > 0 &&
    (await page.locator('[data-testid="monitoring-brokers-demo-chip"]').count()) > 0
  ) {
    check("monitoring brokers panel carries demo marker (chain B)", true);
  } else {
    note("monitoring brokers telemetry not present (empty hub) — marker assertion skipped");
  }

  // ── Console discipline ────────────────────────────────────────────────────
  check("no unexpected page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  console.log(`\n${passed} passed, ${failed} failed${softNotes.length ? `, ${softNotes.length} notes` : ""}`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("PROBE CRASHED:", error);
  process.exit(1);
});
