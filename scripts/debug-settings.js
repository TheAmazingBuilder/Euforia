/** Debug - settings trading card state. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") console.log("[console]", msg.type(), msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 400)));
  page.on("response", (res) => {
    if (res.url().includes("/me/preferences") || res.url().includes("/accounts") || res.url().includes("/instruments")) {
      console.log("[response]", res.status(), res.url());
    }
  });

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log("profile card visible:", await page.locator('[data-testid="settings-profile"]').isVisible().catch(() => false));
  await page.locator('[data-testid="settings-nav-trading"]').click();
  await page.waitForTimeout(2500);
  console.log("content:", await page.locator('[data-testid="settings-content"]').innerHTML().then((h) => h.slice(0, 600)).catch((e) => String(e)));
  await page.screenshot({ path: "scripts/shots/debug-settings-trading.png" });
  await browser.close();
})();
