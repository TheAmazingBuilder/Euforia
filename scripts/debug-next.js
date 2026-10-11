const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE ERROR:", m.text().slice(0, 200));
  });
  page.on("response", (r) => {
    if (r.url().includes("/auth/")) console.log("AUTH RESPONSE:", r.status(), r.url());
  });

  await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("URL after guard:", page.url());

  await page.waitForTimeout(600);
  await page.locator('[data-testid="fill-demo"]').click();
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForTimeout(4000);
  console.log("URL after login:", page.url());
  console.log("Has login error:", await page.locator('[data-testid="login-error"]').isVisible().catch(() => false));

  await browser.close();
})();
