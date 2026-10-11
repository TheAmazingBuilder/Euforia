/** Quick visual check: dashboard + risk render OK? Saves 2 screenshots. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("socket.io")) errors.push(m.text());
  });

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "/home/z/my-project/scripts/preview-dashboard.png" });
  const title = await page.title();
  const h1 = await page.locator("h1").first().textContent().catch(() => "(aucun h1)");

  await page.goto(BASE + "/risk", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/home/z/my-project/scripts/preview-risk.png" });

  console.log("PAGE TITLE:", title);
  console.log("H1 DASHBOARD:", (h1 || "").trim());
  console.log("ERREURS CONSOLE (hors socket.io):", errors.length ? errors.slice(0, 5) : "aucune");
  await browser.close();
  console.log("OK — captures: scripts/preview-dashboard.png, scripts/preview-risk.png");
})();
