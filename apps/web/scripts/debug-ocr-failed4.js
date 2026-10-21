/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const recognitionCalls = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/recognition")) {
      let body = "";
      try { body = (await res.text()).slice(0, 160); } catch {}
      recognitionCalls.push(`${res.request().method()} ${res.url().replace("http://localhost:3000/api", "")} ${res.status()} :: ${body}`);
    }
  });
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL("http://localhost:3000/");

  const png = `${__dirname}/shots/accounts-04-detail.png`;
  const doImport = async (n) => {
    await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle" });
    await page.locator('[data-testid="ocr-import-cta"]').click();
    await page.waitForTimeout(300);
    await page.locator('input[aria-label="Upload screenshot"]').setInputFiles(png);
    await page.waitForTimeout(500);
    await page.locator('[data-testid="ocr-start-analysis"]').click();
    await page.waitForURL("**/recognition?job=*", { timeout: 12000 });
    console.log(`import#${n} url=${page.url()}`);
  };

  await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle" });
  // import 1 (XAUUSD) → complete
  await doImport(1);
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 20000 });
  console.log("job1 completed ✓");
  // import 2 (EURUSD) → complete
  await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle" });
  await doImport(2);
  await page.locator('[data-testid="ocr-result"]').waitFor({ timeout: 20000 });
  console.log("job2 completed ✓");
  // import 3 (NAS100) → cancel at ~1.5s
  await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle" });
  await doImport(3);
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="ocr-cancel"]').click();
  await page.waitForTimeout(900);
  const cancelledShown = await page.locator('[data-testid="ocr-cancelled"]').isVisible().catch(() => false);
  console.log("cancelled shown:", cancelledShown);
  await page.locator('[data-testid="ocr-cancelled-back"]').click();
  await page.waitForTimeout(700);
  console.log("url after back:", page.url());
  // import 4 → expect FAILED
  await doImport(4);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(1500);
    const failed = await page.locator('[data-testid="ocr-failed"]').isVisible().catch(() => false);
    const processing = await page.locator('[data-testid="ocr-processing"]').isVisible().catch(() => false);
    const result = await page.locator('[data-testid="ocr-result"]').isVisible().catch(() => false);
    console.log(`t+${(i + 1) * 1.5}s failed=${failed} processing=${processing} result=${result}`);
    if (failed || result) break;
  }
  await page.screenshot({ path: `${__dirname}/shots/debug-ocr-failed4.png` });
  const mainText = await page.locator("main").innerText();
  console.log("\nMAIN AT STUCK POINT:", mainText.slice(0, 400).replace(/\n/g, " | "));
  console.log("\n--- ALL recognition api calls (" + recognitionCalls.length + ") ---");
  const posts = recognitionCalls.filter((l) => l.startsWith("POST"));
  for (const line of posts) console.log(line.slice(0, 130));
  console.log("--- last 6 GETs ---");
  const gets = recognitionCalls.filter((l) => l.startsWith("GET"));
  for (const line of gets.slice(-6)) console.log(line.slice(0, 130));
  await browser.close();
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
