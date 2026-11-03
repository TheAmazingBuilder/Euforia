/** Debug: layout switch flow - dump state at each step. */
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3001";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

  const dump = async (label) => {
    const state = await page.evaluate(() => {
      const read = window.__ORYON_PANELS_DEBUG__;
      const panels = typeof read === "function" ? read() : null;
      const raw = window.localStorage.getItem("euforia.oryon.layouts.v1");
      const file = raw ? JSON.parse(raw) : null;
      return {
        panels: panels?.map((p) => ({ sym: p.symbol, iv: p.interval, bands: p.sessionBands, m: p.eventMarkers })),
        active: file?.activeLayoutId,
        layouts: file?.layouts?.map((l) => ({ id: l.id, ctx: l.panels.map((p) => p.context.sessionShading) })),
      };
    });
    console.log(label, JSON.stringify(state));
  };

  await dump("initial:");

  // Save-as with sessions OFF.
  await page.locator('[data-testid="oryon-panel-0-context-menu"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('[data-testid="oryon-panel-0-context-sessions"]').click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await dump("sessions-off:");
  await page.click('[data-testid="oryon-panel-0-identity"]');
  await page.waitForTimeout(250);
  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="oryon-layout-save-as"]');
  await page.waitForTimeout(400);
  await page.fill('[data-testid="oryon-layout-name-input"]', "CtxDebug");
  await page.click('[data-testid="oryon-layout-name-submit"]');
  await page.waitForTimeout(900);
  await dump("saved:");

  // Mutate ON.
  await page.locator('[data-testid="oryon-panel-0-context-menu"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('[data-testid="oryon-panel-0-context-sessions"]').click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await dump("dirty-on:");

  // Switch back to saved.
  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForTimeout(300);
  await page.locator('[data-testid^="oryon-layout-item-"]:not([data-testid="oryon-layout-item-default"])').first().click();
  await page.waitForTimeout(600);
  const guardCount = await page.locator('[data-testid="oryon-layout-switch-discard"]').count();
  console.log("guard visible:", guardCount);
  if (guardCount > 0) {
    await page.locator('[data-testid="oryon-layout-switch-discard"]').click();
    await page.waitForTimeout(1_000);
  }
  await dump("after-switch:");
  await browser.close();
})();
