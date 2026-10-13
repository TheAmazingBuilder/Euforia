/* Visual QA probe — captures the extended analytics sections (drawer open, patterns grid, execution, consistency). */
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOTS = "/home/z/my-project/scripts/shots/analytics-extended";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });

  await page.locator('nav[aria-label="Main navigation"] a[href="/analytics"]').click();
  await page.locator('[data-testid="analytics-tab-overview"]').waitFor({ state: "visible", timeout: 60_000 });

  // Behavior tab — full page (score + patterns + compliance + timeline).
  await page.locator('[role="tab"]', { hasText: /^Behavior$/i }).click();
  await page.locator('[data-testid="analytics-tab-behavior"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/QA-behavior-full.png`, fullPage: true });

  // Open the revenge drawer for the details capture.
  const revenge = page.locator('[data-testid="behavior-pattern-card"][data-pattern-type="REVENGE_TRADING"]');
  await revenge.getByRole("button", { name: /View details/i }).click();
  await page.locator('[data-testid="behavior-pattern-drawer"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/QA-drawer-open.png` });
  await page.keyboard.press("Escape");

  // Execution + Consistency full page.
  await page.locator('[role="tab"]', { hasText: /^Execution$/i }).click();
  await page.locator('[data-testid="analytics-tab-execution"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/QA-execution-full.png`, fullPage: true });

  await page.locator('[role="tab"]', { hasText: /^Consistency$/i }).click();
  await page.locator('[data-testid="analytics-tab-consistency"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/QA-consistency-full.png`, fullPage: true });

  await browser.close();
  console.log("QA captures done");
})().catch((err) => {
  console.error("PROBE ERROR:", err);
  process.exit(1);
});
