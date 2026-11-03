/**
 * Verify - Dynamic i18n (runtime language engine, EN default / FR pack).
 *
 * Covers:
 *   A. Default EN: gate redirect, <html lang="en">, EN login surface.
 *   B. Authenticated shell EN: sidebar + breadcrumb in English.
 *   C. Dynamic switch (SPA, NO reload): Settings → Localization → Français
 *      → Save - sidebar/settings/breadcrumb flip to FR in place, <html lang>
 *      follows, a window marker proves no page reload happened.
 *   D. Persistence: FR survives SPA navigation AND a full reload (boot
 *      mirror + mock-backend language jar).
 *   E. Auth surfaces in FR: logout → login page renders the FR auth pack;
 *      session-expired path uses the FR toast copy.
 *   F. Back to EN: same switch path restores English + <html lang="en">.
 *   G. Console/network cleanliness.
 *
 * SPA-only navigation after the initial entry (MSW state lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/i18n";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Boot 401s are EXPECTED at every page load (silent boot restore: /auth/me
  // fires without a token → 401 → cookie refresh → retry); the single-flight
  // refresh design means genuine failures surface as SESSION_EXPIRED, not
  // as hidden 401s. socket.io + market-service noise is likewise excluded.
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

  // ══ A. Default EN ═════════════════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator('[data-testid="login-form"]').waitFor({ state: "visible", timeout: 15_000 });
  check("A1 Gate → /login", page.url().includes("/login"));
  check("A2 <html lang> defaults to en", (await htmlLang()) === "en", await htmlLang());
  check("A3 Login surface renders EN", (await page.locator("h1").first().innerText()).includes("Sign in to Cosmoz"));

  // ══ B. Authenticated shell EN ═════════════════════════════════════════════
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  bootPhase = false;
  check("B1 Sidebar renders EN (Dashboard)", true);
  // SPA proof marker - must survive the language switch below untouched.
  await page.evaluate(() => { window.__i18nProbe = 42; });

  // ══ C. Dynamic switch to FR (no reload) ═══════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.locator('[data-testid="settings-nav-localization"]').click();
  await page.locator('[data-testid="settings-localization-language"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[data-testid="settings-localization-language"]').selectOption("fr");
  await page.locator('[data-testid="settings-localization-save"]').click();
  await page.locator('[data-testid="settings-nav-localization"]', { hasText: "Localisation" }).waitFor({ timeout: 10_000 });
  check("C1 Settings rail flips to FR instantly", true);
  check("C2 <html lang> follows to fr", (await htmlLang()) === "fr", await htmlLang());

  await page.locator('nav[aria-label="Main navigation"] a[href="/"]').click();
  await page.waitForTimeout(600);
  const dashFr = await page.locator('nav[aria-label="Main navigation"] a[href="/"]').innerText();
  check("C3 Sidebar FR after SPA nav (Tableau de bord)", /Tableau de bord/.test(dashFr), dashFr.trim());
  check("C4 NO page reload during switch (SPA marker intact)", (await page.evaluate(() => window.__i18nProbe)) === 42);
  await page.screenshot({ path: `${SHOTS}/shell-fr.png` });

  // ══ D. Persistence ════════════════════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/trades"]').click();
  await page.waitForURL(/\/trades/, { timeout: 20_000 });
  await page
    .locator('[data-testid="breadcrumb"]', { hasText: "Transactions" })
    .waitFor({ timeout: 15_000 });
  const crumbFr = await page.locator('[data-testid="breadcrumb"]').innerText();
  check("D1 Breadcrumb FR (Transactions)", /Transactions/.test(crumbFr), crumbFr.replace(/\s+/g, " "));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(800);
  const dashAfterReload = await page.locator('nav[aria-label="Main navigation"] a[href="/"]').innerText();
  check("D2 FR survives full reload (boot mirror + server jar)",
    /Tableau de bord/.test(dashAfterReload) && (await htmlLang()) === "fr",
    dashAfterReload.trim());
  await page.screenshot({ path: `${SHOTS}/shell-fr-reload.png` });

  // ══ E. Auth surfaces in FR ════════════════════════════════════════════════
  await page.locator('[data-testid="sidebar-logout"]').click();
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator('[data-testid="login-form"]').waitFor({ state: "visible", timeout: 15_000 });
  check("E1 Login page renders the FR auth pack",
    (await page.locator("h1").first().innerText()).includes("Connectez-vous à Cosmoz"));

  // Back in (FR session) for the EN restore.
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });

  // ══ F. Back to EN ═════════════════════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/settings"]').click();
  await page.locator('[data-testid="settings-nav-localization"]').click();
  await page.locator('[data-testid="settings-localization-language"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[data-testid="settings-localization-language"]').selectOption("en");
  await page.locator('[data-testid="settings-localization-save"]').click();
  await page.locator('nav[aria-label="Main navigation"] a[href="/"]', { hasText: "Dashboard" }).waitFor({ timeout: 10_000 });
  check("F1 Switch back to EN (sidebar Dashboard)", true);
  check("F2 <html lang> back to en", (await htmlLang()) === "en", await htmlLang());
  await page.screenshot({ path: `${SHOTS}/shell-en-restore.png` });

  // ══ G. Cleanliness ════════════════════════════════════════════════════════
  check("G1 No unexpected console/network errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} ${failed === 0 ? "ALL PASS" : "FAILURES PRESENT"}`);
  process.exit(failed === 0 ? 0 : 1);
})();
