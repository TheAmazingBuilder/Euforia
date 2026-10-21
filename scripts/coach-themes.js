/** Coach page across the three themes — desktop screenshots. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const THEMES = ["dark-blue", "dark", "light"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  for (const theme of THEMES) {
    await page.goto(BASE + "/coach", { waitUntil: "domcontentloaded" });
    await page.evaluate((value) => {
      window.localStorage.setItem("theme", value);
    }, theme);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const applied = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    console.log(`theme=${theme} applied=${applied}`);
    await page.screenshot({ path: `scripts/shots/coach-theme-${theme}.png` });
  }

  await browser.close();
  console.log("THEME SHOTS DONE");
})();
