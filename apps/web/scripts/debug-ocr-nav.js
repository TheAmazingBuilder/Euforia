/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL("http://localhost:3000/");

  const swInfo = async () => page.evaluate(() => ({
    controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
    ready: navigator.serviceWorker ? "yes" : "no",
  }));

  const png = `${__dirname}/shots/accounts-04-detail.png`;
  // import 1
  await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle" });
  console.log("SW before import1:", JSON.stringify(await swInfo()));
  await page.locator('[data-testid="ocr-import-cta"]').click();
  await page.waitForTimeout(400);
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(png);
  await page.waitForTimeout(700);
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  await page.waitForURL("**/recognition?job=*", { timeout: 12000 });
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 20000 });
  console.log("import1 done, url:", page.url());

  // full navigation back
  await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  console.log("SW after goto:", JSON.stringify(await swInfo()));
  const mainHead = await page.locator("main").innerText();
  console.log("MAIN after goto:", mainHead.slice(0, 260).replace(/\n/g, " | "));
  console.log("URL after goto:", page.url());

  // click import-cta and watch what surface appears
  await page.locator('[data-testid="ocr-import-cta"]').click();
  await page.waitForTimeout(600);
  const mainAfter = await page.locator("main").innerText();
  console.log("MAIN after cta:", mainAfter.slice(0, 300).replace(/\n/g, " | "));
  await browser.close();
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
