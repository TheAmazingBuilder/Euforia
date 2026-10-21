/* Diagnostic probe — Academy overview band + courses/glossary inputs. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const SHOTS = "/home/z/my-project/scripts/shots/i18n-academy";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.locator('nav[aria-label="Main navigation"] a[href="/academy"]').click();
  await page.locator('[data-testid="academy-view"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1200);

  // FR
  await page.locator('[data-testid="language-selector-trigger"]').click();
  await page.locator('[data-testid="language-option-fr"]').click();
  await page.waitForTimeout(600);

  const txt = await page.locator("body").innerText();
  const idx = txt.search(/Vue d'ensemble/);
  console.log("===== OVERVIEW FR (after tabs) =====");
  console.log(txt.slice(idx, idx + 1500).replace(/\n{2,}/g, "\n"));
  await page.screenshot({ path: `${SHOTS}/probe-overview.png`, fullPage: true });

  await page.locator('button[data-testid="academy-tab-courses"]').click();
  await page.waitForTimeout(900);
  const placeholders = await page.locator("input[placeholder]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("placeholder")).filter(Boolean).slice(0, 8));
  console.log("===== COURSES INPUT PLACEHOLDERS FR =====");
  console.log(placeholders.join("\n"));
  const coursesTxt = await page.locator("body").innerText();
  const cidx = coursesTxt.search(/Cours/);
  console.log("===== COURSES TEXT (excerpt) =====");
  console.log(coursesTxt.slice(cidx, cidx + 900).replace(/\n{2,}/g, "\n"));

  await browser.close();
})().catch((e) => { console.error("PROBE ERROR:", e.message); process.exit(2); });
