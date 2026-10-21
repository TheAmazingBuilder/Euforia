const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("response", (resp) => {
    if (resp.url().includes("emotion")) {
      console.log("EMOTION RESP:", resp.status(), resp.url().slice(0, 100));
      resp.text().then((t) => console.log("BODY:", t.slice(0, 300))).catch(() => {});
    }
  });
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERR:", m.text().slice(0, 150)); });
  await page.goto(`${BASE}/discipline`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  console.log("matrix count:", await page.locator('[data-testid="emotion-matrix"]').count());
  console.log("skeleton cards:", await page.locator('[aria-busy="true"]').count());
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
