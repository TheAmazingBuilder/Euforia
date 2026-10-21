const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (msg) => { if (msg.text().includes("MSW") || msg.text().includes("mock")) console.log("[console]", msg.text().slice(0,120)); });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(4000);
  const probe = await page.evaluate(async () => {
    const sw = await navigator.serviceWorker.getRegistrations();
    const ctrl = !!navigator.serviceWorker.controller;
    const overview = await fetch("/stats/overview");
    return { swCount: sw.length, ctrl, overviewStatus: overview.status, url: location.href };
  });
  console.log(probe);
  await browser.close();
})();
