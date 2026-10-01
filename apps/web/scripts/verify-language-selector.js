/**
 * Verify — Header LanguageSelector (the missing i18n entry point).
 *
 * Covers:
 *   A. Selector visible in the topbar (EN default, trigger shows active code).
 *   B. Instant switch via the header: EN → FR — sidebar/breadcrumb flip in
 *      place, <html lang> follows, trigger code flips to FR, NO reload.
 *   C. FR persists across SPA navigation AND a full reload (boot mirror).
 *   D. Switch back to EN from the header — instant restore.
 *   E. Console/network cleanliness.
 *
 * SPA-only navigation after the initial entry (MSW state lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/i18n-selector";

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
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const htmlLang = () => page.evaluate(() => document.documentElement.lang);

  // ══ Entry: login (default EN) ═════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  // SPA proof marker — must survive the header switch untouched.
  await page.evaluate(() => { window.__i18nProbe = 42; });

  // ══ A. Selector in the topbar ═════════════════════════════════════════════
  const selector = page.locator('[data-testid="language-selector"]');
  await selector.waitFor({ state: "visible", timeout: 10_000 });
  check("A1 LanguageSelector visible in topbar", await selector.isVisible());
  const triggerCode = await page
    .locator('[data-testid="language-selector-trigger"] span.font-mono')
    .innerText();
  check("A2 Trigger shows active locale code EN", triggerCode.trim().toUpperCase() === "EN", triggerCode.trim());

  // ══ B. Header switch EN → FR (instant, no reload) ═════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-option-fr"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.screenshot({ path: `${SHOTS}/dropdown-open.png` });
  await page.locator('[data-testid="language-option-fr"]').click();
  await page
    .locator('nav[aria-label="Main navigation"] a[href="/"]', { hasText: "Tableau de bord" })
    .waitFor({ timeout: 10_000 });
  check("B1 Sidebar flips to FR instantly (Tableau de bord)", true);
  check("B2 <html lang> follows to fr", (await htmlLang()) === "fr", await htmlLang());
  const triggerCodeFr = await page
    .locator('[data-testid="language-selector-trigger"] span.font-mono')
    .innerText();
  check("B3 Trigger code flips to FR", triggerCodeFr.trim().toUpperCase() === "FR", triggerCodeFr.trim());
  check("B4 NO page reload (SPA marker intact)", (await page.evaluate(() => window.__i18nProbe)) === 42);
  await page.screenshot({ path: `${SHOTS}/shell-fr-from-header.png` });

  // ══ C. Persistence ════════════════════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/trades"]').click();
  await page.waitForURL(/\/trades/, { timeout: 20_000 });
  await page
    .locator('[data-testid="breadcrumb"]', { hasText: "Transactions" })
    .waitFor({ timeout: 15_000 });
  check("C1 FR persists across SPA nav (breadcrumb Transactions)", true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(800);
  const dashAfterReload = await page.locator('nav[aria-label="Main navigation"] a[href="/"]').innerText();
  check("C2 FR survives full reload (boot mirror)",
    /Tableau de bord/.test(dashAfterReload) && (await htmlLang()) === "fr",
    dashAfterReload.trim());
  check("C3 Selector still in topbar after reload", await selector.isVisible());

  // ══ D. Header switch back to EN ═══════════════════════════════════════════
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-option-en"]').waitFor({ state: "visible", timeout: 5_000 });
  await page.locator('[data-testid="language-option-en"]').click();
  await page
    .locator('nav[aria-label="Main navigation"] a[href="/"]', { hasText: "Dashboard" })
    .waitFor({ timeout: 10_000 });
  check("D1 Sidebar back to EN instantly (Dashboard)", true);
  check("D2 <html lang> back to en", (await htmlLang()) === "en", await htmlLang());
  await page.screenshot({ path: `${SHOTS}/shell-en-restored.png` });

  // ══ E. Cleanliness ════════════════════════════════════════════════════════
  check("E1 No unexpected console/network errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} ${failed === 0 ? "ALL PASS" : "FAILURES PRESENT"}`);
  process.exit(failed === 0 ? 0 : 1);
})();
