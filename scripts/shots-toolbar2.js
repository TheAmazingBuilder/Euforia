/** Screenshots : toolbar v2 (rail + flyout trend + favoris + barre du bas). */
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  try {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 });
    const demoButton = page.locator('[data-testid="login-demo-hint"] button').first();
    if ((await demoButton.count()) > 0) await demoButton.click();
    else {
      await page.fill("#login-email", "trader@cosmoz.app");
      await page.fill("#login-password", "cosmoz-demo-2026");
    }
    await page.click('[data-testid="login-submit"]');
    await page.waitForTimeout(3_000);
  } catch { /* already authed */ }

  await page.locator('[href="/oryon"]').first().click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 40_000 });
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
  await page.waitForTimeout(4_500);

  // 1. Full workspace with the favorites bar at default position.
  await page.screenshot({ path: "/home/z/my-project/scripts/toolbar2-overview.png" });

  // 2. Trend flyout open.
  await page.click('[data-testid="oryon-tool-caret-trend"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/home/z/my-project/scripts/toolbar2-flyout-trend.png" });
  await page.keyboard.press("Escape");

  // 3. Fibonacci flyout.
  await page.click('[data-testid="oryon-tool-caret-fib"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/home/z/my-project/scripts/toolbar2-flyout-fib.png" });
  await page.keyboard.press("Escape");

  // 4. Forecasting flyout.
  await page.click('[data-testid="oryon-tool-caret-forecast"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/home/z/my-project/scripts/toolbar2-flyout-forecast.png" });
  await page.keyboard.press("Escape");

  // 5. A drawn trendline + position tool + favorites bar dragged mid-chart.
  await page.evaluate(() => localStorage.removeItem("euforia.oryon.ui.v1"));
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
  await page.waitForTimeout(4_000);
  const box = await page.locator('[data-testid="oryon-panel"]').first().boundingBox();
  const cx = box.x + box.width / 2;
  const a = { x: cx - 180, y: box.y + 300 };
  const b = { x: cx + 140, y: box.y + 180 };
  await page.keyboard.press("Alt+t");
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  // long position
  await page.click('[data-testid="oryon-tool-caret-forecast"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-tool-item-longpos"]');
  await page.waitForTimeout(300);
  await page.mouse.click(cx - 60, box.y + 260);
  await page.mouse.click(cx + 260, box.y + 340);
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/home/z/my-project/scripts/toolbar2-drawings.png" });

  await browser.close();
  console.log("shots OK");
})();
