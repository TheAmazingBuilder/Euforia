/**
 * Integration Hub verification - MASTER PROMPT §32.
 * Covers: connection lifecycle, safe connection test (no trades), sync +
 * idempotency, rate limiting + manual retry, webhook pipeline (valid /
 * bad signature / stale timestamp / replay), secret isolation, licensing
 * gate, Monitoring health strip, console cleanliness.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const results = [];
const ok = (name, cond) => results.push(`${cond ? "PASS" : "FAIL"} - ${name}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    const text = m.text();
    if (
      m.type() === "error" &&
      !text.includes("socket.io") &&
      !text.includes("404") &&
      !text.includes("Failed to load resource")
    )
      errors.push(text);
  });

  // ── 1. Overview renders: summary band + 12 provider rows ──────────────────
  await page.goto(BASE + "/integrations", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  ok("summary band visible", await page.getByTestId("hub-summary").isVisible());
  ok("summary Connected count = 5", (await page.getByTestId("hub-summary-connected").innerText()).includes("5"));
  const rowCount = await page.locator("[data-testid^='provider-row-']").count();
  ok(`overview lists 12 providers (${rowCount})`, rowCount === 12);

  // ── 2. Tab URL persistence ────────────────────────────────────────────────
  await page.getByTestId("hub-tab-economic").click();
  await page.waitForTimeout(700);
  ok("tab param persisted (?tab=economic)", page.url().includes("tab=economic"));
  ok("eco table renders", await page.getByTestId("hub-eco-table").isVisible());

  // ── 3. Market data capability matrix differs per provider (§8) ────────────
  await page.getByTestId("hub-tab-market-data").click();
  await page.waitForTimeout(700);
  const binanceRow = page.locator("tr", { hasText: "Binance Market Data" });
  const simulatedRow = page.locator("tr", { hasText: "Simulated Feed" });
  ok("Binance declares OHLC", (await binanceRow.locator("[aria-label='supported']").count()) >= 1);
  ok("Simulated feed has no OHLC", (await simulatedRow.locator("[aria-label='not supplied']").count()) >= 3);

  // ── 4. Trading Accounts honesty (§6) ─────────────────────────────────────
  await page.getByTestId("hub-tab-accounts").click();
  await page.waitForTimeout(700);
  ok("account balance pending adapter sync", (await page.getByTestId("account-balance-state").innerText()).includes("pending adapter sync"));

  // ── 5. News licensing gate (§29) ──────────────────────────────────────────
  await page.getByTestId("hub-tab-news").click();
  await page.waitForTimeout(700);
  ok("news licensing gate visible", await page.getByTestId("hub-news-license").isVisible());
  ok("news sample items flagged", (await page.getByTestId("hub-news-item").count()) === 6);

  // ── 6. Trades count before connection tests (§27 - never create trades) ──
  await page.goto(BASE + "/trades", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const tradeRowsBefore = await page.locator("[data-testid^='trade-row-'], tbody tr").count();

  // ── 7. Connect MT5 (vaultRef flow) then test + sync ──────────────────────
  await page.goto(BASE + "/integrations?tab=brokers", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByTestId("provider-connect-mt5-bridge").click();
  await page.waitForTimeout(400);
  ok("connect dialog opens", await page.getByTestId("hub-connect-dialog").isVisible());
  await page.getByTestId("hub-connect-input").fill("vault://mt5/bridge-key");
  await page.getByTestId("hub-connect-submit").click();
  await page.waitForTimeout(1400);
  ok("MT5 connected", (await page.getByTestId("provider-status-mt5-bridge").innerText()).includes("Connected"));
  await page.getByTestId("provider-test-mt5-bridge").click();
  await page.waitForTimeout(1400);
  ok("MT5 test passes", (await page.getByTestId("provider-status-mt5-bridge").innerText()).includes("Connected"));
  await page.getByTestId("provider-sync-mt5-bridge").click();
  await page.waitForTimeout(1400);
  ok("MT5 sync ok (still Connected)", (await page.getByTestId("provider-status-mt5-bridge").innerText()).includes("Connected"));

  // ── 8. cTrader expired-credential scenario → recovery (§15/§26/§32) ─────
  await page.getByTestId("provider-connect-ctrader").click();
  await page.waitForTimeout(400);
  await page.getByTestId("hub-connect-input").fill("vault://ctrader/api-key");
  await page.getByTestId("hub-connect-submit").click();
  await page.waitForTimeout(1400);
  ok("cTrader paired → AUTH_REQUIRED", (await page.getByTestId("provider-status-ctrader").innerText()).includes("Authentication required"));
  await page.getByTestId("provider-test-ctrader").click();
  await page.waitForTimeout(1400);
  await page.getByTestId("hub-tab-overview").click();
  await page.waitForTimeout(900);
  ok("CREDENTIALS_EXPIRED error surfaced", await page.getByTestId("error-row-CREDENTIALS_EXPIRED").isVisible());
  // Recovery: disconnect → reconnect with a fresh vault ref → test passes.
  await page.getByTestId("hub-tab-brokers").click();
  await page.waitForTimeout(700);
  await page.getByTestId("provider-disconnect-ctrader").click();
  await page.waitForTimeout(500);
  await page.getByTestId("hub-disconnect-confirm").click();
  await page.waitForTimeout(1200);
  ok("cTrader disconnected", (await page.getByTestId("provider-status-ctrader").innerText()).includes("Disconnected"));
  await page.getByTestId("provider-connect-ctrader").click();
  await page.waitForTimeout(400);
  await page.getByTestId("hub-connect-input").fill("vault://ctrader/key-rotated");
  await page.getByTestId("hub-connect-submit").click();
  await page.waitForTimeout(1400);
  await page.getByTestId("provider-test-ctrader").click();
  await page.waitForTimeout(1400);
  ok("cTrader recovered after key rotation", (await page.getByTestId("provider-status-ctrader").innerText()).includes("Connected"));

  // ── 9. Licensing gate blocks unverified providers (§29) ──────────────────
  await page.goto(BASE + "/integrations?tab=exchanges", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  ok("Binance Spot connect blocked (license)", (await page.getByTestId("provider-connect-binance-exchange").isDisabled()));

  // ── 10. Sync rate limit + manual retry (§17) ─────────────────────────────
  await page.goto(BASE + "/integrations?tab=economic", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  for (let i = 0; i < 3; i += 1) {
    await page.getByTestId("provider-sync-macro-sample").click();
    await page.waitForTimeout(1300);
  }
  const statusAfter3 = await page.getByTestId("provider-status-macro-sample").innerText();
  ok("3 syncs ok (Connected or Syncing)", statusAfter3.includes("Connected") || statusAfter3.includes("Syncing"));
  await page.getByTestId("provider-sync-macro-sample").click();
  await page.waitForTimeout(1400);
  await page.getByTestId("hub-tab-overview").click();
  await page.waitForTimeout(900);
  ok("RATE_LIMITED surfaced after quota exhausted", await page.getByTestId("error-row-RATE_LIMITED").isVisible());

  // ── 11. Webhook pipeline (§12): valid → replay → bad sig → stale ─────────
  await page.getByTestId("hub-tab-external").click();
  await page.waitForTimeout(700);
  await page.getByTestId("webhook-sim-valid").click();
  await page.waitForTimeout(1300);
  const deliveries = page.getByTestId("webhook-deliveries");
  ok("valid webhook accepted", (await deliveries.innerText()).includes("accepted"));
  await page.getByTestId("webhook-sim-replay").click();
  await page.waitForTimeout(1300);
  ok("replay flagged duplicate", (await deliveries.innerText()).includes("duplicate"));
  await page.getByTestId("webhook-sim-bad-signature").click();
  await page.waitForTimeout(1300);
  ok("bad signature rejected", (await deliveries.innerText()).includes("sig ✗"));
  await page.getByTestId("webhook-sim-stale").click();
  await page.waitForTimeout(1300);
  ok("stale timestamp rejected (replay window)", (await deliveries.innerText()).includes("replay window"));

  // Idempotency on the eco feed: webhook updated actual without duplicating.
  await page.getByTestId("hub-tab-economic").click();
  await page.waitForTimeout(900);
  const ecoRows = await page.locator("[data-testid^='eco-actual-']").count();
  ok(`eco feed has no duplicates after webhook (${ecoRows} rows)`, ecoRows === 10);

  // ── 12. Secret isolation (§18) ────────────────────────────────────────────
  const bodyText = await page.locator("body").innerText();
  ok("no raw provider secret in UI", !bodyText.includes("deriv-demo-token") && !bodyText.includes("whsec_demo"));
  await page.goto(BASE + "/integrations?tab=brokers", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const brokersText = await page.locator("body").innerText();
  ok("masked hints visible instead", brokersText.includes("••••"));

  // ── 13. §27 - connection tests never created trades ──────────────────────
  await page.goto(BASE + "/trades", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const tradeRowsAfter = await page.locator("[data-testid^='trade-row-'], tbody tr").count();
  ok(`no trades created by tests (${tradeRowsBefore} → ${tradeRowsAfter})`, tradeRowsBefore === tradeRowsAfter);

  // ── 14. Monitoring exposes integration health (§13, onglet Integrations) ─
  await page.goto(BASE + "/monitoring", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.getByTestId("monitoring-tab-integrations").click();
  await page.waitForTimeout(900);
  const monitoringIntegrationsText = await page.getByTestId("monitoring-integrations-health").innerText();
  ok(
    "monitoring shows integrations health",
    /Deriv/i.test(monitoringIntegrationsText) && /last successful sync/i.test(monitoringIntegrationsText),
  );

  // ── 15. Calendar still works off the pipeline (§22) ───────────────────────
  await page.goto(BASE + "/calendar", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  ok("calendar renders from provider pipeline", (await page.locator("body").innerText()).length > 200);

  // ── Screenshots (dark / light / mobile) ───────────────────────────────────
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/integrations", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "scripts/shots/hub-overview.png" });
  await page.goto(BASE + "/integrations?tab=external", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "scripts/shots/hub-external.png" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.goto(BASE + "/integrations?tab=economic", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "scripts/shots/hub-economic-light.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark-blue"));
  await page.goto(BASE + "/integrations", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "scripts/shots/hub-mobile.png" });

  console.log(results.join("\n"));
  console.log("ERREURS CONSOLE:", errors.length ? errors.slice(0, 5) : "aucune");
  await browser.close();
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(failed === 0 ? "ALL PASS" : `${failed} FAIL`);
})();
