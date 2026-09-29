const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const bad = [];
  page.on("response", (res) => { if (res.status() >= 400) bad.push(`${res.status()} ${res.url()}`); });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  console.log("4xx on goto(/):", bad);
  await browser.close();
})();
