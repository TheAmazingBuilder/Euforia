/* eslint-disable @typescript-eslint/no-require-imports -- Node screenshot script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Overview (dark)
  await page.goto(`${BASE}/nofy`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/nofy-overview.png", fullPage: true });

  // My Notes list
  await page.click('[data-testid="nofy-tab-notes"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/nofy-notes.png", fullPage: false });

  // Editor with seeded note (blocks + ref cards)
  await page.locator('[data-testid="nofy-note-row"]', { hasText: "Why I entered too early" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/nofy-editor.png", fullPage: true });

  // Slash menu open (fresh empty block — "/" opens the menu at block start)
  await page.locator('[data-testid="nofy-blocks"] > button[aria-label="Add a block"]').click();
  await page.waitForTimeout(400);
  const fresh = page.locator('[data-testid="nofy-block"] textarea').last();
  await fresh.type("/");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/nofy-slash-menu.png", fullPage: true });
  await page.keyboard.press("Escape");

  // Templates
  await page.click('[data-testid="nofy-editor-back"]');
  await page.waitForTimeout(900);
  await page.click('[data-testid="nofy-tab-templates"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/nofy-templates.png", fullPage: false });

  // Light theme overview
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.click('[data-testid="nofy-tab-overview"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/nofy-overview-light.png", fullPage: false });

  // Mobile overview + editor
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/nofy`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: "/home/z/my-project/scripts/shots/nofy-mobile.png", fullPage: false });
  await mobile.close();

  await browser.close();
  console.log("Screenshots saved.");
})();
