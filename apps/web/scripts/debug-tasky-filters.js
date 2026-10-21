/* Debug — Tasky search + priority filter behavior. */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });

  await page.goto("http://localhost:3000/tasky", { waitUntil: "networkidle" });
  await page.locator('[data-testid="tasky-view"]').waitFor({ state: "visible" });

  const dump = async (tag) => {
    const cards = await page.locator('[data-testid^="tasky-card-"]').all();
    const info = [];
    for (const card of cards) {
      info.push({
        id: await card.getAttribute("data-testid"),
        column: await card.getAttribute("data-column"),
        priority: await card.getAttribute("data-priority"),
        text: (await card.innerText()).split("\n")[0],
      });
    }
    console.log(`--- ${tag}: ${cards.length} cards ---`);
    for (const item of info) console.log(JSON.stringify(item));
  };

  await dump("initial");

  // Create via dialog.
  await page.locator('[data-testid="tasky-new-open"]').click();
  await page.locator('[data-testid="tasky-new-dialog"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="tasky-form-title"]').fill("QA verification card");
  await page.locator('[data-testid="tasky-form-column"]').click();
  await page.getByRole("option", { name: "Review" }).click();
  await page.locator('[data-testid="tasky-form-submit"]').click();
  await page.waitForTimeout(400);
  await dump("after-create");

  await page.locator('[data-testid="tasky-search"]').fill("QA verification");
  await page.waitForTimeout(400);
  await dump("search=QA verification");

  await page.locator('[data-testid="tasky-search"]').fill("");
  await page.waitForTimeout(300);
  await page.locator('[data-testid="tasky-priority-high"]').click();
  await page.waitForTimeout(400);
  await dump("priority=HIGH");

  await browser.close();
})();
