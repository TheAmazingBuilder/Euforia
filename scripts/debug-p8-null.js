/** Debug: capture full stacks of uncaught "Value is null" in quad+switch flow. */
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3001";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => {
    if (String(e).includes("Value is null")) {
      console.log("PAGEERROR STACK:");
      console.log(e.stack ?? "(no stack)");
      console.log("---");
    }
  });
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  try {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 15_000 });
    const demo = page.locator('[data-testid="login-demo-hint"] button').first();
    if ((await demo.count()) > 0) await demo.click();
    await page.click('[data-testid="login-submit"]');
    await page.waitForTimeout(3_000);
    if ((await page.locator('[data-testid="login-mfa-code"]').count()) > 0) {
      const hint = (await page.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
      if (hint) {
        await page.fill('[data-testid="login-mfa-code"]', hint[0]);
        await page.keyboard.press("Enter");
      }
    }
    await page.waitForTimeout(2_000);
  } catch {}
  await page.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
  await page.waitForTimeout(3_000);

  // Quad grid - the P7 flow that produced the errors.
  await page.click('[data-testid="oryon-grid-trigger"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-grid-item-quad"]');
  await page.waitForTimeout(6_000);

  // Symbol switches on two panels (data-reload windows).
  for (const [i, symbol] of [[1, "XAUUSD"], [2, "GBPUSD"], [1, "EURUSD"]]) {
    await page.locator(`[data-testid="oryon-panel-${i}-identity"]`).click().catch(() => {});
    await page.waitForTimeout(300);
    await page.click(`[data-testid="oryon-panel-${i}-instrument-trigger"]`).catch((e) => console.log("click err", String(e).slice(0, 80)));
    await page.waitForTimeout(400);
    await page.fill(`[data-testid="oryon-panel-${i}-instrument-search"]`, symbol).catch(() => {});
    await page.waitForTimeout(300);
    await page.click(`[data-testid="oryon-panel-${i}-instrument-option-${symbol}"]`).catch(() => {});
    await page.waitForTimeout(2_500);
    console.log(`switched panel ${i} -> ${symbol}`);
  }

  // Chart type switch on panel 0 (series rebuild with markers + bands).
  await page.locator('[data-testid="oryon-panel-0-identity"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-panel-0-type-line"]').catch(() => {});
  await page.waitForTimeout(1_500);
  await page.click('[data-testid="oryon-panel-0-type-candles"]').catch(() => {});
  await page.waitForTimeout(1_500);
  console.log("type switches done");

  // Time-scale sync + user pan (the P7 broadcast path).
  await page.click('[data-testid="oryon-sync-trigger"]');
  await page.waitForTimeout(250);
  await page.click('[data-testid="oryon-sync-item-timeScale"]').catch(() => {});
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  for (const [i, dx] of [[0, -220], [2, 180], [1, -260]]) {
    const canvas = page.locator('[data-testid="oryon-panel"]').nth(i).locator('[data-testid="oryon-chart-canvas"] canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let step = 1; step <= 6; step++) await page.mouse.move(cx + (dx * step) / 6, cy, { steps: 2 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      console.log(`panned panel ${i}`);
    }
  }

  // Interval switch on a synced grid (data-reload + broadcast).
  await page.locator('[data-testid="oryon-panel-3-identity"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-panel-3-timeframes"]').catch(() => {});
  await page.waitForTimeout(250);
  await page.click('[data-testid="oryon-panel-3-tf-15m"]').catch(() => {});
  await page.waitForTimeout(2_500);
  console.log("interval switch done");

  // Crosshair sync + hover across panels.
  await page.click('[data-testid="oryon-sync-trigger"]');
  await page.waitForTimeout(250);
  await page.click('[data-testid="oryon-sync-item-crosshair"]').catch(() => {});
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const c0 = await page.locator('[data-testid="oryon-panel"]').first().locator('[data-testid="oryon-chart-canvas"] canvas').first().boundingBox();
  if (c0) {
    await page.mouse.move(c0.x + c0.width * 0.2, c0.y + c0.height / 2, { steps: 6 });
    await page.waitForTimeout(300);
    await page.mouse.move(c0.x + c0.width * 0.45, c0.y + c0.height / 2, { steps: 6 });
    await page.waitForTimeout(300);
    await page.mouse.move(10, 500, { steps: 4 });
  }
  console.log("crosshair sweep done");
  await page.waitForTimeout(2_000);
  await browser.close();
})();
