const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector('[data-testid="trades-row"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  const offenders = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > clientWidth + 1) {
        const tag = el.tagName.toLowerCase();
        const testid = el.getAttribute?.("data-testid") ?? "";
        const cls = typeof el.className === "string" ? el.className.slice(0, 80) : "";
        out.push(`${tag}${testid ? `[${testid}]` : ""} right=${Math.round(rect.right)} w=${Math.round(rect.width)} :: ${cls}`);
      }
    }
    return out.slice(0, 25);
  });
  console.log("scrollWidth:", await page.evaluate(() => document.documentElement.scrollWidth));
  console.log(offenders.join("\n"));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
