// Debug: vline + ray creation failure after hline (P2 sequence).
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90000 });
  try {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 20000 });
    const demo = page.locator('[data-testid="login-demo-hint"] button').first();
    if ((await demo.count()) > 0) await demo.click();
    await page.click('[data-testid="login-submit"]');
    await page.waitForTimeout(3000);
    if ((await page.locator('[data-testid="login-mfa-code"]').count()) > 0) {
      const hint = (await page.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
      if (hint) { await page.fill('[data-testid="login-mfa-code"]', hint[0]); await page.keyboard.press("Enter"); }
    }
  } catch {}

  await page.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()); });

  const box = await page.locator('[data-testid="oryon-chart-canvas"]').boundingBox();
  console.log("canvas box:", JSON.stringify(box));

  const armTool = async (tool, group) => {
    await page.click(`[data-testid="oryon-tool-caret-${group}"]`);
    await page.waitForSelector(`[data-testid="oryon-tool-item-${tool}"]`, { timeout: 5000 });
    await page.click(`[data-testid="oryon-tool-item-${tool}"]`);
    await page.waitForTimeout(280);
  };
  const dump = async (label) => {
    const d = await page.evaluate(() => window.__ORYON_DRAWINGS_DEBUG__ ? window.__ORYON_DRAWINGS_DEBUG__() : null);
    console.log(label, JSON.stringify(d && d.byType), "tool:", d && d.activeTool);
  };

  // hline SKIPPED — vline first

  // pan SKIPPED in this variant

  // vline (FAILS in P2)
  await armTool("vline", "trend");
  await dump("after arm vline:");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.waitForTimeout(300);
  await dump("after vline click:");

  // trend AFTER vline
  await armTool("trend", "trend");
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.6);
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await page.waitForTimeout(400);
  await dump("after trend clicks:");

  await page.screenshot({ path: "/home/z/my-project/scripts/debug-p2-vline.png" });
  await browser.close();
})();
