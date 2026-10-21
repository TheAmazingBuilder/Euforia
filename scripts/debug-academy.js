/* Debug probe: mobile overflow elements on /academy + 404 URLs */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const bad = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) bad.push(`${resp.status()} ${resp.url()}`);
  });
  await page.goto(`${BASE}/academy`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2000);

  const overflowInfo = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [];
    document.querySelectorAll("*").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > vw + 1 || rect.right > vw + 1) {
        wide.push(`${el.tagName}.${String(el.className).slice(0, 70)} w=${Math.round(rect.width)} right=${Math.round(rect.right)}`);
      }
    });
    return { vw, scrollW: document.documentElement.scrollWidth, wide: wide.slice(0, 12) };
  });
  console.log("VIEWPORT:", overflowInfo.vw, "SCROLLW:", overflowInfo.scrollW);
  console.log(overflowInfo.wide.join("\n"));
  console.log("\nHTTP >= 400:");
  console.log(bad.join("\n") || "(none)");
  await browser.close();
})();
