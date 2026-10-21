// Debug2: exact full-probe sequence — rr editor, Escape, then extended.
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90000 });
  try {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 20000 });
    const demo = page.locator('[data-testid="login-demo-hint"] button').first();
    if ((await demo.count()) > 0) await demo.click();
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
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((n) => n.remove());
    localStorage.removeItem("euforia.oryon.drawings.v1:EURUSD");
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(3000);

  const box = await page.locator('[data-testid="oryon-panel"]').first().boundingBox();
  const cx = box.x + box.width / 2;
  const rr1 = { x: cx - 160, y: box.y + 300 };
  const rr2 = { x: cx + 40, y: box.y + 360 };

  // 1. Draw longpos (press-drag).
  await page.click('[data-testid="oryon-tool-caret-forecast"]');
  await page.waitForSelector('[data-testid="oryon-tool-item-longpos"]', { timeout: 5000 });
  await page.click('[data-testid="oryon-tool-item-longpos"]');
  await page.mouse.move(rr1.x, rr1.y);
  await page.mouse.down();
  await page.mouse.move(rr2.x, rr2.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  let dbg = await page.evaluate(() => window.__ORYON_DRAWINGS_DEBUG__());
  console.log("longpos:", JSON.stringify(dbg.byType));

  // 2. Right-click → rr editor → chip 3 → input 2.5.
  await page.mouse.click((rr1.x + rr2.x) / 2, (rr1.y + rr2.y) / 2 + 20, { button: "right" });
  const ed = await page.waitForSelector('[data-testid="oryon-drawing-ctx-editor"][data-drawing-type="longpos"]', { timeout: 5000 }).catch(() => null);
  console.log("editor open:", ed !== null);
  await page.click('[data-testid="oryon-ctx-rr-3"]');
  await page.waitForTimeout(200);
  const input = page.locator('[data-testid="oryon-ctx-rr"] input[type="number"]');
  await input.fill("2.5");
  await input.press("Enter");
  await page.waitForTimeout(300);
  dbg = await page.evaluate(() => window.__ORYON_DRAWINGS_DEBUG__());
  console.log("rr after input:", JSON.stringify(dbg.drawings.find((d) => d.type === "longpos")?.rr));

  // 3. Escape, then arm extended EXACTLY like the probe.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-tool-caret-trend"]');
  await page.waitForSelector('[data-testid="oryon-tool-item-extended"]', { timeout: 5000 });
  await page.click('[data-testid="oryon-tool-item-extended"]');
  await page.waitForTimeout(100);
  await page.mouse.click(rr1.x, box.y + 380);
  await page.mouse.click(rr2.x + 120, box.y + 300);
  await page.waitForTimeout(500);
  dbg = await page.evaluate(() => window.__ORYON_DRAWINGS_DEBUG__());
  console.log("after extended attempt:", JSON.stringify(dbg.byType), "total", dbg.total);

  // Retry with a small settle delay after arming.
  if ((dbg.byType.extended ?? 0) === 0) {
    console.log("RETRY with settle…");
    await page.click('[data-testid="oryon-tool-caret-trend"]');
    await page.waitForSelector('[data-testid="oryon-tool-item-extended"]', { timeout: 5000 });
    await page.click('[data-testid="oryon-tool-item-extended"]');
    await page.waitForTimeout(400);
    await page.mouse.click(rr1.x, box.y + 380);
    await page.waitForTimeout(150);
    await page.mouse.click(rr2.x + 120, box.y + 300);
    await page.waitForTimeout(500);
    dbg = await page.evaluate(() => window.__ORYON_DRAWINGS_DEBUG__());
    console.log("after retry:", JSON.stringify(dbg.byType), "total", dbg.total);
  }
  await browser.close();
})();
