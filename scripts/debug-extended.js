// Focused debug: why doesn't the extended-line tool create via flyout?
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3001";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console]", m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

  // login
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90000 });
  try {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 20000 });
    const demo = page.locator('[data-testid="login-demo-hint"] button').first();
    if ((await demo.count()) > 0) await demo.click();
    else {
      await page.fill("#login-email", "trader@cosmoz.app");
      await page.fill("#login-password", "cosmoz-demo-2026");
    }
    await page.click('[data-testid="login-submit"]');
    await page.waitForTimeout(3000);
    if ((await page.locator('[data-testid="login-mfa-code"]').count()) > 0) {
      const hint = (await page.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
      if (hint) {
        await page.fill('[data-testid="login-mfa-code"]', hint[0]);
        await page.keyboard.press("Enter");
      }
    }
  } catch {}

  await page.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector('[data-testid="oryon-panel"]', { timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));

  const box = await page.locator('[data-testid="oryon-panel"]').first().boundingBox();
  const cx = box.x + box.width / 2;
  console.log("panel box:", JSON.stringify(box));

  // Arm extended via the trend flyout.
  await page.click('[data-testid="oryon-tool-caret-trend"]');
  await page.waitForSelector('[data-testid="oryon-tool-item-extended"]', { timeout: 5000 });
  await page.click('[data-testid="oryon-tool-item-extended"]');
  await page.waitForTimeout(300);

  // Read the armed tool from the rail's aria state (item aria-checked).
  const checked = await page.locator('[data-testid="oryon-tool-item-extended"]').getAttribute("aria-checked").catch(() => "gone");
  console.log("extended item aria-checked after click:", checked);

  const x1 = cx - 160, y1 = box.y + 380;
  const x2 = cx + 160, y2 = box.y + 300;
  console.log("click1", x1, y1, "click2", x2, y2);
  await page.mouse.click(x1, y1);
  await page.waitForTimeout(200);
  let dbg = await page.evaluate(() => window.__ORYON_DRAWINGS_DEBUG__ ? window.__ORYON_DRAWINGS_DEBUG__() : null);
  console.log("after click1:", JSON.stringify(dbg && dbg.byType), "total", dbg && dbg.total);
  await page.mouse.click(x2, y2);
  await page.waitForTimeout(400);
  dbg = await page.evaluate(() => window.__ORYON_DRAWINGS_DEBUG__ ? window.__ORYON_DRAWINGS_DEBUG__() : null);
  console.log("after click2:", JSON.stringify(dbg && dbg.byType), "total", dbg && dbg.total);
  await page.screenshot({ path: "/home/z/my-project/scripts/debug-extended.png" });
  await browser.close();
})();
