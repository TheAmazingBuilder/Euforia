/* Debug probe: replicate K1 drag, log every predicate piece. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const { ensureLogin } = require("/home/z/my-project/apps/web/scripts/helpers/login.js");

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/login`);
  await ensureLogin(page);
  await page.goto(`${BASE}/tasky`);
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    document.querySelector('[data-testid="tasky-board-scroll"]').scrollLeft = 9999;
  });
  await page.waitForTimeout(200);

  const doneZone = page.locator('[data-testid="tasky-dropzone-done"]');
  const source = page.locator('[data-testid="tasky-card-t-ratelimit"]');
  const sBox = await source.boundingBox();
  const tBox = await doneZone.boundingBox();
  console.log("sBox:", JSON.stringify(sBox));
  console.log("tBox:", JSON.stringify(tBox));

  const sx = sBox.x + sBox.width / 2;
  const sy = sBox.y + sBox.height / 2;
  const tx = tBox.x + 120;
  const ty = tBox.y + 30;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy + 8, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 18 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(500);

  console.log("count done:", JSON.stringify(await page.locator('[data-testid="tasky-count-done"]').innerText()));
  console.log("count review:", JSON.stringify(await page.locator('[data-testid="tasky-count-in-review"]').innerText()));
  console.log("inZone:", await page.locator('[data-testid="tasky-dropzone-done"] [data-testid="tasky-card-t-ratelimit"]').count());

  await browser.close();
})();
