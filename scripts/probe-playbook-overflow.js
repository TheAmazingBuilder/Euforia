/** probe-playbook-overflow.js - find the element overflowing at 390px on /playbook. */
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/playbook`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 2 || rect.left < -2) {
        const cls = (el.className && String(el.className).slice(0, 90)) || "";
        bad.push(
          `${el.tagName.toLowerCase()}.${cls} right=${Math.round(rect.right)} left=${Math.round(rect.left)} w=${Math.round(rect.width)}`,
        );
      }
    }
    return bad.slice(0, 25);
  });
  console.log(offenders.length === 0 ? "NO OVERFLOW" : offenders.join("\n"));
  // Also probe each tab for overflow
  for (const tab of ["strategies", "setups", "rules", "checklists", "performance", "templates"]) {
    await page.goto(`${BASE}/playbook?tab=${tab}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1800);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
    console.log(`tab=${tab} overflow=${over}`);
  }
  await browser.close();
})();
