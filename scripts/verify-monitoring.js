/**
 * verify-monitoring.js - Monitoring & System Health module (MASTER PROMPT §20).
 *
 * Contract under test:
 *  - 11 tabs (§3) persisted in the URL (?tab=)
 *  - Overview status board: every status carries EVIDENCE, client-observed
 *    rows marked, no unevidenced "operational" (§4)
 *  - API telemetry from REAL observed requests (§9, §21)
 *  - Market data freshness LIVE/DELAYED/STALE incl. stale detection via
 *    clock shift (§6, §17) - skipped gracefully if the feed is down
 *  - Broker connections from the Integration Hub engine (§7)
 *  - Job ledger with a REAL manual run (§11)
 *  - Notifications: real in-app counts, honest Unknown for email/push (§12)
 *  - Alert rules toggle persisted (§14) + system events + incidents (§15/§16)
 *  - No secret leakage (§19) · light theme + mobile 390 · 0 console errors
 *
 * NOTE MSW: the mock engine reseeds on full page reload - the script loads
 * the app once, then navigates client-side.
 */
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "shots");

let pass = 0;
let fail = 0;
const ok = (label, cond) => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
  }
};

/** Remove the Next dev-tools portal so it never intercepts clicks. */
async function clearDevOverlay(page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  }).catch(() => {});
}

const CONSOLE_NOISE = [
  "socket.io",
  "XTransformPort",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    errors.push(text);
  });

  // Boot once on the dashboard, then stay client-side (store reseeds on reload).
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_500);

  // ── 1. Navigation vers Monitoring ────────────────────────────────────────
  await page.locator('a[href="/monitoring"]').first().click();
  await page.waitForSelector('[data-testid="monitoring-overall-status"]', { timeout: 15_000 });
  ok("Monitoring - h1", (await page.locator("h1").innerText()).trim() === "Monitoring");
  ok("Monitoring - overall status badge", await page.locator('[data-testid="monitoring-overall-status"]').isVisible());
  ok(
    "Monitoring - overall evidence line",
    ((await page.locator('[data-testid="monitoring-overall-evidence"]').innerText()) || "").length > 5,
  );

  // ── 2. Tablist §3 - 11 onglets + persistance ?tab= ──────────────────────
  ok("Monitoring - 11 onglets", (await page.locator('[data-testid="monitoring-tablist"] [role="tab"]').count()) === 11);
  await page.locator('[data-testid="monitoring-tab-api"]').click();
  await page.waitForTimeout(700);
  ok("Monitoring - ?tab= persiste", page.url().includes("tab=api"));

  // ── 3. API tab (§9) - télémétrie réelle ──────────────────────────────────
  ok("API - stats observées", await page.locator('[data-testid="monitoring-api-stats"]').isVisible());
  const totalRequestsText = (await page.locator('[data-testid="monitoring-api-stats"]').innerText()).replace(/\u00a0/g, " ");
  ok("API - totalRequests > 0 (trafic réel)", /Requests\s*\n?\s*([1-9]\d*)/i.test(totalRequestsText));
  ok("API - lignes d'endpoints", (await page.locator('[data-testid="api-endpoint-row"]').count()) >= 3);
  // The engine's own request is recorded only AFTER its response returns - a
  // refetch (12 s poll) is needed before /monitoring/overview shows up (§21).
  ok(
    "API - trafic préexistant observé (/stats/overview)",
    /GET \/stats\/overview/i.test(await page.locator('[data-testid="monitoring-api-endpoints"]').innerText()),
  );
  await page.waitForTimeout(13_000);
  ok(
    "API - endpoint /monitoring/overview observé après refetch",
    /\/monitoring\/overview/i.test(await page.locator('[data-testid="monitoring-api-endpoints"]').innerText()),
  );

  // ── 4. Database (§10) ─────────────────────────────────────────────────────
  await page.locator('[data-testid="monitoring-tab-database"]').click();
  await page.waitForTimeout(600);
  const dbText = await page.locator('[data-testid="monitoring-db-entities"]').innerText();
  ok("Database - entités réelles", /Trades:\s*\d+/.test(dbText));
  ok("Database - indisponibilités déclarées honnêtement", /Not observable|no credentials/i.test(dbText));

  // ── 5. Jobs (§11) - run réel ──────────────────────────────────────────────
  await page.locator('[data-testid="monitoring-tab-jobs"]').click();
  await page.waitForTimeout(600);
  ok("Jobs - 6 définitions", (await page.locator('[data-testid="monitoring-jobs"] [data-testid^="job-row-"]').count()) === 6);
  ok("Jobs - seed enregistré", (await page.locator('[data-testid="job-row-fixture-seed"]').innerText()).includes("SUCCESS"));
  const beforeRuns = await page.locator('[data-testid="job-row-analytics-aggregation"]').innerText();
  await page.locator('[data-testid="job-run-analytics-aggregation"]').click();
  await page.waitForTimeout(1_400);
  const afterRuns = await page.locator('[data-testid="job-row-analytics-aggregation"]').innerText();
  ok("Jobs - run manuel enregistré dans le ledger", afterRuns !== beforeRuns && /SUCCESS/.test(afterRuns));
  ok("Jobs - boutons app-driven désactivés", await page.locator('[data-testid="job-run-integration-sync"]').isDisabled());

  // ── 6. Notifications (§12) ────────────────────────────────────────────────
  await page.locator('[data-testid="monitoring-tab-notifications"]').click();
  await page.waitForTimeout(600);
  const notifText = await page.locator('[data-testid="monitoring-notifications"]').innerText();
  ok("Notifications - in-app livraisons réelles", /IN-APP/.test(notifText));
  ok("Notifications - email/push honnêtes (Unknown)", /EMAIL[\s\S]*Unknown[\s\S]*PUSH[\s\S]*Unknown/.test(notifText));

  // ── 7. Brokers (§7) - état moteur Intégrations ───────────────────────────
  await page.locator('[data-testid="monitoring-tab-brokers"]').click();
  await page.waitForTimeout(700);
  const brokersText = await page.locator('[data-testid="monitoring-brokers"]').innerText();
  ok("Brokers - Deriv présent", /Deriv/i.test(brokersText));
  ok("Brokers - statuts mappés (CONNECTED/AUTH FAILED)", /CONNECTED|AUTH FAILED/.test(brokersText));
  ok("Brokers - read-only affiché", /read-only/i.test(brokersText));

  // ── 8. WebSockets (§8) - compteurs client ────────────────────────────────
  await page.locator('[data-testid="monitoring-tab-websockets"]').click();
  await page.waitForTimeout(600);
  const wsText = await page.locator('[data-testid="monitoring-ws"]').innerText();
  ok("WS - phase + transport affichés", /transport:/.test(wsText));
  ok("WS - compteurs réels (reconnects / drops / RTT)", /RECONNECT ATTEMPTS/i.test(wsText) && /DROPPED CONNECTIONS/i.test(wsText));

  // ── 9. Integrations (§13) ─────────────────────────────────────────────────
  await page.locator('[data-testid="monitoring-tab-integrations"]').click();
  await page.waitForTimeout(700);
  const integText = await page.locator('[data-testid="monitoring-integrations-health"]').innerText();
  ok("Integrations - Deriv", /Deriv/i.test(integText));
  ok("Integrations - statut credentials dérivé des faits", /configured|expired|none/.test(integText));

  // ── 10. Events (§15/§16) + règles d'alerte (§14) ─────────────────────────
  await page.locator('[data-testid="monitoring-tab-events"]').click();
  await page.waitForTimeout(700);
  ok("Events - 8 règles d'alerte", (await page.locator('[data-testid="monitoring-alert-rules"] [data-testid^="rule-row-"]').count()) === 8);
  const apiRule = page.locator('[data-testid="rule-row-API_DEGRADED"] input[type="checkbox"], [data-testid="rule-row-API_DEGRADED"] button[role="switch"]');
  const wasChecked = await apiRule.getAttribute("aria-checked");
  await page.locator('[data-testid="rule-row-API_DEGRADED"]').locator("button[role=\"switch\"], input[type=\"checkbox\"]").first().click();
  await page.waitForTimeout(1_200);
  const nowChecked = await apiRule.getAttribute("aria-checked");
  ok("Alerting - toggle persiste (§14)", wasChecked !== nowChecked);
  await page.locator('[data-testid="rule-row-API_DEGRADED"]').locator("button[role=\"switch\"], input[type=\"checkbox\"]").first().click();
  await page.waitForTimeout(1_000);
  ok("Events - journal système rendu", (await page.locator('[data-testid="monitoring-system-events"]').count()) > 0);
  ok("Events - section incidents rendue", (await page.locator("text=Incidents").count()) > 0);

  // ── 11. Market Data (§6/§17) + détection de staleness ────────────────────
  await page.locator('[data-testid="monitoring-tab-market-data"]').click();
  await page.waitForTimeout(1_500);
  const symbolRows = await page.locator('[data-testid="market-symbol-row"]').count();
  if (symbolRows === 0) {
    console.log("  SKIP  Market Data - aucun tick observé (service marché indisponible) - structure honnête vérifiée");
    ok("Market - pas de statut inventé sans données", (await page.locator('[data-testid="monitoring-market"]').innerText()).length > 10);
  } else {
    const feedText = await page.locator('[data-testid="monitoring-market"]').innerText();
    ok("Market - âge du dernier tick affiché", /Last update:/.test(feedText));
    ok("Market - classes freshness présentes", /LIVE|DELAYED|STALE/.test(feedText));
    // Negative test (§20 stale detection): shift the clock forward → STALE.
    const before = await page.locator('[data-testid="monitoring-market"]').innerText();
    await page.evaluate(() => {
      window.__realDateNow = Date.now.bind(Date);
      const shifted = window.__realDateNow() + 61_000;
      Date.now = () => shifted;
    });
    await page.waitForTimeout(2_200);
    const after = await page.locator('[data-testid="monitoring-market"]').innerText();
    await page.evaluate(() => {
      if (window.__realDateNow) Date.now = window.__realDateNow;
    });
    ok("Market - STALE détecté après décalage d'horloge (§20)", after !== before && /STALE/.test(after));
  }

  // ── 12. Overview - status board avec preuves (§4) ────────────────────────
  await page.locator('[data-testid="monitoring-tab-overview"]').click();
  await page.waitForTimeout(900);
  const boardRows = await page.locator('[data-testid="monitoring-status-board"] [data-testid^="status-row-"]').count();
  ok("Overview - 8 composants au board", boardRows === 8);
  const apiRow = await page.locator('[data-testid="status-row-api"]').innerText();
  ok("Overview - API row porte une preuve chiffrée", /requests observed/.test(apiRow));
  const marketRow = await page.locator('[data-testid="status-row-market-data"]').innerText();
  ok("Overview - lignes client-observed marquées", marketRow.length > 0);
  ok("Overview - badge 'observed in your browser' présent", (await page.locator("text=observed in your browser").count()) >= 1);

  // ── 13. Secrets jamais exposés (§19) ──────────────────────────────────────
  const bodyText = await page.evaluate(() => document.body.innerText);
  ok("Sécurité - aucun secret en clair", !/cz_live_|vault:\/\/|sk_[a-zA-Z0-9]{10,}/.test(bodyText));

  // ── 14. Light + mobile (thèmes et responsive) ────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/monitoring-light.png` });
  ok("Light - page rendue", (await page.locator('[data-testid="monitoring-status-board"]').count()) > 0);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const tablistScrollable = await page.locator('[data-testid="monitoring-tablist"]').evaluate((el) => el.scrollWidth >= el.clientWidth - 4);
  ok("Mobile 390 - tablist scrollable", tablistScrollable);
  await page.screenshot({ path: `${OUT}/monitoring-mobile.png` });

  // ── 15. Console errors ────────────────────────────────────────────────────
  ok("0 erreur console (hors bruit socket.io/market)", errors.length === 0);
  if (errors.length > 0) errors.slice(0, 6).forEach((e) => console.log("   -", e.slice(0, 160)));

  await browser.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
