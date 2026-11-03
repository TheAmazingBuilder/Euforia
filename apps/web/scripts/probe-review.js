/* Probe - reviewed row lesson state inside ReviewDialog */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.locator('nav[aria-label="Main navigation"] a[href="/journal"]').click();
  await page.waitForTimeout(1500);
  await page.click('[data-testid="tab-reviews"]');
  await page.waitForTimeout(1300);

  const editCount = await page.locator('[data-testid="review-edit"]').count();
  console.log("review-edit buttons:", editCount);
  await page.locator('[data-testid="review-edit"]').first().click();
  await page.waitForTimeout(1000);
  const dialogText = await page.locator('[data-testid="review-dialog"]').innerText();
  console.log("dialog verdict line:", dialogText.split("\n").slice(0, 4).join(" | "));
  const lessonsValue = await page.locator('[data-testid="review-lessons-input"]').inputValue();
  console.log("lessons textarea value:", JSON.stringify(lessonsValue.slice(0, 120)));
  const sectionText = await page.locator('[data-testid="review-nofy-section"]').innerText();
  console.log("nofy section text:", JSON.stringify(sectionText.slice(0, 160)));
  await browser.close();
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
