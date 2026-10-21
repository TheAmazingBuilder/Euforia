const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const reqs = [];
  page.on("response", async (resp) => {
    if (resp.url().includes("/academy/bookmarks")) {
      let body = "";
      try { body = (await resp.text()).slice(0, 200); } catch {}
      reqs.push(`${resp.request().method()} ${resp.status()} ${resp.url()} ${body}`);
    }
  });
  await page.goto(`${BASE}/academy?tab=courses&course=crs-risk-fundamentals&lesson=lsn-risk-why`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.click('[data-testid="academy-lesson-bookmark"]');
  await page.waitForTimeout(1500);
  const text = await page.locator('[data-testid="academy-lesson-bookmark"]').textContent();
  console.log("button text:", text.trim());
  console.log(reqs.join("\n") || "(no bookmark requests)");
  await browser.close();
})();
