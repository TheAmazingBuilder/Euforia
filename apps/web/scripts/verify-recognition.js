const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 140)));
  page.on("response", (r) => { if (r.status() >= 400 && !/socket\.io|candles|favicon|X-TransformPort/i.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url().slice(28, 100)}`); });

  // 1) Unauthenticated → /recognition must redirect to /login
  await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  console.log("unauth /recognition →", page.url().includes("/login") ? "redirected to login ✓" : page.url());

  // 2) Login with the demo credentials
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
  const email = process.env.DEMO_EMAIL || "trader@cosmoz.app";
  const password = process.env.DEMO_PASSWORD || "cosmoz-demo-2026";
  await page.fill('input[type="email"]', email).catch(() => console.log("no email input"));
  await page.fill('input[type="password"]', password).catch(() => console.log("no password input"));
  await page.click('button[type="submit"]').catch(() => console.log("no submit"));
  await page.waitForTimeout(2500);
  console.log("after login →", page.url());

  // 3) Navigate to /recognition via sidebar
  await page.goto("http://localhost:3000/recognition", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const h1 = await page.locator("h1").first().textContent().catch(() => "NONE");
  console.log("/recognition h1 →", h1 && h1.trim().slice(0, 40));

  // 4) Sidebar contains Recognition
  const navHasRecognition = await page.locator('a[href="/recognition"]').count();
  console.log("sidebar /recognition links →", navHasRecognition);

  // 5) Upload flow: create a tiny PNG, set it on the file input, analyze
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz4AFMGETHDQSADveAgfNVdvhAAAAAElFTkSuQmCC",
    "base64",
  );
  await page.setInputFiles('input[type="file"]', { name: "shot.png", mimeType: "image/png", buffer: tinyPng });
  await page.waitForTimeout(500);
  await page.locator('[data-testid="recognition-analyze"]').click().catch(() => console.log("no analyze btn (file may be cleared)"));
  await page.waitForTimeout(2500);
  const cards = await page.locator('[data-testid="recognition-card"]').count();
  console.log("recognition cards after upload →", cards);
  if (cards > 0) {
    await page.locator('[data-testid="recognition-card"]').first().click();
    await page.waitForTimeout(1500);
    const dialogVisible = await page.locator('[data-testid="recognition-review-dialog"]').isVisible().catch(() => false);
    console.log("review dialog open →", dialogVisible);
    const confirmBtn = await page.locator('[data-testid="recognition-confirm"]').count();
    console.log("confirm button present →", confirmBtn);
    if (confirmBtn > 0) {
      await page.locator('[data-testid="recognition-confirm"]').click();
      await page.waitForTimeout(1800);
      console.log("confirmed ✓");
    }
  }

  await page.screenshot({ path: "scripts/shots/recognition-page.png", fullPage: true });
  console.log("ERRORS:", errors.length === 0 ? "none" : errors.slice(0, 6));
  await browser.close();
})();
