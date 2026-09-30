const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/settings#trading`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  const result = await page.evaluate(async () => {
    const r1 = await fetch("/api/instruments");
    return { status: r1.status, contentType: r1.headers.get("content-type"), body: (await r1.text()).slice(0, 120) };
  });
  console.log(JSON.stringify(result, null, 2));
  // Try via XHR too
  const result2 = await page.evaluate(async () => {
    const r = await fetch("/api/rules-status");
    return { status: r.status, body: (await r.text()).slice(0, 120) };
  });
  console.log(JSON.stringify(result2, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
