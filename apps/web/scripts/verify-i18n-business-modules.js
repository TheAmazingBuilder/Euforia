/**
 * Verify - Business-module i18n migration (Session Live / Trades / Nofy).
 *
 *   A. Login (EN default) → switch to FR via the HEADER LanguageSelector.
 *   B. /session - Session Live renders FR (broker card, private stream card).
 *   C. /trades - Trades renders FR (breadcrumb + new-trade CTA).
 *   D. /nofy - Nofy renders FR (tabs + tagline).
 *   E. Back to EN via the header - Session Live restores English.
 *   F. Console/network cleanliness.
 *
 * SPA-only navigation after the initial entry (MSW state lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/i18n-business-modules";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      const url = resp.url();
      const expected =
        (resp.status() === 401 && /\/api\/auth\/(me|refresh)/.test(url)) ||
        /socket\.io/i.test(url) || /X-TransformPort/i.test(url);
      if (!expected) errors.push(`${resp.status()} ${url}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const htmlLang = () => page.evaluate(() => document.documentElement.lang);

  // ══ A. Entry + header switch to FR ════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.evaluate(() => { window.__i18nProbe = 42; });

  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-option-fr"]').click();
  await page
    .locator('nav[aria-label="Main navigation"] a[href="/"]', { hasText: "Tableau de bord" })
    .waitFor({ timeout: 10_000 });
  check("A1 Switched to FR via header selector", (await htmlLang()) === "fr", await htmlLang());

  // ══ B. Session Live in FR (SPA nav) ═══════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 20_000 });
  const brokerTitle = page.locator('[data-testid="broker-panel"] h2');
  await brokerTitle.waitFor({ timeout: 15_000 });
  check("B1 Broker card in FR (Compte de trading)", (await brokerTitle.innerText()).includes("Compte de trading"),
    (await brokerTitle.innerText()).trim());

  const streamCard = page.locator('[data-testid="private-positions-stream"]');
  await streamCard.waitFor({ state: "visible", timeout: 15_000 });
  const streamTitle = await streamCard.locator("h2").innerText();
  check("B2 Private stream card in FR (Flux de positions privées)",
    streamTitle.includes("Flux de positions privées"), streamTitle.trim());
  await page.screenshot({ path: `${SHOTS}/session-fr.png` });

  // ══ C. Trades in FR (SPA nav) ═════════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/trades"]').click();
  await page.waitForURL(/\/trades/, { timeout: 20_000 });
  await page
    .locator('[data-testid="breadcrumb"]', { hasText: "Transactions" })
    .waitFor({ timeout: 15_000 });
  check("C1 Trades breadcrumb in FR (Transactions)", true);

  const newTradeBtn = page.locator('button', { hasText: "Nouvelle transaction" }).first();
  const newTradeVisible = await newTradeBtn.isVisible().catch(() => false);
  check("C2 New-trade CTA in FR (Nouvelle transaction)", newTradeVisible);
  await page.screenshot({ path: `${SHOTS}/trades-fr.png` });

  // ══ D. Nofy in FR (SPA nav) ═══════════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/nofy"]').click();
  await page.waitForURL(/\/nofy/, { timeout: 20_000 });
  await page.locator('[data-testid="nofy-view"]').waitFor({ state: "visible", timeout: 20_000 });
  const tabsFr = await page.locator('[data-testid="nofy-tab-overview"]').innerText();
  check("D1 Nofy first tab in FR (Vue d'ensemble)", tabsFr.includes("Vue d'ensemble"), tabsFr.trim());
  const trashFr = await page.locator('[data-testid="nofy-tab-trash"]').innerText();
  check("D2 Nofy trash tab in FR (Corbeille)", trashFr.includes("Corbeille"), trashFr.trim());
  await page.screenshot({ path: `${SHOTS}/nofy-fr.png` });

  // ══ E. Back to EN (header) - Session Live restores ════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-option-en"]').click();
  await page
    .locator('nav[aria-label="Main navigation"] a[href="/"]', { hasText: "Dashboard" })
    .waitFor({ timeout: 10_000 });
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="broker-panel"] h2', { hasText: "Trading account" }).waitFor({ timeout: 15_000 });
  check("E1 Session Live restored to EN (Trading account)", true);
  check("E2 <html lang> back to en", (await htmlLang()) === "en", await htmlLang());
  check("E3 NO page reload during the whole tour (SPA marker intact)",
    (await page.evaluate(() => window.__i18nProbe)) === 42);

  // ══ F. Cleanliness ════════════════════════════════════════════════════════
  check("F1 No unexpected console/network errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} ${failed === 0 ? "ALL PASS" : "FAILURES PRESENT"}`);
  process.exit(failed === 0 ? 0 : 1);
})();
