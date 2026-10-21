const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/academy", { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    try { localStorage.setItem("theme", "light"); } catch {}
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "scripts/shots/academy-overview-light.png" });
  await page.goto("http://localhost:3000/academy?tab=courses&course=crs-candles-single&lesson=lsn-candles-anatomy", { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "scripts/shots/academy-lesson-light.png" });
  await browser.close();
  console.log("done");
})();
