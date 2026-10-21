/* eslint-disable @typescript-eslint/no-require-imports -- Node probe */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  const suite = await page.evaluate(async () => {
    const resp = await fetch("/api/stats/analytics-suite");
    const json = await resp.json();
    const rows = (json.suite ?? json).strategies ?? (json.suite ?? json).strategyRows ?? [];
    return { keys: Object.keys(json.suite ?? json), rows: rows.map((r) => ({ id: r.strategyId, name: r.name, trades: r.trades })) };
  });
  console.log(JSON.stringify(suite, null, 1).slice(0, 1200));

  await browser.close();
})();
