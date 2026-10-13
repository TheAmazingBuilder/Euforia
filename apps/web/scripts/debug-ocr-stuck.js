/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const apiLog = [];
  page.on("response", async (res) => {
    if (res.url().includes("/recognition")) {
      let body = "";
      try { body = (await res.text()).slice(0, 300); } catch {}
      apiLog.push(`${res.status()} ${res.request().method()} ${res.url().replace("http://localhost:3000", "")} :: ${body}`);
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text().slice(0, 200));
  });

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL("http://localhost:3000/");

  await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle" });
  await page.locator('[data-testid="ocr-empty-hero-cta"]').click();
  await page.waitForTimeout(400);
  const png = `${__dirname}/shots/accounts-04-detail.png`;
  await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(png);
  await page.waitForTimeout(500);
  await page.locator('[data-testid="ocr-start-analysis"]').click();
  await page.waitForURL("**/recognition?job=*", { timeout: 10000 });
  console.log("URL:", page.url());

  for (let i = 0; i < 14; i += 1) {
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("main").innerText().catch(() => "");
    const hasProcessing = bodyText.includes("Analyzing screenshot");
    const hasResult = bodyText.includes("Recognition result");
    const hasFailed = bodyText.includes("Recognition failed");
    const progress = (bodyText.match(/(\d+)%/) || [])[1];
    console.log(`t+${(i + 1) * 1.5}s | processing=${hasProcessing} result=${hasResult} failed=${hasFailed} progress=${progress ?? "-"}`);
    if (hasResult || hasFailed) break;
  }

  console.log("\n--- API calls ---");
  for (const line of apiLog.slice(-12)) console.log(line);
  await page.screenshot({ path: `${__dirname}/shots/debug-ocr-stuck.png` });
  await browser.close();
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
