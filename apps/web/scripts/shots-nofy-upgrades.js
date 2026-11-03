/* Screenshots - Nofy upgrades: slash menu, export PDF, playbook & review integrations */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);

  // Slash menu
  await page.locator('nav[aria-label="Main navigation"] a[href="/nofy"]').click();
  await page.waitForTimeout(1400);
  await page.click('[data-testid="nofy-tab-notes"]');
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="nofy-note-row"]', { hasText: "XAUUSD London Breakout" }).click();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Add a block" }).click();
  await page.waitForTimeout(400);
  const fresh = page.locator('[data-testid="nofy-block"] textarea').last();
  await fresh.type("/");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "scripts/shots/nofy-upgrade-slash-menu.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const anchorBlock = page.locator('[data-testid="nofy-block"] textarea').last();
  await anchorBlock.press("Control+a");
  await anchorBlock.press("Backspace");
  await page.waitForTimeout(1500);

  // Export PDF dialog
  await page.click('[data-testid="nofy-note-menu"]');
  await page.waitForTimeout(400);
  await page.locator('[role="menuitem"]', { hasText: "Export PDF" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: "scripts/shots/nofy-upgrade-export-pdf.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Playbook strategy dialog with linked notes
  await page.locator('nav[aria-label="Main navigation"] a[href="/playbook"]').click();
  await page.waitForTimeout(1500);
  await page.click('[data-testid="tab-strategies"]');
  await page.waitForTimeout(1300);
  await page.locator('button[aria-haspopup="dialog"]').first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "scripts/shots/nofy-upgrade-playbook.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Review dialog with linked notes
  await page.locator('nav[aria-label="Main navigation"] a[href="/journal"]').click();
  await page.waitForTimeout(1500);
  await page.click('[data-testid="tab-reviews"]');
  await page.waitForTimeout(1300);
  await page.locator('[data-testid="review-edit"]').first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "scripts/shots/nofy-upgrade-review.png" });

  await browser.close();
  console.log("shots saved");
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
