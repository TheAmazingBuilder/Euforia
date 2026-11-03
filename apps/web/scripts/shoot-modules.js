const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");
(async () => {
  const browser = await chromium.launch();
  // Desktop dark
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await ensureLogin(page);
  await page.goto("http://localhost:3000/tasky", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "scripts/shots/tasky-desktop.png", fullPage: false });
  await page.goto("http://localhost:3000/events", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "scripts/shots/events-desktop.png", fullPage: false });
  // Tools typography check
  await page.goto("http://localhost:3000/tools/lot-size", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "scripts/shots/lot-standard-header.png", fullPage: false });
  // Mobile
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  // ensureLogin waits for the DESKTOP sidebar - hidden below lg - so log in manually.
  await mobile.locator("#login-email").fill("trader@cosmoz.app");
  await mobile.locator("#login-password").fill("cosmoz-demo-2026");
  await mobile.locator('[data-testid="login-submit"]').click();
  await mobile.waitForURL((url) => !String(url).includes("/login"), { timeout: 20_000 });
  await mobile.goto("http://localhost:3000/tasky", { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1800);
  await mobile.screenshot({ path: "scripts/shots/tasky-mobile.png", fullPage: false });
  await mobile.goto("http://localhost:3000/events", { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1800);
  await mobile.screenshot({ path: "scripts/shots/events-mobile.png", fullPage: false });
  // Light theme events
  const light = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await light.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await ensureLogin(light);
  await light.evaluate(() => { try { localStorage.setItem("theme", "light"); } catch {} });
  await light.goto("http://localhost:3000/events", { waitUntil: "networkidle" });
  await light.waitForTimeout(1800);
  await light.screenshot({ path: "scripts/shots/events-light.png", fullPage: false });
  await browser.close();
  console.log("SHOTS DONE");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
