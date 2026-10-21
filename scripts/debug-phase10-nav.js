const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Journal page: do the CSV import flow, then check state transitions live.
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const csv = [
    "Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit",
    "99001,2026.09.20 14:30,buy,0.5,EURUSD,1.08650,2026.09.20 16:45,1.08950,-2.5,0.4,250",
    "99002,2026.09.21 09:12,sell,0.3,BOOM1000,9820.00,2026.09.21 10:05,9860.00,-1.8,-0.9,80",
  ].join("\n");

  await page.locator("summary", { hasText: "or paste CSV text" }).click();
  await page.locator("details textarea").fill(csv);
  await page.locator('button:has-text("Analyze file")').click();
  await page.waitForSelector("text=importable", { timeout: 8000 });
  await page.locator('button:has-text("Import 2 trades")').click();
  await page.waitForSelector("text=Import complete", { timeout: 8000 });
  console.log("commit toast OK");
  await page.waitForTimeout(400);

  // Client-side nav via sidebar
  await page.locator('aside a[href="/trades"], nav a[href="/trades"]').first().click();
  await page.waitForTimeout(1500);
  console.log("URL:", page.url());
  const bodyText = await page.locator("body").textContent();
  console.log("BOOM1000 in DOM:", bodyText.includes("BOOM1000"));
  console.log("99001 in DOM:", bodyText.includes("99001"));
  console.log("EURUSD in DOM:", bodyText.includes("EURUSD"));
  // dump the first rows of the table
  const rows = await page.locator("table tbody tr").allTextContents();
  console.log("rows:", rows.length);
  console.log(rows.slice(0, 6).join("\n"));
  await browser.close();
})();
